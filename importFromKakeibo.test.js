// ============================================================================
// importFromKakeibo.test.js
//
// 家計簿アプリから渡されたデータの取り込みのテスト。
//
// 【不具合1】通常の「バックアップの読み込み」を使い回していたため、配列が
// 丸ごと入れ替わり、家計簿が持っていない情報（保険の benefits・customBenefits、
// 民間年金の currentBalance など）が消えていた。
//
// 【不具合2】家計簿に登録の無い分類が空配列で届くと、こちらの既存データが
// 全部消える恐れがあった。空配列を「全部消せ」と解釈してはいけない。
//
// 【重要】計算には関与しない。取り込みの重ね方だけを見る。
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isKakeiboPayload, mergeList, mergeKakeiboInputs, checkKakeiboAmountUnit } from "./utils/importFromKakeibo.js";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.jsx"), "utf8");

/* ライフプラン側にすでに入っている、詳しい内容 */
const CURRENT = () => ({
  currentAge: 58,
  birthDate: "1968-11-13",
  retireAge: 65,
  pensionMonthly: 167106,
  insurancePolicies: [
    {
      name: "JAめぐみの　医療共済", monthlyPremium: 15767, premiumFromAge: 46, premiumToAge: 65,
      coverageUntilAge: 82.8,
      benefits: { hospitalizationPerDay: 10000, hospitalizationSurgery: 200000, death: 0 },
      customBenefits: [{ name: "がん保険金", amount: 1000000 }, { name: "介護保険金", amount: 1000000 }],
    },
    {
      name: "明治安田生命", monthlyPremium: 18672, premiumFromAge: 50, premiumToAge: 63,
      benefits: { death: 3000000 }, customBenefits: [],
    },
  ],
  privatePensionPlans: [
    { name: "JA年金共済", monthlyContribution: 15000, payoutFromAge: 60, payoutToAge: 70, currentBalance: 1234567 },
  ],
  banks: [{ name: "JAめぐみの", balance: 501192 }, { name: "八幡信用金庫", balance: 601578 }, { name: "楽天銀行", balance: 0 }],
  loans: [{ name: "車", principal: 3051600, memo: "ライフプランだけのメモ" }],
});
const payload = (inputs, extra = {}) => Object.assign({ source: "kakeibo", schemaVersion: 1, inputs }, extra);

describe("家計簿から来たデータだと見分ける", () => {
  it("印があるものだけを、家計簿由来として扱う", () => {
    expect(isKakeiboPayload(payload({}))).toBe(true);
    expect(isKakeiboPayload({ inputs: {} })).toBe(false, "通常のバックアップまで別扱いにしている");
    expect(isKakeiboPayload({ source: "other", inputs: {} })).toBe(false);
    expect(isKakeiboPayload(null)).toBe(false);
    expect(isKakeiboPayload("こわれ")).toBe(false);
  });

  it("画面が、家計簿由来のときだけ専用の取り込みを使う", () => {
    expect(app).toContain("isKakeiboPayload(parsed)");
    /* 重ねる相手は、5か国プロファイル対応で inputs から
       「取り込み先の国のプロファイル」へ変わった。
       ここで見張りたいのは相手の名前ではなく、
       **家計簿由来のときは専用の重ね方を通ること**。 */
    expect(app).toMatch(/mergeKakeiboInputs\(\s*\w+\s*,\s*parsed\s*\)/);
    /* 通常のバックアップは、これまでどおり mergeSavedInputs で重ねる。
       5か国プロファイル対応で、重ねる相手が「その国のまっさらなプロファイル」に
       変わったので、呼び出しの形ではなく **専用の重ね方を通ること** を見る。 */
    expect(app).toMatch(/mergeSavedInputs\([^)]*parsed\.inputs\)/);
  });
});

