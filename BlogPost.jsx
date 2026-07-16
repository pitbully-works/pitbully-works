import React from "react";
import { blogPosts } from "./blogPosts.js";

// 本文中の [表示文](URL) をタップできるリンクに変換する。
// URL が mailto: で始まればメール、それ以外はリンク先を新しいタブで開く。
// この記法を含まない段落は、これまでどおりただの <p> として表示する（既存の見た目は不変）。
function renderParagraph(text, key) {
  const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(text.trim());
  if (linkMatch) {
    const [, labelText, url] = linkMatch;
    const isMail = url.startsWith("mailto:");
    return (
      <p key={key}>
        <a
          className="blog-link"
          href={url}
          {...(isMail ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        >
          {labelText}
        </a>
      </p>
    );
  }
  return <p key={key}>{text}</p>;
}

export default function BlogPost({ slug, onBack, onGoToSimulator }) {
  const post = blogPosts.find((p) => p.slug === slug);

  return (
    <div className="blog-post-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&family=Noto+Sans+JP:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .blog-post-page {
          --bg: #0E1316;
          --panel: #151C20;
          --line: #2A363C;
          --line-faint: rgba(79,168,216,0.14);
          --blue: #4FA8D8;
          --amber: #D9A54F;
          --green: #8FBF7F;
          --text: #E7ECEE;
          --muted: #7C8A90;
          font-family: 'Noto Sans JP', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          background-image:
            linear-gradient(var(--line-faint) 1px, transparent 1px),
            linear-gradient(90deg, var(--line-faint) 1px, transparent 1px);
          background-size: 28px 28px;
          padding: 0 0 70px;
        }
        .blog-post-header {
          padding: calc(22px + env(safe-area-inset-top, 0px)) 24px 18px; border-bottom: ...24px 18px; border-bottom: 1px solid var(--line);
        }
        .blog-back {
          background: var(--panel); border: 1px solid var(--line); color: var(--blue);
          font-size: 13px; padding: 7px 14px; border-radius: 4px; cursor: pointer;
        }
        .blog-back:hover { border-color: var(--blue); }
        .blog-post-body {
          max-width: 680px; margin: 0 auto; padding: 36px 22px 0;
        }
        .blog-post-date {
          font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--muted);
          margin-bottom: 10px; display: block;
        }
        .blog-post-body h1 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 22px; font-weight: 700;
          line-height: 1.5; margin: 0 0 26px; color: var(--text);
        }
        .blog-post-content h2 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 16.5px; font-weight: 700;
          color: var(--blue); margin: 30px 0 12px; padding-left: 10px;
          border-left: 3px solid var(--blue);
        }
        .blog-post-content p {
          font-size: 14px; line-height: 1.95; color: var(--text); margin: 0 0 18px;
        }
        /* 本文中のリンク（note・メールなど）。既存の段落スタイルはそのまま、リンクだけ装飾する。 */
        .blog-link {
          color: var(--blue); font-weight: 600; text-decoration: none;
          border-bottom: 1px solid rgba(79,168,216,0.5);
          word-break: break-all;
        }
        .blog-link:hover { border-bottom-color: var(--blue); }
        .blog-post-footer {
          max-width: 680px; margin: 40px auto 0; padding: 20px 22px 0;
          border-top: 1px solid var(--line);
        }
        .blog-not-found {
          max-width: 680px; margin: 60px auto; padding: 0 20px; text-align: center;
          color: var(--muted); font-size: 13px;
        }
        .blog-cta {
          max-width: 640px; margin: 44px auto 0; padding: 26px 22px;
          text-align: center; border: 1px solid var(--line); border-radius: 8px;
          background: var(--panel);
        }
        .blog-cta-title {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 17px; font-weight: 700;
          margin: 0 0 12px; color: var(--text);
        }
        .blog-cta-text {
          font-size: 13px; line-height: 1.8; color: var(--muted);
          margin: 0 0 20px;
        }
        .blog-cta-button {
          display: inline-block; width: 100%; max-width: 360px;
          background: var(--blue); color: #0E1316; border: none;
          font-family: 'Zen Kaku Gothic New', sans-serif;
          font-size: 15px; font-weight: 700; letter-spacing: 0.02em;
          padding: 15px 20px; border-radius: 6px; cursor: pointer;
        }
        .blog-cta-button:hover { background: #6BB8E0; }
      `}</style>

      <div className="blog-post-header">
        <button className="blog-back" onClick={onBack}>← コラム一覧に戻る</button>
      </div>

      {!post ? (
        <div className="blog-not-found">記事が見つかりませんでした。</div>
      ) : (
        <>
          <div className="blog-post-body">
            <span className="blog-post-date">{post.date}</span>
            <h1>{post.title}</h1>
            <div className="blog-post-content">
              {post.body.map((block, i) =>
                block.startsWith("## ") ? (
                  <h2 key={i}>{block.replace("## ", "")}</h2>
                ) : (
                  renderParagraph(block, i)
                )
              )}
            </div>
          </div>

          <div className="blog-cta">
            <h3 className="blog-cta-title">無料でライフプランをシミュレーション</h3>
            <p className="blog-cta-text">
              現在の資産・NISA・年金・預貯金・金・保険などを入力するだけで、将来のお金の流れや資産推移をグラフで分かりやすく確認できます。<br />
              老後資産を「見える化」したい方は、ぜひシミュレーションをご利用ください。
            </p>
            <button className="blog-cta-button" onClick={onGoToSimulator}>
              今すぐ無料でシミュレーションする
            </button>
          </div>

          <div className="blog-post-footer">
            <button className="blog-back" onClick={onBack}>← コラム一覧に戻る</button>
          </div>
        </>
      )}
    </div>
  );
}
