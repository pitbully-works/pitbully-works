// ============================================================================
// 国ごとの分離：復元用テキストと「初期値に戻す」
// ----------------------------------------------------------------------------
// 実機で2つ見つかった。
//   ① 日本で貼り付けた復元用テキストが、アメリカへ切り替えても残っていた。
//      金額は国ごとに分かれているのに、貼り付け欄だけ共通だった。
//      「この国のデータのように見えて、中身は別の国のもの」が
//      いちばん紛らわしいので、ここも国ごとに分ける。
//   ② 「初期値に戻す」が、いつでも日本の初期値に戻していた。
//      アメリカで押すと日本に切り替わり、アプリが最初から持っている
//      想定利回りや税率まで消えたように見えていた。
//      消すのは「打ち込んだ値」だけ。アプリの標準値はその国の初期値へ戻す。
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROFILE_COUNTRIES, makeCountryProfile, forceCountryMeta, normalizeProfileCountry,
} from "./utils/countryProfiles.js";
import { GB_COUNTRY_RULES, CA_COUNTRY_RULES } from "./countryRules/index.js";

const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");

/* App.jsx の DEFAULT_INPUTS をそのまま取り出して使う。
   ここで作りものの初期値を書くと、本物とずれても気づけない。
   初期値の一部は国のルールから計算されている
   （英国の国家年金の満額・カナダのCPPの見込み額）ので、
   本物のルールを渡して評価する。 */
const DEFAULT_INPUTS = (() => {
  const m = /const DEFAULT_INPUTS = (\{[\s\S]*?\n\});/.exec(app);
  if (!m) throw new Error("DEFAULT_INPUTS が読めない");
  const body = m[1].replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return new Function("GB_COUNTRY_RULES", "CA_COUNTRY_RULES", "return (" + body + ");")(
    GB_COUNTRY_RULES, CA_COUNTRY_RULES);
})();

describe("① 復元用テキストが、ほかの国へ漏れない", () => {
  it("貼り付け欄を国ごとに持っている", () => {
    expect(app, "国ごとの入れ物がない").toMatch(/const importTextsRef = useRef\(\{\}\)/);
    expect(app, "知らせの入れ物がない").toMatch(/const importNoticesRef = useRef\(\{\}\)/);
  });

  it("国を切り替えたら、貼り付け欄も入れ替える", () => {
    expect(app).toMatch(/const switchImportTextCountry = \(fromCountry, toCountry\) =>/);
    expect(app, "国の選択で入れ替えを呼んでいない")
      .toContain("switchImportTextCountry(currentCountry, nextCountry)");
  });

  it("入れ替えでは、いまの国をしまってから次の国を出す", () => {
    const fn = /const switchImportTextCountry = \(fromCountry, toCountry\) => \{[\s\S]*?\n  \};/.exec(app);
    expect(fn, "入れ替えの処理が見つからない").toBeTruthy();
    const body = fn[0];
    const save = body.indexOf("[from]: importText");
    const load = body.indexOf("importTextsRef.current[to]");
    expect(save, "いまの国をしまっていない").toBeGreaterThan(0);
    expect(load, "次の国を出していない").toBeGreaterThan(0);
    expect(save, "出してからしまっている（順番が逆）").toBeLessThan(load);
  });

  it("結果の知らせも、国ごとに持ち替える", () => {
    const fn = /const switchImportTextCountry = \(fromCountry, toCountry\) => \{[\s\S]*?\n  \};/.exec(app)[0];
    for (const [what, needle] of [
      ["エラー", "setImportError("],
      ["成功", "setImportOk("],
      ["生年月日の食い違い", "setImportBirthMismatch("],
      ["区間の重なり", "setImportScheduleOverlaps("],
    ]) {
      expect(fn, `${what}を持ち替えていない`).toContain(needle);
    }
  });

  it("入れ替えの動きを、そのまま再現しても混ざらない", () => {
    /* App.jsx と同じ手順を、素のオブジェクトで再現して確かめる。 */
    const texts = {};
    let shown = "";
    const switchTo = (from, to) => {
      texts[from] = shown;
      shown = typeof texts[to] === "string" ? texts[to] : "";
    };
    shown = "JPで貼り付けた文字列";
    switchTo("JP", "US");
    expect(shown, "日本の文字列がアメリカに残っている").toBe("");

    shown = "USで貼り付けた文字列";
    switchTo("US", "GB");
    expect(shown).toBe("");
    switchTo("GB", "US");
    expect(shown, "アメリカのぶんが戻ってこない").toBe("USで貼り付けた文字列");
    switchTo("US", "JP");
    expect(shown, "日本のぶんが戻ってこない").toBe("JPで貼り付けた文字列");

    for (const c of PROFILE_COUNTRIES) {
      switchTo(normalizeProfileCountry(shown ? "JP" : "JP"), c);
      expect(typeof shown, `${c} で文字列以外が出ている`).toBe("string");
    }
  });
});