describe("ライフプランにしかない情報を消さない", () => {
  it("保険の benefits が残る", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({
      insurancePolicies: [{ name: "JAめぐみの　医療共済", monthlyPremium: 16000, premiumFromAge: 46, premiumToAge: 63 }],
    }));
    const p = r.inputs.insurancePolicies[0];
    expect(p.benefits).toEqual(expect.objectContaining({ hospitalizationPerDay: 10000, hospitalizationSurgery: 200000, death: 0 }));
  });

  it("保険の customBenefits が残る", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({
      insurancePolicies: [{ name: "JAめぐみの　医療共済", monthlyPremium: 16000 }],
    }));
    expect(r.inputs.insurancePolicies[0].customBenefits).toHaveLength(2);
    expect(r.inputs.insurancePolicies[0].customBenefits[0].name).toBe("がん保険金");
  });

  it("民間年金の currentBalance が残る", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({
      privatePensionPlans: [{ name: "JA年金共済", monthlyContribution: 20000 }],
    }));
    expect(r.inputs.privatePensionPlans[0].currentBalance).toBe(1234567);
    expect(r.inputs.privatePensionPlans[0].payoutFromAge).toBe(60, "受け取りの設定まで消えている");
  });

  it("家計簿で直した項目だけは、ちゃんと上書きされる", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({
      insurancePolicies: [{ name: "JAめぐみの　医療共済", monthlyPremium: 16000, premiumToAge: 63 }],
      privatePensionPlans: [{ name: "JA年金共済", monthlyContribution: 20000 }],
    }));
    expect(r.inputs.insurancePolicies[0].monthlyPremium).toBe(16000);
    expect(r.inputs.insurancePolicies[0].premiumToAge).toBe(63);
    expect(r.inputs.privatePensionPlans[0].monthlyContribution).toBe(20000);
  });

  it("ライフプランだけのメモなども残る", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({ loans: [{ name: "車", principal: 2000000 }] }));
    expect(r.inputs.loans[0].memo).toBe("ライフプランだけのメモ");
    expect(r.inputs.loans[0].principal).toBe(2000000);
  });

  it("入れ子の中身も、丸ごと入れ替えずに重ねる", () => {
    const cur = { ideco: { currentValue: 500000, returnPct: 5, payoutMethod: "pension" } };
    const r = mergeKakeiboInputs(cur, payload({ ideco: { monthlyContribution: 23000 } }));
    expect(r.inputs.ideco).toEqual({ currentValue: 500000, returnPct: 5, payoutMethod: "pension", monthlyContribution: 23000 });
  });
});

