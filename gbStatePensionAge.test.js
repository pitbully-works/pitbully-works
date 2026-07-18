// ============================================================================
// gbStatePensionAge.test.js
// 【GB段階1】State Pension age（受給資格年齢）の自動算出テスト。
//
// 【出典】
//   - Pensions Act 2014 s.26：66歳→67歳への引上げを2026年4月〜2028年3月に前倒し。
//     1960-04-06〜1961-03-05生まれは66歳1か月〜66歳11か月、
//     1961-03-06〜1977-04-05生まれは67歳。
//   - Pensions Act 2007：67歳→68歳への引上げを2044〜2046年に実施。
//     1977-04-06以降生まれは68歳。
//   - GOV.UK「State Pension age timetable」
//
// 【設計】生年月日からの自動算出を標準とし、必要な場合のみ手動で上書きできる。
// ============================================================================

import { describe, it, expect } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

const ret = GB_COUNTRY_RULES.retirement;
const tax = GB_COUNTRY_RULES.tax;

const near = (actual, expected, tol = 1e-9) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

describe("GB：State Pension age の法定スケジュール", () => {
  it("1960年4月6日より前の生まれは66歳", () => {
    expect(ret.getStatePensionAge("1950-01-01").ageInYears).toBe(66);
    expect(ret.getStatePensionAge("1959-12-31").ageInYears).toBe(66);
    expect(ret.getStatePensionAge("1960-04-05").ageInYears).toBe(66);
  });

  it("1961年3月6日〜1977年4月5日の生まれは67歳", () => {
    expect(ret.getStatePensionAge("1961-03-06").ageInYears).toBe(67);
    expect(ret.getStatePensionAge("1970-06-15").ageInYears).toBe(67);
    expect(ret.getStatePensionAge("1977-04-05").ageInYears).toBe(67);
  });

  it("1978年4月6日以降の生まれは68歳（68歳の誕生日に到達）", () => {
    expect(ret.getStatePensionAge("1978-04-06").ageInYears).toBe(68);
    expect(ret.getStatePensionAge("1985-01-01").ageInYears).toBe(68);
    expect(ret.getStatePensionAge("2000-12-31").ageInYears).toBe(68);
  });

  it("GOV.UK公表の実例と一致する（1960-07-31 → 66歳4か月）", () => {
    const r = ret.getStatePensionAge("1960-07-31");
    expect(r.years).toBe(66);
    expect(r.months).toBe(4);
  });

  it("GOV.UK公表の実例と一致する（1960-12-31 → 66歳9か月）", () => {
    const r = ret.getStatePensionAge("1960-12-31");
    expect(r.years).toBe(66);
    expect(r.months).toBe(9);
  });

  it("GOV.UK公表の実例と一致する（1961-01-31 → 66歳10か月）", () => {
    const r = ret.getStatePensionAge("1961-01-31");
    expect(r.years).toBe(66);
    expect(r.months).toBe(10);
  });

  it("移行期の両端が正しい（66歳1か月〜66歳11か月）", () => {
    const first = ret.getStatePensionAge("1960-04-06");
    const last = ret.getStatePensionAge("1961-03-05");
    expect(first.years).toBe(66);
    expect(first.months).toBe(1);
    expect(last.years).toBe(66);
    expect(last.months).toBe(11);
  });

  it("移行期の判定は毎月6日を区切りとする", () => {
    // 6日以降はその月の区切り、5日以前は前月の区切りに属する
    expect(ret.getStatePensionAge("1960-07-05").months).toBe(3);
    expect(ret.getStatePensionAge("1960-07-06").months).toBe(4);
  });

  it("移行期だけ isTransitional が true になる", () => {
    expect(ret.getStatePensionAge("1960-07-31").isTransitional).toBe(true);
    expect(ret.getStatePensionAge("1959-01-01").isTransitional).toBe(false);
    expect(ret.getStatePensionAge("1970-01-01").isTransitional).toBe(false);
    expect(ret.getStatePensionAge("1980-01-01").isTransitional).toBe(false);
  });

  it("移行期の ageInYears は年＋月/12 で表される", () => {
    const r = ret.getStatePensionAge("1960-07-31");
    expect(near(r.ageInYears, 66 + 4 / 12)).toBe(true);
  });

  it("年齢は生年月日に対して単調に増加する（逆転しない）", () => {
    const dates = [
      "1955-01-01", "1960-04-05", "1960-04-06", "1960-09-30",
      "1961-03-05", "1961-03-06", "1977-04-05", "1977-04-06", "1990-01-01",
    ];
    const ages = dates.map((d) => ret.getStatePensionAge(d).ageInYears);
    for (let i = 1; i < ages.length; i++) {
      expect(ages[i] >= ages[i - 1]).toBe(true);
    }
  });

  it("1977年4月6日〜1978年4月5日は67→68の移行期（68歳固定ではない）", () => {
    const first = ret.getStatePensionAge("1977-04-06");
    const last = ret.getStatePensionAge("1978-04-05");
    expect(first.isTransitional).toBe(true);
    expect(last.isTransitional).toBe(true);
    expect(first.ageInYears < 68).toBe(true);
    expect(last.ageInYears < 68).toBe(true);
  });

  it("生年月日が未入力・不正な場合は null を返す", () => {
    expect(ret.getStatePensionAge("")).toBe(null);
    expect(ret.getStatePensionAge(null)).toBe(null);
    expect(ret.getStatePensionAge(undefined)).toBe(null);
    expect(ret.getStatePensionAge("not-a-date")).toBe(null);
  });

  it("Date オブジェクトでも同じ結果になる", () => {
    const fromString = ret.getStatePensionAge("1980-05-15").ageInYears;
    const fromDate = ret.getStatePensionAge(new Date("1980-05-15T00:00:00Z")).ageInYears;
    expect(fromString).toBe(fromDate);
  });
});

