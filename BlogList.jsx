import React from "react";
import { blogPosts } from "./blogPosts.js";

export default function BlogList({ onBack, onSelectPost }) {
  return (
    <div className="blog-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&family=Noto+Sans+JP:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .blog-page {
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
          padding: 0 0 60px;
        }
        .blog-header {
          padding: 22px 24px 18px; border-bottom: 1px solid var(--line);
          display: flex; align-items: center; gap: 14px;
        }
        .blog-back {
          background: var(--panel); border: 1px solid var(--line); color: var(--blue);
          font-size: 13px; padding: 7px 14px; border-radius: 4px; cursor: pointer;
        }
        .blog-back:hover { border-color: var(--blue); }
        .blog-header h1 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 19px; font-weight: 700;
          margin: 0; color: var(--text);
        }
        .blog-grid {
          max-width: 780px; margin: 32px auto 0; padding: 0 20px;
          display: grid; grid-template-columns: 1fr; gap: 16px;
        }
        @media (min-width: 700px) {
          .blog-grid { grid-template-columns: 1fr 1fr; }
        }
        .blog-card {
          background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
          padding: 20px; text-align: left; cursor: pointer; position: relative;
          transition: border-color 0.15s ease;
        }
        .blog-card:hover { border-color: var(--blue); }
        .blog-card::before {
          content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 2px;
          background: var(--blue);
        }
        .blog-card-date {
          font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted);
          margin-bottom: 8px; display: block;
        }
        .blog-card h2 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 15.5px; font-weight: 700;
          line-height: 1.5; margin: 0 0 10px; color: var(--text);
        }
        .blog-card p {
          font-size: 12.5px; line-height: 1.7; color: var(--muted); margin: 0;
        }
        .blog-empty {
          max-width: 780px; margin: 60px auto; padding: 0 20px; text-align: center;
          color: var(--muted); font-size: 13px;
        }
      `}</style>

      <div className="blog-header">
        <button className="blog-back" onClick={onBack}>← トップに戻る</button>
        <h1>資産形成コラム</h1>
      </div>

      {blogPosts.length === 0 ? (
        <div className="blog-empty">まだ記事がありません。近日公開予定です。</div>
      ) : (
        <div className="blog-grid">
          {blogPosts.map((post) => (
            <div key={post.slug} className="blog-card" onClick={() => onSelectPost(post.slug)}>
              <span className="blog-card-date">{post.date}</span>
              <h2>{post.title}</h2>
              <p>{post.excerpt}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