describe("どの行と どの行を対応させるか", () => {
  it("id があれば、名前より id を優先する", () => {
    const cur = { banks: [{ id: "b1", name: "むかしの名前", balance: 100 }] };
    const r = mergeKakeiboInputs(cur, payload({ banks: [{ id: "b1", name: "あたらしい名前", balance: 200 }] }));
    expect(r.inputs.banks).toHaveLength(1);
    expect(r.inputs.banks[0].name).toBe("あたらしい名前");
    expect(r.inputs.banks[0].balance).toBe(200);
  });

  it("同じ名前が複数あるときは、取り違えずに新しい行として足す", () => {
    const cur = { banks: [{ name: "同じ名前", balance: 1 }, { name: "同じ名前", balance: 2 }] };
    const r = mergeKakeiboInputs(cur, payload({ banks: [{ name: "同じ名前", balance: 999 }] }));
    expect(r.inputs.banks).toHaveLength(3, "どちらかへ勝手に混ぜている");
    expect(r.inputs.banks[0].balance).toBe(1);
    expect(r.inputs.banks[1].balance).toBe(2);
    expect(r.inputs.banks[2].balance).toBe(999);
  });

  it("別の契約へ誤って混ぜない", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({
      insurancePolicies: [{ name: "明治安田生命", monthlyPremium: 19000 }],
    }));
    expect(r.inputs.insurancePolicies[0].monthlyPremium).toBe(15767, "別の契約を書き換えている");
    expect(r.inputs.insurancePolicies[1].monthlyPremium).toBe(19000);
    expect(r.inputs.insurancePolicies[0].customBenefits).toHaveLength(2);
  });

  it("家計簿で新しく足した契約は、行が増える", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({
      insurancePolicies: [{ name: "新しい保険", monthlyPremium: 3000 }],
    }));
    expect(r.inputs.insurancePolicies).toHaveLength(3);
    expect(r.inputs.insurancePolicies[2].name).toBe("新しい保険");
  });

  it("家計簿で新しく足した保険にも表示に必要な benefits を自動補完する", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({
      insurancePolicies: [{ name: "新しい保険", monthlyPremium: 3000, premiumFromAge: 58, premiumToAge: 65 }],
    }));
    const p = r.inputs.insurancePolicies[2];
    expect(p.benefits).toEqual({
      hospitalizationPerDay: 0,
      hospitalizationDaysLimit: 0,
      hospitalizationSurgery: 0,
      daySurgery: 0,
      radiationPerSession: 0,
      advancedMedical: 0,
      death: 0,
    });
    expect(p.customBenefits).toEqual([]);
    expect(() => p.benefits.hospitalizationPerDay).not.toThrow();
  });

  it("既存の保険データに benefits が欠けていても連携時に補修する", () => {
    const cur = { insurancePolicies: [{ name: "古い保険", monthlyPremium: 1000 }] };
    const r = mergeKakeiboInputs(cur, payload({
      insurancePolicies: [{ name: "古い保険", monthlyPremium: 1200 }],
    }));
    expect(r.inputs.insurancePolicies[0].monthlyPremium).toBe(1200);
    expect(r.inputs.insurancePolicies[0].benefits.hospitalizationPerDay).toBe(0);
    expect(r.inputs.insurancePolicies[0].customBenefits).toEqual([]);
  });

  it("届かなかった行は、そのまま残る（消さない）", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({ banks: [{ name: "JAめぐみの", balance: 999 }] }));
    expect(r.inputs.banks).toHaveLength(3, "届かなかった銀行が消えている");
    expect(r.inputs.banks[0].balance).toBe(999);
    expect(r.inputs.banks[2].name).toBe("楽天銀行");
  });
});

describe("空配列を「全部消せ」と解釈しない", () => {
  it("銀行3件あって空配列が届いても、3件のまま", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({ banks: [] }));
    expect(r.inputs.banks).toHaveLength(3);
  });

  it("保険2件あって空配列が届いても、2件のまま", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({ insurancePolicies: [] }));
    expect(r.inputs.insurancePolicies).toHaveLength(2);
    expect(r.inputs.insurancePolicies[0].customBenefits).toHaveLength(2);
  });

  it("全部の分類が空でも、何ひとつ消えない", () => {
    const cur = CURRENT();
    const r = mergeKakeiboInputs(cur, payload({
      banks: [], loans: [], privatePensionPlans: [], insurancePolicies: [], lumpSums: [],
      tsumitateSchedule: [], gold: {}, ideco: {},
    }));
    expect(r.inputs).toEqual(cur);
    expect(r.touched).toEqual([]);
  });

  it("届いた分類だけを触り、ほかには影響しない", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({ banks: [{ name: "JAめぐみの", balance: 999 }] }));
    expect(r.touched).toEqual(["banks"]);
    expect(r.inputs.insurancePolicies).toEqual(CURRENT().insurancePolicies);
    expect(r.inputs.privatePensionPlans).toEqual(CURRENT().privatePensionPlans);
    expect(r.inputs.loans).toEqual(CURRENT().loans);
  });

  it("ライフプランでしか入れない値は、いっさい変わらない", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({ banks: [{ name: "JAめぐみの", balance: 999 }] }));
    expect(r.inputs.currentAge).toBe(58);
    expect(r.inputs.retireAge).toBe(65);
    expect(r.inputs.pensionMonthly).toBe(167106);
  });
});

