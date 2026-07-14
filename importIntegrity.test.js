// ============================================================================
// importIntegrity.test.js
//
// 【このテストが存在する理由】
// App.jsx を countryRules / translations / ui / panels へ分割した際、
// GBRetirementPanel.jsx が App.jsx 側にあった `CURRENCY_BY_CODE` を import し忘れたまま
// 参照しており、英国（GB）を選択した瞬間に ReferenceError で画面が真っ白になった。
//
// 既存の 91 件のテストは純粋関数（計算式）が中心のため、この種の「モジュールスコープの
// 参照漏れ」を検知できなかった。そこで、分割後の全ファイルを静的に走査し、
// 「使われているのに import も宣言もされていない識別子」がひとつも無いことを検証する。
//
// このテストは React のレンダリングを行わないため追加の依存パッケージを必要とせず、
// import 漏れ・export 漏れ・再エクスポート漏れをすべて検知できる。
// ============================================================================

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const TARGET_FILES = [
  "App.jsx",
  "ui/locale.js",
  "ui/guides.jsx",
  "ui/inputs.jsx",
  "ui/charts.jsx",
  "ui/cards.jsx",
  "ui/index.js",
  "panels/USInvestmentAccountsPanel.jsx",
  "panels/GBRetirementPanel.jsx",
  "panels/CARetirementPanel.jsx",
  "panels/AURetirementPanel.jsx",
  "panels/index.js",
  "countryRules/index.js",
  "translations/index.js",
  "utils/generateAdvice.js",
];

// 文字列・テンプレートリテラル・コメントを取り除く（誤検知を防ぐ）。
// テンプレートリテラルの ${...} の中身はコードなので残す。
function stripLiterals(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const j = src.indexOf("*/", i + 2);
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      out.push(" ");
      continue;
    }
    if (c === "`") {
      i++;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") {
          let j = i + 2;
          let depth = 1;
          while (j < n && depth > 0) {
            if (src[j] === "{") depth++;
            else if (src[j] === "}") depth--;
            j++;
          }
          out.push(" " + src.slice(i + 2, j - 1) + " ");
          i = j;
          continue;
        }
        if (src[i] === "`") { i++; break; }
        i++;
      }
      continue;
    }
    out.push(c);
    i++;
  }
  return out.join("");
}

// JS の組み込み・実行環境が提供するグローバル
const GLOBALS = new Set([
  "Math", "Number", "String", "Object", "Array", "JSON", "Boolean", "Date",
  "console", "isNaN", "parseFloat", "parseInt", "undefined", "null", "true",
  "false", "NaN", "Infinity", "window", "document", "React", "Intl", "Promise",
  "Map", "Set", "Error", "RegExp", "Symbol", "localStorage", "setTimeout",
  "clearTimeout", "navigator", "alert", "confirm", "Blob", "URL", "structuredClone",
]);

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "new", "typeof", "instanceof",
  "in", "of", "delete", "void", "this", "class", "extends", "import", "export",
  "from", "as", "default", "try", "catch", "finally", "throw", "async", "await",
  "yield", "static", "get", "set",
]);

// import されている名前を集める
function collectImported(src) {
  const names = new Set();
  const re = /import\s+(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]*)\}\s*from/gs;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) names.add(m[1]);
    for (const part of m[2].split(",")) {
      const p = part.trim();
      if (!p) continue;
      names.add(p.includes(" as ") ? p.split(" as ").pop().trim() : p);
    }
  }
  const re2 = /import\s+([A-Za-z_$][\w$]*)\s+from/g;
  while ((m = re2.exec(src))) names.add(m[1]);
  return names;
}

// 再エクスポート `export { A, B } from "./x.js";` の名前は、そのファイル内で
// 宣言されていなくても正しい（別モジュールから素通しするだけ）ので解決済みとして扱う。
function collectReExported(src) {
  const names = new Set();
  const re = /export\s*\{([^}]*)\}\s*from/gs;
  let m;
  while ((m = re.exec(src))) {
    for (const part of m[1].split(",")) {
      const p = part.trim();
      if (p) names.add(p.includes(" as ") ? p.split(" as ")[0].trim() : p);
    }
  }
  return names;
}

// そのファイル内で宣言されている名前を集める（変数・関数・分割代入・引数）
function collectDeclared(code) {
  const names = new Set();
  let m;

  const reDecl = /\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = reDecl.exec(code))) names.add(m[1]);

  // 分割代入 { a, b: c } = ... / 引数の分割代入
  const reDestr = /\{([^{}]*)\}\s*(?:=|\)|,)/g;
  while ((m = reDestr.exec(code))) {
    for (const part of m[1].split(",")) {
      const p = part.trim();
      if (!p) continue;
      const name = p.includes(":") ? p.split(":").pop().trim() : p.split("=")[0].trim();
      const id = name.match(/^[A-Za-z_$][\w$]*/);
      if (id) names.add(id[0]);
    }
  }

  // 関数・アロー関数の引数
  const reParams = /\(([^()]*)\)\s*(?:=>|\{)/g;
  while ((m = reParams.exec(code))) {
    for (const id of m[1].match(/[A-Za-z_$][\w$]*/g) || []) names.add(id);
  }

  return names;
}