describe("GB：自動算出を標準とし、手動で上書きできる", () => {
  it("生年月日があれば自動算出され、isAuto が true になる", () => {
    const r = ret.resolveStatePensionAge("1980-05-15", 0);
    expect(r.ageInYears).toBe(68);
    expect(r.isAuto).toBe(true);
    expect(r.detail).toBeTruthy();
  });

  it("手動で値を入れた場合はその値が優先され、isAuto が false になる", () => {
    const r = ret.resolveStatePensionAge("1980-05-15", 65);
    expect(r.ageInYears).toBe(65);
    expect(r.isAuto).toBe(false);
  });

  it("上書き値が 0 / 空 / 不正なら自動算出に戻る", () => {
    for (const override of [0, "", null, undefined, "abc"]) {
      const r = ret.resolveStatePensionAge("1980-05-15", override);
      expect(r.ageInYears).toBe(68);
      expect(r.isAuto).toBe(true);
    }
  });

  it("生年月日が無く上書きも無い場合は既定値（67歳）を使う", () => {
    const r = ret.resolveStatePensionAge("", 0);
    expect(r.ageInYears).toBe(ret.statePension.defaultAge);
    expect(r.isAuto).toBe(false);
  });

  it("移行期の生まれは端数月を含む年齢が返る", () => {
    const r = ret.resolveStatePensionAge("1960-07-31", 0);
    expect(near(r.ageInYears, 66 + 4 / 12)).toBe(true);
    expect(r.detail.months).toBe(4);
  });
});

describe("GB：State Pension age と繰下げ受給の関係", () => {
  it("自動算出したSPAより前に受給しようとしても、SPAまで繰り上がらない（繰上げ不可）", () => {
    const spa = ret.resolveStatePensionAge("1980-01-01", 0).ageInYears; // 68歳
    expect(ret.getEffectiveClaimAge(65, spa)).toBe(spa);
    expect(ret.getEffectiveClaimAge(70, spa)).toBe(70);
  });

  it("SPAちょうどで受給するなら増額なし", () => {
    const spa = ret.resolveStatePensionAge("1970-01-01", 0).ageInYears; // 67歳
    expect(ret.getDeferralFactor(spa, spa)).toBe(1);
  });

  it("1年繰下げるとおよそ5.78%増える（9週ごとに1%）", () => {
    const spa = 67;
    const factor = ret.getDeferralFactor(68, spa);
    expect(near(factor, 1 + (52 / 9) * 0.01, 1e-9)).toBe(true);
    expect(Math.round((factor - 1) * 10000) / 100).toBe(5.78);
  });

  it("最低繰下げ週数（9週）未満では増額しない", () => {
    expect(ret.getDeferralFactorFromWeeks(8)).toBe(1);
    expect(ret.getDeferralFactorFromWeeks(9)).toBe(1.01);
  });

  it("SPAが68歳の人は、67歳時点では受給できない扱いになる", () => {
    const spa = ret.resolveStatePensionAge("1985-06-01", 0).ageInYears;
    expect(spa).toBe(68);
    expect(ret.getEffectiveClaimAge(67, spa)).toBe(68);
  });
});

