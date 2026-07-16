// ============================================================================
// developerColumn.test.js
//
// 「👤 開発者について」コラムの追加と、フッターのクレジット表記の検証。
// 既存のコラム構造・デザインを壊していないことを合わせて確認する。
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { blogPosts } from "./blogPosts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(__dirname, rel), "utf8");

describe("開発者コラム", () => {
  it("コラム一覧の一番上が「👤 開発者について」である", () => {
    expect(blogPosts[0].title).toBe("👤 開発者について");
    expect(blogPosts[0].slug).toBe("about-developer");
  });

  it("既存のコラムは残っている（削除・破壊していない）", () => {
    const slugs = blogPosts.map((p) => p.slug);
    expect(slugs).toContain("nisa-life-plan-basics");
    expect(slugs).toContain("practice-column");
    expect(blogPosts.length).toBe(3);
  });

  it("既存コラムと同じ形式（slug/title/date/excerpt/body）を満たす", () => {
    const p = blogPosts[0];
    expect(typeof p.slug).toBe("string");
    expect(typeof p.title).toBe("string");
    expect(typeof p.date).toBe("string");
    expect(typeof p.excerpt).toBe("string");
    expect(Array.isArray(p.body)).toBe(true);
    expect(p.body.length).toBeGreaterThan(0);
  });

  it("開発者名・コンセプト・継続改善の要素が本文に含まれる", () => {
    const body = blogPosts[0].body.join("\n");
    expect(body).toContain("Kunihiko Hioki");
    expect(body).toContain("開発コンセプト");
    expect(body).toContain("改善");
  });

  it("note と メール のリンクが [表示文](URL) 形式で含まれる", () => {
    const body = blogPosts[0].body;
    const note = body.find((b) => b.includes("note.com/chic_zebra900"));
    const mail = body.find((b) => b.includes("mailto:pdr.gifu@gmail.com"));
    expect(note).toBeTruthy();
    expect(mail).toBeTruthy();
    // リンク記法として正しい形
    expect(/^\[.+\]\(https:\/\/note\.com\/chic_zebra900\)$/.test(note.trim())).toBe(true);
    expect(/^\[.+\]\(mailto:pdr\.gifu@gmail\.com\)$/.test(mail.trim())).toBe(true);
  });
});

describe("BlogPost：リンク描画", () => {
  let src = "";
  try {
    src = read("./BlogPost.jsx");
  } catch {
    src = "";
  }

  it("[表示文](URL) をリンクに変換する処理がある", () => {
    expect(src.includes("renderParagraph")).toBe(true);
    expect(src.includes("blog-link")).toBe(true);
  });

  it("mailto は新規タブ属性を付けない（メール起動のため）", () => {
    expect(src.includes('startsWith("mailto:")')).toBe(true);
  });

  it("見出し（## ）と通常段落の既存の描画は残っている", () => {
    expect(src.includes('startsWith("## ")')).toBe(true);
    expect(src.includes("blog-post-content")).toBe(true);
  });
});

describe("クレジット表記", () => {
  const app = read("./App.jsx");

  it("「このアプリについて」の免責事項の下に4項目のクレジットがある", () => {
    const idx = app.indexOf('className="app-credit"');
    expect(idx).toBeGreaterThan(0);
    // 免責バナー（disclaimer-banner）より後にあること
    const banner = app.indexOf('className="disclaimer-banner"');
    expect(idx).toBeGreaterThan(banner);
    const block = app.slice(idx, idx + 600);
    expect(block).toContain("© 2026 Kunihiko Hioki");
    expect(block).toContain("Developed by Kunihiko Hioki");
    expect(block).toContain("Version 1.0.0");
    expect(block).toContain("pdr.gifu@gmail.com");
  });

  it("画面下の免責事項の下には1行だけの © 表記は無い（footer-copyright を削除）", () => {
    expect(app.includes('className="footer-copyright"')).toBe(false);
  });

  it("一番下に4行のクレジット（footer-credit）がある", () => {
    const idx = app.indexOf('className="footer-credit"');
    expect(idx).toBeGreaterThan(0);
    const block = app.slice(idx, idx + 600);
    expect(block).toContain("© 2026 Kunihiko Hioki");
    expect(block).toContain("Developed by Kunihiko Hioki");
    expect(block).toContain("Version 1.0.0");
    expect(block).toContain("pdr.gifu@gmail.com");
  });

  it("クレジットのメールは mailto リンクになっている", () => {
    expect(app).toContain('href="mailto:pdr.gifu@gmail.com"');
  });
});
