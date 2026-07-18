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

// ============================================================================
// 国別ルール関数の呼び出しガード（静的解析）
//
// 【背景】rules.tax.implemented / rules.investment.implemented は JP/US/GB/CA/AU
// すべてで true になる。そのため implemented だけを条件にして AU 専用の関数
// （resolveDivision293Income など）を呼ぶと、他国を選んだ瞬間に
//   TypeError: rules.tax.resolveDivision293Income is not a function
// で画面が真っ白になる。実際にこの事故が起きたため、CI で静的に検出する。
//
// 判定ルール：AU_COUNTRY_RULES にしか存在しない関数の呼び出し行は、
//   ・同じ行または直前4行に auIsAU / country === "AU" があること、または
//   ・関数名に AU を含むコンポーネント（AU選択時にしか描画されない）の中にあること
// のいずれかを満たさなければならない。
// ============================================================================
describe("国別ルール関数のガード", () => {
  const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

  // AU にしか無いメソッド名を抽出する
  const methodNames = (src) =>
    new Set([...src.matchAll(/^\s{4}(\w+)\s*\(/gm)].map((m) => m[1]));

  const auOnlyMethods = () => {
    const au = methodNames(readSrc("countryRules/AU.js"));
    const others = ["JP", "US", "GB", "CA"]
      .map((c) => readSrc(`countryRules/${c}.js`))
      .join("\n");
    return [...au].filter((n) => n.length > 3 && !others.includes(`${n}(`));
  };

  it("AU専用のルール関数は、必ず国の判定でガードされている", () => {
    const names = auOnlyMethods();
    expect(names.length).toBeGreaterThan(0); // 抽出自体が壊れていないこと

    const lines = readSrc("App.jsx").split("\n");
    // 直近に現れた関数・コンポーネント定義の名前を追う
    let enclosing = "";
    const violations = [];

    lines.forEach((line, i) => {
      // トップレベルの定義だけを「囲っているコンポーネント」として追う
      const def = line.match(/^(?:export\s+default\s+)?(?:function|const)\s+([A-Za-z_]\w*)/);
      if (def) enclosing = def[1];

      const called = names.find((n) => line.includes(`.${n}(`));
      if (!called) return;

      // 【厳密な窓】呼び出しを含む「その文」だけを見る。
      // 直前の別の文にある auIsAU を拾ってしまうと、ガード漏れを見逃す。
      let start = i;
      while (start > 0 && !/^\s{0,4}(?:const|let|var|return|if|\}|\)|<)/.test(lines[start])) {
        start -= 1;
      }
      const statement = lines.slice(start, i + 1).join("\n");

      // 早期 return によるガード（if (country !== "AU") return 既定値;）は
      // 同じ useMemo / 関数の中にあれば有効なので、そこだけ広めに探す。
      const blockStart = Math.max(0, i - 40);
      const block = lines.slice(blockStart, i + 1).join("\n");
      const earlyReturnGuard = /if\s*\(\s*country\s*!==\s*"AU"/.test(block);

      const guarded =
        /auIsAU/.test(statement) ||
        /country\s*===\s*"AU"/.test(statement) ||
        earlyReturnGuard ||
        /^AU/.test(enclosing);

      if (!guarded) {
        violations.push(`App.jsx:${i + 1} ${called}() が国の判定でガードされていない`);
      }
    });

    expect(violations).toEqual([]);
  });

  it("AU専用のルール関数が、他国のルールに紛れ込んでいない", () => {
    const names = auOnlyMethods();
    ["JP", "US", "GB", "CA"].forEach((c) => {
      const src = readSrc(`countryRules/${c}.js`);
      const leaked = names.filter((n) => new RegExp(`^\\s{4}${n}\\s*\\(`, "m").test(src));
      expect(leaked, `${c}.js に AU 専用メソッドが存在する`).toEqual([]);
    });
  });
});

// ============================================================================
// 依存配列の静的検査
//
// 【背景】豪Age Pensionの画面カードは、本番投影（integrated）の結果から値を読む。
// useMemo の依存配列に integrated が入っていないと、銀行預金・個別株・金・民間年金を
// 変更してもカードが更新されない。React の再計算はテストから直接観測しづらいため、
// 依存配列を静的に検査する。
// ============================================================================
describe("useMemo の依存配列", () => {
  it("auAgePensionFromEngine が integrated に依存している", () => {
    const app = fs.readFileSync(path.join(ROOT, "App.jsx"), "utf8");
    const i = app.indexOf("const auAgePensionFromEngine = useMemo(");
    expect(i, "auAgePensionFromEngine が見つからない").toBeGreaterThan(-1);

    // useMemo の閉じ括弧までを取り出し、末尾の依存配列を読む
    const body = app.slice(i, app.indexOf("\n\n", i));
    const deps = body.slice(body.lastIndexOf("}, ["));
    expect(deps.includes("integrated"), "依存配列に integrated が無い").toBe(true);
    expect(deps.includes("inputs.auInvestment"), "依存配列に inputs.auInvestment が無い").toBe(true);
  });

  it("integrated は planCtx に依存し、planCtx は inputs に依存している", () => {
    const app = fs.readFileSync(path.join(ROOT, "App.jsx"), "utf8");
    expect(app).toMatch(/const integrated = useMemo\(\(\) => runIntegratedPlan\(buildPlanInput\(planCtx\)\), \[planCtx\]\)/);
    const i = app.indexOf("const planCtx = useMemo(");
    const deps = app.slice(i, app.indexOf("]);", i));
    expect(deps.includes("inputs"), "planCtx が inputs に依存していない").toBe(true);
    expect(deps.includes("stockTotalNow"), "planCtx が stockTotalNow に依存していない").toBe(true);
    expect(deps.includes("goldSim.currentValue"), "planCtx が金の評価額に依存していない").toBe(true);
  });

  it("画面カードが3口座だけの projectAgePension を呼び戻していない", () => {
    const app = fs.readFileSync(path.join(ROOT, "App.jsx"), "utf8");
    expect(app.includes("projectAgePension"), "App.jsx が projectAgePension を直接呼んでいる").toBe(false);
  });
});