describe("生年月日は勝手に書き換えない", () => {
  it("食い違っていたら知らせる", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({}, { birth: "1970-01-05" }));
    expect(r.birthMismatch).toEqual({ kakeibo: "1970-01-05", lifePlan: "1968-11-13" });
    expect(r.inputs.birthDate).toBe("1968-11-13", "勝手に書き換えている");
  });

  it("同じなら、何も知らせない", () => {
    expect(mergeKakeiboInputs(CURRENT(), payload({}, { birth: "1968-11-13" })).birthMismatch).toBe(null);
  });

  it("どちらか空なら、知らせない", () => {
    expect(mergeKakeiboInputs(CURRENT(), payload({})).birthMismatch).toBe(null);
    expect(mergeKakeiboInputs({}, payload({}, { birth: "1970-01-05" })).birthMismatch).toBe(null);
  });

  it("知らせる文言が ja / en どちらにもある", () => {
    expect(JA_TRANSLATIONS.birthMismatchWarning).toBeTruthy();
    expect(EN_TRANSLATIONS.birthMismatchWarning).toBeTruthy();
    expect(JA_TRANSLATIONS.birthMismatchWarning).toContain("{kakeibo}");
    expect(JA_TRANSLATIONS.birthMismatchWarning).toContain("{lifePlan}");
    expect(app).toContain('t("birthMismatchWarning"');
  });
});

describe("壊れたデータでも落ちない", () => {
  it("古い保存データ・欠けた値でも落ちない", () => {
    expect(() => mergeKakeiboInputs(null, null)).not.toThrow();
    expect(() => mergeKakeiboInputs(undefined, payload({ banks: [null, undefined, "こわれ"] }))).not.toThrow();
    expect(() => mergeKakeiboInputs({ banks: "こわれ" }, payload({ banks: [{ name: "A" }] }))).not.toThrow();
    expect(() => mergeKakeiboInputs(CURRENT(), { source: "kakeibo" })).not.toThrow();
    expect(mergeKakeiboInputs(CURRENT(), { source: "kakeibo" }).inputs).toEqual(CURRENT());
  });

  it("配列でないものを渡しても、既存を壊さない", () => {
    expect(mergeList([{ name: "A" }], null)).toEqual([{ name: "A" }]);
    expect(mergeList([{ name: "A" }], "こわれ")).toEqual([{ name: "A" }]);
    expect(mergeList(null, [{ name: "B" }])).toEqual([{ name: "B" }]);
    expect(mergeList(null, null)).toEqual([]);
  });

  it("配列内の null・文字列・数値を state に入れない", () => {
    const r = mergeKakeiboInputs(
      { banks: [{ name: "既存", balance: 50 }] },
      payload({ banks: [null, undefined, "こわれ", 123, { name: "正常", balance: 100 }] })
    );
    expect(r.inputs.banks).toEqual([
      { name: "既存", balance: 50 },
      { name: "正常", balance: 100 },
    ]);
    expect(r.inputs.banks.every((row) => row && typeof row === "object" && !Array.isArray(row))).toBe(true);
  });

  it("既存配列に残った不正行も、家計簿連携時に除去する", () => {
    const r = mergeKakeiboInputs(
      { banks: [null, "こわれ", { name: "既存", balance: 50 }] },
      payload({ banks: [{ name: "正常", balance: 100 }] })
    );
    expect(r.inputs.banks).toEqual([
      { name: "既存", balance: 50 },
      { name: "正常", balance: 100 },
    ]);
  });

  it("もとのデータを書き換えない（複製して返す）", () => {
    const cur = CURRENT();
    const before = JSON.stringify(cur);
    mergeKakeiboInputs(cur, payload({ banks: [{ name: "JAめぐみの", balance: 999 }] }));
    expect(JSON.stringify(cur)).toBe(before, "渡された側を書き換えている");
  });
});