describe("② 初期値に戻す：打ち込んだ値だけ消す", () => {
  /* 打ち込んだ値（0が初期値のもの）と、アプリの標準値（0でないもの）。 */
  const userEntered = {
    userName: "K", birthDate: "1968-11-13",
    currentAssets: 12345678, pensionMonthly: 200000, livingCostMonthly: 250000,
    healthBrackets: { b60: 150000, b70: 200000, b80: 300000 },
    inheritanceTarget: 5000000,
    banks: [{ id: "b1", name: "Main", balance: 3000000 }],
    lumpSums: [{ id: "l1", age: 60, amount: 1000000 }],
  };

  it("打ち込んだ値は、未入力へ戻る（5か国とも）", () => {
    for (const c of PROFILE_COUNTRIES) {
      const dirty = forceCountryMeta({ ...DEFAULT_INPUTS, ...userEntered }, c);
      const fresh = makeCountryProfile(DEFAULT_INPUTS, c, {});
      expect(fresh.userName, `${c}：名前が残っている`).toBe("");
      expect(fresh.birthDate, `${c}：生年月日が残っている`).toBe("");
      expect(fresh.currentAssets, `${c}：資産額が残っている`).toBe(0);
      expect(fresh.banks, `${c}：銀行が残っている`).toEqual([]);
      expect(fresh.lumpSums, `${c}：一括投資が残っている`).toEqual([]);
      expect(dirty.currentAssets, "前提が崩れている").toBe(12345678);
    }
  });

  it("アプリの標準値は、その国の初期値へ戻る（0にしない）", () => {
    /* 想定利回り・税率・年齢の既定などは、消してはいけない。
       ここが0になると、計算の前提そのものが壊れる。 */
    for (const c of PROFILE_COUNTRIES) {
      const fresh = makeCountryProfile(DEFAULT_INPUTS, c, {});
      expect(fresh.currentAge, `${c}：現在年齢`).toBe(DEFAULT_INPUTS.currentAge);
      expect(fresh.retireAge, `${c}：引退年齢`).toBe(DEFAULT_INPUTS.retireAge);
      expect(fresh.deathAge, `${c}：想定寿命`).toBe(DEFAULT_INPUTS.deathAge);
      expect(fresh.publicPensionStartAge, `${c}：年金開始年齢`).toBe(DEFAULT_INPUTS.publicPensionStartAge);
      expect(fresh.postRetireReturn, `${c}：退職後の想定利回り`).toBe(DEFAULT_INPUTS.postRetireReturn);
      expect(fresh.stockReturnPct, `${c}：株式の想定利回り`).toBe(DEFAULT_INPUTS.stockReturnPct);
      expect(fresh.ideco.returnPct, `${c}：iDeCoの想定利回り`).toBe(DEFAULT_INPUTS.ideco.returnPct);
      expect(fresh.gold.priceGrowthPct, `${c}：金価格の想定上昇率`).toBe(DEFAULT_INPUTS.gold.priceGrowthPct);
      expect(fresh.usInvestment.k401.withdrawalTaxPct, `${c}：401(k)の税率`).toBe(22);
      expect(fresh.usInvestment.socialSecurity.claimAge, `${c}：受給開始年齢`).toBe(67);
      expect(fresh.gbInvestment.sipp.withdrawalTaxPct, `${c}：SIPPの税率`).toBe(15);
    }
  });

  it("制度から決まる標準値は、0にならずルールどおりの額へ戻る", () => {
    /* 英国の国家年金の満額・カナダのCPPの見込み額は、国のルールから計算した
       「アプリの標準値」。ここが0になると、年金の前提そのものが消える。 */
    for (const c of PROFILE_COUNTRIES) {
      const fresh = makeCountryProfile(DEFAULT_INPUTS, c, {});
      const gb = fresh.gbInvestment.statePension.estimatedAnnual;
      const ca = fresh.caInvestment.cpp.estimatedAnnualAt65;
      expect(gb, `${c}：英国の国家年金の標準額が消えた`)
        .toBe(Math.round(GB_COUNTRY_RULES.retirement.statePension.fullAnnualRate));
      expect(gb, `${c}：英国の国家年金が0になった`).toBeGreaterThan(0);
      expect(ca, `${c}：カナダのCPPの標準額が消えた`)
        .toBe(Math.round(CA_COUNTRY_RULES.retirement.getCppMaxAnnualAt65()));
      expect(ca, `${c}：カナダのCPPが0になった`).toBeGreaterThan(0);
    }
  });

  it("医療・健康予備費は、その国の初期値へ戻る", () => {
    /* 日本は参考初期値（15/25/40万円）、海外4か国は0。
       くわしくは下の「医療・健康予備費」のところで確かめる。 */
    const jp = makeCountryProfile(DEFAULT_INPUTS, "JP", {});
    expect(jp.healthBrackets, "日本の参考初期値に戻っていない")
      .toEqual({ b60: 150000, b70: 250000, b80: 400000 });
    for (const c of ["US", "GB", "CA", "AU"]) {
      const fresh = makeCountryProfile(DEFAULT_INPUTS, c, {});
      expect(fresh.healthBrackets, `${c}：根拠のない額が入っている`)
        .toEqual({ b60: 0, b70: 0, b80: 0 });
    }
  });

  it("戻したあとも、その国の通貨とことばのまま（日本に戻らない）", () => {
    const want = { JP: "JPY", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD" };
    for (const c of PROFILE_COUNTRIES) {
      const fresh = makeCountryProfile(DEFAULT_INPUTS, c, {});
      expect(fresh.country, `${c}：国が変わった`).toBe(c);
      expect(fresh.baseCurrency, `${c}：通貨が変わった`).toBe(want[c]);
    }
  });

  it("戻すのは、いま開いている国のぶんだけ", () => {
    const fn = /const resetAllInputs = \(\) => \{[\s\S]*?\n  \};/.exec(app);
    expect(fn, "初期値に戻す処理が見つからない").toBeTruthy();
    const body = fn[0];
    expect(body, "日本の初期値へ戻している").not.toContain('defaultWatchlistFor("JP")');
    expect(body, "いまの国を見ていない").toContain("normalizeProfileCountry(inputs.country)");
    expect(body, "その国の初期値を作っていない").toContain("makeCountryProfile(DEFAULT_INPUTS, code, {})");
    expect(body, "この国のぶんだけ入れ替えていない")
      .toContain("countryProfilesRef.current = { ...countryProfilesRef.current, [code]: fresh }");
  });

  it("ほかの国のプロファイルには触れない", () => {
    /* App.jsx と同じ手順を再現して、ほかの国が残ることを確かめる。 */
    const profiles = {};
    PROFILE_COUNTRIES.forEach((c) => {
      profiles[c] = forceCountryMeta({ ...DEFAULT_INPUTS, currentAssets: c === "JP" ? 111 : 222 }, c);
    });
    const before = JSON.parse(JSON.stringify(profiles));
    const code = "US";
    const fresh = makeCountryProfile(DEFAULT_INPUTS, code, {});
    const after = { ...profiles, [code]: fresh };

    expect(after.US.currentAssets, "戻したい国が戻っていない").toBe(0);
    for (const c of PROFILE_COUNTRIES.filter((x) => x !== code)) {
      expect(after[c], `${c} のプロファイルが変わった`).toEqual(before[c]);
    }
  });

  it("戻したときは、その国の貼り付け欄も消す（ほかの国は残す）", () => {
    const body = /const resetAllInputs = \(\) => \{[\s\S]*?\n  \};/.exec(app)[0];
    expect(body, "貼り付け欄を消していない")
      .toContain('importTextsRef.current = { ...importTextsRef.current, [code]: "" }');
    expect(body, "貼り付け欄の表示を消していない").toContain('setImportText("")');
  });
});

describe("既存の仕組みを壊していない", () => {
  it("家計簿の単位ガードは、いまも取り込みの先頭にある", () => {
    const at = app.indexOf("checkKakeiboAmountUnit(parsed)");
    const target = app.indexOf("targetCountryFromKakeibo(parsed)");
    expect(at, "単位ガードが消えた").toBeGreaterThan(0);
    expect(at, "国の判定より後に移った").toBeLessThan(target);
  });

  it("5か国のプロファイル保存は、いまも使われている", () => {
    expect(app).toContain("profileStorageVersion: PROFILE_STORAGE_VERSION");
    expect(app).toContain("targetCountryFromKakeibo(parsed)");
  });
});

// ============================================================================
// 医療・健康予備費（日本の参考初期値）
// ----------------------------------------------------------------------------
// 60代15万円 / 70代25万円 / 80代以降40万円 は、このアプリがもともと持っていた
// **資金計画のための参考初期値**。公的制度から算出した自己負担額ではない。
// 「初期値に戻す」でこの3つが0になると、利用者は自分で数値を出せないまま
// 医療費0円の前提で試算してしまう。だから0にはしない。
//
// 海外4か国は、国ごとの初期値がコードに存在しない。
// 根拠のない額を作らないので0のまま（各国は専用の医療費欄を持つ）。
// ============================================================================
import { COUNTRY_INPUT_DEFAULTS } from "./utils/countryProfiles.js";
import { JA_TRANSLATIONS as JA2 } from "./translations/ja.js";

/* ui/locale.js は React を読み込むので、ここではソースから項目名だけを取り出す
   （テストの都合で本物のファイルを読む形は崩さない）。 */
const localeSrc = readFileSync(join(process.cwd(), "ui/locale.js"), "utf8");
const healthCostLabelJP = (() => {
  const m = /healthCost:\s*\{[\s\S]*?JP:\s*"([^"]*)"/.exec(localeSrc);
  if (!m) throw new Error("healthCost の日本語名が読めない");
  return m[1];
})();