describe("GB：スコットランド税率は未実装であることの固定", () => {
  it("適用地域は England / Wales / Northern Ireland に限定されている", () => {
    expect(tax.region).toBe("England, Wales & Northern Ireland");
    expect(tax.regionsImplemented).toEqual(["england", "wales", "northernIreland"]);
    expect(tax.regionsImplemented.includes("scotland")).toBe(false);
  });

  it("スコットランドは implemented: false で、税率・バンドを持たない", () => {
    expect(tax.scotland.implemented).toBe(false);
    expect(tax.scotland.bands).toBe(null);
    expect(tax.scotland.rates).toBe(null);
  });

  it("未実装リストにスコットランド税率が明記されている", () => {
    const listed = tax.notImplemented.some((n) => n.includes("スコットランド") || n.toLowerCase().includes("scottish"));
    expect(listed).toBe(true);
  });

  it("スコットランド独自の税率（19% / 21% / 42% / 45% / 48%）が混入していない", () => {
    // イングランド等のバンドは 20 / 40 / 45% の3段のみ。
    const rates = tax.incomeTax.bands.map((b) => b.rate);
    expect(rates).toEqual([0.20, 0.40, 0.45]);
    for (const scottishOnly of [0.19, 0.21, 0.42, 0.48]) {
      expect(rates.includes(scottishOnly)).toBe(false);
    }
  });

  it("スコットランドのバンド数（6段）ではなく3段である", () => {
    expect(tax.incomeTax.bands).toHaveLength(3);
  });

  it("スコットランド居住者向けの参照先URLは案内として保持している", () => {
    expect(typeof tax.sourceUrls.scotland).toBe("string");
    expect(tax.sourceUrls.scotland.includes("scottish-income-tax")).toBe(true);
  });

  it("所得税計算はスコットランド税率を適用しない（£30,000 で確認）", () => {
    // イングランド等：(30,000 − 12,570) × 20% = 3,486
    // スコットランドなら19%/20%/21%の複数段になり金額が変わる
    const r = tax.calculateIncomeTax(30000);
    expect(near(r.tax, (30000 - 12570) * 0.20, 1e-9)).toBe(true);
  });
});

