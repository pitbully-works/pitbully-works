const MAX_BODY_CHARS = 18000;
const MAX_DECLARED_BODY_BYTES = 64 * 1024;

export default {
  async fetch(request, env) {
    try {
  const reject = (status, error) =>
    Response.json({ error }, {
      status,
      headers: { "Cache-Control": "no-store" }
    });

  if (request.method !== "POST") return reject(405, "POST required");

  const secret = env.LIFEPLAN_WORKER_SECRET;
  const db = env.AI_QUOTA;
  if (!secret || !db) return reject(503, "AI quota unavailable");

  const encoder = new TextEncoder();
  const actual = encoder.encode(request.headers.get("Authorization") || "");
  const expected = encoder.encode(`Bearer ${secret}`);
  if (actual.length !== expected.length ||
      !crypto.subtle.timingSafeEqual(actual, expected)) {
    return reject(401, "Unauthorized");
  }

  const subject = request.headers.get("X-Lifeplan-Subject") || "";
  const flow = request.headers.get("X-Lifeplan-Flow") || "";
  const mode = request.headers.get("X-Lifeplan-Mode");
  const validFlow = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
  if (!/^[a-f0-9]{64}$/.test(subject) || !validFlow.test(flow)) {
    return reject(400, "Invalid quota identifier");
  }

  const day = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  try {
    if (mode === "answer" || mode === "agent-plan") {
      const stage = mode === "answer" ? 0 : 1;
      const [, result] = await db.batch([
        db.prepare("DELETE FROM ai_questions WHERE day < ?").bind(day),
        db.prepare(`
          INSERT INTO ai_questions (subject, day, flow, stage)
          SELECT ?, ?, ?, ?
          WHERE (SELECT count(*) FROM ai_questions
                 WHERE subject = ? AND day = ?) < 3
          ON CONFLICT (subject, day, flow) DO NOTHING
        `).bind(subject, day, flow, stage, subject, day)
      ]);
      if (result.meta.changes !== 1) {
        return reject(429, "Daily AI limit reached or question already submitted");
      }
    } else if (mode === "agent-explain" || mode === "agent-review") {
      const stage = mode === "agent-explain" ? 2 : 3;
      const result = await db.prepare(`
        UPDATE ai_questions SET stage = ?
        WHERE subject = ? AND day = ? AND flow = ?
          AND stage BETWEEN 1 AND ?
      `).bind(stage, subject, day, flow, stage - 1).run();
      if (result.meta.changes !== 1) {
        return reject(409, "AI question step expired or already used");
      }
    } else {
      return reject(400, "Invalid AI mode");
    }
  } catch {
    return reject(503, "AI quota unavailable");
  }
}{
      if (request.method !== "POST") {
        return Response.json({ error: "POST required" }, { status: 405 });
      }

      // Reject clearly oversized requests before parsing JSON. This is only an
      // application boundary; deployment-level rate limiting/WAF is still required.
      const contentLength = request.headers.get("content-length");
      if (contentLength) {
        const declaredBytes = Number(contentLength);
        if (Number.isFinite(declaredBytes) && declaredBytes > MAX_DECLARED_BODY_BYTES) {
          return Response.json({ error: "Request body is too large" }, { status: 413 });
        }
      }

      const body = await request.json();
      const question = typeof body?.question === "string" ? body.question.trim() : "";
      if (!question) return Response.json({ error: "Question is required" }, { status: 400 });
      if (question.length > MAX_BODY_CHARS) return Response.json({ error: "Question is too long" }, { status: 400 });

      const result = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
        messages: [
          {
            role: "system",
            content: "You are an assistant embedded in a life-planning application. Answer in the same language as the user. Treat calculations produced by the application as authoritative. Do not invent financial calculation results. Do not modify user settings."
          },
          { role: "user", content: question }
        ]
      });
      return Response.json({ ok: true, result });
    } catch (error) {
      console.error("AI Worker request failed", error);
      return Response.json({ ok: false, error: "AI request failed" }, { status: 500 });
    }
  }
};
