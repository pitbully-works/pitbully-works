const MAX_BODY_CHARS = 18000;

export default {
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return Response.json({ error: "POST required" }, { status: 405 });
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
      return Response.json({ ok: false, error: "AI request failed", detail: String(error?.message || error) }, { status: 500 });
    }
  }
};