describe("GB：67→68への移行期（Pensions Act 2007 Sch.3 TABLE 4）", () => {
  // 【出典】Pensions Act 2007 Schedule 3 TABLE 4
  //   https://www.legislation.gov.uk/ukpga/2007/22/schedule/3/enacted
  //   GOV.UK「State Pension age timetable」Table 5 と同一内容。
  // 移行期は「年齢」ではなく「SPAに到達する固定日」で定められている点が
  // 66→67の移行期（年齢で規定）と異なる。
  const table = [
    ["1977-04-06", "1977-05-05", "2044-05-06"],
    ["1977-05-06", "1977-06-05", "2044-07-06"],
    ["1977-06-06", "1977-07-05", "2044-09-06"],
    ["1977-07-06", "1977-08-05", "2044-11-06"],
    ["1977-08-06", "1977-09-05", "2045-01-06"],
    ["1977-09-06", "1977-10-05", "2045-03-06"],
    ["1977-10-06", "1977-11-05", "2045-05-06"],
    ["1977-11-06", "1977-12-05", "2045-07-06"],
    ["1977-12-06", "1978-01-05", "2045-09-06"],
    ["1978-01-06", "1978-02-05", "2045-11-06"],
    ["1978-02-06", "1978-03-05", "2046-01-06"],
    ["1978-03-06", "1978-04-05", "2046-03-06"],
  ];

  it("法定表は12区分ある", () => {
    expect(ret.statePension.age68Table).toHaveLength(12);
  });

  it.each(table)("生年月日 %s（区分の始め）は %s までの区分で、%s にSPAへ到達する", (from, _to, spaDate) => {
    expect(ret.getStatePensionAge(from).spaDate).toBe(spaDate);
  });

  it.each(table)("生年月日 %s〜%s の区分は、終わりの日でも同じ到達日 %s になる", (_from, to, spaDate) => {
    expect(ret.getStatePensionAge(to).spaDate).toBe(spaDate);
  });

  it("到達日は2044年5月6日から2046年3月6日まで、2か月刻みで進む", () => {
    const dates = ret.statePension.age68Table.map((r) => r.spaDate);
    expect(dates[0]).toBe("2044-05-06");
    expect(dates[dates.length - 1]).toBe("2046-03-06");
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(`${dates[i - 1]}T00:00:00Z`);
      const cur = new Date(`${dates[i]}T00:00:00Z`);
      const monthsApart =
        (cur.getUTCFullYear() - prev.getUTCFullYear()) * 12 + (cur.getUTCMonth() - prev.getUTCMonth());
      expect(monthsApart).toBe(2);
    }
  });

  it("区分の切れ目は「6日」で、1日ずれると別の到達日になる", () => {
    expect(ret.getStatePensionAge("1977-05-05").spaDate).toBe("2044-05-06");
    expect(ret.getStatePensionAge("1977-05-06").spaDate).toBe("2044-07-06");
  });

  it("移行期の直前（1977年4月5日）は67歳のまま、移行期に入らない", () => {
    const before = ret.getStatePensionAge("1977-04-05");
    expect(before.ageInYears).toBe(67);
    expect(before.isTransitional).toBe(false);
    expect(before.spaDate).toBe(null);
  });

  it("移行期の直後（1978年4月6日）は68歳で、到達日は固定されない", () => {
    const after = ret.getStatePensionAge("1978-04-06");
    expect(after.ageInYears).toBe(68);
    expect(after.isTransitional).toBe(false);
    expect(after.spaDate).toBe(null);
  });

  it("移行期の到達年齢は67歳台から68歳へ向かって上がる", () => {
    // 各区分の開始日で比べると、67歳1か月 → 67歳2か月 …… → 68歳0か月
    const first = ret.getStatePensionAge("1977-04-06");
    const last = ret.getStatePensionAge("1978-03-06");
    expect(first.years).toBe(67);
    expect(first.months).toBe(1);
    expect(last.years).toBe(68);
    expect(last.months).toBe(0);
  });

  it("同じ区分でも生年月日が遅いほど到達年齢は若くなる（到達日が固定のため）", () => {
    // 1977-04-06 と 1977-05-05 はどちらも 2044-05-06 に到達する
    const early = ret.getStatePensionAge("1977-04-06");
    const late = ret.getStatePensionAge("1977-05-05");
    expect(early.spaDate).toBe(late.spaDate);
    expect(late.ageInYears <= early.ageInYears).toBe(true);
  });

  it("最終区分では68歳の誕生日より前に到達する人がいる（法律どおりの挙動）", () => {
    // 1978-04-05生まれは68歳の誕生日（2046-04-05）より前の2046-03-06に到達する
    const r = ret.getStatePensionAge("1978-04-05");
    expect(r.spaDate).toBe("2046-03-06");
    expect(r.years).toBe(67);
    expect(r.months).toBe(11);
    expect(r.ageInYears < 68).toBe(true);
  });

  it("移行期の全区分で isTransitional が true になる", () => {
    for (const [from, to] of table) {
      expect(ret.getStatePensionAge(from).isTransitional).toBe(true);
      expect(ret.getStatePensionAge(to).isTransitional).toBe(true);
    }
  });

  it("移行期の出典が Pensions Act 2007 Sch.3 と記録されている", () => {
    expect(ret.getStatePensionAge("1977-08-15").source).toContain("Pensions Act 2007");
  });

  it("移行期をまたいでも State Pension age は単調に増加する", () => {
    const dates = [
      "1976-01-01", "1977-04-05", "1977-04-06", "1977-08-15",
      "1978-01-01", "1978-04-05", "1978-04-06", "1990-01-01",
    ];
    const ages = dates.map((d) => ret.getStatePensionAge(d).ageInYears);
    for (let i = 1; i < ages.length; i++) {
      expect(ages[i] >= ages[i - 1]).toBe(true);
    }
  });

  it("移行期でも自動算出が働き、手動上書きで置き換えられる", () => {
    const auto = ret.resolveStatePensionAge("1977-08-15", 0);
    expect(auto.isAuto).toBe(true);
    expect(auto.detail.isTransitional).toBe(true);
    const manual = ret.resolveStatePensionAge("1977-08-15", 67);
    expect(manual.isAuto).toBe(false);
    expect(manual.ageInYears).toBe(67);
  });
});
