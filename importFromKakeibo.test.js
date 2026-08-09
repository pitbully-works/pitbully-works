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
import { isKakeiboPayload, mergeList, mergeKakeiboInputs, findScheduleOverlaps } from "./utils/importFromKakeibo.js";
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
    expect(app).toContain("mergeKakeiboInputs(inputs, parsed)");
    /* 通常のバックアップは、これまでどおり mergeSavedInputs のまま */
    expect(app).toContain("mergeSavedInputs(prev, parsed.inputs)");
  });
});

describe("ライフプランにしかない情報を消さない", () => {
  it("保険の benefits が残る", () => {
    const r = mergeKakeiboInputs(CURRENT(), payload({
      insurancePolicies: [{ name: "JAめぐみの　医療共済", monthlyPremium: 16000, premiumFromAge: 46, premiumToAge: 63 }],
    }));
    const p = r.inputs.insurancePolicies[0];
    expect(p.benefits).toEqual({ hospitalizationPerDay: 10000, hospitalizationSurgery: 200000, death: 0 });
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

  it("もとのデータを書き換えない（複製して返す）", () => {
    const cur = CURRENT();
    const before = JSON.stringify(cur);
    mergeKakeiboInputs(cur, payload({ banks: [{ name: "JAめぐみの", balance: 999 }] }));
    expect(JSON.stringify(cur)).toBe(before, "渡された側を書き換えている");
  });
});

// ============================================================================
// NISAの積立区間が重なっていないか知らせる
//
// 【なぜ要るか】
// 区間は名前を持たず、こちらで手入力した区間には id も無い。そのため
// 家計簿から来た区間は既存の行と対応させられず、新しい行として足される。
// 「35〜65歳」と「57〜65歳」が並ぶと、重なる期間は合算されて積立額が二重になる。
//
// 開始年齢が違う区間を勝手に同じものと決めつけるのは危ないので、
// 知らせるだけにして、消すかどうかは利用者に任せる。
// ============================================================================
describe("NISAの積立区間の重なりを知らせる", () => {
  it("手入力の区間と家計簿の区間が重なったら知らせる", () => {
    const current = { tsumitateSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 100000 }] };
    const r = mergeKakeiboInputs(current, {
      source: "kakeibo",
      inputs: { tsumitateSchedule: [{ fromAge: 57, toAge: 65, monthlyYen: 100000, id: "k1" }] },
    });
    expect(r.scheduleOverlaps).toContain("tsumitateSchedule");
    /* 知らせるだけ。勝手に消さない */
    expect(r.inputs.tsumitateSchedule).toHaveLength(2);
  });

  it("重なっていなければ知らせない", () => {
    expect(findScheduleOverlaps({
      tsumitateSchedule: [
        { fromAge: 35, toAge: 56, monthlyYen: 100000 },
        { fromAge: 57, toAge: 65, monthlyYen: 100000 },
      ],
    })).toEqual([]);
  });

  it("端の年齢が同じなら、その年齢は両方に入るので重なりとみなす", () => {
    expect(findScheduleOverlaps({
      growthSchedule: [
        { fromAge: 35, toAge: 57, monthlyYen: 50000 },
        { fromAge: 57, toAge: 65, monthlyYen: 10000 },
      ],
    })).toEqual(["growthSchedule"]);
  });

  it("金額が0の区間は、計算に効かないので知らせない", () => {
    expect(findScheduleOverlaps({
      tsumitateSchedule: [
        { fromAge: 35, toAge: 65, monthlyYen: 0 },
        { fromAge: 57, toAge: 65, monthlyYen: 100000 },
      ],
    })).toEqual([]);
  });

  it("つみたて枠と成長枠は別ものなので、またいだ重なりは知らせない", () => {
    expect(findScheduleOverlaps({
      tsumitateSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 100000 }],
      growthSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 50000 }],
    })).toEqual([]);
  });

  it("両方の枠で重なっていれば、両方を知らせる", () => {
    expect(findScheduleOverlaps({
      tsumitateSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 1 }, { fromAge: 57, toAge: 65, monthlyYen: 1 }],
      growthSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 1 }, { fromAge: 57, toAge: 65, monthlyYen: 1 }],
    })).toEqual(["tsumitateSchedule", "growthSchedule"]);
  });

  it("壊れたデータでも落ちない", () => {
    expect(() => findScheduleOverlaps(null)).not.toThrow();
    expect(findScheduleOverlaps(null)).toEqual([]);
    expect(findScheduleOverlaps({ tsumitateSchedule: "こわれ" })).toEqual([]);
    expect(findScheduleOverlaps({ tsumitateSchedule: [null, undefined, 3] })).toEqual([]);
    expect(findScheduleOverlaps({ tsumitateSchedule: [{ fromAge: 65, toAge: 35, monthlyYen: 1 }] })).toEqual([]);
  });

  it("取り込みそのものは、これまでどおり動く（知らせるだけ）", () => {
    const current = { tsumitateSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 100000 }] };
    const before = JSON.stringify(current);
    const r = mergeKakeiboInputs(current, {
      source: "kakeibo",
      inputs: { tsumitateSchedule: [{ fromAge: 57, toAge: 65, monthlyYen: 100000, id: "k1" }] },
    });
    expect(JSON.stringify(current)).toBe(before, "渡された側を書き換えている");
    expect(r.inputs.tsumitateSchedule[0]).toEqual({ fromAge: 35, toAge: 65, monthlyYen: 100000 });
  });
});

describe("重なりの知らせの文言", () => {
  it("日本語・英語の両方にある", () => {
    expect(JA_TRANSLATIONS.scheduleOverlapWarning).toBeTruthy();
    expect(EN_TRANSLATIONS.scheduleOverlapWarning).toBeTruthy();
  });

  it("合算されることと、確認をうながすことが書いてある", () => {
    expect(JA_TRANSLATIONS.scheduleOverlapWarning).toContain("合算");
    expect(JA_TRANSLATIONS.scheduleOverlapWarning).toContain("確認");
  });

  it("画面につながっている（勝手に消さず、知らせるだけ）", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "App.jsx"), "utf8");
    expect(src).toContain("scheduleOverlapWarning");
    expect(src).toContain("setImportScheduleOverlaps");
  });
});