describe("医療・健康予備費", () => {
  const JP_RESERVE = { b60: 150000, b70: 250000, b80: 400000 };

  it("日本の初期値は 15 / 25 / 40 万円", () => {
    const fresh = makeCountryProfile(DEFAULT_INPUTS, "JP", {});
    expect(fresh.healthBrackets).toEqual(JP_RESERVE);
  });

  it("海外4か国には、根拠のない額を作らない（0のまま）", () => {
    for (const c of ["US", "GB", "CA", "AU"]) {
      const fresh = makeCountryProfile(DEFAULT_INPUTS, c, {});
      expect(fresh.healthBrackets, `${c} に金額を作ってしまっている`)
        .toEqual({ b60: 0, b70: 0, b80: 0 });
      expect(COUNTRY_INPUT_DEFAULTS[c].healthBrackets, `${c} に国別初期値を足している`)
        .toBeUndefined();
    }
  });

  it("はじめて開いたときも、日本の参考初期値が入る", () => {
    expect(app, "初回の入力欄が参考初期値を通っていない")
      .toContain('useState(() => makeCountryProfile(DEFAULT_INPUTS, "JP", {}))');
  });

  it("日本で、打ち込んだ額を変えてから初期値に戻すと、15/25/40 に戻る", () => {
    /* App.jsx の「初期値に戻す」と同じ手順を再現する。 */
    const dirty = forceCountryMeta({
      ...DEFAULT_INPUTS,
      userName: "K", birthDate: "1968-11-13", currentAssets: 12345678,
      healthBrackets: { b60: 999999, b70: 888888, b80: 777777 },
      banks: [{ id: "b1", name: "Main", balance: 3000000 }],
    }, "JP");
    expect(dirty.healthBrackets.b60, "前提が崩れている").toBe(999999);

    const fresh = makeCountryProfile(DEFAULT_INPUTS, "JP", {});
    // ③ 参考初期値へ戻る
    expect(fresh.healthBrackets, "参考初期値に戻っていない").toEqual(JP_RESERVE);
    // ④ 打ち込んだ値は消える
    expect(fresh.userName, "名前が残っている").toBe("");
    expect(fresh.birthDate, "生年月日が残っている").toBe("");
    expect(fresh.currentAssets, "資産額が残っている").toBe(0);
    expect(fresh.banks, "銀行が残っている").toEqual([]);
    // ⑤ アプリが本来持つ設定は0にならない
    expect(fresh.postRetireReturn, "退職後の想定利回りが0になった").toBe(DEFAULT_INPUTS.postRetireReturn);
    expect(fresh.stockReturnPct, "株式の想定利回りが0になった").toBe(DEFAULT_INPUTS.stockReturnPct);
    expect(fresh.currentAge).toBe(DEFAULT_INPUTS.currentAge);
    expect(fresh.retireAge).toBe(DEFAULT_INPUTS.retireAge);
    expect(fresh.deathAge).toBe(DEFAULT_INPUTS.deathAge);
  });

  it("日本を初期値に戻しても、ほかの4か国は変わらない", () => {
    const profiles = {};
    PROFILE_COUNTRIES.forEach((c) => {
      profiles[c] = forceCountryMeta({
        ...DEFAULT_INPUTS, currentAssets: 1000, healthBrackets: { b60: 1, b70: 2, b80: 3 },
      }, c);
    });
    const before = JSON.parse(JSON.stringify(profiles));
    const after = { ...profiles, JP: makeCountryProfile(DEFAULT_INPUTS, "JP", {}) };

    expect(after.JP.healthBrackets, "日本が戻っていない").toEqual(JP_RESERVE);
    for (const c of ["US", "GB", "CA", "AU"]) {
      expect(after[c], `${c} のデータが変わった`).toEqual(before[c]);
    }
  });

  it("画面の文言が、公的制度の金額だと言い切っていない", () => {
    /* 15/25/40 は資金計画のための参考値。
       「高額療養費制度から算出した」「公的な自己負担額」とは書かない。 */
    const note = JA2.healthCostNote;
    expect(note, "説明文が無い").toBeTruthy();
    expect(note.includes("高額療養費"), "高額療養費制度から算出したと書いている").toBe(false);
    expect(note, "参考値だと書いていない").toMatch(/参考値/);
    expect(note, "公的制度の額ではないと書いていない").toMatch(/公的制度によって定められた自己負担額ではありません/);
    for (const k of ["health60sGuide", "health70sGuide", "health80sGuide"]) {
      expect(JA2[k].includes("高額療養費"), `${k} に高額療養費の断定が残っている`).toBe(false);
    }
    /* 厚労省の標準額だとも言わない */
    for (const k of ["healthCostNote", "health60sGuide", "health70sGuide", "health80sGuide"]) {
      expect(JA2[k].includes("厚生労働省"), `${k} に公的統計の裏づけがあるように書いている`).toBe(false);
    }
  });

  it("項目名が「医療・健康予備費（年間）」になっている", () => {
    expect(healthCostLabelJP).toBe("医療・健康予備費（年間）");
    expect(healthCostLabelJP.includes("自己負担"), "自己負担という言い方が残っている").toBe(false);
  });
});