// ============================================================================
// 受信ガード：金額の単位（amount_unit）
// ----------------------------------------------------------------------------
// 家計簿アプリは内部で「最小通貨単位」を使う。
//   日本 … 1 = 1円（倍率1） ／ 米英加豪 … 1 = 1セント（倍率100）
// こちらへ渡すときだけ主単位へ戻し、amount_unit: "major" を添える決まり。
//
// この取り決めが崩れて最小単位のまま届くと、$12.34 が $1,234.00 になる。
// 逆なら 1/100 になる。しかも金額の値からは、どちらの単位か絶対に分からない
// （1234 は $1,234.00 とも $12.34 とも読める）。
// だから **"major" と書いてあるときだけ取り込み、それ以外は止める**。
// こちらで倍率を推測して直すことは、してはいけない。
// ============================================================================
describe("受信ガード：金額の単位", () => {
  /* 家計簿アプリが実際に書き出す形（buildLifePlanInputs の出力に合わせてある）。 */
  const payload = (country, over = {}) => ({
    source: "kakeibo",
    schemaVersion: 2,
    countryCode: country,
    baseCurrency: { JP: "JPY", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD" }[country],
    amount_unit: "major",
    minor_unit_scale: country === "JP" ? 1 : 100,
    inputs: {
      banks: [{ id: "b1", name: "Main", balance: 1200, monthlyDeposit: 50, interestPct: 1.5 }],
    },
    ...over,
  });

  it("amount_unit が major なら取り込める（5か国とも、主単位の値がそのまま入る）", () => {
    for (const c of ["JP", "US", "GB", "CA", "AU"]) {
      const got = checkKakeiboAmountUnit(payload(c));
      expect(got.ok, `${c}：取り込みを止めてしまった`).toBe(true);

      const merged = mergeKakeiboInputs({ banks: [] }, payload(c));
      expect(merged.inputs.banks[0].balance, `${c}：残高が変わった`).toBe(1200);
      expect(merged.inputs.banks[0].monthlyDeposit, `${c}：毎月の入金が変わった`).toBe(50);
      expect(merged.inputs.banks[0].interestPct, `${c}：利率が変わった`).toBe(1.5);
    }
  });

  it("JPの既存データは1円も変わらない", () => {
    const mine = {
      birthDate: "1968-11-13",
      banks: [{ id: "b1", name: "Main", balance: 5000000, monthlyDeposit: 30000, interestPct: 0.2 }],
      loans: [{ id: "l1", name: "住宅", principal: 20000000, monthlyPayment: 85000 }],
    };
    const jp = payload("JP", {
      inputs: { banks: [{ id: "b1", name: "Main", balance: 5000000, monthlyDeposit: 30000, interestPct: 0.2 }] },
    });
    const merged = mergeKakeiboInputs(mine, jp);
    expect(merged.inputs.banks[0].balance).toBe(5000000);
    expect(merged.inputs.banks[0].monthlyDeposit).toBe(30000);
    expect(merged.inputs.banks[0].interestPct).toBe(0.2);
    /* 届かなかった分類（借入）には触らない */
    expect(merged.inputs.loans[0].principal).toBe(20000000);
  });

  it("amount_unit が無ければ取り込まない（印の無い古い書き出し）", () => {
    for (const c of ["JP", "US", "GB", "CA", "AU"]) {
      const p = payload(c);
      delete p.amount_unit;
      const got = checkKakeiboAmountUnit(p);
      expect(got.ok, `${c}：印が無いのに取り込もうとしている`).toBe(false);
      expect(got.reason).toBe("missing");
    }
  });

  it("minor など知らない値なら取り込まない", () => {
    for (const unit of ["minor", "cents", "MAJOR", "Major", " major", "yen", "1", ""]) {
      const got = checkKakeiboAmountUnit(payload("US", { amount_unit: unit }));
      expect(got.ok, `amount_unit=${JSON.stringify(unit)} を通してしまった`).toBe(false);
    }
    expect(checkKakeiboAmountUnit(payload("US", { amount_unit: 100 })).ok).toBe(false);
    expect(checkKakeiboAmountUnit(payload("US", { amount_unit: null })).ok).toBe(false);
    expect(checkKakeiboAmountUnit(payload("US", { amount_unit: { unit: "major" } })).ok).toBe(false);
  });

  it("止めたときに、原因が分かる値を返す", () => {
    /* 画面に「amount_unit: minor」と出せるようにしておく。
       ただ「取り込めません」だけだと、何を直せばよいか分からない。 */
    expect(checkKakeiboAmountUnit(payload("US", { amount_unit: "minor" })).unit).toBe("minor");
    expect(checkKakeiboAmountUnit(payload("US", { amount_unit: "minor" })).reason).toBe("unknown");
  });

  it("止めるだけで、金額を勝手に直さない（受け取った数をそのまま入れる）", () => {
    /* 「minor で来たから100で割る」ようなことは絶対にしない。
       単位が分からないまま換算するのが、いちばん危ない。
       取り込みを通った数は、1桁も変わらずに入ること。 */
    const values = [1200, 1234.56, 0.01, 999999, 5000000, 1, 0.5, 123456789];
    for (const v of values) {
      const merged = mergeKakeiboInputs({ banks: [] }, payload("US", {
        inputs: { banks: [{ id: "b1", name: "Main", balance: v, monthlyDeposit: v, interestPct: v }] },
      }));
      const row = merged.inputs.banks[0];
      expect(row.balance, `${v} が変わった`).toBe(v);
      expect(row.monthlyDeposit, `${v} が変わった`).toBe(v);
      expect(row.interestPct, `${v} が変わった`).toBe(v);
    }
  });

  it("止めたときは、いまの内容に指一本触れない", () => {
    /* ガードは App 側で throw して取り込みを中止する。
       ここでは「重ねる処理そのものが呼ばれなければ何も変わらない」ことを確かめる。 */
    const mine = { banks: [{ id: "b1", name: "Main", balance: 5000000 }] };
    const before = JSON.parse(JSON.stringify(mine));
    const bad = payload("US", { amount_unit: "minor" });
    expect(checkKakeiboAmountUnit(bad).ok).toBe(false);
    expect(mine, "元のデータが書き換わった").toEqual(before);
  });

  it("App は、単位を確かめてから重ねる", () => {
    const at = app.indexOf("checkKakeiboAmountUnit(parsed)");
    const merge = app.indexOf("mergeKakeiboInputs(");
    /* プロファイルへ書き込む前に止めること。あとから止めても、
       countryProfilesRef が書き換わったあとでは手遅れになる。 */
    const touchProfiles = app.indexOf("countryProfilesRef.current = { ...countryProfilesRef.current, [currentCode]: inputs }");
    expect(at, "単位を確かめていない").toBeGreaterThan(0);
    expect(at, "重ねたあとに確かめている").toBeLessThan(merge);
    if (touchProfiles > 0) {
      expect(at, "プロファイルを書き換えたあとに確かめている").toBeLessThan(touchProfiles);
    }
    expect(app).toMatch(/importUnitMissingError/);
    expect(app).toMatch(/importUnitUnknownError/);
  });

  it("止めたときの文言が、日本語と英語の両方にある", () => {
    for (const key of ["importUnitMissingError", "importUnitUnknownError"]) {
      expect(JA_TRANSLATIONS[key], `日本語の ${key} が無い`).toBeTruthy();
      expect(EN_TRANSLATIONS[key], `英語の ${key} が無い`).toBeTruthy();
    }
    expect(JA_TRANSLATIONS.importUnitUnknownError).toMatch(/\{unit\}/);
    expect(EN_TRANSLATIONS.importUnitUnknownError).toMatch(/\{unit\}/);
  });

  it("家計簿から来たデータ以外は、これまでどおり（ガードは通らない）", () => {
    /* 通常のバックアップ（source が無い）は、単位の印を持たない。
       ここでガードが効いてしまうと、自分の書き出しを戻せなくなる。 */
    expect(isKakeiboPayload({ inputs: {} })).toBe(false);
    expect(isKakeiboPayload({ source: "backup", inputs: {} })).toBe(false);
  });
});
