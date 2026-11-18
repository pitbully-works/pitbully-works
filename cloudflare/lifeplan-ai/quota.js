const DAILY_LIMIT = 3;
const JAPAN_OFFSET_MS = 9 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function respond(status, error) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function protectWorker(worker) {
  return {
    async fetch(request, env, context) {
      if (request.method !== "POST") return respond(405, "POST required");

      const secret = env.LIFEPLAN_WORKER_SECRET;
      if (!secret || !env.AI_QUOTA) return respond(503, "AI quota unavailable");
      const supplied = request.headers.get("Authorization") || "";
      const actual = encoder.encode(supplied);
      const expected = encoder.encode(`Bearer ${secret}`);
      if (actual.length !== expected.length || !crypto.subtle.timingSafeEqual(actual, expected)) {
        return respond(401, "Unauthorized");
      }

      const subject = request.headers.get("X-Lifeplan-Subject") || "";
      const flow = request.headers.get("X-Lifeplan-Flow") || "";
      const mode = request.headers.get("X-Lifeplan-Mode");
      if (!/^[a-f0-9]{64}$/.test(subject) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(flow)) {
        return respond(400, "Invalid quota identifier");
      }

      const day = new Date(Date.now() + JAPAN_OFFSET_MS).toISOString().slice(0, 10);
      const database = env.AI_QUOTA;
      try {
        if (mode === "answer" || mode === "agent-plan") {
          const [, result] = await database.batch([
            database.prepare("DELETE FROM ai_questions WHERE day < ?").bind(day),
            database.prepare(`
              INSERT INTO ai_questions (subject, day, flow, stage)
              SELECT ?, ?, ?, ?
              WHERE (SELECT count(*) FROM ai_questions WHERE subject = ? AND day = ?) < ?
              ON CONFLICT (subject, day, flow) DO NOTHING
            `).bind(subject, day, flow, mode === "answer" ? 0 : 1, subject, day, DAILY_LIMIT),
          ]);
          if (result.meta.changes !== 1) return respond(429, "Daily AI limit reached or question already submitted");
        } else if (mode === "agent-explain" || mode === "agent-review") {
          const stage = mode === "agent-explain" ? 2 : 3;
          const result = await database.prepare(`
            UPDATE ai_questions SET stage = ?
            WHERE subject = ? AND day = ? AND flow = ? AND stage BETWEEN 1 AND ?
          `).bind(stage, subject, day, flow, stage - 1).run();
          if (result.meta.changes !== 1) return respond(409, "AI question step expired or already used");
        } else {
          return respond(400, "Invalid AI mode");
        }
      } catch {
        return respond(503, "AI quota unavailable");
      }

      return worker.fetch(request, env, context);
    },
  };
}
