export default {
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return Response.json({ error: "POSTで送信してください" }, { status: 405 });
      }

      const body = await request.json();
      const question = typeof body?.question === "string" ? body.question.trim() : "";
      if (!question) return Response.json({ error: "質問がありません" }, { status: 400 });
      if (question.length > 12000) return Response.json({ error: "質問が長すぎます" }, { status: 400 });

      const result = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
        messages: [
          {
            role: "system",
            content: "あなたはライフプランアプリの補助AIです。必ず指定された言語で回答してください。金融計算の最終結果を勝手に確定せず、アプリ本体の計算結果を最優先してください。ユーザーの設定を直接変更したと主張してはいけません。与えられていない数値を推測して将来額を作らないでください。",
          },
          { role: "user", content: question },
        ],
      });

      return Response.json({ ok: true, result });
    } catch {
      return Response.json({ ok: false, error: "AI処理に失敗しました" }, { status: 500 });
    }
  },
};