// 参照されている名前（プロパティアクセスの右側は除く）
function collectUsed(code, src) {
  const names = new Set();
  let m;
  const reUse = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*(?=[([\].,;)\s}]|$)/g;
  while ((m = reUse.exec(code))) names.add(m[1]);
  // JSX のコンポーネント名（大文字始まり）
  const reJsx = /<([A-Z][\w$]*)/g;
  while ((m = reJsx.exec(src))) names.add(m[1]);
  return names;
}

// JSXの小文字タグ（div, span...）は識別子ではないので除外する
const isHtmlTag = (name) => /^[a-z]/.test(name) && !name.startsWith("use");

describe("分割後モジュールの参照整合性", () => {
  for (const rel of TARGET_FILES) {
    const abs = path.join(ROOT, rel);

    it(`${rel} に「import も宣言もされていない識別子」が無い`, () => {
      expect(fs.existsSync(abs), `${rel} が存在しない`).toBe(true);

      const src = fs.readFileSync(abs, "utf8");
      const code = stripLiterals(src);

      const imported = collectImported(src);
      const declared = collectDeclared(code);
      const reExported = collectReExported(src);
      const used = collectUsed(code, src);

      const unresolved = [...used].filter(
        (name) =>
          !imported.has(name) &&
          !declared.has(name) &&
          !reExported.has(name) &&
          !GLOBALS.has(name) &&
          !KEYWORDS.has(name) &&
          !isHtmlTag(name)
      );

      // 【この行が CURRENCY_BY_CODE の import 漏れを検知する】
      expect(
        unresolved,
        `${rel} で未解決の識別子: ${unresolved.join(", ")}\n` +
          `（分割元 App.jsx にあった定数・関数を import し忘れている可能性があります）`
      ).toEqual([]);
    });
  }
});

describe("index.js の再エクスポート漏れ", () => {
  const readExports = (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const names = new Set();
    const re = /export\s*\{([^}]*)\}/gs;
    let m;
    while ((m = re.exec(src))) {
      for (const part of m[1].split(",")) {
        const p = part.trim();
        if (p) names.add(p.includes(" as ") ? p.split(" as ").pop().trim() : p);
      }
    }
    return names;
  };

  it("ui/index.js が ui/ 配下の全部品を再エクスポートしている", () => {
    const barrel = readExports("ui/index.js");
    const required = [
      "yen", "CURRENCY_BY_CODE", "CATEGORY_LABELS", "getCategoryLabel", "LocaleContext",
      "GuideButton", "SectionGuide", "GuideLabel",
      "MAN", "useMoneyScale", "MoneyInput", "MoneyField", "Field",
      "AgeField", "AgeYMInput", "LabeledMiniInput", "CustomBenefitEditor",
      "PIE_COLORS", "AllocationCharts", "AllocationBreakdown",
      "StatCard",
    ];
    for (const name of required) {
      expect(barrel.has(name), `ui/index.js に ${name} の再エクスポートが無い`).toBe(true);
    }
  });

  it("panels/index.js が全パネルを再エクスポートしている", () => {
    const barrel = readExports("panels/index.js");
    for (const name of [
      "USInvestmentAccountsPanel",
      "GBRetirementPanel",
      "CARetirementPanel",
      "AURetirementPanel",
    ]) {
      expect(barrel.has(name), `panels/index.js に ${name} の再エクスポートが無い`).toBe(true);
    }
  });

  it("App.jsx が ui / panels から import した名前は、すべて barrel に存在する", () => {
    const app = fs.readFileSync(path.join(ROOT, "App.jsx"), "utf8");
    const uiBarrel = readExports("ui/index.js");
    const panelBarrel = readExports("panels/index.js");

    const pick = (from) => {
      const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"\\./${from}/index\\.js"`, "s");
      const m = app.match(re);
      return m
        ? m[1].split(",").map((x) => x.trim()).filter(Boolean)
        : [];
    };

    for (const name of pick("ui")) {
      expect(uiBarrel.has(name), `App.jsx が import している ${name} が ui/index.js に無い`).toBe(true);
    }
    for (const name of pick("panels")) {
      expect(panelBarrel.has(name), `App.jsx が import している ${name} が panels/index.js に無い`).toBe(true);
    }
  });
});
