import React, { useState, useMemo, useEffect, useCallback, useContext, createContext } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, BarChart, Bar, Legend, Cell, PieChart, Pie, LabelList
} from "recharts";
import { Plus, Trash2, TrendingUp, HeartPulse, Landmark, Users, Ruler, Info, Coins, PiggyBank } from "lucide-react";
import "./storageShim.js";

// ---------- helpers ----------
const yen = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "¥0";
  const sign = n < 0 ? "-" : "";
  n = Math.abs(Math.round(n));
  if (n >= 100000000) return `${sign}¥${(n / 100000000).toFixed(2)}億`;
  if (n >= 10000) return `${sign}¥${(n / 10000).toFixed(1)}万`;
  return `${sign}¥${n.toLocaleString()}`;
};

// ============================================================================
// ---------- 国際化（i18n）基盤 ----------
// 目的：既存の日本版の挙動・計算ロジック・見た目は一切変更せず、
// 「国を選択すると表示ラベル・通貨表記だけが切り替わる」土台を追加する。
// 将来的に国が増えても、下記のテーブルに1行追加するだけで拡張できる設計。
// 注意：各国固有の制度計算（NISA枠・iDeCoの拠出上限・401(k)拠出上限・
// 健康保険の自己負担ルール等）は今回のスコープ外。今回は「表示層」の
// 多言語・多通貨対応のみを行い、計算ロジックは日本の現行ルールのまま。
// ============================================================================

// 初期対応国（将来ここに追加するだけで選択肢が増える設計）。コードはISO 3166-1 alpha-2に統一
// （イギリスは "UK" ではなく ISO準拠の "GB" を使用）。
// enabled: false の国は「Coming Soon」として選択肢に表示されるが選べない（内部コード・設定はそのまま残す）。
export const SUPPORTED_COUNTRIES = [
  { code: "JP", flag: "🇯🇵", name: "日本", enabled: true },
  { code: "US", flag: "🇺🇸", name: "United States", enabled: true },
  { code: "GB", flag: "🇬🇧", name: "United Kingdom", enabled: true },
  { code: "CA", flag: "🇨🇦", name: "Canada", enabled: true },
  { code: "AU", flag: "🇦🇺", name: "Australia", enabled: true },
];

// 通貨（コード・記号・ロケール）。キーは通貨コード（ISO 4217）そのものにし、
// 「表示国」からは独立したデータとして管理する（例：日本在住でもUSD表示、海外在住の日本人でもJPY表示、が将来可能）。
// 将来通貨を追加する場合もここに1行追加するだけでよい。
const CURRENCY_BY_CODE = {
  JPY: { symbol: "¥", locale: "ja-JP" },
  USD: { symbol: "$", locale: "en-US" },
  GBP: { symbol: "£", locale: "en-GB" },
  CAD: { symbol: "C$", locale: "en-CA" },
  AUD: { symbol: "A$", locale: "en-AU" },
};

// 国を選んだ際に「初期値として」自動設定する基準通貨・表示言語。
// あくまで初期値であり、保存データ上は country / baseCurrency / language は別項目として保持される
// （将来、この自動連動を切り離して個別に変更できるUIを追加しても、データ構造の変更は不要）。
const DEFAULT_CURRENCY_BY_COUNTRY = { JP: "JPY", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD" };
const DEFAULT_LANGUAGE_BY_COUNTRY = { JP: "ja", US: "en", GB: "en-GB", CA: "en", AU: "en" };

// 世界共通の内部カテゴリ・キー → 国別の「表示名」だけを切り替えるテーブル。
// データ構造・計算ロジックはこのキー（例："investmentTaxAdvantaged"）を使い、
// NISAやiDeCoといった日本固有の名称はここでの「表示専用マッピング」としてのみ登場する。
const CATEGORY_LABELS = {
  personalInfo: {
    JP: "ご本人情報", US: "Personal Info", GB: "Personal Info", CA: "Personal Info", AU: "Personal Info",
  },
  basicInfo: {
    JP: "基本情報", US: "Basic Info", GB: "Basic Info", CA: "Basic Info", AU: "Basic Info",
  },
  // NISA（日本）→ 他国では税制優遇のある投資口座全般
  investmentTaxAdvantaged: {
    JP: "NISA積立（つみたて枠 + 成長投資枠）",
    US: "Investment Account (401(k) + Brokerage)",
    GB: "ISA (Stocks & Shares)",
    CA: "TFSA (Tax-Free Savings Account)",
    AU: "Investment Account (Super + Brokerage)",
  },
  // iDeCo（日本）→ 他国では個人年金口座全般
  retirementAccount: {
    JP: "iDeCo積立（個人型確定拠出年金）",
    US: "Retirement Account (IRA)",
    GB: "SIPP / Personal Pension",
    CA: "RRSP (Registered Retirement Savings Plan)",
    AU: "Superannuation Contributions",
  },
  pensionRetirement: {
    JP: "老後・年金",
    US: "Retirement & Social Security",
    GB: "Retirement & State Pension",
    CA: "Retirement & CPP",
    AU: "Retirement & Age Pension",
  },
  healthCost: {
    JP: "健康リスク費用（自己負担目安）",
    US: "Healthcare Costs (Out-of-Pocket Estimate)",
    GB: "Healthcare Costs",
    CA: "Healthcare Costs (Out-of-Pocket Estimate)",
    AU: "Healthcare Costs (Out-of-Pocket Estimate)",
  },
  inheritance: {
    JP: "相続プラン",
    US: "Estate & Inheritance Plan",
    GB: "Inheritance",
    CA: "Estate & Inheritance Plan",
    AU: "Estate & Inheritance Plan",
  },
  gold: {
    JP: "金（ゴールド）資産形成",
    US: "Gold Holdings",
    GB: "Gold Holdings",
    CA: "Gold Holdings",
    AU: "Gold Holdings",
  },
  cash: {
    JP: "銀行預金（銀行別）",
    US: "Cash & Bank Accounts",
    GB: "Cash Savings",
    CA: "Cash & Bank Accounts",
    AU: "Cash & Bank Accounts",
  },
  loan: {
    JP: "借入金（返済シミュレーション）",
    US: "Loans (Repayment Simulation)",
    GB: "Loans (Repayment Simulation)",
    CA: "Loans (Repayment Simulation)",
    AU: "Loans (Repayment Simulation)",
  },
  insurance: {
    JP: "生命保険",
    US: "Insurance (Life)",
    GB: "Life Insurance",
    CA: "Insurance (Life)",
    AU: "Insurance (Life)",
  },
  privatePension: {
    JP: "民間年金積立",
    US: "Private Pension / Annuity",
    GB: "Private Pension",
    CA: "Private Pension / Annuity",
    AU: "Private Pension / Annuity",
  },
};

function getCategoryLabel(key, country) {
  const entry = CATEGORY_LABELS[key];
  if (!entry) return key;
  return entry[country] || entry.JP;
}

// ============================================================================
// ---------- 翻訳辞書（画面文言の一元管理） ----------
// 画面内の文字列（見出し・ボタン・単位・注意書き・グラフの凡例やツールチップ等）は
// すべてここに集約し、JSX側では TRANSLATIONS を直接書かず t("キー") 経由で参照する。
// {name} のようなプレースホルダーは t(key, { name: "..." }) で差し込む。
// ============================================================================
const TRANSLATIONS = {
  ja: {
    // ---------- 英国版（GB）専用キー ----------
    // 英国選択時の表示言語は en-GB のため、実際に画面へ出るのは en 側の英国英語表記。
    // ここでは辞書の欠落を防ぐためのフォールバック（日本語）として同じキーを保持する。
    "gbAccountBreakdownChartTitle": "退職時点（{age}）の口座別内訳",
    "gbAccountBreakdownNote": "退職時点における、ISA・SIPP・職域年金・一般投資口座・現金貯蓄の口座別残高の内訳です。",
    "gbAdditionalPensionLabel": "任意の追加年金収入（年額）",
    "gbAdjustedIncomeLabel": "Adjusted Income（年金拠出上限のテーパリング判定用・未入力なら年収と同額）",
    "gbAnnualContributionLabel": "年間積立額",
    "gbAnnualIncomeLabel": "年間総所得（給与・年金等）",
    "gbCapitalGainLabel": "年間の譲渡益見込額（ISA・年金の外側）",
    "gbCashIsaLabel": "Cash ISA",
    "gbCashSavingsLabel": "Cash Savings",
    "gbCgtLabel": "Capital Gains Tax（概算）",
    "gbCgtSub": "年間非課税枠 {amount} 控除後・{basic}%／{higher}%",
    "gbCgtTaxFreeNote": "譲渡益が年間非課税枠（{amount}）の範囲内のため、Capital Gains Taxは発生しません。",
    "gbClaimAgeLabel": "受給開始年齢（繰下げ受給可）",
    "gbContributionEndAgeLabel": "積立終了年齢",
    "gbCurrentValueLabel": "現在の残高",
    "gbDeferralNote": "繰下げ受給により {pct}% 増額（{weeks}週ごとに{unitPct}%）。英国では繰上げ受給はできません。",
    "gbDividendIncomeLabel": "年間の配当収入（ISA・年金の外側）",
    "gbDividendTaxLabel": "Dividend Tax（概算）",
    "gbDividendTaxSub": "配当非課税枠 {amount} 控除後・{basic}%／{higher}%／{additional}%",
    "gbEffectiveClaimAgeNote": "実際の受給開始は {age} です（State Pension ageより前には受給できません）。",
    "gbExpensesMonthlyLabel": "退職後の毎月の生活費見込み",
    "gbExpensesTotalLabel": "支出合計（生活費＋医療費）",
    "gbExpensesTotalSub": "年間の生活費と医療費の合計",
    "gbFullStatePensionNote": "参考：{taxYear}年度のState Pension満額は年 {amount}（週 {weekly}）です。実際の受給額はNational Insuranceの加入記録により異なるため、GOV.UKの「Check your State Pension forecast」で確認した金額に必ず書き換えてください。",
    "gbGiaLabel": "General Investment Account",
    "gbHealthcareSourceNote": "基本的な医療はNHSでカバーされる前提のうえ、自己負担が生じうる費目のみ年間費用を入力する簡易モデルです。NHSの処方箋料・歯科料金の自動計算は未実装です（地域により制度が異なるため）。",
    "gbHealthcareTotalLabel": "医療費合計（年額）",
    "gbHealthcareTotalSub": "基本医療費＋民間保険料＋歯科＋処方箋＋介護＋その他の合計",
    "gbIncomeTaxLabel": "Income Tax（概算）",
    "gbIncomeTaxSub": "課税所得：{amount}（Personal Allowance控除後）",
    "gbInvestmentSourceNote": "掲載している上限額・税率は{taxYear}年度のGOV.UK公表値です。イングランド・ウェールズ・北アイルランドが対象で、スコットランド税率は未実装です。実際の税務判断は専門家にご確認ください。",
    "gbIsaAllowanceLabel": "ISA年間拠出上限（{taxYear}）",
    "gbIsaOverLabel": "ISA年間上限を {amount} 超過しています",
    "gbIsaRemainingLabel": "ISA年間枠の残り",
    "gbIsaRemainingSub": "Stocks and Shares ISA と Cash ISA の合算で {amount} まで",
    "gbIsaTaxFreeNote": "ISA内の利子・配当・譲渡益はすべて非課税です。上の税額計算はISA・年金の外側にある資産のみを対象としています。",
    "gbLiquidAssetsLabel": "Liquid / Accessible Assets（引き出し可能資産）",
    "gbLiquidAssetsSub": "Cash Savings・Cash ISA・GIA・Stocks and Shares ISA（{age}歳以降は年金資産も含む）",
    "gbLumpSumNote": "年金資産は原則{pct}%まで非課税で一時金として受け取れます（生涯上限 {amount}）。この一時金課税の自動計算は未実装です。",
    "gbNotImplementedTitle": "未実装の項目",
    "gbOverlapYearsLabel": "受給開始前の収入との重複期間（年）",
    "gbOverlapYearsSub": "State Pension受給開始後も給与等の収入が続く年数（該当しない場合は0）",
    "gbOverlapYearsUnit": "年",
    "gbPensionAccessNote": "SIPP・職域年金は原則{age}歳まで引き出せません（{date}から{futureAge}歳へ引き上げ予定）。",
    "gbPensionAllowanceLabel": "年金の年間拠出上限（Annual Allowance・{taxYear}）",
    "gbPensionOverLabel": "年金の年間拠出上限を {amount} 超過しています",
    "gbPensionRemainingLabel": "年金拠出枠の残り",
    "gbPensionRemainingSub": "SIPP と Workplace Pension の合算で {amount} まで",
    "gbPensionReliefLabel": "年金拠出による税軽減（概算）",
    "gbPensionReliefSub": "拠出額 × 限界税率 {pct}%",
    "gbPensionTaperNote": "Adjusted Incomeが {threshold} を超えるため、拠出上限がテーパリングにより {amount} へ逓減しています（下限 {floor}）。",
    "gbPrescriptionLabel": "処方箋費用（年額）",
    "gbPrivateHealthLabel": "民間医療保険料（月額）",
    "gbDentalLabel": "歯科費用（年額）",
    "gbLongTermCareLabel": "介護費用（年額）",
    "gbNhsBasicLabel": "基本医療費（NHSでカバーされる前提の自己負担・年額）",
    "gbOtherOutOfPocketLabel": "その他の自己負担医療費（年額）",
    "gbRestrictedAssetsLabel": "Retirement / Restricted Assets（制約付き資産）",
    "gbRestrictedAssetsSubAccessible": "{age}歳以降のため、年金資産も引き出し可能です",
    "gbRestrictedAssetsSubLocked": "SIPP＋Workplace Pension（{age}歳まで引き出し不可）",
    "gbRetirementIncomeLabel": "Retirement Income（年金収入）",
    "gbRetirementIncomeSub": "State Pension＋追加年金の年間受給額",
    "gbSippLabel": "SIPP",
    "gbStatePensionAgeLabel": "State Pension age（受給資格年齢）",
    "gbStatePensionAgeNote": "State Pension ageは{from}歳から{to}歳へ段階的に引き上げ中です（生年月日により異なります）。ご自身の正確な年齢はGOV.UKの「Check your State Pension age」でご確認ください。",
    "gbStatePensionAnnualLabel": "State Pension 年間受給見込額",
    "gbStatePensionAnnualSub": "繰下げ増額を反映した年間受給額",
    "gbStatePensionEstimateLabel": "年間受給見込額（GOV.UKの予測値を入力）",
    "gbStatePensionSourceNote": "受給資格年数（{years}年）の自動判定は行っていません。GOV.UKの「Check your State Pension forecast」で確認した年間見込額を入力してください。繰下げ受給による増額（{weeks}週ごとに{unitPct}%）はGOV.UKの公式ルールどおり計算しています。",
    "gbStocksSharesIsaLabel": "Stocks and Shares ISA",
    "gbSurplusLabel": "収支余剰",
    "gbSurplusSub": "年金収入が生活費・医療費を上回る年間額",
    "gbTaxAdvantagedLabel": "Tax-Advantaged Investments（税制優遇資産）",
    "gbTaxAdvantagedSub": "ISA＋SIPP＋Workplace Pension（上2区分と重なる横断的な内訳）",
    "gbTaxHandledInInvestmentNote": "英国の税制（Income Tax・Dividend Tax・Capital Gains Tax・年金拠出の税軽減）は、セクション02「ISA（Stocks & Shares）」内でまとめて計算しています。",
    "gbTaxSectionLabel": "Tax（{taxYear}年度・{region}）",
    "gbTaxSourceNote": "Income Tax・Dividend Tax・Capital Gains Taxは{taxYear}年度のGOV.UK公表値に基づく概算です（{region}基準）。スコットランド税率、National Insurance、貯蓄利子課税、相続税は未実装です。",
    "gbTotalAssetsLabel": "総資産（6口座の合計）",
    "gbTotalAssetsSub": "ISA＋SIPP＋Workplace Pension＋GIA＋Cash Savingsのすべての合計",
    "gbTotalTaxLabel": "税額合計（概算・年金軽減後）",
    "gbTotalTaxSub": "Income Tax＋Dividend Tax＋CGT − 年金拠出による軽減",
    "gbWithdrawalLabel": "取崩し必要額（口座から）",
    "gbWithdrawalSub": "年金収入で賄えない年間の不足額",
    "gbWorkplacePensionLabel": "Workplace Pension",
    "disclaimerBanner": "【免責事項】本アプリは情報提供とシミュレーションを目的としたものであり、税務・投資・法務上の助言ではありません。制度・税率は変更される場合があり、計算結果は一定の前提に基づく概算です。実際のご判断は、税理士・ファイナンシャルプランナー等の専門家にご確認ください。",
    "caAccountBreakdownChartTitle": "退職時点（{age}）の口座別内訳",
    "caAccountBreakdownNote": "退職時点における、TFSA・RRSP・非登録口座・現金貯蓄の口座別残高の内訳です。",
    "caAdditionalPensionLabel": "任意の追加年金収入（年額・職域年金など）",
    "caAnnualContributionLabel": "年間積立額",
    "caAnnualIncomeLabel": "年間総所得（給与・年金等）",
    "caBasicHealthLabel": "基本医療費（州の公的保険でカバーされる前提の自己負担・年額）",
    "caCapitalGainLabel": "年間の譲渡益見込額（TFSA・RRSPの外側）",
    "caCashSavingsLabel": "Cash Savings",
    "caCgtLabel": "譲渡益への課税（概算）",
    "caCgtSub": "利益の{pct}%が課税所得に算入され、限界税率で課税されます",
    "caContributionEndAgeLabel": "積立終了年齢",
    "caCppAnnualLabel": "CPP 年間受給額",
    "caCppAnnualSub": "受給開始年齢による増減を反映",
    "caCppEstimateLabel": "65歳時点の年間受給見込額（My Service Canada Accountで確認）",
    "caCppFactorNote": "受給開始年齢{age}歳のため、65歳基準の{pct}%になります（繰上げは月{early}%減、繰下げは月{late}%増）。",
    "caCppFullNote": "参考：{taxYear}年に65歳で受給を開始した場合の満額は年 {amount} です。実際の受給額は拠出履歴により大きく異なるため、My Service Canada Account で確認した金額に必ず書き換えてください。",
    "caCppStartAgeLabel": "CPP 受給開始年齢（{min}〜{max}歳）",
    "caCurrentValueLabel": "現在の残高",
    "caDentalLabel": "歯科費用（年額）",
    "caExpensesMonthlyLabel": "退職後の毎月の生活費見込み",
    "caExpensesTotalLabel": "支出合計（生活費＋医療費）",
    "caExpensesTotalSub": "年間の生活費と医療費の合計",
    "caFederalTaxLabel": "連邦所得税（概算）",
    "caFederalTaxSub": "基礎控除（BPA {amount}）を最低税率で税額控除した後",
    "caHealthcareSourceNote": "基本的な医療は州・準州の公的医療保険でカバーされる前提のうえ、自己負担が生じうる費目のみ年間費用を入力する簡易モデルです。処方薬・歯科・視力の公的補助は州により制度が大きく異なるため、自動計算していません。",
    "caHealthcareTotalLabel": "医療費合計（年額）",
    "caHealthcareTotalSub": "基本医療費＋民間保険料＋処方薬＋歯科＋視力＋介護＋その他の合計",
    "caInvestmentSourceNote": "掲載している上限額・税率は{taxYear}課税年度のcanada.ca（CRA / Service Canada）公表値です。{region}。実際の税務判断は専門家にご確認ください。",
    "caLiquidAssetsLabel": "Liquid / Accessible Assets（引き出し可能資産）",
    "caLiquidAssetsSub": "TFSA・非登録口座・現金貯蓄（引出しに課税されない、または課税済みの資産）",
    "caLongTermCareLabel": "介護費用（年額）",
    "caNonRegisteredLabel": "Non-Registered Account（課税口座）",
    "caOasAnnualLabel": "OAS 年間受給額（クローバック後）",
    "caOasAnnualSub": "居住年数と繰下げを反映し、回収税を差し引いた後",
    "caOasClawbackLabel": "OAS回収税（クローバック）",
    "caOasClawbackNote": "純所得が {threshold} を超えるため、超過分の{pct}%（{amount}）がOASから回収されます。TFSAからの引出しは純所得に含まれないため、クローバックの対象外です。",
    "caOasClawbackSub": "純所得 {threshold} 超で、超過分の{pct}%が回収されます",
    "caOasEnhancedNote": "OASは四半期ごとに物価連動で改定されます。75歳以降は10%上乗せされます（現在の満額：65〜74歳は年 {base}、75歳以降は年 {enhanced}）。",
    "caOasNoEarlyNote": "OASは65歳より前には受給できません。実際の受給開始は{age}歳です。",
    "caOasResidenceLabel": "18歳以降のカナダ居住年数（{full}年で満額）",
    "caOasResidenceSub": "居住{years}年 → 満額の{pct}%（{min}年未満は受給資格なし）",
    "caOasStartAgeLabel": "OAS 受給開始年齢（{min}〜{max}歳・繰上げ不可）",
    "caOtherOutOfPocketLabel": "その他の自己負担医療費（年額）",
    "caPrescriptionLabel": "処方薬費用（年額）",
    "caPrivateHealthLabel": "民間医療保険料（月額）",
    "caPriorEarnedIncomeLabel": "前年の稼得所得（RRSP拠出枠の算定用・未入力なら年収と同額）",
    "caRestrictedAssetsLabel": "Restricted Assets（制約付き資産）",
    "caRestrictedAssetsSub": "RRSP（引出しは可能だが全額が課税所得となり、{age}歳でRRIFへ強制転換されます）",
    "caRetirementIncomeLabel": "Retirement Income（年金収入）",
    "caRetirementIncomeSub": "CPP＋OAS（クローバック後）＋追加年金の年間受給額",
    "caRrifNote": "RRSPは{age}歳の年末までにRRIFへ転換され、翌年から年齢別の最低取崩し率に従って引き出す義務が生じます（{age}歳で{pct}%、80歳で{pct80}%、95歳以降は{pct95}%）。この強制取崩し分はシミュレーションに反映されています。",
    "caRrspLabel": "RRSP",
    "caRrspRoomLabel": "RRSP年間拠出枠",
    "caRrspRoomSub": "前年の稼得所得の{pct}% と 上限 {cap} の低い方",
    "caRrspOverLabel": "RRSP拠出枠を {amount} 超過しています",
    "caRrspRemainingLabel": "RRSP拠出枠の残り",
    "caRrspTaxSavingLabel": "RRSP拠出による税軽減（概算）",
    "caRrspTaxSavingSub": "拠出額は所得控除。限界税率 {pct}% 相当の軽減",
    "caSurplusLabel": "収支余剰",
    "caSurplusSub": "年金収入が生活費・医療費を上回る年間額",
    "caTaxAdvantagedLabel": "Tax-Advantaged Accounts（税制優遇資産）",
    "caTaxAdvantagedSub": "TFSA＋RRSP（上2区分と重なる横断的な内訳）",
    "caTaxHandledInInvestmentNote": "カナダの税制（連邦所得税・譲渡益課税・RRSP拠出の税軽減）は、セクション02「TFSA」内でまとめて計算しています。",
    "caTaxSectionLabel": "Tax（{taxYear}課税年度・連邦税のみ）",
    "caTaxSourceNote": "連邦所得税・譲渡益課税は{taxYear}課税年度のCRA公表値に基づく概算です。州・準州の所得税（13地域すべてで税率が異なる）、配当税額控除、CPP拠出金・EI保険料、AMTは未実装です。",
    "caTfsaLabel": "TFSA",
    "caTfsaLimitLabel": "TFSA年間拠出上限（{taxYear}）",
    "caTfsaOverLabel": "TFSA年間上限を {amount} 超過しています",
    "caTfsaRemainingLabel": "TFSA年間枠の残り",
    "caTfsaRemainingSub": "年間 {amount} まで。累積枠は個人の状況により異なります",
    "caTfsaTaxFreeNote": "TFSA内の運用益・引出しはすべて非課税です。引出しは純所得に含まれないため、OASのクローバックにも影響しません。",
    "caTotalAssetsLabel": "総資産（4口座の合計）",
    "caTotalAssetsSub": "TFSA＋RRSP＋非登録口座＋現金貯蓄のすべての合計",
    "caTotalTaxLabel": "税額合計（概算・RRSP軽減後）",
    "caTotalTaxSub": "連邦所得税＋譲渡益課税 − RRSP拠出による軽減",
    "caVisionLabel": "視力・眼鏡費用（年額）",
    "caWithdrawalLabel": "取崩し必要額（口座から）",
    "caWithdrawalSub": "年金収入で賄えない年間の不足額",
    "caYearsUnit": "年",
    "auAccountBreakdownChartTitle": "退職時点（{age}）の口座別内訳",
    "auAccountBreakdownNote": "退職時点における、Superannuation・投資口座・現金貯蓄の口座別残高の内訳です。",
    "auAgePensionAnnualLabel": "Age Pension 年間受給額",
    "auAgePensionAnnualSub": "所得テストと資産テストの低い方が適用されます",
    "auAgePensionMaxLabel": "Age Pension 満額（年額）",
    "auAgePensionMaxSub": "{status}の最大給付額。実際の受給額は資力調査により減額されます",
    "auAgePensionNotYetNote": "Age Pensionの受給資格年齢は{age}歳です。退職から受給開始まで、Superや投資口座からの取崩しで生活費を賄う必要があります。",
    "auAgePensionQualifyingAgeLabel": "Age Pension 受給資格年齢",
    "auAgePensionZeroNote": "資力調査により、Age Pensionの受給額はゼロです（資産または所得がカットオフを超えています）。",
    "auAnnualContributionLabel": "年間積立額（税引後拠出）",
    "auAnnualSalaryLabel": "年間給与（SG拠出額・所得税の算定に使用）",
    "auAssetsTestLabel": "資産テスト",
    "auAssetsTestSub": "無影響枠 {amount} を超えた1,000ドルごとに、隔週{taper}ドル減額",
    "auCapitalGainDiscountLabel": "12か月を超えて保有している（{pct}%割引の対象）",
    "auCapitalGainLabel": "年間の譲渡益見込額（Superの外側）",
    "auCashSavingsLabel": "Cash Savings",
    "auCgtLabel": "譲渡益への課税（概算）",
    "auCgtSub": "12か月超の保有なら利益の{pct}%が割引され、限界税率＋Medicare levyで課税されます",
    "auConcessionalCapLabel": "税引前拠出の上限（{taxYear}）",
    "auConcessionalCapSub": "雇用主のSG拠出と給与犠牲の合計で年間 {amount} まで",
    "auConcessionalOverLabel": "税引前拠出の上限を {amount} 超過しています（超過分には追加課税があります）",
    "auConcessionalRemainingLabel": "税引前拠出枠の残り",
    "auContributionEndAgeLabel": "積立終了年齢",
    "auContributionTaxLabel": "拠出時の課税（{pct}%）",
    "auContributionTaxSub": "税引前拠出は口座へ入る前に課税されます",
    "auCoupleLabel": "夫婦",
    "auCurrentValueLabel": "現在の残高",
    "auDentalLabel": "歯科費用（年額）",
    "auDiv293Note": "所得と税引前拠出の合計が {threshold} を超えるため、Division 293により拠出への課税が{pct}%（通常15%＋追加15%）になっています。",
    "auExpensesMonthlyLabel": "退職後の毎月の生活費見込み",
    "auExpensesTotalLabel": "支出合計（生活費＋医療費）",
    "auExpensesTotalSub": "年間の生活費と医療費の合計",
    "auGapLabel": "診療費の自己負担（Medicareの差額・年額）",
    "auHomeownerLabel": "持家である（資産テストの無影響枠が変わります）",
    "auIncomeTaxLabel": "所得税（概算）",
    "auIncomeTaxSub": "{taxYear}年度の税率。第2バンドは15%へ引下げ済み",
    "auIncomeTestLabel": "所得テスト",
    "auIncomeTestSub": "無影響枠 {amount} を超えた1ドルにつき{taper}セント減額",
    "auInvestmentAccountLabel": "Investment Account（Super外の投資口座）",
    "auInvestmentSourceNote": "掲載している上限額・税率は{taxYear}会計年度（2026年7月1日〜2027年6月30日）のATO公表値です。実際の税務判断は専門家にご確認ください。",
    "auLiquidAssetsLabel": "Liquid / Accessible Assets（引き出し可能資産）",
    "auLiquidAssetsSub": "投資口座・現金貯蓄（{age}歳以降はSuperannuationも含む）",
    "auMedicareLevyLabel": "Medicare levy（{pct}%）",
    "auMedicareLevySub": "公的医療制度の財源。所得税とは別に課されます",
    "auAgedCareLabel": "高齢者介護費用（年額）",
    "auOpticalLabel": "視力・眼鏡費用（年額）",
    "auOtherIncomeLabel": "年金以外の年間収入（Age Pensionの所得テストで評価されます）",
    "auOtherOutOfPocketLabel": "その他の自己負担医療費（年額）",
    "auPharmaceuticalLabel": "薬剤費（年額）",
    "auPreservationAgeNote": "Superannuationは原則{age}歳（preservation age）まで引き出せません。{unrestricted}歳になれば就労状況に関わらず無条件で引き出せます。",
    "auPrivateHealthLabel": "民間医療保険料（月額）",
    "auRestrictedAssetsLabel": "Restricted Assets（制約付き資産）",
    "auRestrictedAssetsSubAccessible": "{age}歳以降のため、Superannuationも引き出し可能です",
    "auRestrictedAssetsSubLocked": "Superannuation（{age}歳まで引き出し不可）",
    "auRetirementIncomeLabel": "Retirement Income（退職後の収入）",
    "auRetirementIncomeSub": "Age Pension＋その他収入の年間合計",
    "auSalarySacrificeLabel": "給与犠牲などの任意の税引前拠出（年額）",
    "auSalarySacrificeSavingLabel": "給与犠牲による節税（概算）",
    "auSalarySacrificeSavingSub": "限界税率{pct}%と拠出課税15%の差分",
    "auSgContributionLabel": "雇用主のSG拠出（{pct}%）",
    "auSgContributionSub": "給与の{pct}%が自動的にSuperへ拠出されます（対象収入の上限あり）",
    "auSingleLabel": "単身",
    "auMinimumDrawdownNote": "退職フェーズでは、年齢別の最低取崩し率に従ってSuperから引き出す義務があります（65歳未満{under65}%、65〜74歳{age65}%、75〜79歳{age75}%、95歳以降{age95}%）。この強制取崩し分はシミュレーションに反映されています。",
    "auStatusLabel": "配偶者の有無（Age Pensionの給付額・資力調査が変わります）",
    "auSuperEarningsTaxNote": "Superの運用益は積立期に{pct}%課税されます。退職フェーズ（{age}歳以降かつ退職後）では、Transfer Balance Cap（{tbc}）の範囲内で非課税になります。",
    "auSuperLabel": "Superannuation",
    "auSuperTaxFreeNote": "{age}歳以降のSuperからの引き出しは非課税です（課税済みファンドの場合）。",
    "auSurplusLabel": "収支余剰",
    "auSurplusSub": "退職後の収入が生活費・医療費を上回る年間額",
    "auTaxAdvantagedLabel": "Tax-Advantaged Assets（税制優遇資産）",
    "auTaxAdvantagedSub": "Superannuation（運用益への課税が15%に軽減され、退職後は非課税）",
    "auTaxHandledInInvestmentNote": "オーストラリアの税制（所得税・Medicare levy・Super拠出課税・譲渡益課税）は、セクション02「Investment Account」内でまとめて計算しています。",
    "auTaxSectionLabel": "Tax（{taxYear}会計年度）",
    "auTaxSourceNote": "所得税・Medicare levy・譲渡益課税は{taxYear}年度のATO公表値に基づく概算です。LITO・SAPTOなどの税額控除、Medicare Levy Surcharge、HECS-HELPの返済は未実装です。",
    "auTotalAssetsLabel": "総資産（3口座の合計）",
    "auTotalAssetsSub": "Superannuation＋投資口座＋現金貯蓄のすべての合計",
    "auTotalTaxLabel": "税額合計（概算）",
    "auTotalTaxSub": "所得税＋Medicare levy＋譲渡益課税",
    "auWithdrawalLabel": "取崩し必要額（口座から）",
    "auWithdrawalSub": "退職後の収入で賄えない年間の不足額",
    "guideButtonLabel": "この欄の説明を見る",
    "tsumitateHoldingsGuide": "【銘柄ごとに、いま積立枠に溜まっている金額を入れてください】\n積立投資枠（年間120万円まで）で買った投資信託を、銘柄ごとに分けて入力します。金額は「取得価額（買った時の値段の合計）」ではなく、証券口座に表示されている現在の評価額を入れてください。\n下の「基準年齢」には、この金額を確認した時点のあなたの年齢を入れます。そこから現在までの分は自動で追いつき計算されます。",
    "growthHoldingsGuide": "【銘柄ごとに、いま成長投資枠に溜まっている金額を入れてください】\n成長投資枠（年間240万円まで）で買った投資信託・株式を、銘柄ごとに分けて入力します。金額は証券口座に表示されている現在の評価額です。\n積立枠と成長枠を両方使っている場合は、それぞれ別のブロックに分けて入れてください。",
    "tsumitateScheduleGuide": "【毎月いくら積み立てるかを入れてください（積立投資枠）】\n「何歳から何歳まで、毎月いくら」という形で登録します。金額は積立枠の合計額です。銘柄ごとの内訳は、次の「積立枠の配分」で決めます。\n年間120万円（月10万円）が上限です。上限を超えると自動的に切り詰められ、その旨が表示されます。\n収入が変わる予定があれば、期間を分けて複数登録できます（例：40歳まで月5万円、その後は月10万円）。",
    "tsumitateAllocationGuide": "【銘柄ごとに、毎月いくら投資するかを決めてください（積立投資枠）】\n上で決めた「毎月の合計額」を、銘柄ごとに何％ずつ振り分けるかを指定します。合計が100%になるように調整してください。\n例：毎月10万円 ＋ 配分がオルカン70%・S&P500が30% → オルカンに毎月7万円、S&P500に毎月3万円。\n想定利回りも銘柄ごとに設定でき、シミュレーションに反映されます。",
    "growthScheduleGuide": "【毎月いくら積み立てるかを入れてください（成長投資枠）】\n積立枠とは別に、成長投資枠で毎月いくら投資するかを登録します。年間240万円（月20万円）が上限です。\n成長投資枠を使わない場合は、この欄は空のままで構いません。",
    "growthAllocationGuide": "【銘柄ごとに、毎月いくら投資するかを決めてください（成長投資枠）】\n成長投資枠の毎月の合計額を、銘柄ごとに何％ずつ振り分けるかを指定します。合計が100%になるように調整してください。",
    "lumpSumGuide": "【一括投資する金額を入れてください（成長投資枠）】\n退職金やボーナスなどで、ある年齢にまとめて投資する予定があれば、その金額と年齢を登録します。\nここに入れた金額は成長投資枠を消費します。年間240万円・生涯1200万円の上限を超える分は自動的に切り詰められ、その旨が表示されます。\n一括投資の予定がなければ、空のままで構いません。",
    "lumpAllocationGuide": "【一括投資の内訳を、銘柄ごとに決めてください】\n上で登録した一括投資の金額を、銘柄ごとに何％ずつ振り分けるかを指定します。合計が100%になるように調整してください。",
    "nisaTotalGuide": "【NISA全体の合計です（自動計算・入力不要）】\n積立枠と成長枠の保有額を合計した、現在のNISA資産の評価額です。上のブロックに入力した金額から自動で計算されます。",
    "currentAgeGuide": "【いまのあなたの年齢を入れてください】\n生年月日を入力していれば自動で計算されます。シミュレーションはこの年齢を起点に、毎月1回ずつ資産を計算していきます。",
    "retireAgeGuide": "【何歳で仕事を辞める予定かを入れてください】\nこの年齢を境に、シミュレーションが「積立期」から「取崩期」に切り替わります。積立が止まり、生活費の取り崩しが始まります。\n実際にはまだ決めていなくても構いません。65歳などで一度入れて、あとから動かして比べてみてください。",
    "deathAgeGuide": "【何歳まで生きる想定でシミュレーションするかを入れてください】\n資産が何歳まで持つかを見るための「計算の終わり」です。長寿リスクに備えるなら、平均寿命より長め（90〜95歳）に設定することをおすすめします。",
    "idecoCurrentValueGuide": "【iDeCo口座の、いまの評価額を入れてください】\n運営管理機関のサイトに表示されている「資産評価額」です。拠出した元本ではなく、運用益を含んだ現在の金額を入れてください。",
    "idecoPrincipalGuide": "【これまでiDeCoに拠出した元本の合計を入れてください】\n受取時の税金（退職所得控除）の計算に使います。運用益は含めず、実際に払い込んだ金額の累計を入れてください。",
    "idecoMonthlyContributionGuide": "【毎月いくらiDeCoに拠出するかを入れてください】\n拠出限度額は職業や企業年金の有無で変わります（会社員：月12,000〜23,000円、自営業：月68,000円など）。ご自身の限度額は運営管理機関でご確認ください。\n拠出額は全額が所得控除になり、下の「節税シミュレーション」に反映されます。",
    "idecoPayoutYearsGuide": "【年金として何年に分けて受け取るかを入れてください】\n5年〜20年の範囲で選べるのが一般的です。年数を長くすると1年あたりの受取額は減りますが、公的年金等控除の枠内に収まりやすく、税負担を抑えられる場合があります。",
    "idecoPayoutReturnGuide": "【受取期間中も運用を続ける場合の、想定利回りを入れてください】\n年金として分割で受け取る間も、残りの資産は運用され続けます。安全運用に切り替えるなら0〜1%、株式のまま持つなら3〜5%が目安です。",
    "idecoLumpPortionGuide": "【一時金と年金を併用する場合、何％を一時金で受け取るかを入れてください】\n例：50%と入れると、半分を一時金でまとめて受け取り、残り半分を年金として分割で受け取ります。\n一時金は退職所得控除、年金は公的年金等控除の対象になるため、併用すると税負担を抑えられる場合があります。",
    "annualIncomeGuide": "【現在の年収（額面）を入れてください】\niDeCo拠出による節税額を計算するために使います。手取りではなく、源泉徴収票の「支払金額」を入れてください。\nこの金額から所得税・住民税の限界税率を推定し、拠出額 × 税率で年間の節税額を出します。",
    "livingCostGuide": "【退職後、毎月いくらで暮らす想定かを入れてください】\n家賃・食費・光熱費・通信費・趣味など、生活に必要な支出の合計です。医療費は別のセクション（05）で入れるので、ここには含めません。\n総務省の家計調査では、65歳以上の夫婦のみ世帯で月25〜28万円程度が目安です。",
    "health60sGuide": "【60代の年間医療費（自己負担分）を入れてください】\n公的医療保険でカバーされない、実際に自分で払う金額です。窓口負担・薬代・健診・歯科などの合計を、年額で入れてください。\n目安がなければ、年10〜15万円から始めて調整してください。",
    "health70sGuide": "【70代の年間医療費（自己負担分）を入れてください】\n70歳以降は窓口負担が原則2割（現役並み所得者は3割）に下がりますが、受診回数が増えるため総額は上がる傾向があります。",
    "health80sGuide": "【80代以降の年間医療費（自己負担分）を入れてください】\n75歳以降は後期高齢者医療制度で原則1割負担になりますが、入院や介護に関わる費用が増えます。介護費用を見込むなら多めに設定してください。",
    "inheritanceTargetGuide": "【子や配偶者に、いくら遺したいかを入れてください】\nシミュレーションの最後（死亡想定年齢）に、この金額が残っているかを確認できます。\n遺したい金額がなければ0のままで構いません。その場合は「資産を使い切る」前提の計算になります。",
    "goldCurrentHoldingGuide": "【いま保有している金（きん）の重さを、グラム単位で入れてください】\n地金・純金積立・金貨などの合計です。金ETFや投資信託は、このセクションではなく「個別株」や「NISA」の方で管理してください。",
    "goldPriceRefGuide": "【金1グラムあたりの現在価格を入れてください】\n田中貴金属などの小売価格（税込）が目安です。この価格を起点に、下の想定上昇率で将来の価格を計算します。",
    "goldGrowthGuide": "【金価格が年何％上昇すると想定するかを入れてください】\n過去20年の金価格は年平均8〜10%程度上昇していますが、変動は大きく、下落する年もあります。控えめに見るなら2〜3%が無難です。",
    "goldMonthlyContributionGuide": "【毎月いくら金を買い増すかを入れてください（純金積立）】\n金額を入れると、その時々の価格で自動的にグラム数に換算して積み上がります。買い増さない場合は0のままで構いません。",
    "usModifiedAGIGuide": "【調整後総所得（MAGI）を入れてください】\nRoth IRAの拠出可否や、Traditional IRAの控除可否を判定するために使います。ざっくりとは、税引前の年収から一部の控除を戻した金額です。\n正確な数字が分からなければ、まずは年収の額面を入れて構いません。",
    "usCurrentBalanceGuide": "【この口座の、いまの残高を入れてください】\n証券会社・運営管理機関のサイトに表示されている現在の評価額です。拠出した元本ではなく、運用益を含んだ金額を入れてください。",
    "usAnnualContributionGuide": "【この口座に、年間いくら拠出するかを入れてください】\n401(k)は年24,500ドル（50歳以上は+8,000ドル、60〜63歳は+11,250ドル）、IRAは年7,500ドル（50歳以上は+1,100ドル）が上限です。\n上限を超えると警告が出ます。",
    "usStateTaxRateGuide": "【お住まいの州の所得税率を入れてください】\n州によって0%（テキサス・フロリダなど）から13%超（カリフォルニア）まで大きく異なります。州税は自動計算していないため、ご自身で入力してください。",
    "usCapitalGainGuide": "【年間の譲渡益の見込額を入れてください】\n課税口座（Brokerage）で売却して得る利益の見込みです。401(k)やIRAの中の利益は課税されないので、含めません。",
    "usPiaGuide": "【Social Securityの月額受給見込額を入れてください】\nssa.gov の「my Social Security」で確認できる、満額支給開始年齢（67歳）時点の見込額（PIA）です。\n受給開始年齢を早める・遅らせると、この金額から自動的に増減が計算されます。",
    "usExpensesMonthlyGuide": "【退職後、毎月いくらで暮らす想定かを入れてください】\n生活に必要な支出の合計です。医療費は別のセクションで入れるので、ここには含めません。",
    "usHealthInsuranceGuide": "【民間医療保険の月額保険料を入れてください】\nMedicare Part B の保険料は所得に応じて自動計算されるので、ここには含めません。Medigap や Part D、退職前の民間保険などを入れてください。",
    "usOutOfPocketGuide": "【年間の自己負担医療費を入れてください】\n保険でカバーされない、実際に自分で払う金額です。deductible・copay・処方薬・歯科・眼科などの合計を年額で入れてください。",
    "gbCurrentValueGuide": "【この口座の、いまの残高を入れてください】\nプロバイダーのサイトに表示されている現在の評価額です。拠出した元本ではなく、運用益を含んだ金額を入れてください。",
    "gbAnnualContributionGuide": "【この口座に、年間いくら拠出するかを入れてください】\nISA（Stocks & Shares + Cash 合算）は年£20,000、年金（SIPP + 職域年金）は年£60,000が上限です。上限を超えると警告が出ます。",
    "gbExpectedReturnGuide": "【この口座の、想定年利回りを入れてください】\n株式中心なら5〜7%、債券・現金中心なら1〜3%が目安です。口座ごとに別々に設定できます。",
    "gbContributionEndAgeGuide": "【この口座への積立を、何歳でやめるかを入れてください】\n通常は退職年齢と同じにしますが、口座ごとに別々に設定できます（例：現金貯蓄だけ早めにやめる）。",
    "gbAnnualIncomeGuide": "【年間の総所得を入れてください】\n給与・年金などの合計（税引前）です。Income Tax、Dividend Tax、CGT、年金拠出の税軽減の判定すべてに使われます。",
    "gbAdjustedIncomeGuide": "【Adjusted Incomeを入れてください（分からなければ空欄で構いません）】\n年金拠出上限（Annual Allowance）のテーパリング判定に使う所得です。£260,000を超えると拠出上限が減額されます。\n空欄なら、上の年間総所得と同じ額として計算します。",
    "gbDividendIncomeGuide": "【年間の配当収入を入れてください】\nISAや年金の「外側」で受け取る配当のみです。ISA内の配当は非課税なので含めません。\n年£500までは非課税枠があります。",
    "gbCapitalGainGuide": "【年間の譲渡益の見込額を入れてください】\nISAや年金の「外側」（General Investment Account など）で売却して得る利益です。ISA内の利益は非課税なので含めません。\n年£3,000までは非課税枠があります。",
    "gbStatePensionEstimateGuide": "【State Pensionの年間受給見込額を入れてください】\nGOV.UKの「Check your State Pension forecast」で確認できます。National Insuranceの納付記録によって金額が変わるため、必ずご自身の見込額で上書きしてください。\n初期値は満額（2026/27年度）を参考値として入れてあります。",
    "gbOverlapYearsGuide": "【State Pension受給開始後も収入が続く年数を入れてください】\n受給を開始したあとも給与などの収入が続く場合、その年数を入れます。該当しなければ0で構いません。",
    "gbAdditionalPensionGuide": "【職域年金など、追加の年金収入を年額で入れてください】\nState Pension以外に受け取る予定の年金（確定給付年金など）があれば入れてください。SIPPや職域年金の「取り崩し」はセクション02で計算されるので、ここには含めません。",
    "gbExpensesMonthlyGuide": "【退職後、毎月いくらで暮らす想定かを入れてください】\n生活に必要な支出の合計です。医療費は別のセクションで入れるので、ここには含めません。",
    "gbHealthcareGuide": "【NHSでカバーされない、自己負担の医療費を入れてください】\n基本的な医療はNHSが無料でカバーします。ここには、民間保険料・歯科・処方箋料・眼科・介護など、実際に自分で払う金額を入れてください。",
    "caCurrentValueGuide": "【この口座の、いまの残高を入れてください】\n金融機関のサイトに表示されている現在の評価額です。拠出した元本ではなく、運用益を含んだ金額を入れてください。",
    "caAnnualContributionGuide": "【この口座に、年間いくら拠出するかを入れてください】\nTFSAは年C$7,000、RRSPは「前年の稼得所得の18%」と「C$33,810」の低い方が上限です。上限を超えると警告が出ます。",
    "caAnnualIncomeGuide": "【年間の総所得を入れてください】\n給与・年金などの合計です。連邦所得税、譲渡益課税、RRSP拠出の節税額、OASのクローバック判定すべてに使われます。",
    "caPriorEarnedIncomeGuide": "【前年の稼得所得を入れてください（分からなければ空欄で構いません）】\nRRSPの拠出枠（前年所得の18%）を計算するために使います。空欄なら、上の年間総所得と同じ額として計算します。\n正確な枠は、CRAの Notice of Assessment に記載されています。",
    "caCapitalGainGuide": "【年間の譲渡益の見込額を入れてください】\nTFSAやRRSPの「外側」（非登録口座）で売却して得る利益です。TFSA内の利益は完全非課税なので含めません。\nカナダでは利益の50%が課税所得に算入されます。",
    "caCppEstimateGuide": "【65歳時点のCPP年間受給見込額を入れてください】\nMy Service Canada Account で確認できます。拠出履歴によって金額が大きく変わるため、必ずご自身の見込額で上書きしてください。\n初期値は満額（2026年）を参考値として入れてあります。受給開始年齢を60〜70歳で変えると、自動的に増減が計算されます。",
    "caOasResidenceGuide": "【18歳以降、カナダに住んだ年数を入れてください】\n40年で満額、10年未満だと受給資格がありません。20年なら満額の50%になります。\n生まれてからずっとカナダに住んでいる場合は40を入れてください。",
    "caAdditionalPensionGuide": "【職域年金など、追加の年金収入を年額で入れてください】\nCPP・OAS以外に受け取る予定の年金があれば入れてください。RRSPやTFSAの「取り崩し」はセクション02で計算されるので、ここには含めません。",
    "caExpensesMonthlyGuide": "【退職後、毎月いくらで暮らす想定かを入れてください】\n生活に必要な支出の合計です。医療費は別のセクションで入れるので、ここには含めません。",
    "caHealthcareGuide": "【州の公的医療保険でカバーされない、自己負担の医療費を入れてください】\n基本的な医療は州の公的保険がカバーします。ここには、処方薬・歯科・視力・民間保険料・介護など、実際に自分で払う金額を入れてください。州によって補助の範囲が大きく異なります。",
    "auCurrentValueGuide": "【この口座の、いまの残高を入れてください】\nSuper基金・証券会社のサイトに表示されている現在の評価額です。拠出した元本ではなく、運用益を含んだ金額を入れてください。",
    "auAnnualContributionGuide": "【この口座に、年間いくら拠出するかを入れてください】\nSuperの欄は「税引後拠出（non-concessional）」を入れます。雇用主のSG拠出と給与犠牲は、上の「年間給与」「給与犠牲」から自動計算されるので、ここには含めません。",
    "auAnnualSalaryGuide": "【年間給与（税引前）を入れてください】\n雇用主のSG拠出額（給与の12%）と、所得税・Medicare levy の計算に使います。\nSG拠出の対象収入には年A$270,830の上限があります。",
    "auSalarySacrificeGuide": "【給与犠牲など、任意の税引前拠出を年額で入れてください】\n給与から天引きしてSuperに入れる分です。所得税（最高47%）ではなく15%の課税で済むため、節税になります。\n雇用主のSG拠出と合わせて年A$32,500が上限です。超えると追加課税があります。",
    "auCapitalGainGuide": "【年間の譲渡益の見込額を入れてください】\nSuperの「外側」（投資口座）で売却して得る利益です。Super内の利益は別に課税されるので含めません。\n12か月を超えて保有した資産は、利益の50%が割引されます。",
    "auOtherIncomeGuide": "【年金以外の年間収入を入れてください】\nAge Pensionの「所得テスト」で評価される収入です。賃料収入・配当・パート収入などが含まれます。\nこの金額が大きいほど、Age Pensionの受給額が減ります（無影響枠を超えた1ドルにつき50セント減額）。",
    "auExpensesMonthlyGuide": "【退職後、毎月いくらで暮らす想定かを入れてください】\n生活に必要な支出の合計です。医療費は別のセクションで入れるので、ここには含めません。\nASFAの基準では、快適な老後（単身）に年A$54,840程度が目安とされています。",
    "auHealthcareGuide": "【Medicareでカバーされない、自己負担の医療費を入れてください】\n基本的な医療はMedicareがカバーします。ここには、診療費の差額（gap）・民間保険料・薬剤費・歯科・視力・介護など、実際に自分で払う金額を入れてください。",
    "bankGuide": "【銀行口座・現金の残高を入れてください】\n普通預金・定期預金・タンス預金などの合計です。口座ごとに分けて登録でき、それぞれに毎月の積立額と金利を設定できます。\n投資に回していない「守りのお金」をここに入れてください。",
    "stockGuide": "【NISA以外で保有している個別株の銘柄を登録してください】\n特定口座・一般口座で持っている株式です。NISA口座内の株はセクション02で管理するので、ここには含めません。\n銘柄名を入れると想定利回りが自動で提案されますが、自由に変更できます。",
    "loanGuide": "【住宅ローンなどの借入を登録してください】\n残高・金利・毎月の返済額を入れると、完済までのシミュレーションができます。\n返済額が利息を下回っていると残高が減らないため、その場合は警告が出ます。",
    "insuranceGuide": "【生命保険・医療保険の保険料を登録してください】\n払込期間と月額保険料を入れると、生涯で払う保険料の総額が計算され、資産から差し引かれます。\n保障内容はメモとして残せますが、シミュレーションには反映されません。",
    "privatePensionGuide": "【企業年金・個人年金保険などを登録してください】\n拠出期間と月額拠出額、受取期間と月額受取額を入れると、資産の推移に反映されます。\niDeCoはセクション03で別に管理するので、ここには含めません。",
    "pensionSourcesGuide": "【公的年金の受給見込額を入れてください】\n「ねんきん定期便」や「ねんきんネット」で確認できる、65歳時点の年間受給見込額です。老齢基礎年金と老齢厚生年金の合計を入れてください。\n複数の年金（配偶者分など）がある場合は、それぞれ分けて登録できます。",
    "nisaGroupHoldings": "① いま溜まっている金額",
    "nisaGroupTsumitate": "② つみたて投資枠（毎月）",
    "nisaGroupGrowth": "③ 成長投資枠（毎月）",
    "nisaGroupLump": "④ 一括投資（成長投資枠）",
    "advancedMedicalLabel": "先進医療（円）",
    "ageYM": "{years}歳{months}ヶ月",
    "ageYMD": "{years}歳{months}ヶ月{days}日",
    "ageYears": "{age}歳",
    "allocSumNote": "積立・成長投資枠・一括投資の内訳合計（{amount}）から自動計算されています。",
    "amountPlaceholder": "金額（円）",
    "annualContributionLabel": "年間掛金",
    "annualIncomeLabel": "年収（任意）",
    "annualOverPaceNote": "年間上限120万円を {amount} 超過するペースです（自動的に月10万円に調整されます）",
    "annualOverPaceNoteGrowth": "年間上限240万円を {amount} 超過するペースです（自動的に月20万円に調整されます）",
    "annualPayoutAmountLabel": "年間予想受取額（{from}〜{to}歳）",
    "annualRatePlaceholder": "金利（年率%）",
    "annualTaxSavingLabel": "年間節税額（概算）",
    "appSubtitle": "NISA積立 × 老後資産 × 年金 × 健康費用 × 相続 — 統合シミュレーション",
    "appTitle": "資産形成 総合ライフプラン",
    "appTitleWithName": "（{name}様）",
    "asOfAgePlaceholder": "基準年齢",
    "asOfAgeRequired": "この残高時点の基準年齢（必須）",
    "autoEstimatedSuffix": "（自動仮設定）",
    "autoGuessedFromHoldingsSuffix": "（自動：保有銘柄名から仮設定）",
    "autoGuessedSuffix": "（自動：商品名から仮設定）",
    "autoHalfWeightedSuffix": "（自動：現役時代の加重平均の半分）",
    "autoValuationCol": "時価（自動）",
    "autoValuationLabel": "時価（自動計算：つみたて・成長投資枠のスケジュール分＋一括投資の経過分）",
    "backupExportLabel": "エクスポート（コピー用）",
    "backupImportButton": "読み込む",
    "backupImportLabel": "復元用テキスト（貼り付け）",
    "backupImportPlaceholder": "ここに以前コピーしたテキストを貼り付けてください",
    "backupImportSuccess": "読み込みました",
    "backupInstructions": "下のテキストを全選択してコピーし、メモ帳やメモアプリに保存しておいてください。次回はそれを「復元用テキスト」に貼り付けて「読み込む」を押すと元に戻ります。",
    "backupToggleClose": "バックアップを閉じる",
    "backupToggleOpen": "手動バックアップ",
    "balanceCol": "残高",
    "bankBreakdownChartTitle": "銀行別 預金残高 — 年齢ごとの見込み（現在 / {retireAge} / {deathAge}）",
    "bankNameCol": "銀行名",
    "bankNote": "毎月入金は引退年齢（{age}）まで継続する前提で計算します。金利は普通預金なら0〜0.1%程度が目安です。",
    "bankTotalNowLabel": "銀行預金 合計（現在）",
    "benefitAdvancedMedical": "先進医療{amount}",
    "benefitDaySurgery": "日帰り{amount}",
    "benefitDeath": "死亡{amount}",
    "benefitDetailsLabel": "保障内容（項目別の金額）",
    "benefitHospitalization": "入院{amount}/日（限度{limit}日/回）",
    "benefitRadiation": "放射線{amount}/回",
    "benefitSeparator": "・",
    "benefitSurgery": "手術{amount}",
    "birthDateLabel": "生年月日",
    "birthDateNotePrefix": "生年月日から計算した現在の年齢：",
    "birthDateNoteSuffix": "（本日時点）。この数値がシミュレーション全体の「現在の年齢」として自動的に使われます。",
    "capDiffExceeded": "月上限を{amount}超過",
    "capDiffRemaining": "月上限まであと{amount}",
    "colAge": "年齢",
    "colAmount": "金額",
    "colAmountVsCap": "金額 / 枠との差",
    "colMonthlyVsCap": "月額 / 上限との差",
    "colName": "銘柄",
    "colPercent": "割合",
    "contribLabel": "積立",
    "contribPayoutCol": "積立 / 受給",
    "contribPeriodLabel": "積立期間：開始〜終了",
    "contributionTotalLabel": "積立総額（見込み）",
    "countrySelectTitle": "国を選択（表示名・通貨が自動で切り替わります。計算は現状すべて日本の制度基準です）",
    "coveragePlaceholder": "保証",
    "coverageUntilAgeLabel": "何歳までの保証か",
    "coverageUntilLabel": "保障 {age}まで",
    "cumulativeTaxSavingLabel": "積立終了までの累計節税額（概算）",
    "currencyUnit": "円",
    "currentAgeAutoNote": "生年月日が入力されているため、この欄は自動計算され編集できません。年齢を手動で調整したい場合は、上の生年月日を空欄にしてください。",
    "currentAgeFieldLabel": "現在の年齢",
    "currentAgeLabel": "現在",
    "currentBalanceAutoPlaceholder": "未入力なら積立実績から自動概算",
    "currentBalanceManualLabel": "現在の残高（手入力）",
    "currentBalanceOptionalLabel": "現在の残高（円・任意）",
    "currentBalancePlaceholder": "現在の残高（円）",
    "currentLabelShort": "現在",
    "customBenefitNamePlaceholder": "項目名（例：先進医療給付日数）",
    "daySurgeryLabel": "日帰り手術（円）",
    "deathBenefitLabel": "死亡保険金（円）",
    "depletionMarkerLabel": "枯渇",
    "endPlaceholder": "終了",
    "estimatedAssetsAtPayoutLabel": "受取開始時点の予想資産",
    "expectedAnnualReturnLabel": "想定年間利回り",
    "expectedReturnAutoNote": "想定年率は、銘柄名から一般的な目安を自動で仮設定しています（実際の市場データではありません）。数値はいつでも手動で書き換えられます。",
    "expectedReturnLabel": "想定年率",
    "footerDisclaimer": "※ 本ツールは入力値に基づく概算シミュレーションであり、将来の運用成果・年金額・医療費・税制を保証するものではありません。相続・税務・投資判断は専門家（FP・税理士等）にご確認ください。データは入力のたびにブラウザ上のストレージに自動保存されます。",
    "fundBreakdownChartTitle": "{age}時点 ファンド別内訳",
    "goldAccumulateUntilLabel": "積立を続ける年齢（まで）",
    "goldAsOfNote": "基準年齢時点の保有量から、毎月の積立額を加算しながら現在の年齢まで計算した結果、現在の保有量は{grams}g、評価額は{amount}になります。",
    "goldCurrentHoldingLabel": "現在の保有量",
    "goldCurrentValueAutoLabel": "現在の金の資産金額（自動計算）",
    "goldGrowthRateLabel": "想定 年率価格上昇率",
    "goldMonthlyContributionLabel": "毎月の積立額",
    "goldPriceRefLabel": "現在の金価格（参考）",
    "goldPriceRefNote": "金価格は2026年7月時点の店頭小売価格（1g ≈ 24,000円前後）を参考値としています。実際の価格は日々変動するため、最新の価格に置き換えてご利用ください。",
    "growthAllocationLabel": "成長投資枠の銘柄別内訳（金額を入れると割合を自動計算）",
    "growthAsOfNote": "残高時点の基準年齢を基に計算いたします。（現在の実際の残高＋利率　{manual}）＋（スケジュール分＋利率　{catchup}）＝現在のNISA資産合計。",
    "growthFrameLabel": "成長投資枠",
    "growthHoldingsLabel": "成長投資枠：実際の残高（銘柄・金額）",
    "growthOverageDetail": "成長投資枠は上限を{amount}超過。",
    "growthScheduleCategoryLabel": "成長投資枠スケジュール分",
    "growthScheduleExampleNote": "例：「50歳0ヶ月〜55歳11ヶ月・月15万円」「56歳0ヶ月〜65歳0ヶ月・月5万円」のように、歳とヶ月で区間を分けて成長投資枠の毎月投資額を設定できます。区間が重なる場合は合算されます。",
    "growthScheduleLabel": "成長投資枠：毎月投資額（年齢区間ごとに設定）",
    "health60sLabel": "60代 年間自己負担",
    "health70sLabel": "70代 年間自己負担",
    "health80sLabel": "80代以降 年間自己負担",
    "healthCostNote": "公的医療保険の高額療養費制度を考慮した後の自己負担額の概算です。実際は所得区分により上限が変わるため目安としてご利用ください。",
    "healthcareNotImplementedNote": "{country}向けの医療費モデルはまだ実装されていません。上の自己負担額はご自身で見積もった金額としてそのまま計算に使われますが、日本の高額療養費制度に基づく説明は{country}には当てはまりません。",
    "historyColBankTotal": "銀行預金合計",
    "historyColDate": "日付",
    "historyColGoldGrams": "金保有量",
    "historyColNisaPrincipal": "NISA元本",
    "historyEmpty": "まだ記録がありません。入力すると今日の日付で自動記録されます。",
    "historyFetchErrorDebug": "履歴の取得中にエラー: {message}",
    "historyRecordNow": "今すぐ記録する",
    "historyReload": "履歴を再読み込み",
    "historyRestore": "この記録を復元",
    "historyToggleClose": "履歴を閉じる",
    "historyToggleOpen": "入力履歴（{count}件）",
    "holdingNamePlaceholder": "銘柄名",
    "holdingValueCol": "保有金額",
    "hospitalizationDaysLimitLabel": "限度日数（1回何日まで）",
    "hospitalizationPerDayLabel": "入院1日あたり（円）",
    "hospitalizationSurgeryLabel": "入院手術（円）",
    "idecoAsOfNote": "基準年齢時点の評価額から、毎月の掛金を加算しながら現在の年齢まで計算した結果、現在の評価額は{amount}になります。",
    "idecoContributionEndAgeLabel": "掛金終了年齢",
    "idecoContributionStartAgeLabel": "掛金開始年齢",
    "idecoCurrentValueAutoLabel": "現在のiDeCo評価額（自動計算）",
    "idecoCurrentValueLabel": "現在評価額",
    "idecoIntroNote": "iDeCoは老後資産形成制度です。原則として受給可能年齢まで引き出せません。運用成果は将来を保証するものではありません。節税額は概算です。",
    "idecoMonthlyContributionLabel": "毎月掛金",
    "idecoPrincipalLabel": "投資元本（これまでの掛金累計）",
    "idecoProductDefault": "全世界株式",
    "idecoProductNameLabel": "運用商品名",
    "importFailedError": "読み込みに失敗しました。正しいバックアップテキストか確認してください。（{message}）",
    "importInputsNotFoundError": "inputsが見つかりません",
    "inheritanceAmountPlaceholder": "残したい金額（円）",
    "inheritanceAutoNote": "相続予定を1人以上登録すると、この欄には自動的にその合計金額が反映され、編集できなくなります。手入力に戻したい場合は、登録した相続予定をすべて削除してください。",
    "inheritanceTargetAutoLabel": "子孫に残したい金額（上の合計が自動反映）",
    "inheritanceTargetLabel": "子孫に残したい金額",
    "inheritanceTotalLabel": "相続予定 合計",
    "insuranceNameCol": "保険名",
    "insuranceNamePlaceholder": "例：〇〇生命 医療保険",
    "insuranceNote": "払込中の保険料は将来資産から自動的に控除されます。入院・手術等の給付額は保障内容の記録用で、発生が不確実なため資産予測には自動反映されません（必要に応じて健康費用の想定額をご自身で調整してください）。登録後、各保険の項目下にある欄から項目名を自由に追加できます。",
    "interestRateCol": "金利",
    "interestRatePlaceholder": "金利（%・任意）",
    "investmentGainLabel": "運用益（現時点）",
    "investmentLimitsNotImplementedNote": "{country}向けの投資制度（拠出上限・非課税枠など）はまだ実装されていません。以下は日本のNISA制度に基づく計算の枠組みを流用した参考表示であり、{country}の実際の制度上限ではありません。",
    "investmentTimePlaceholder": "投資時",
    "landingAudience1": "老後資金が足りるか不安な方",
    "landingAudience2": "NISAを始めたい方",
    "landingAudience3": "退職後の生活をシミュレーションしたい方",
    "landingAudience4": "年金と資産をまとめて管理したい方",
    "landingAudience5": "ライフプランを見える化したい方",
    "landingAudienceTitle": "こんな方におすすめ",
    "landingBlogCta": "資産形成コラムを見る",
    "landingBlogDesc1": "老後資産・NISA・年金・保険・ライフプランに役立つ情報を分かりやすく解説しています。",
    "landingBlogDesc2": "シミュレーションだけでは伝えきれない考え方や資産形成のポイントも随時更新していきます。",
    "landingBlogTitle": "資産形成コラム",
    "landingCatch": "あなたの人生設計を、ひとつの画面で。",
    "landingCta": "無料でシミュレーションを始める",
    "landingDisclaimer": "本サービスは入力された条件に基づくシミュレーションです。将来の運用成果や生活を保証するものではありません。特定の金融商品を推奨するサービスではありません。",
    "landingFeature1Desc": "NISA・預貯金・金・個別株・保険などをまとめて管理",
    "landingFeature1Title": "資産を一括管理",
    "landingFeature2Desc": "公的年金・企業年金・生活費・医療費まで考慮してシミュレーション",
    "landingFeature2Title": "年金・生活費を反映",
    "landingFeature3Desc": "年齢ごとの資産推移をグラフで確認",
    "landingFeature3Title": "将来の資産推移を見える化",
    "landingFeature4Desc": "すぐ利用でき、入力データは端末内へ保存",
    "landingFeature4Title": "無料・登録不要",
    "landingFreeBadge": "完全無料・登録不要",
    "landingFreeNotice": "現在はすべての機能を無料でご利用いただけます。",
    "landingScreenshotAlt": "資産形成 総合ライフプラン シミュレーション画面",
    "landingScreenshotDesc": "現在の資産・NISA・年金・預貯金・金・保険などを入力するだけで、将来の資産推移をグラフで分かりやすく確認できます。",
    "landingScreenshotTitle": "実際のシミュレーション画面",
    "landingSub1": "入力するだけで、将来のお金の流れを見える化。",
    "landingSub2": "NISA・年金・預貯金・金・保険をまとめて管理し、将来の資産推移をシミュレーションできます。",
    "landingTitle": "資産形成 総合ライフプラン",
    "legendBankDeposits": "銀行預金",
    "legendGoldAssets": "金資産",
    "legendIdecoAssets": "iDeCo資産",
    "legendNetWorth": "純資産（借入金・保険料控除後）",
    "legendNisaAssets": "NISA資産",
    "legendPrivatePension": "民間年金積立",
    "legendStocks": "個別株",
    "legendUsInvestment": "投資口座（401k/IRA/Roth/Brokerage）",
    "legendGbInvestment": "投資口座（ISA/SIPP/職域年金/GIA/現金）",
    "legendCaInvestment": "投資口座（TFSA/RRSP/非登録口座/現金）",
    "legendAuInvestment": "投資口座（Super/投資口座/現金）",
    "lifeExpectancyLabel": "想定寿命",
    "lifetimeRemainingAfterInvestment": "投資後 生涯枠残り {amount}",
    "lifetimeRemainingAtEnd": "区間終了時 生涯枠残り {amount}",
    "listSeparator": "、",
    "livingCostLabel": "老後の生活費",
    "loanBalancePlaceholder": "借入残高（円）",
    "loanBreakdownChartTitle": "借入金 残高推移 — 年齢ごとの見込み（現在 / {retireAge} / {deathAge}）",
    "loanNameCol": "名称",
    "loanNamePlaceholder": "名称（例：住宅ローン）",
    "loanPrincipalCol": "残元本",
    "localePreviewWarning": "現在はプレビュー版です。通貨と一部の表示名のみ選択国に対応しています。投資上限、年金、税制、医療費などの計算は、日本の制度を基準にしています。",
    "lumpAllocationLabel": "一括投資の銘柄別内訳（金額を入れると割合を自動計算）",
    "lumpPayoutAmountLabel": "一時金として受け取る額（{age}に一度）",
    "lumpPortionPctLabel": "一時金として受け取る割合",
    "lumpSumCategoryLabel": "一括投資",
    "lumpSumLabel": "一括投資（成長投資枠・年齢と金額を指定）",
    "lumpSumMarkerLabel": "一括",
    "lumpTruncationAt": "時点で{amount}",
    "lumpTruncationIntro": "一部の一括投資は成長投資枠・生涯枠の上限を超えたため、超過分（",
    "lumpTruncationOutro": "）は非課税枠に反映されていません。",
    "manualOverrideNote": "手動設定中です。",
    "monthlyAmountCol": "月額",
    "monthlyAmountPlaceholder": "毎月投資額（円）",
    "monthlyContribAmountLabel": "毎月の積立金額（円）",
    "monthlyDepositCol": "月次入金",
    "monthlyDepositPlaceholder": "毎月入金額（円）",
    "monthlyPaceNote": "月{monthly}のペース（年換算 {annual}）",
    "monthlyPaymentCol": "月返済",
    "monthlyPaymentPlaceholder": "毎月返済額（円）",
    "monthlyPayoutAmountLabel": "受給時に毎月もらえる金額（円）",
    "monthlyPremiumPlaceholder": "毎月の払込金額（円）",
    "nameCol": "名前",
    "nameLabel": "お名前（任意）",
    "netWorthChartNote": "色の帯は資産を積み上げたものです。帯の一番上が「総資産」で、下から順に足し合わさっています（例：緑の線は「NISA＋金＋銀行預金」の合計であり、銀行預金だけの金額ではありません）。\n白い線は、その総資産から借入金と生命保険の払込累計額を差し引いた「純資産」です。借入金や保険料がある限り、白い線は必ず帯の一番上より下になります。",
    "netWorthChartTitle": "総資産推移 — NISA + 金 + 銀行預金 + 個別株 + 民間年金積立 + iDeCo − 借入金 − 保険料累計（{currentAge} 〜 {deathAge}）",
    "nisaAllocationSlidersLabel": "NISA資産の配分（積立・成長投資枠・一括投資の内訳に入れた銘柄がそのままスライダーになります）",
    "nisaBreakdownChartTitle": "現在のNISA資産の内訳 — つみたて投資枠 × 成長投資枠（現在日付での使用累計ベース）",
    "nisaCapSummaryNote": "年間上限：つみたて枠120万円（月10万円）／成長投資枠240万円（月20万円）。生涯投資枠は合計1,800万円（うち成長投資枠は1,200万円まで）。上限に達すると自動的にそれ以上の非課税投資は停止する前提で計算します。",
    "nisaTotalExplanation": "つみたて投資枠の評価額（{tsumitate}） + 成長投資枠の評価額（{growth}） + 一括投資の評価額（{lump}）を合計したものが、この「合計」欄（{total}）に反映され、シミュレーションではこの金額が使われます。「実際の残高」は基準年齢時点で実際にいくらだったかという金額として入力してください。基準年齢を入力すると、そこから現在の年齢まで銘柄ごとの想定利回りで複利運用したものとして評価額を計算します（未入力ならそのままの金額を使用）。それとは別に、つみたて・成長投資枠それぞれの毎月投資額スケジュールで実際に引き落とされてきたはずの金額も、その都度の想定利回りで複利運用したものとして自動計算・加算されます（つみたてスケジュール分：{tsumitateCatchup}／成長投資枠スケジュール分：{growthCatchup}）。一括投資も同様に、それぞれの投資日から現在まで複利運用したものとして自動計算されます。※スケジュール分は自動加算されるため、「実際の残高」にはスケジュールで積み立て済みの分を重複して含めないようご注意ください。ここで入力した銘柄名は、下の「NISA資産の配分」スライダーにもそのまま反映され、想定年率（利回り）はそちらで銘柄ごとに自動設定・調整されます（この欄自体には利回りの入力は不要です）。ご自身で利回りを変更したい場合は、下の「NISA資産の配分」セクションにある、各銘柄の「想定年率」欄を直接書き換えてください。",
    "nisaTotalLabel": "現在のNISA資産：合計（自動計算）",
    "noFundsYetNote": "まだ銘柄が入力されていません。上の「積立投資枠」「成長投資枠」「一括投資」いずれかの銘柄別内訳に銘柄名と金額を入力すると、ここにスライダーが自動的に表示されます。",
    "overageWarningIntro": "入力された「これまでの使用累計」がNISAの上限を超えています。",
    "overageWarningOutro": "実際の証券口座の使用累計をご確認のうえ、数値を見直してください。",
    "overlapWarningNote": "同じ系統のファンドを重ねすぎると分散効果が薄れる点にご注意ください（例：全世界株式とS&P500は米国株の比重が重なりやすい組み合わせです）。",
    "payoffInsufficientNote": "返済額不足のため未完済",
    "payoffScheduleLabel": "完済予定",
    "payoutAccountingNote": "受取開始後は、一時金は受取年に「現在使える資産」へ一度だけ加算され、年金は受取期間中「年間収入」へ加算されて生活費との差額の取り崩しに反映されます。受取期間が終わるとiDeCoからの収入加算は終了します。",
    "payoutLabel": "受給",
    "payoutMethodBoth": "併用",
    "payoutMethodLabel": "受取方法",
    "payoutMethodLump": "一時金",
    "payoutMethodPension": "年金",
    "payoutPeriodLabel": "年金受給期間：開始〜終了",
    "payoutReturnPctLabel": "受取中の想定運用利回り",
    "payoutStartAgeLabel": "受取開始年齢",
    "payoutYearsLabel": "年金受取期間",
    "pensionAutoNote": "年金の種類を1件以上登録すると、この欄には自動的にその合計月額が反映され、編集できなくなります。手入力に戻したい場合は、登録した項目をすべて削除してください。",
    "pensionEstimateLabel": "年金受給見込み額",
    "pensionNameCol": "年金名",
    "pensionNamePlaceholder": "例：国民年金、企業年金基金",
    "pensionNamePlaceholderPrivate": "例：〇〇個人年金保険",
    "pensionSourcesLabel": "年金受給見込み額（国民年金・企業年金基金など、いくつでも追加できます）",
    "pensionTotalAutoLabel": "年金受給見込み額：合計（上のリストから自動反映）",
    "pensionTypeCol": "年金の種類",
    "peopleCount": "{count}名",
    "perMonthSuffix": "/月",
    "periodMonth": "月",
    "periodYear": "年間",
    "phaseAccumulation": "積立期",
    "phaseDrawdown": "取崩期",
    "postRetireReturnLabel": "退職後の想定運用利回り",
    "premiumCoverageCol": "払込 / 保障",
    "premiumPeriodLabel": "掛け金払込：開始〜終了",
    "premiumRangeLabel": "払込",
    "printButton": "PDFで保存 / 印刷",
    "privatePensionNote": "積立期間中は毎月の積立額を貯め、受給期間中はそこから毎月の受給額を取り崩していく残高として、生涯資産グラフに資産の一部として反映されます。さらに受給額は、公的年金と同様に生活費・健康費用の補填としても扱われ、NISA資産の取り崩しペースを緩める効果があります。「現在の残高」を入力すると、証書に記載の実際の解約返戻金額などをそのまま開始残高として使用します（未入力の場合は積立開始年齢〜現在までの積立額の単純合計＝0%運用想定で自動概算します）。",
    "privatePensionTotalNowLabel": "民間年金積立 合計（現在）",
    "radiationLabel": "放射線治療1回（円）",
    "relationCol": "続柄",
    "relationPlaceholder": "続柄（例：妻・長男）",
    "retireAgeFieldLabel": "引退（年金開始）年齢",
    "retireAgeLabel": "引退",
    "retirementMarkerLabel": "引退",
    "retirementNotImplementedNote": "{country}向けの年金・退職口座制度（拠出上限や税制優遇のルール）はまだ実装されていません。以下はiDeCoの計算構造を仮に流用した参考表示です。",
    "revertToAutoLink": "自動計算に戻す",
    "saveError": "保存失敗",
    "saveMessageFailed": "保存に失敗しました：{error}",
    "saveMessageLastSaved": "最終保存: {time}",
    "saveMessageUnavailable": "このブラウザ/表示環境では自動保存が利用できません（Claudeのアーティファクトとして開いてください）",
    "saveSaved": "保存済み",
    "saveSaving": "保存中…",
    "saveUnavailable": "保存不可",
    "saveWarningHint": "自動保存が使えない環境のため、下の「手動バックアップ」からテキストをコピーして保管してください。",
    "scheduleBeforeBaseAgeAlert": "スケジュールの開始年齢が、上の「この残高時点の基準年齢」（{age}）より前になっています。\n基準年齢より前の期間は、既に「実際の残高」に反映されているはずのため、開始年齢は基準年齢と同じかそれより後にしてください。",
    "scheduleExampleNote": "例：「58歳0ヶ月〜61歳11ヶ月・月11万円」「62歳0ヶ月〜65歳0ヶ月・月9万円」のように、歳とヶ月で区間を分けて毎月投資額を設定できます。区間が重なる場合は合算されます。",
    "sectorCol": "セクター",
    "sharesCol": "個数",
    "startPlaceholder": "開始",
    "statAssetsAtRetireLabel": "{age}時点の資産",
    "statAssetsAtRetireSub": "積立フェーズ終了時",
    "statBankAtRetireLabel": "銀行預金 合計 — {age}時点",
    "statBankAtRetireSub": "毎月入金を継続した場合の見込み",
    "statBankCountSub": "{count}行に分散",
    "statBankTotalNowLabel": "銀行預金 合計（現在）",
    "statDepletionAtAge": "{age}歳で枯渇",
    "statDepletionSub": "取崩し速度の見直しが必要",
    "statGoldAtTargetLabel": "金資産 — {age}時点",
    "statGoldGramsEstimateSub": "{grams}g 想定",
    "statGrowthAnnualRemainingLabel": "成長投資枠 年間上限 残り（現在のペース基準）",
    "statGrowthLifetimeUsageLabel": "成長投資枠 生涯累計使用額（予測）",
    "statGrowthOverageLabel": "成長投資枠 上限オーバー額",
    "statGrowthRemainingLabel": "成長投資枠 残り",
    "statGrowthRemainingSub": "上限1,200万円 中 {used} 使用済み",
    "statIdecoAssetsLabel": "投資資産：iDeCo",
    "statIdecoAssetsSub": "現在のiDeCo評価額",
    "statInheritanceGapNegative": "目標に対し {amount}",
    "statInheritanceGapPositive": "目標に対し +{amount}",
    "statInsuranceCountSub": "{count}件の保険",
    "statInsurancePaidLabel": "生命保険 払込累計（生涯）",
    "statLifetimeRoomSub": "生涯枠に余裕がある見込み",
    "statLoanBalanceNowLabel": "借入金 残高（現在）",
    "statLoanCountSub": "{count}件の借入",
    "statMaxedAtAge": "{age}歳で上限到達見込み",
    "statMonthlyGapCoveredSub": "年金で生活費を賄える",
    "statMonthlyGapLabel": "老後の月次収支ギャップ",
    "statMonthlyGapShortfallSub": "年金だけでは不足（資産取崩し要）",
    "statNetWorthFinalLabel": "{age}時点の総資産（NISA+金+預金・相続可能額）",
    "statNeverDepletes": "生涯枯渇なし",
    "statNisaAssetsLabel": "投資資産：NISA",
    "statNisaAssetsSub": "現在のNISA評価額",
    "statNoBankAccountsSub": "銀行口座が未登録です",
    "statNoInsuranceSub": "保険未登録",
    "statNoLoansSub": "借入金なし",
    "statNotRegisteredSub": "未登録",
    "statNotYetMaxed": "上限未到達の見込み",
    "statOfLifetimeLimit": "生涯合算枠 {amount} 中",
    "statOverageOverSub": "上限を超えています",
    "statOverageWithinSub": "上限内におさまっています",
    "statPensionPlanCountSub": "{count}件の年金プラン",
    "statPrivatePensionFinalLabel": "民間年金 積立残高（受給終了時点）",
    "statRetirementLockedSub": "受取開始年齢までは引き出せません",
    "statRetirementOnlyAssetsLabel": "老後専用資産（iDeCo）",
    "statSpendableAssetsLabel": "現在使える資産",
    "statSpendableAssetsSub": "iDeCoロック分を除く、現時点の資産",
    "statStockHoldingsCountSub": "{count}銘柄に保有あり",
    "statStockValueNowLabel": "個別株 保有評価額（現在）",
    "statSustainabilityLabel": "資産の持続性",
    "statSustainableSub": "現在の前提では維持可能",
    "statTotalLifetimeUsageLabel": "NISA総枠 生涯累計使用額（予測）",
    "statTotalOverageLabel": "生涯投資枠（総枠） 上限オーバー額",
    "statTotalRemainingLabel": "生涯投資枠（総枠） 残り",
    "statTotalRemainingSub": "上限1,800万円 中 {used} 使用済み",
    "statTsumitateAnnualRemainingLabel": "つみたて 年間上限 残り（現在の年齢のペース基準）",
    "statTsumitateLifetimeUsageLabel": "つみたて投資枠 生涯累計使用額（予測）",
    "statTsumitateOverageLabel": "つみたて投資枠 上限オーバー額",
    "statTsumitateRemainingLabel": "つみたて投資枠 残り",
    "statTsumitateRemainingSub": "総枠（1,800万円）を成長投資枠と共有",
    "statUsedUpAtAge": "{age}歳で使い切り見込み",
    "stockAllocationChartLabel": "保有金額に連動した銘柄別割合",
    "stockCurrentTotalLabel": "個別株 現在の金額（合計）",
    "stockReturnLabel": "{age}までの想定年率（個別株全体）",
    "stockWatchlistTitle": "個別株 保有一覧（個数・保有金額を入力）",
    "storageKeyCountDebug": "ストレージ内のキー数: {count}",
    "storageUnavailableDebug": "ストレージ機能が利用できません（window.storage未対応の環境）",
    "taxNotImplementedNote": "{country}向けの税制計算（節税額シミュレーション）はまだ実装されていません。根拠のない税率を表示しないため、この項目は非表示にしています。",
    "taxSavingCaveatNote": "節税額は、年収から推定した税率を使う簡易計算です。実際は給与所得控除、社会保険料、扶養・配偶者控除などを差し引いた課税所得で決まるため、表示額と異なる場合があります。年収未入力時は目安の税率20%で計算します。",
    "taxSavingSimLabel": "節税シミュレーション（概算）",
    "todayLabel": "本日",
    "todayTotalHidden": "現在の日付で算出した総資産",
    "todayTotalShown": "現在の日付で算出した総資産：{amount}",
    "totalOverageDetail": "総枠（生涯上限）は{amount}超過。",
    "tsumitateAllocationLabel": "つみたて投資枠の銘柄別内訳（金額を入れると割合を自動計算）",
    "tsumitateAsOfNote": "残高時点の基準年齢を基に計算いたします。（現在の実際の残高＋利率　{manual}）＋（スケジュール分＋利率　{catchup}）＝現在のNISA資産合計。",
    "tsumitateFrameLabel": "つみたて投資枠",
    "tsumitateHoldingsLabel": "つみたて投資枠：実際の残高（銘柄・金額）",
    "tsumitateScheduleCategoryLabel": "つみたてスケジュール分",
    "tsumitateScheduleLabel": "つみたて投資枠：毎月投資額（年齢区間ごとに設定）",
    "uncategorizedLabel": "未分類",
    "unitMonths": "ヶ月",
    "unitYears": "歳",
    "unitYearsShort": "歳",
    "unknownError": "不明なエラー",
    "unknownShort": "不明",
    "us401kLabel": "401(k)",
    "usAccountBreakdownChartTitle": "{age}時点 口座別内訳（401(k)/Traditional IRA/Roth IRA/Brokerage）",
    "usAccountBreakdownNote": "現在のデータ構造では口座内の銘柄・ファンド別の内訳までは追跡していないため、口座種別ごとの内訳を表示しています。",
    "usAnnualContributionLabel": "年間拠出額",
    "usBrokerageBalanceLabel": "投資資産：Brokerage（課税口座）",
    "usBrokerageBalanceSub": "現在のBrokerage評価額",
    "usBrokerageLabel": "Brokerage Account（課税口座）",
    "usBrokerageNoLimitNote": "課税口座のため拠出上限はありません（税制優遇もありません）。",
    "usCapGainsTaxLabel": "キャピタルゲイン税（概算）",
    "usCapGainsTaxSub": "長期譲渡益（0/15/20%）想定",
    "usCapitalGainLabel": "年間のキャピタルゲイン実現見込み額",
    "usClaimAgeLabel": "受給開始年齢（62〜70歳で選択）",
    "usCombinedLimitLabel": "従業員＋雇用主 合計上限（2026年）",
    "usCoveredByPlanLabel": "勤務先の企業年金制度に加入している",
    "usDeductibleAmountLabel": "所得控除の対象額（概算）",
    "usEarlyWithdrawalWarning": "Early withdrawals from retirement accounts may be subject to taxes and penalties. This planner uses a simplified model.",
    "usEmployeeLimitLabel": "従業員拠出 上限（2026年）",
    "usExpensesLabel": "退職後の生活費（Expenses）",
    "usExpensesMonthlyLabel": "毎月の生活費見込み",
    "usExpensesTotalLabel": "Expenses（生活費＋医療費）",
    "usExpensesTotalSub": "年間の生活費＋医療費合計",
    "usFederalTaxLabel": "連邦所得税（概算）",
    "usFilingHoh": "世帯主（Head of Household）",
    "usFilingMarriedJoint": "夫婦合算申告（Married Filing Jointly）",
    "usFilingMarriedSeparate": "夫婦別々申告（Married Filing Separately）",
    "usFilingSingle": "単身（Single）",
    "usFilingStatusLabel": "申告区分（Filing Status）",
    "usFraNote": "満額支給開始年齢（Full Retirement Age）：{age}歳",
    "usHealthInsuranceLabel": "民間医療保険料（月額・Medicare以外）",
    "usHealthInsuranceSub": "入力した月額 × 12",
    "usHealthInsuranceTotalLabel": "民間医療保険料（年額）",
    "usHealthcareSourceNote": "Medicare Part B保険料は2026年のCMS公表値（標準保険料および所得に応じたIRMAA区分）に基づき自動計算しています。民間保険料・自己負担額はご自身の見込みを入力してください。",
    "usHealthcareTotalLabel": "医療費合計（年額）",
    "usHealthcareTotalSub": "Medicare＋民間保険料＋自己負担の合計",
    "usInvestmentSourceNote": "掲載している拠出上限は2026年分のIRS（米国内国歳入庁）公表値（Notice 2025-67、2025年11月13日公表）に基づく参考値です。実際の税務判断は専門家にご確認ください。",
    "usIraCombinedNote": "Traditional IRAとRoth IRAは拠出上限を共有します。合算した残り拠出可能額：{amount}",
    "usIraSharedLimitLabel": "IRA拠出上限（Traditional + Rothの合算・2026年）",
    "usIraSharedRemainingSub": "IRA合算上限までの残り拠出可能額",
    "usLiquidAssetsLabel": "Liquid / Accessible Assets（引き出し可能資産）",
    "usLiquidAssetsSub": "現金・Brokerage・59歳半以降なら401(k)/Traditional IRAも含む",
    "usMedicareAutoLabel": "Medicare Part B（自動計算・年額）",
    "usMedicareAutoNote": "上のセクションで入力した申告区分・MAGIに基づき、IRMAA（所得連動追加保険料）を含めて自動計算しています。",
    "usMedicareLabel": "Medicare Part B（年額）",
    "usMedicareSub": "IRMAA込みの自動計算値",
    "usModifiedAGILabel": "修正調整後総所得（MAGI・年額）",
    "usNiitLabel": "NIIT（純投資所得税）",
    "usNiitSub": "所得が閾値超過分の3.8%",
    "usNoDeductionNote": "所得水準により、今回の拠出額は所得控除の対象外です（フェーズアウトにより全額控除不可）。",
    "usOutOfPocketLabel": "自己負担額の年間見込み（Out of Pocket）",
    "usOutOfPocketSub": "入力した見込み額",
    "usOutOfPocketTotalLabel": "自己負担額（年額）",
    "usOverLimitLabel": "上限を{amount}超過しています",
    "usPartialDeductionNote": "所得水準により、控除額の一部のみが対象です（フェーズアウト適用中）。",
    "usPiaLabel": "満額支給開始年齢（67歳）時点の月額見込み（PIA）",
    "usRemainingLabel": "上限まであと{amount}",
    "usRemainingOfLimitSub": "2026年上限までの残り拠出可能額",
    "usRestrictedAssetsLabel": "Retirement / Restricted Assets（制約付き資産）",
    "usRestrictedAssetsSubOver595": "Roth IRA（簡易的に常に制約資産として計上）",
    "usRestrictedAssetsSubUnder595": "59歳半未満のため401(k)/Traditional IRA＋Roth IRAが対象",
    "usRetirementIncomeLabel": "Retirement Income（年金収入）",
    "usRetirementIncomeSub": "Social Security年間受給額",
    "usRothAllowedLabel": "拠出可能額（所得フェーズアウト後）",
    "usRothIneligibleNote": "所得水準により、Roth IRAへは直接拠出できません（フェーズアウトにより対象外）。",
    "usRothIraLabel": "Roth IRA",
    "usRothOverEligibleNote": "入力された拠出額が、所得フェーズアウト後の拠出可能額を超えています。",
    "usRothPartialNote": "所得水準により、拠出可能額の一部が制限されています（フェーズアウト適用中）。",
    "usSpouseCoveredByPlanLabel": "配偶者が勤務先の企業年金制度に加入している",
    "usSsAnnualLabel": "年間受給額",
    "usSsAnnualSub": "生涯にわたり継続（インフレ調整は含まず）",
    "usSsMonthlyLabel": "受給開始年齢での月額",
    "usSsMonthlySub": "{age}歳で受給開始した場合",
    "usSsSourceNote": "受給開始年齢による増減率はSSA（社会保障庁）の公式ルールに基づき正確に計算しています。ただし月額見込み（PIA）はご自身の「my Social Security」アカウント等で確認した金額を入力してください（生涯収入からの自動計算は未対応です）。",
    "usStateTaxLabel": "州税（概算）",
    "usStateTaxRateLabel": "州税：概算の実効税率",
    "usStateTaxSub": "入力した実効税率で計算",
    "usSurplusLabel": "収支余剰",
    "usSurplusSub": "年金収入が生活費・医療費を上回る年間額",
    "usTaxAdvantagedTotalLabel": "投資資産：税制優遇口座（401k+IRA+Roth）",
    "usTaxAdvantagedTotalSub": "401(k)＋Traditional IRA＋Roth IRAの合計評価額",
    "usTaxSectionLabel": "税制（簡易版）",
    "usTaxSourceNote": "連邦税・キャピタルゲイン税・NIITは2026年のIRS公表値（Revenue Procedure 2025-32）に基づく概算です。州税は州により大きく異なるため、実効税率をご自身で入力してください。",
    "usTaxableIncomeSub": "課税所得：{amount}",
    "usTotalInvestmentLabel": "投資口座 合計評価額",
    "usTotalInvestmentSub": "401(k) + Traditional IRA + Roth IRA + Brokerageの合計",
    "usTotalTaxLabel": "税金合計（概算）",
    "usTotalTaxSub": "連邦税＋キャピタルゲイン税＋NIIT＋州税",
    "usTraditionalIraLabel": "Traditional IRA",
    "usWithdrawalLabel": "Withdrawal（投資口座からの取崩し必要額）",
    "usWithdrawalSub": "年金収入だけでは不足する年間額",
  },
  en: {
    // ---------- United Kingdom (GB) keys ----------
    // The GB build runs on the "en-GB" dictionary, which inherits every key below.
    // Wording here is British English and uses UK product names only (no US terms).
    "gbAccountBreakdownChartTitle": "Account Breakdown at Retirement ({age})",
    "gbAccountBreakdownNote": "Projected balance of each account — ISAs, SIPP, Workplace Pension, General Investment Account and Cash Savings — at your retirement age.",
    "gbAdditionalPensionLabel": "Additional Pension Income (Annual, optional)",
    "gbAdjustedIncomeLabel": "Adjusted Income (for the pension allowance taper — leave blank to use your total income)",
    "gbAnnualContributionLabel": "Annual Contribution",
    "gbAnnualIncomeLabel": "Total Annual Income (salary, pension, etc.)",
    "gbCapitalGainLabel": "Estimated Annual Capital Gains (outside ISAs and pensions)",
    "gbCashIsaLabel": "Cash ISA",
    "gbCashSavingsLabel": "Cash Savings",
    "gbCgtLabel": "Capital Gains Tax (Estimate)",
    "gbCgtSub": "After the {amount} annual exempt amount — {basic}% / {higher}%",
    "gbCgtTaxFreeNote": "Your gains are within the annual exempt amount ({amount}), so no Capital Gains Tax is due.",
    "gbClaimAgeLabel": "Age You Start Claiming (deferral allowed)",
    "gbContributionEndAgeLabel": "Contributions End at Age",
    "gbCurrentValueLabel": "Current Balance",
    "gbDeferralNote": "Deferring increases your State Pension by {pct}% ({unitPct}% for every {weeks} weeks). You cannot claim the State Pension early in the UK.",
    "gbDividendIncomeLabel": "Annual Dividend Income (outside ISAs and pensions)",
    "gbDividendTaxLabel": "Dividend Tax (Estimate)",
    "gbDividendTaxSub": "After the {amount} dividend allowance — {basic}% / {higher}% / {additional}%",
    "gbEffectiveClaimAgeNote": "Your State Pension will actually start at {age}, as it cannot be claimed before State Pension age.",
    "gbExpensesMonthlyLabel": "Estimated Monthly Living Costs in Retirement",
    "gbExpensesTotalLabel": "Total Outgoings (Living + Healthcare)",
    "gbExpensesTotalSub": "Annual living costs plus healthcare costs",
    "gbFullStatePensionNote": "For reference, the full new State Pension for {taxYear} is {amount} a year ({weekly} a week). What you actually receive depends on your National Insurance record, so please replace this with the figure from your GOV.UK State Pension forecast.",
    "gbGiaLabel": "General Investment Account",
    "gbHealthcareSourceNote": "This assumes core healthcare is covered by the NHS, and asks you to enter only the annual costs you expect to pay yourself. NHS prescription and dental charges are not calculated automatically, as they differ across England, Scotland, Wales and Northern Ireland.",
    "gbHealthcareTotalLabel": "Total Healthcare Costs (Annual)",
    "gbHealthcareTotalSub": "Core costs + private cover + dental + prescriptions + long-term care + other",
    "gbIncomeTaxLabel": "Income Tax (Estimate)",
    "gbIncomeTaxSub": "Taxable income: {amount} (after Personal Allowance)",
    "gbInvestmentSourceNote": "Allowances and rates shown are the GOV.UK figures for the {taxYear} tax year, for {region}. Scottish Income Tax rates are not implemented. Please consult a qualified adviser for your own tax position.",
    "gbIsaAllowanceLabel": "Annual ISA Allowance ({taxYear})",
    "gbIsaOverLabel": "You are {amount} over the annual ISA allowance",
    "gbIsaRemainingLabel": "Remaining ISA Allowance",
    "gbIsaRemainingSub": "Up to {amount} across your Stocks and Shares ISA and Cash ISA combined",
    "gbIsaTaxFreeNote": "Interest, dividends and gains inside an ISA are entirely tax-free. The tax figures above apply only to holdings outside ISAs and pensions.",
    "gbLiquidAssetsLabel": "Liquid / Accessible Assets",
    "gbLiquidAssetsSub": "Cash Savings, Cash ISA, GIA and Stocks and Shares ISA (plus pensions once you are {age} or older)",
    "gbLumpSumNote": "You can normally take {pct}% of your pension as a tax-free lump sum, within the Lump Sum Allowance ({amount}). Tax on lump sums is not calculated here.",
    "gbNotImplementedTitle": "Not implemented",
    "gbOverlapYearsLabel": "Years Your Other Income Overlaps the State Pension",
    "gbOverlapYearsSub": "Years you expect to keep earning after your State Pension starts (enter 0 if none)",
    "gbOverlapYearsUnit": "years",
    "gbPensionAccessNote": "SIPP and Workplace Pension funds cannot normally be accessed before age {age} (rising to {futureAge} from {date}).",
    "gbPensionAllowanceLabel": "Pension Annual Allowance ({taxYear})",
    "gbPensionOverLabel": "You are {amount} over the pension annual allowance",
    "gbPensionRemainingLabel": "Remaining Pension Allowance",
    "gbPensionRemainingSub": "Up to {amount} across your SIPP and Workplace Pension combined",
    "gbPensionReliefLabel": "Pension Tax Relief (Estimate)",
    "gbPensionReliefSub": "Contributions × your marginal rate of {pct}%",
    "gbPensionTaperNote": "Your adjusted income is above {threshold}, so your annual allowance is tapered down to {amount} (floor of {floor}).",
    "gbPrescriptionLabel": "Prescription Costs (Annual)",
    "gbPrivateHealthLabel": "Private Health Insurance (Monthly)",
    "gbDentalLabel": "Dental Costs (Annual)",
    "gbLongTermCareLabel": "Long-term Care Costs (Annual)",
    "gbNhsBasicLabel": "Core Healthcare Costs (assuming NHS cover, Annual)",
    "gbOtherOutOfPocketLabel": "Other Out-of-Pocket Healthcare Costs (Annual)",
    "gbRestrictedAssetsLabel": "Retirement / Restricted Assets",
    "gbRestrictedAssetsSubAccessible": "You are {age} or older, so your pension funds are accessible",
    "gbRestrictedAssetsSubLocked": "SIPP + Workplace Pension (locked until age {age})",
    "gbRetirementIncomeLabel": "Retirement Income",
    "gbRetirementIncomeSub": "Annual State Pension plus any additional pension income",
    "gbSippLabel": "SIPP",
    "gbStatePensionAgeLabel": "Your State Pension Age",
    "gbStatePensionAgeNote": "State Pension age is rising from {from} to {to}, depending on your date of birth. Check your exact age with the GOV.UK State Pension age tool.",
    "gbStatePensionAnnualLabel": "State Pension (Annual)",
    "gbStatePensionAnnualSub": "Including any uplift from deferring",
    "gbStatePensionEstimateLabel": "Estimated Annual State Pension (from your GOV.UK forecast)",
    "gbStatePensionSourceNote": "Qualifying years ({years} for the full rate) are not assessed automatically. Please enter the annual figure from your GOV.UK State Pension forecast. The uplift for deferring ({unitPct}% for every {weeks} weeks) follows the official GOV.UK rules.",
    "gbStocksSharesIsaLabel": "Stocks and Shares ISA",
    "gbSurplusLabel": "Income Surplus",
    "gbSurplusSub": "Annual amount by which pension income exceeds your outgoings",
    "gbTaxAdvantagedLabel": "Tax-Advantaged Investments",
    "gbTaxAdvantagedSub": "ISAs + SIPP + Workplace Pension (a cross-cutting view that overlaps the two categories above)",
    "gbTaxHandledInInvestmentNote": "UK tax — Income Tax, Dividend Tax, Capital Gains Tax and pension tax relief — is calculated together in section 02 (ISA — Stocks & Shares).",
    "gbTaxSectionLabel": "Tax ({taxYear} — {region})",
    "gbTaxSourceNote": "Income Tax, Dividend Tax and Capital Gains Tax are estimates based on GOV.UK figures for {taxYear} ({region}). Scottish Income Tax, National Insurance, tax on savings interest and Inheritance Tax are not implemented.",
    "gbTotalAssetsLabel": "Total Assets (all six accounts)",
    "gbTotalAssetsSub": "ISAs + SIPP + Workplace Pension + GIA + Cash Savings combined",
    "gbTotalTaxLabel": "Total Tax (Estimate, after pension relief)",
    "gbTotalTaxSub": "Income Tax + Dividend Tax + CGT − pension tax relief",
    "gbWithdrawalLabel": "Withdrawal Needed from Your Accounts",
    "gbWithdrawalSub": "Annual shortfall not covered by pension income",
    "gbWorkplacePensionLabel": "Workplace Pension",
    "disclaimerBanner": "Disclaimer: This app is provided for information and simulation purposes only. It does not constitute tax, investment, or legal advice. Rules and tax rates can change, and all figures are estimates based on the assumptions you enter. Please consult a qualified professional before acting on any result.",
    "caAccountBreakdownChartTitle": "Account Breakdown at Retirement ({age})",
    "caAccountBreakdownNote": "Projected balance of each account — TFSA, RRSP, non-registered and cash savings — at your retirement age.",
    "caAdditionalPensionLabel": "Additional Pension Income (Annual, e.g. workplace pension)",
    "caAnnualContributionLabel": "Annual Contribution",
    "caAnnualIncomeLabel": "Total Annual Income (salary, pension, etc.)",
    "caBasicHealthLabel": "Core Healthcare Costs (assuming provincial coverage, Annual)",
    "caCapitalGainLabel": "Estimated Annual Capital Gains (outside TFSA and RRSP)",
    "caCashSavingsLabel": "Cash Savings",
    "caCgtLabel": "Tax on Capital Gains (Estimate)",
    "caCgtSub": "{pct}% of the gain is included in taxable income and taxed at your marginal rate",
    "caContributionEndAgeLabel": "Contributions End at Age",
    "caCppAnnualLabel": "CPP (Annual)",
    "caCppAnnualSub": "Adjusted for the age you start receiving it",
    "caCppEstimateLabel": "Estimated Annual CPP at 65 (from My Service Canada Account)",
    "caCppFactorNote": "Starting at {age} gives you {pct}% of the amount payable at 65 (reduced {early}% per month before 65, increased {late}% per month after).",
    "caCppFullNote": "For reference, the maximum CPP starting at 65 in {taxYear} is {amount} a year. What you actually receive depends heavily on your contribution history, so please replace this with the figure from My Service Canada Account.",
    "caCppStartAgeLabel": "Age You Start CPP ({min}–{max})",
    "caCurrentValueLabel": "Current Balance",
    "caDentalLabel": "Dental Costs (Annual)",
    "caExpensesMonthlyLabel": "Estimated Monthly Living Costs in Retirement",
    "caExpensesTotalLabel": "Total Outgoings (Living + Healthcare)",
    "caExpensesTotalSub": "Annual living costs plus healthcare costs",
    "caFederalTaxLabel": "Federal Income Tax (Estimate)",
    "caFederalTaxSub": "After the Basic Personal Amount credit ({amount}) at the lowest rate",
    "caHealthcareSourceNote": "This assumes core healthcare is covered by your provincial or territorial plan, and asks you to enter only the annual costs you expect to pay yourself. Prescription, dental and vision coverage varies widely by province, so these are not calculated automatically.",
    "caHealthcareTotalLabel": "Total Healthcare Costs (Annual)",
    "caHealthcareTotalSub": "Core costs + private cover + prescriptions + dental + vision + long-term care + other",
    "caInvestmentSourceNote": "Limits and rates shown are the canada.ca (CRA / Service Canada) figures for the {taxYear} tax year. {region}. Please consult a qualified professional for your own tax position.",
    "caLiquidAssetsLabel": "Liquid / Accessible Assets",
    "caLiquidAssetsSub": "TFSA, non-registered account and cash savings (withdrawals are tax-free or already taxed)",
    "caLongTermCareLabel": "Long-term Care Costs (Annual)",
    "caNonRegisteredLabel": "Non-Registered Account",
    "caOasAnnualLabel": "OAS (Annual, after clawback)",
    "caOasAnnualSub": "Reflecting residence years and deferral, net of the recovery tax",
    "caOasClawbackLabel": "OAS Recovery Tax (Clawback)",
    "caOasClawbackNote": "Your net income is above {threshold}, so {pct}% of the excess ({amount}) is recovered from your OAS. TFSA withdrawals do not count as net income and never trigger the clawback.",
    "caOasClawbackSub": "{pct}% of net income above {threshold} is recovered",
    "caOasEnhancedNote": "OAS is indexed quarterly to inflation. It increases by 10% from age 75 (current maximums: {base} a year at 65–74, {enhanced} a year from 75).",
    "caOasNoEarlyNote": "OAS cannot be claimed before 65. Your OAS will actually start at {age}.",
    "caOasResidenceLabel": "Years Lived in Canada After 18 ({full} years for the full amount)",
    "caOasResidenceSub": "{years} years gives you {pct}% of the full amount (no entitlement below {min} years)",
    "caOasStartAgeLabel": "Age You Start OAS ({min}–{max}, no early claim)",
    "caOtherOutOfPocketLabel": "Other Out-of-Pocket Healthcare Costs (Annual)",
    "caPrescriptionLabel": "Prescription Costs (Annual)",
    "caPrivateHealthLabel": "Private Health Insurance (Monthly)",
    "caPriorEarnedIncomeLabel": "Prior Year Earned Income (for RRSP room — leave blank to use your total income)",
    "caRestrictedAssetsLabel": "Restricted Assets",
    "caRestrictedAssetsSub": "RRSP (withdrawals are possible but fully taxable, and it must convert to a RRIF at {age})",
    "caRetirementIncomeLabel": "Retirement Income",
    "caRetirementIncomeSub": "Annual CPP + OAS (after clawback) + any additional pension",
    "caRrifNote": "Your RRSP must convert to a RRIF by the end of the year you turn {age}, after which minimum withdrawals apply ({pct}% at {age}, {pct80}% at 80, {pct95}% from 95). These mandatory withdrawals are included in the projection.",
    "caRrspLabel": "RRSP",
    "caRrspRoomLabel": "Annual RRSP Room",
    "caRrspRoomSub": "The lesser of {pct}% of last year's earned income and the {cap} cap",
    "caRrspOverLabel": "You are {amount} over your RRSP room",
    "caRrspRemainingLabel": "Remaining RRSP Room",
    "caRrspTaxSavingLabel": "RRSP Tax Saving (Estimate)",
    "caRrspTaxSavingSub": "Contributions are deductible — worth about {pct}% at your marginal rate",
    "caSurplusLabel": "Income Surplus",
    "caSurplusSub": "Annual amount by which pension income exceeds your outgoings",
    "caTaxAdvantagedLabel": "Tax-Advantaged Accounts",
    "caTaxAdvantagedSub": "TFSA + RRSP (a cross-cutting view that overlaps the two categories above)",
    "caTaxHandledInInvestmentNote": "Canadian tax — federal income tax, capital gains and RRSP tax savings — is calculated together in section 02 (TFSA).",
    "caTaxSectionLabel": "Tax ({taxYear} — federal only)",
    "caTaxSourceNote": "Federal income tax and capital gains are estimates based on CRA figures for the {taxYear} tax year. Provincial and territorial income tax (all 13 differ), dividend tax credits, CPP and EI contributions, and AMT are not implemented.",
    "caTfsaLabel": "TFSA",
    "caTfsaLimitLabel": "Annual TFSA Limit ({taxYear})",
    "caTfsaOverLabel": "You are {amount} over the annual TFSA limit",
    "caTfsaRemainingLabel": "Remaining TFSA Room",
    "caTfsaRemainingSub": "Up to {amount} a year. Your cumulative room depends on your own circumstances",
    "caTfsaTaxFreeNote": "Growth and withdrawals inside a TFSA are entirely tax-free. Withdrawals do not count as net income, so they never trigger the OAS clawback.",
    "caTotalAssetsLabel": "Total Assets (all four accounts)",
    "caTotalAssetsSub": "TFSA + RRSP + non-registered account + cash savings combined",
    "caTotalTaxLabel": "Total Tax (Estimate, after RRSP saving)",
    "caTotalTaxSub": "Federal income tax + capital gains tax − RRSP tax saving",
    "caVisionLabel": "Vision Care Costs (Annual)",
    "caWithdrawalLabel": "Withdrawal Needed from Your Accounts",
    "caWithdrawalSub": "Annual shortfall not covered by pension income",
    "caYearsUnit": "years",
    "auAccountBreakdownChartTitle": "Account Breakdown at Retirement ({age})",
    "auAccountBreakdownNote": "Projected balance of each account — superannuation, investment account and cash savings — at your retirement age.",
    "auAgePensionAnnualLabel": "Age Pension (Annual)",
    "auAgePensionAnnualSub": "The lower of the income test and assets test applies",
    "auAgePensionMaxLabel": "Maximum Age Pension (Annual)",
    "auAgePensionMaxSub": "The maximum rate for a {status}. Means testing reduces what you actually receive",
    "auAgePensionNotYetNote": "The Age Pension starts at {age}. Between retirement and that age you will need to fund your living costs from super and your investment account.",
    "auAgePensionQualifyingAgeLabel": "Age Pension Qualifying Age",
    "auAgePensionZeroNote": "Means testing reduces your Age Pension to zero — your assets or income are above the cut-off point.",
    "auAnnualContributionLabel": "Annual Contribution (after-tax)",
    "auAnnualSalaryLabel": "Annual Salary (used for SG contributions and income tax)",
    "auAssetsTestLabel": "Assets Test",
    "auAssetsTestSub": "Reduces by ${taper} a fortnight for every $1,000 of assets above {amount}",
    "auCapitalGainDiscountLabel": "Held for more than 12 months (eligible for the {pct}% discount)",
    "auCapitalGainLabel": "Estimated Annual Capital Gains (outside super)",
    "auCashSavingsLabel": "Cash Savings",
    "auCgtLabel": "Tax on Capital Gains (Estimate)",
    "auCgtSub": "Held over 12 months, {pct}% of the gain is discounted; the rest is taxed at your marginal rate plus the Medicare levy",
    "auConcessionalCapLabel": "Concessional Contributions Cap ({taxYear})",
    "auConcessionalCapSub": "Up to {amount} a year across employer SG and salary sacrifice combined",
    "auConcessionalOverLabel": "You are {amount} over the concessional cap (excess contributions attract extra tax)",
    "auConcessionalRemainingLabel": "Remaining Concessional Cap",
    "auContributionEndAgeLabel": "Contributions End at Age",
    "auContributionTaxLabel": "Contributions Tax ({pct}%)",
    "auContributionTaxSub": "Concessional contributions are taxed before they land in your fund",
    "auCoupleLabel": "Couple",
    "auCurrentValueLabel": "Current Balance",
    "auDentalLabel": "Dental Costs (Annual)",
    "auDiv293Note": "Your income plus concessional contributions is above {threshold}, so Division 293 lifts the tax on those contributions to {pct}% (the standard 15% plus an extra 15%).",
    "auExpensesMonthlyLabel": "Estimated Monthly Living Costs in Retirement",
    "auExpensesTotalLabel": "Total Outgoings (Living + Healthcare)",
    "auExpensesTotalSub": "Annual living costs plus healthcare costs",
    "auGapLabel": "Medical Gap Payments (above the Medicare rebate, Annual)",
    "auHomeownerLabel": "I own my home (this changes the assets test threshold)",
    "auIncomeTaxLabel": "Income Tax (Estimate)",
    "auIncomeTaxSub": "{taxYear} rates. The second bracket dropped to 15% from 1 July 2026",
    "auIncomeTestLabel": "Income Test",
    "auIncomeTestSub": "Reduces by {taper}c for every dollar of income above {amount}",
    "auInvestmentAccountLabel": "Investment Account (outside super)",
    "auInvestmentSourceNote": "Caps and rates shown are the ATO figures for the {taxYear} financial year (1 July 2026 to 30 June 2027). Please consult a qualified professional for your own tax position.",
    "auLiquidAssetsLabel": "Liquid / Accessible Assets",
    "auLiquidAssetsSub": "Investment account and cash savings (plus superannuation once you are {age} or older)",
    "auMedicareLevyLabel": "Medicare Levy ({pct}%)",
    "auMedicareLevySub": "Funds the public health system, charged on top of income tax",
    "auAgedCareLabel": "Aged Care Costs (Annual)",
    "auOpticalLabel": "Optical Costs (Annual)",
    "auOtherIncomeLabel": "Other Annual Income (assessed under the Age Pension income test)",
    "auOtherOutOfPocketLabel": "Other Out-of-Pocket Healthcare Costs (Annual)",
    "auPharmaceuticalLabel": "Pharmaceutical Costs (Annual)",
    "auPreservationAgeNote": "Superannuation cannot normally be accessed before {age} (your preservation age). From {unrestricted} it is accessible regardless of your work status.",
    "auPrivateHealthLabel": "Private Health Insurance (Monthly)",
    "auRestrictedAssetsLabel": "Restricted Assets",
    "auRestrictedAssetsSubAccessible": "You are {age} or older, so your superannuation is accessible",
    "auRestrictedAssetsSubLocked": "Superannuation (locked until age {age})",
    "auRetirementIncomeLabel": "Retirement Income",
    "auRetirementIncomeSub": "Annual Age Pension plus any other income",
    "auSalarySacrificeLabel": "Salary Sacrifice and Other Concessional Contributions (Annual)",
    "auSalarySacrificeSavingLabel": "Salary Sacrifice Saving (Estimate)",
    "auSalarySacrificeSavingSub": "The gap between your {pct}% marginal rate and the 15% contributions tax",
    "auSgContributionLabel": "Employer SG Contribution ({pct}%)",
    "auSgContributionSub": "{pct}% of your salary is paid into super automatically (subject to the maximum contribution base)",
    "auSingleLabel": "Single",
    "auMinimumDrawdownNote": "In the retirement phase you must draw a minimum percentage from super each year, based on your age ({under65}% under 65, {age65}% at 65–74, {age75}% at 75–79, {age95}% from 95). These mandatory withdrawals are included in the projection.",
    "auStatusLabel": "Relationship Status (this changes your Age Pension rate and means test)",
    "auSuperEarningsTaxNote": "Earnings inside super are taxed at {pct}% during the accumulation phase. In the retirement phase (from age {age}, once retired) they are tax-free up to the Transfer Balance Cap ({tbc}).",
    "auSuperLabel": "Superannuation",
    "auSuperTaxFreeNote": "Withdrawals from super after age {age} are tax-free (from a taxed fund).",
    "auSurplusLabel": "Income Surplus",
    "auSurplusSub": "Annual amount by which your retirement income exceeds your outgoings",
    "auTaxAdvantagedLabel": "Tax-Advantaged Assets",
    "auTaxAdvantagedSub": "Superannuation (earnings taxed at just 15%, and tax-free in retirement)",
    "auTaxHandledInInvestmentNote": "Australian tax — income tax, the Medicare levy, super contributions tax and capital gains — is calculated together in section 02 (Investment Account).",
    "auTaxSectionLabel": "Tax ({taxYear} financial year)",
    "auTaxSourceNote": "Income tax, the Medicare levy and capital gains tax are estimates based on ATO figures for {taxYear}. Offsets such as LITO and SAPTO, the Medicare Levy Surcharge and HECS-HELP repayments are not implemented.",
    "auTotalAssetsLabel": "Total Assets (all three accounts)",
    "auTotalAssetsSub": "Superannuation + investment account + cash savings combined",
    "auTotalTaxLabel": "Total Tax (Estimate)",
    "auTotalTaxSub": "Income tax + Medicare levy + capital gains tax",
    "auWithdrawalLabel": "Withdrawal Needed from Your Accounts",
    "auWithdrawalSub": "Annual shortfall not covered by your retirement income",
    "guideButtonLabel": "Show what to enter here",
    "tsumitateHoldingsGuide": "[Enter what you currently hold in the accumulation quota, fund by fund]\nList the funds you bought inside the accumulation quota (up to 1.2M yen a year), one row per fund. Enter the current market value shown in your brokerage account, not the price you originally paid.\nIn the 'as of age' field below, enter your age when you checked these figures. The app then catches the balance up to today automatically.",
    "growthHoldingsGuide": "[Enter what you currently hold in the growth quota, fund by fund]\nList the funds and shares you bought inside the growth quota (up to 2.4M yen a year), one row per fund. Enter the current market value shown in your brokerage account.\nIf you use both quotas, keep them in their separate blocks.",
    "tsumitateScheduleGuide": "[Enter how much you invest each month in the accumulation quota]\nRegister it as 'from age X to age Y, this much per month'. This is the total for the quota — you split it between funds in the next block.\nThe cap is 1.2M yen a year (100k a month). Anything above the cap is trimmed automatically and flagged.\nYou can register several periods if your income will change (for example 50k a month until 40, then 100k).",
    "tsumitateAllocationGuide": "[Decide how much of your monthly investment goes into each fund — accumulation quota]\nSplit the monthly total above between your funds as percentages. They should add up to 100%.\nExample: 100k a month, split 70% global equity and 30% S&P 500, means 70k into global equity and 30k into the S&P 500 every month.\nYou can also set an expected return per fund, which feeds the projection.",
    "growthScheduleGuide": "[Enter how much you invest each month in the growth quota]\nSeparate from the accumulation quota, register how much you invest monthly in the growth quota. The cap is 2.4M yen a year (200k a month).\nIf you do not use the growth quota, leave this empty.",
    "growthAllocationGuide": "[Decide how much of your monthly investment goes into each fund — growth quota]\nSplit the monthly total for the growth quota between your funds as percentages. They should add up to 100%.",
    "lumpSumGuide": "[Enter any lump-sum investments — growth quota]\nIf you plan to invest a lump sum at a certain age (from a retirement payout or bonus, for example), register the amount and the age.\nThis consumes your growth quota. Anything above the 2.4M annual or 12M lifetime cap is trimmed automatically and flagged.\nIf you have no lump sum planned, leave this empty.",
    "lumpAllocationGuide": "[Decide how the lump sum is split between funds]\nSplit the lump sum registered above between your funds as percentages. They should add up to 100%.",
    "nisaTotalGuide": "[This is your NISA total — calculated automatically, nothing to enter]\nThe combined current value of your accumulation and growth holdings, worked out from the amounts you entered in the blocks above.",
    "currentAgeGuide": "[Enter your age today]\nIf you entered your date of birth, this is filled in automatically. The projection starts from this age and steps forward one month at a time.",
    "retireAgeGuide": "[Enter the age you plan to stop working]\nAt this age the projection switches from the accumulation phase to the drawdown phase: contributions stop and you begin living off your assets.\nYou do not have to have decided. Put 65 in, then move it around to compare.",
    "deathAgeGuide": "[Enter how long the projection should run]\nThis is where the calculation ends, so you can see whether your money lasts. To be safe against living a long time, set it beyond average life expectancy — 90 to 95 is a common choice.",
    "idecoCurrentValueGuide": "[Enter the current value of your iDeCo account]\nThis is the balance shown by your provider. Enter the current market value including growth, not the total you have paid in.",
    "idecoPrincipalGuide": "[Enter the total you have paid into iDeCo so far]\nThis is used for the retirement income deduction when you withdraw. Enter only the contributions, excluding investment growth.",
    "idecoMonthlyContributionGuide": "[Enter how much you pay into iDeCo each month]\nYour cap depends on your job and whether you have a workplace pension (typically 12,000 to 23,000 yen a month for employees, 68,000 for the self-employed). Check your own cap with your provider.\nContributions are fully deductible, and this feeds the tax-saving estimate below.",
    "idecoPayoutYearsGuide": "[Enter over how many years you will draw it as a pension]\nUsually between 5 and 20 years. A longer period means a smaller annual payment, which can keep you inside the public pension deduction and reduce your tax.",
    "idecoPayoutReturnGuide": "[Enter the expected return while you are drawing it down]\nYour remaining balance keeps being invested while you draw it. Use 0-1% if you switch to cash, or 3-5% if you stay in equities.",
    "idecoLumpPortionGuide": "[If you take both, enter what percentage you take as a lump sum]\nFor example, 50% means half as a lump sum and half drawn as a pension.\nThe lump sum uses the retirement income deduction and the pension uses the public pension deduction, so splitting can reduce your total tax.",
    "annualIncomeGuide": "[Enter your current gross annual income]\nUsed to estimate the tax you save through iDeCo. Enter the gross figure from your withholding slip, not your take-home pay.\nThe app estimates your marginal rate from this and multiplies it by your contributions.",
    "livingCostGuide": "[Enter what you expect to spend each month in retirement]\nRent, food, utilities, phone, hobbies and so on. Do not include healthcare — that goes in section 05.\nFor reference, Japanese government surveys put a retired couple at around 250,000 to 280,000 yen a month.",
    "health60sGuide": "[Enter your annual out-of-pocket healthcare costs in your 60s]\nThis is what you actually pay yourself, on top of public insurance: co-payments, medicines, check-ups, dental work.\nIf you have no idea, start with 100,000 to 150,000 yen a year and adjust.",
    "health70sGuide": "[Enter your annual out-of-pocket healthcare costs in your 70s]\nCo-payments drop to 20% from age 70 (30% for higher earners), but people visit more often, so the total usually rises.",
    "health80sGuide": "[Enter your annual out-of-pocket healthcare costs from 80]\nFrom 75 the co-payment is usually 10%, but hospital stays and care costs increase. Set this higher if you want to allow for long-term care.",
    "inheritanceTargetGuide": "[Enter how much you want to leave behind]\nAt the end of the projection you can check whether this much is still there.\nIf you have no target, leave it at zero — the projection then assumes you spend it all.",
    "goldCurrentHoldingGuide": "[Enter how many grams of gold you hold]\nBullion, gold accumulation plans and coins. Gold ETFs and funds belong under shares or NISA instead.",
    "goldPriceRefGuide": "[Enter the current price of gold per gram]\nUse the retail price from a dealer. Future prices are projected from here using the growth rate below.",
    "goldGrowthGuide": "[Enter how fast you expect gold to rise each year]\nGold has risen around 8-10% a year over the past two decades, but it is volatile and does fall. Two or three percent is a conservative choice.",
    "goldMonthlyContributionGuide": "[Enter how much gold you buy each month]\nEnter an amount and it is converted into grams at whatever the price is that month. Leave it at zero if you are not adding to it.",
    "usModifiedAGIGuide": "[Enter your Modified Adjusted Gross Income]\nUsed to work out whether you can contribute to a Roth IRA and whether your Traditional IRA contribution is deductible.\nIf you are not sure of the exact figure, start with your gross salary.",
    "usCurrentBalanceGuide": "[Enter the current balance of this account]\nThe value shown by your provider. Enter the current market value including growth, not the total you have paid in.",
    "usAnnualContributionGuide": "[Enter how much you contribute to this account each year]\n401(k): $24,500 (plus $8,000 from 50, or $11,250 at 60-63). IRA: $7,500 (plus $1,100 from 50).\nYou will see a warning if you go over.",
    "usStateTaxRateGuide": "[Enter your state income tax rate]\nThis varies from 0% (Texas, Florida) to over 13% (California). State tax is not calculated automatically, so please enter it yourself.",
    "usCapitalGainGuide": "[Enter your expected annual capital gains]\nGains you expect to realise in your taxable brokerage account. Gains inside a 401(k) or IRA are not taxed, so leave them out.",
    "usPiaGuide": "[Enter your monthly Social Security benefit]\nThis is the amount at full retirement age (67), which you can find in your my Social Security account at ssa.gov.\nClaiming earlier or later adjusts this figure automatically.",
    "usExpensesMonthlyGuide": "[Enter what you expect to spend each month in retirement]\nYour total living costs. Healthcare goes in a separate section, so leave it out here.",
    "usHealthInsuranceGuide": "[Enter your monthly private health insurance premium]\nMedicare Part B is calculated automatically from your income, so do not include it. Enter Medigap, Part D, or pre-retirement private cover here.",
    "usOutOfPocketGuide": "[Enter your annual out-of-pocket healthcare costs]\nWhat you pay yourself on top of insurance: deductibles, co-pays, prescriptions, dental and vision.",
    "gbCurrentValueGuide": "[Enter the current balance of this account]\nThe value shown by your provider. Enter the current market value including growth, not the total you have paid in.",
    "gbAnnualContributionGuide": "[Enter how much you contribute to this account each year]\nISAs are capped at £20,000 a year across all of them, and pensions at £60,000 a year. You will see a warning if you go over.",
    "gbExpectedReturnGuide": "[Enter the expected annual return for this account]\nAround 5-7% for a mostly equity portfolio, 1-3% for cash and bonds. You can set this separately for each account.",
    "gbContributionEndAgeGuide": "[Enter the age you stop paying into this account]\nUsually the same as your retirement age, but you can set it separately for each account.",
    "gbAnnualIncomeGuide": "[Enter your total annual income]\nSalary, pension and so on, before tax. This drives Income Tax, Dividend Tax, CGT and your pension tax relief.",
    "gbAdjustedIncomeGuide": "[Enter your adjusted income (leave blank if unsure)]\nUsed to work out whether your pension annual allowance is tapered. Above £260,000 the allowance starts to fall.\nIf you leave it blank, your total income above is used instead.",
    "gbDividendIncomeGuide": "[Enter your annual dividend income]\nOnly dividends received outside ISAs and pensions. Dividends inside an ISA are tax-free, so leave them out.\nThe first £500 is tax-free.",
    "gbCapitalGainGuide": "[Enter your expected annual capital gains]\nGains realised outside ISAs and pensions (in a General Investment Account, for example). Gains inside an ISA are tax-free.\nThe first £3,000 is tax-free.",
    "gbStatePensionEstimateGuide": "[Enter your annual State Pension forecast]\nYou can find this with the GOV.UK State Pension forecast. What you receive depends on your National Insurance record, so please replace the default with your own figure.\nThe default shown is the full rate for 2026/27, for reference.",
    "gbOverlapYearsGuide": "[Enter how many years you keep earning after your State Pension starts]\nIf you carry on working past your State Pension age, enter the number of years. Enter 0 if that does not apply.",
    "gbAdditionalPensionGuide": "[Enter any other annual pension income]\nWorkplace defined benefit pensions and so on. Drawdown from your SIPP or workplace pension is already calculated in section 02, so do not include it here.",
    "gbExpensesMonthlyGuide": "[Enter what you expect to spend each month in retirement]\nYour total living costs. Healthcare goes in a separate section, so leave it out here.",
    "gbHealthcareGuide": "[Enter the healthcare costs the NHS does not cover]\nCore healthcare is free on the NHS. Enter only what you pay yourself: private cover, dental, prescriptions, optical and long-term care.",
    "caCurrentValueGuide": "[Enter the current balance of this account]\nThe value shown by your institution. Enter the current market value including growth, not the total you have paid in.",
    "caAnnualContributionGuide": "[Enter how much you contribute to this account each year]\nTFSA: C$7,000. RRSP: the lesser of 18% of last year's earned income and C$33,810. You will see a warning if you go over.",
    "caAnnualIncomeGuide": "[Enter your total annual income]\nSalary, pension and so on. This drives federal tax, capital gains, your RRSP tax saving and the OAS clawback.",
    "caPriorEarnedIncomeGuide": "[Enter last year's earned income (leave blank if unsure)]\nUsed to work out your RRSP room (18% of it). If you leave it blank, your total income above is used instead.\nYour exact room is on your CRA Notice of Assessment.",
    "caCapitalGainGuide": "[Enter your expected annual capital gains]\nGains realised outside your TFSA and RRSP, in a non-registered account. Gains inside a TFSA are entirely tax-free.\nIn Canada, 50% of a gain is included in your taxable income.",
    "caCppEstimateGuide": "[Enter your annual CPP at 65]\nYou can find this in My Service Canada Account. It depends heavily on your contribution history, so please replace the default with your own figure.\nThe default is the 2026 maximum, for reference. Starting between 60 and 70 adjusts it automatically.",
    "caOasResidenceGuide": "[Enter how many years you have lived in Canada since 18]\n40 years gives the full amount; below 10 years there is no entitlement. 20 years gives you half.\nIf you have lived in Canada all your life, enter 40.",
    "caAdditionalPensionGuide": "[Enter any other annual pension income]\nAnything beyond CPP and OAS. Drawdown from your RRSP and TFSA is already calculated in section 02, so do not include it here.",
    "caExpensesMonthlyGuide": "[Enter what you expect to spend each month in retirement]\nYour total living costs. Healthcare goes in a separate section, so leave it out here.",
    "caHealthcareGuide": "[Enter the healthcare costs your province does not cover]\nCore healthcare is covered provincially. Enter only what you pay yourself: prescriptions, dental, vision, private cover and long-term care. Coverage varies a lot by province.",
    "auCurrentValueGuide": "[Enter the current balance of this account]\nThe value shown by your super fund or broker. Enter the current market value including growth, not the total you have paid in.",
    "auAnnualContributionGuide": "[Enter how much you contribute to this account each year]\nFor super, enter after-tax (non-concessional) contributions only. Employer SG and salary sacrifice are worked out from your salary above, so do not include them here.",
    "auAnnualSalaryGuide": "[Enter your annual salary before tax]\nUsed to work out your employer's SG contribution (12% of salary) and your income tax and Medicare levy.\nSG is only paid on earnings up to A$270,830 a year.",
    "auSalarySacrificeGuide": "[Enter your salary sacrifice and other concessional contributions]\nMoney taken from your pay before tax and put into super. It is taxed at 15% instead of your marginal rate (up to 47%), which is where the saving comes from.\nTogether with employer SG, the cap is A$32,500 a year. Going over attracts extra tax.",
    "auCapitalGainGuide": "[Enter your expected annual capital gains]\nGains realised outside super, in your investment account. Gains inside super are taxed separately, so leave them out.\nAssets held over 12 months get a 50% discount.",
    "auOtherIncomeGuide": "[Enter your other annual income]\nIncome assessed under the Age Pension income test: rent, dividends, part-time work and so on.\nThe more you have, the less Age Pension you receive — 50c less for every dollar above the free area.",
    "auExpensesMonthlyGuide": "[Enter what you expect to spend each month in retirement]\nYour total living costs. Healthcare goes in a separate section, so leave it out here.\nASFA puts a comfortable retirement for a single person at around A$54,840 a year.",
    "auHealthcareGuide": "[Enter the healthcare costs Medicare does not cover]\nCore healthcare is covered by Medicare. Enter only what you pay yourself: gap payments, private cover, pharmaceuticals, dental, optical and aged care.",
    "bankGuide": "[Enter your bank and cash balances]\nSavings accounts, term deposits and cash. You can add several accounts, each with its own monthly deposit and interest rate.\nThis is the money you are not investing.",
    "stockGuide": "[Add the individual shares you hold outside NISA]\nShares in a taxable account. Shares inside your NISA belong in section 02, so do not include them here.\nEntering a name suggests an expected return, which you can then change.",
    "loanGuide": "[Add your mortgage and other loans]\nEnter the balance, the interest rate and your monthly payment, and the app projects it through to being paid off.\nIf your payment is smaller than the interest, the balance never falls, and you will be warned.",
    "insuranceGuide": "[Add your life and health insurance premiums]\nEnter the payment period and the monthly premium, and the total you will pay over your lifetime is deducted from your assets.\nCover details are kept as a note but do not feed the projection.",
    "privatePensionGuide": "[Add workplace and private pension plans]\nEnter the contribution period and amount, and the payout period and amount, and it feeds the asset projection.\niDeCo is handled separately in section 03, so do not include it here.",
    "pensionSourcesGuide": "[Enter your public pension forecast]\nThe annual amount at 65, from your pension statement or the online pension service. Include both the basic and the earnings-related portions.\nYou can register several pensions separately (for a spouse, for example).",
    "nisaGroupHoldings": "1. What you already hold",
    "nisaGroupTsumitate": "2. Accumulation quota (monthly)",
    "nisaGroupGrowth": "3. Growth quota (monthly)",
    "nisaGroupLump": "4. Lump sum (growth quota)",
    "advancedMedicalLabel": "Advanced medical care",
    "ageYM": "{years}y {months}m",
    "ageYMD": "{years} years {months} months {days} days",
    "ageYears": "{age} years",
    "allocSumNote": "Automatically calculated from the combined total of the regular, growth, and lump-sum breakdowns ({amount}).",
    "amountPlaceholder": "Amount",
    "annualContributionLabel": "Annual Contribution",
    "annualIncomeLabel": "Annual Income (optional)",
    "annualOverPaceNote": "On pace to exceed the $12,000 annual limit by {amount} (automatically adjusted to $1,000/month)",
    "annualOverPaceNoteGrowth": "On pace to exceed the $24,000 annual limit by {amount} (automatically adjusted to $2,000/month)",
    "annualPayoutAmountLabel": "Estimated annual payout (ages {from}–{to})",
    "annualRatePlaceholder": "Interest rate (annual %)",
    "annualTaxSavingLabel": "Annual Tax Savings (Estimate)",
    "appSubtitle": "Investment Accounts × Retirement Assets × Pensions × Healthcare Costs × Estate Planning — Integrated Simulation",
    "appTitle": "Comprehensive Financial Life Planner",
    "appTitleWithName": "({name})",
    "asOfAgePlaceholder": "Reference age",
    "asOfAgeRequired": "Reference age for this balance (required)",
    "autoEstimatedSuffix": " (auto-estimated)",
    "autoGuessedFromHoldingsSuffix": " (auto-estimated from holding names)",
    "autoGuessedSuffix": " (auto-estimated from product name)",
    "autoHalfWeightedSuffix": " (auto: half of your working-years weighted average)",
    "autoValuationCol": "Estimated Value (Auto)",
    "autoValuationLabel": "Estimated value (auto-calculated: regular + growth allocation schedules plus elapsed lump-sum investments)",
    "backupExportLabel": "Export (copy this)",
    "backupImportButton": "Load",
    "backupImportLabel": "Restore text (paste here)",
    "backupImportPlaceholder": "Paste the text you copied previously here",
    "backupImportSuccess": "Loaded",
    "backupInstructions": "Select all the text below and copy it into a notes app to keep it safe. Next time, paste it into the restore text box and press Load to restore it.",
    "backupToggleClose": "Close Backup",
    "backupToggleOpen": "Manual Backup",
    "balanceCol": "Balance",
    "bankBreakdownChartTitle": "Cash Balance by Bank — Projected by Age (Current / {retireAge} / {deathAge})",
    "bankNameCol": "Bank Name",
    "bankNote": "Monthly deposits are assumed to continue until retirement age ({age}). For a typical savings account, an interest rate of 0-0.1% is a reasonable guide.",
    "bankTotalNowLabel": "Total Cash (Current)",
    "benefitAdvancedMedical": "Advanced medical care {amount}",
    "benefitDaySurgery": "Day surgery {amount}",
    "benefitDeath": "Death benefit {amount}",
    "benefitDetailsLabel": "Coverage Details (amount per item)",
    "benefitHospitalization": "Hospitalization {amount}/day (up to {limit} days/stay)",
    "benefitRadiation": "Radiation {amount}/session",
    "benefitSeparator": ", ",
    "benefitSurgery": "Surgery {amount}",
    "birthDateLabel": "Date of Birth",
    "birthDateNotePrefix": "Current age calculated from date of birth: ",
    "birthDateNoteSuffix": " (as of today). This figure is used automatically as the Current Age throughout the simulation.",
    "capDiffExceeded": "{amount} over the monthly cap",
    "capDiffRemaining": "{amount} remaining before monthly cap",
    "colAge": "Age",
    "colAmount": "Amount",
    "colAmountVsCap": "Amount / Difference from Cap",
    "colMonthlyVsCap": "Monthly / Difference from Cap",
    "colName": "Name",
    "colPercent": "Percent",
    "contribLabel": "Contributions",
    "contribPayoutCol": "Contributions / Payout",
    "contribPeriodLabel": "Contribution Period: Start–End",
    "contributionTotalLabel": "Total Contributions (Projected)",
    "countrySelectTitle": "Select country (labels and currency switch automatically. Calculations currently use Japanese rules regardless of country)",
    "coveragePlaceholder": "Coverage",
    "coverageUntilAgeLabel": "Covered Until What Age",
    "coverageUntilLabel": "Coverage until {age}",
    "cumulativeTaxSavingLabel": "Cumulative Tax Savings Through End of Contributions (Estimate)",
    "currencyUnit": "USD",
    "currentAgeAutoNote": "This field is calculated automatically and cannot be edited because a date of birth has been entered. To adjust the age manually, clear the date of birth above.",
    "currentAgeFieldLabel": "Current Age",
    "currentAgeLabel": "Current Age",
    "currentBalanceAutoPlaceholder": "If left blank, estimated automatically from contributions",
    "currentBalanceManualLabel": "Current balance (manual)",
    "currentBalanceOptionalLabel": "Current Balance (optional)",
    "currentBalancePlaceholder": "Current balance",
    "currentLabelShort": "Current",
    "customBenefitNamePlaceholder": "Item name (e.g. advanced medical care days)",
    "daySurgeryLabel": "Day surgery",
    "deathBenefitLabel": "Death benefit",
    "depletionMarkerLabel": "Depleted",
    "endPlaceholder": "End",
    "estimatedAssetsAtPayoutLabel": "Estimated Assets at Payout",
    "expectedAnnualReturnLabel": "Expected Annual Return",
    "expectedReturnAutoNote": "The expected annual return is a rough default automatically set based on the holding's name (not actual market data). You can edit these values manually at any time.",
    "expectedReturnLabel": "Expected annual return",
    "footerDisclaimer": "※ This tool provides an approximate simulation based on the figures you enter. It does not guarantee future investment performance, pension amounts, healthcare costs, or tax treatment. Please consult a professional (financial planner, tax accountant, etc.) for estate, tax, or investment decisions. Data is saved automatically to browser storage each time you make changes.",
    "fundBreakdownChartTitle": "Breakdown by Fund at {age}",
    "goldAccumulateUntilLabel": "Continue Contributing Until Age",
    "goldAsOfNote": "Calculated by compounding the monthly contribution from the reference-age holding up to your current age, current holdings come to {grams}g, valued at {amount}.",
    "goldCurrentHoldingLabel": "Current Holdings",
    "goldCurrentValueAutoLabel": "Current Gold Value (Auto-calculated)",
    "goldGrowthRateLabel": "Expected Annual Price Growth Rate",
    "goldMonthlyContributionLabel": "Monthly Contribution",
    "goldPriceRefLabel": "Current Gold Price (Reference)",
    "goldPriceRefNote": "The gold price uses the retail spot price as of July 2026 (about $155/g) as a reference. Actual prices fluctuate daily, so replace this with the latest price when using the tool.",
    "growthAllocationLabel": "Breakdown by Holding for Growth Allocation (enter an amount to auto-calculate the percentage)",
    "growthAsOfNote": "Calculated based on the reference age for this balance. (Actual balance plus growth: {manual}) + (Contribution schedule plus growth: {catchup}) = current investment account total.",
    "growthFrameLabel": "Growth Allocation",
    "growthHoldingsLabel": "Growth Investment Allocation: Actual Balance (Holding & Amount)",
    "growthOverageDetail": "Growth allocation exceeds its limit by {amount}.",
    "growthScheduleCategoryLabel": "Growth Allocation Schedule",
    "growthScheduleExampleNote": "Example: you can split growth allocation contributions into ranges by year and month, such as “50y0m to 55y11m: $1,500/month” and “56y0m to 65y0m: $500/month.” Overlapping ranges are added together.",
    "growthScheduleLabel": "Growth Investment Allocation: Monthly Contribution (by age range)",
    "health60sLabel": "Annual Out-of-Pocket (60s)",
    "health70sLabel": "Annual Out-of-Pocket (70s)",
    "health80sLabel": "Annual Out-of-Pocket (80s+)",
    "healthCostNote": "This is an estimate of out-of-pocket costs after accounting for the high-cost medical expense cap under public health insurance. Actual caps vary by income bracket, so use this as a general guide.",
    "healthcareNotImplementedNote": "A dedicated healthcare cost model for {country} has not been implemented yet. The out-of-pocket amounts above are used as entered, but the explanation of Japan's high-cost medical expense cap does not apply in {country}.",
    "historyColBankTotal": "Total Cash",
    "historyColDate": "Date",
    "historyColGoldGrams": "Gold Holdings",
    "historyColNisaPrincipal": "Investment Principal",
    "historyEmpty": "No records yet. Records are saved automatically under today's date as you enter data.",
    "historyFetchErrorDebug": "Error while fetching history: {message}",
    "historyRecordNow": "Record Now",
    "historyReload": "Reload History",
    "historyRestore": "Restore This Record",
    "historyToggleClose": "Close History",
    "historyToggleOpen": "Input History ({count})",
    "holdingNamePlaceholder": "Holding name",
    "holdingValueCol": "Holding Value",
    "hospitalizationDaysLimitLabel": "Day limit per stay",
    "hospitalizationPerDayLabel": "Hospitalization per day",
    "hospitalizationSurgeryLabel": "Hospitalization surgery",
    "idecoAsOfNote": "Calculated by compounding monthly contributions from the reference-age value up to your current age, the current value comes to {amount}.",
    "idecoContributionEndAgeLabel": "Contribution End Age",
    "idecoContributionStartAgeLabel": "Contribution Start Age",
    "idecoCurrentValueAutoLabel": "Current IRA Value (Auto-calculated)",
    "idecoCurrentValueLabel": "Current Value",
    "idecoIntroNote": "An IRA is a retirement savings account. In principle, funds cannot be withdrawn before the eligible age. Investment returns are not guaranteed. The tax savings shown are estimates.",
    "idecoMonthlyContributionLabel": "Monthly Contribution",
    "idecoPrincipalLabel": "Principal (Total Contributions So Far)",
    "idecoProductDefault": "Global Equity Index Fund",
    "idecoProductNameLabel": "Investment Product Name",
    "importFailedError": "Failed to load. Please check that this is the correct backup text. ({message})",
    "importInputsNotFoundError": "No inputs field found",
    "inheritanceAmountPlaceholder": "Amount to leave",
    "inheritanceAutoNote": "Once you register one or more heirs, this field is automatically filled with their combined total and can no longer be edited. To go back to manual entry, remove all registered heirs.",
    "inheritanceTargetAutoLabel": "Amount to Leave to Heirs (auto-filled from the total above)",
    "inheritanceTargetLabel": "Amount to Leave to Heirs",
    "inheritanceTotalLabel": "Total Planned Inheritance",
    "insuranceNameCol": "Policy Name",
    "insuranceNamePlaceholder": "e.g. XYZ Life Medical Insurance",
    "insuranceNote": "Premiums paid are automatically deducted from future assets. Benefit amounts for hospitalization, surgery, etc. are for reference only; since their occurrence is uncertain, they are not automatically reflected in the asset projection (adjust your expected healthcare costs manually if needed). After adding a policy, you can freely add custom benefit items in the field below each policy.",
    "interestRateCol": "Interest Rate",
    "interestRatePlaceholder": "Interest rate (%, optional)",
    "investmentGainLabel": "Investment Gain (Current)",
    "investmentLimitsNotImplementedNote": "Investment rules for {country} (contribution limits, tax-advantaged allowances) have not been implemented yet. The figures below reuse Japan's NISA calculation framework as a structural placeholder only — they are not the actual limits for {country}.",
    "investmentTimePlaceholder": "At investment",
    "landingAudience1": "Anyone unsure whether they'll have enough for retirement",
    "landingAudience2": "Anyone getting started with tax-advantaged investing",
    "landingAudience3": "Anyone who wants to simulate life after retirement",
    "landingAudience4": "Anyone who wants to manage pensions and assets together",
    "landingAudience5": "Anyone who wants to visualize their life plan",
    "landingAudienceTitle": "Who This Is For",
    "landingBlogCta": "Read the Articles",
    "landingBlogDesc1": "Clear explanations on retirement savings, tax-advantaged investing, pensions, insurance, and life planning.",
    "landingBlogDesc2": "Regularly updated with ideas and insights that go beyond what the simulation alone can show.",
    "landingBlogTitle": "Financial Planning Articles",
    "landingCatch": "Your entire life plan, on one screen.",
    "landingCta": "Start Your Free Simulation",
    "landingDisclaimer": "This service provides simulations based on the figures you enter. It does not guarantee future investment performance or living conditions, and does not recommend any specific financial product.",
    "landingFeature1Desc": "Investment accounts, savings, gold, individual stocks, insurance, and more in one place",
    "landingFeature1Title": "Manage All Your Assets",
    "landingFeature2Desc": "Simulations account for public and corporate pensions, living costs, and healthcare costs",
    "landingFeature2Title": "Includes Pensions & Living Costs",
    "landingFeature3Desc": "See how your assets are projected to change at every age on a graph",
    "landingFeature3Title": "Visualize Your Future",
    "landingFeature4Desc": "Start right away — your data is saved on your device",
    "landingFeature4Title": "Free, No Sign-up",
    "landingFreeBadge": "Completely Free, No Sign-up Required",
    "landingFreeNotice": "All features are currently free to use.",
    "landingScreenshotAlt": "Comprehensive Financial Life Planner simulation screen",
    "landingScreenshotDesc": "Just enter your current assets, investment accounts, pensions, savings, gold, and insurance to see a clear graph of your future assets.",
    "landingScreenshotTitle": "See It In Action",
    "landingSub1": "Just enter your numbers to visualize your future cash flow.",
    "landingSub2": "Manage your investment accounts, pensions, savings, gold, and insurance together, and simulate how your assets will grow over time.",
    "landingTitle": "Comprehensive Financial Life Planner",
    "legendBankDeposits": "Cash",
    "legendGoldAssets": "Gold",
    "legendIdecoAssets": "Retirement Account",
    "legendNetWorth": "Net Worth (after loans and premiums)",
    "legendNisaAssets": "Investment Account",
    "legendPrivatePension": "Private Pension",
    "legendStocks": "Individual Stocks",
    "legendUsInvestment": "Investment Accounts (401k/IRA/Roth/Brokerage)",
    "legendGbInvestment": "Investment Accounts (ISA/SIPP/Workplace Pension/GIA/Cash)",
    "legendCaInvestment": "Investment Accounts (TFSA/RRSP/Non-Registered/Cash)",
    "legendAuInvestment": "Investment Accounts (Super/Investment Account/Cash)",
    "lifeExpectancyLabel": "Life Expectancy",
    "lifetimeRemainingAfterInvestment": "Lifetime limit remaining after this investment: {amount}",
    "lifetimeRemainingAtEnd": "Lifetime limit remaining at end of range: {amount}",
    "listSeparator": ", ",
    "livingCostLabel": "Retirement Living Costs",
    "loanBalancePlaceholder": "Outstanding balance",
    "loanBreakdownChartTitle": "Loan Balance Over Time — Projected by Age (Current / {retireAge} / {deathAge})",
    "loanNameCol": "Name",
    "loanNamePlaceholder": "Name (e.g. mortgage)",
    "loanPrincipalCol": "Remaining Principal",
    "localePreviewWarning": "Preview version: Labels and currency are adapted for the United States, but investment limits, retirement rules, taxes, and healthcare calculations currently use Japanese assumptions.",
    "lumpAllocationLabel": "Breakdown by Holding for Lump-Sum Investments (enter an amount to auto-calculate the percentage)",
    "lumpPayoutAmountLabel": "Lump-sum payout (once, at {age})",
    "lumpPortionPctLabel": "Portion Received as Lump Sum",
    "lumpSumCategoryLabel": "Lump-Sum Investments",
    "lumpSumLabel": "Lump-Sum Investments (growth allocation, specify age and amount)",
    "lumpSumMarkerLabel": "Lump Sum",
    "lumpTruncationAt": " (shortfall {amount})",
    "lumpTruncationIntro": "Some lump-sum investments exceeded the growth allocation or lifetime limit. The excess (",
    "lumpTruncationOutro": ") is not reflected in the tax-advantaged allocation.",
    "manualOverrideNote": "Manually set.",
    "monthlyAmountCol": "Monthly Amount",
    "monthlyAmountPlaceholder": "Monthly contribution",
    "monthlyContribAmountLabel": "Monthly contribution amount",
    "monthlyDepositCol": "Monthly Deposit",
    "monthlyDepositPlaceholder": "Monthly deposit",
    "monthlyPaceNote": "Pace of {monthly}/month ({annual}/year)",
    "monthlyPaymentCol": "Monthly Payment",
    "monthlyPaymentPlaceholder": "Monthly payment",
    "monthlyPayoutAmountLabel": "Monthly amount received during payout",
    "monthlyPremiumPlaceholder": "Monthly premium",
    "nameCol": "Name",
    "nameLabel": "Name (optional)",
    "netWorthChartNote": "The coloured bands are stacked: the top of the stack is your total assets, built up from the bottom (the green line, for example, is NISA + gold + cash combined — not the cash on its own).\nThe white line is that total minus your loan balances and the life insurance premiums you have paid. As long as you have either, the white line always sits below the top of the stack.",
    "netWorthChartTitle": "Net Worth Over Time — Investments + Gold + Cash + Stocks + Private Pension + Retirement Account − Loans − Cumulative Insurance Premiums ({currentAge} – {deathAge})",
    "nisaAllocationSlidersLabel": "Investment Allocation (holdings entered in the regular, growth, and lump-sum breakdowns above automatically appear as sliders here)",
    "nisaBreakdownChartTitle": "Current Investment Account Breakdown — Regular vs. Growth Allocation (based on cumulative usage to date)",
    "nisaCapSummaryNote": "Annual caps: regular allocation $12,000 ($1,000/month), growth allocation $24,000 ($2,000/month). Lifetime limit is $180,000 total (up to $120,000 of which can be growth allocation). Once the limit is reached, the simulation assumes no further tax-advantaged investment.",
    "nisaTotalExplanation": "The estimated value of the regular allocation ({tsumitate}) plus the growth allocation ({growth}) plus lump-sum investments ({lump}) makes up this Total field ({total}), and this figure is what the simulation uses. Enter the Actual Balance as the amount you actually held at the reference age. Once you enter a reference age, the estimated value is calculated by compounding from that age to your current age using each holding's expected return (if left blank, the amount entered is used as-is). Separately, the amounts that would have been contributed on the monthly schedule for the regular and growth allocations are also automatically compounded and added (regular allocation schedule: {tsumitateCatchup} / growth allocation schedule: {growthCatchup}). Lump-sum investments are compounded automatically in the same way from their investment date to today. Note: since the schedule amount is added automatically, please make sure the Actual Balance does not double-count amounts already contributed via the schedule. Holding names entered here also appear in the Investment Allocation sliders below, where the expected annual return is set and adjusted automatically per holding (no need to enter a return here). If you want to change the return yourself, edit the Expected Annual Return field for each holding in the Investment Allocation section below.",
    "nisaTotalLabel": "Current Investment Account Total (Auto-calculated)",
    "noFundsYetNote": "No holdings entered yet. Enter a holding name and amount in the Regular Allocation, Growth Allocation, or Lump-Sum breakdown above, and sliders will appear here automatically.",
    "overageWarningIntro": "The cumulative usage you entered exceeds the investment account limits.",
    "overageWarningOutro": "Please check your actual brokerage account usage and review these figures.",
    "overlapWarningNote": "Be aware that stacking too many funds from the same category reduces diversification (for example, a Global Equity fund and an S&P 500 fund tend to overlap heavily in US stock exposure).",
    "payoffInsufficientNote": "not paid off (payment amount insufficient)",
    "payoffScheduleLabel": "Expected Payoff",
    "payoutAccountingNote": "After payout begins, a lump-sum payment is added once, in the year received, to Current Spendable Assets. Annuity payments are added to Annual Income during the payout period and offset against the living-cost shortfall. Once the payout period ends, income from the IRA stops.",
    "payoutLabel": "Payout",
    "payoutMethodBoth": "Both",
    "payoutMethodLabel": "Payout Method",
    "payoutMethodLump": "Lump Sum",
    "payoutMethodPension": "Annuity",
    "payoutPeriodLabel": "Payout Period: Start–End",
    "payoutReturnPctLabel": "Expected Return During Payout",
    "payoutStartAgeLabel": "Payout Start Age",
    "payoutYearsLabel": "Annuity Payout Period",
    "pensionAutoNote": "Once you register one or more pension sources, this field is automatically filled with their combined monthly total and can no longer be edited. To go back to manual entry, remove all registered sources.",
    "pensionEstimateLabel": "Expected Pension Income",
    "pensionNameCol": "Pension Name",
    "pensionNamePlaceholder": "e.g. Social Security, Corporate Pension",
    "pensionNamePlaceholderPrivate": "e.g. XYZ Individual Annuity",
    "pensionSourcesLabel": "Expected Pension Income (Social Security, corporate pension, etc. — add as many as you like)",
    "pensionTotalAutoLabel": "Expected Pension Income: Total (auto-filled from the list above)",
    "pensionTypeCol": "Pension Type",
    "peopleCount": "{count} people",
    "perMonthSuffix": "/month",
    "periodMonth": "monthly",
    "periodYear": "annual",
    "phaseAccumulation": "Accumulation Phase",
    "phaseDrawdown": "Drawdown Phase",
    "postRetireReturnLabel": "Expected Return After Retirement",
    "premiumCoverageCol": "Premiums / Coverage",
    "premiumPeriodLabel": "Premium Payment Period: Start–End",
    "premiumRangeLabel": "Premiums",
    "printButton": "Save as PDF / Print",
    "privatePensionNote": "During the contribution period, monthly contributions accumulate; during the payout period, the monthly payout is drawn down from that balance, and this is reflected as part of your assets in the lifetime asset graph. Payouts are also treated like a public pension, offsetting living and healthcare costs, which slows the drawdown of your investment account. If you enter a Current Balance, the actual surrender value on your policy statement is used as the starting balance (if left blank, it is estimated automatically as the simple sum of contributions from the start age to today, assuming 0% growth).",
    "privatePensionTotalNowLabel": "Total Private Pension Savings (Current)",
    "radiationLabel": "Radiation therapy (per session)",
    "relationCol": "Relationship",
    "relationPlaceholder": "Relationship (e.g. spouse, eldest son)",
    "retireAgeFieldLabel": "Retirement (Pension Start) Age",
    "retireAgeLabel": "Retirement Age",
    "retirementMarkerLabel": "Retirement",
    "retirementNotImplementedNote": "Retirement account rules for {country} (contribution limits, tax treatment) have not been implemented yet. The figures below reuse the iDeCo calculation structure as a placeholder only.",
    "revertToAutoLink": "Revert to Automatic",
    "saveError": "Save Failed",
    "saveMessageFailed": "Save failed: {error}",
    "saveMessageLastSaved": "Last saved: {time}",
    "saveMessageUnavailable": "Auto-save isn't available in this browser/environment (please open this as a Claude artifact).",
    "saveSaved": "Saved",
    "saveSaving": "Saving…",
    "saveUnavailable": "Save Unavailable",
    "saveWarningHint": "Auto-save is not available in this environment. Please copy the text from Manual Backup below to keep it safe.",
    "scheduleBeforeBaseAgeAlert": "The schedule's start age is earlier than the reference age for this balance above ({age}).\nSince periods before the reference age should already be reflected in the Actual Balance, please set the start age to the reference age or later.",
    "scheduleExampleNote": "Example: you can split contributions into ranges by year and month, such as “58y0m to 61y11m: $1,100/month” and “62y0m to 65y0m: $900/month.” Overlapping ranges are added together.",
    "sectorCol": "Sector",
    "sharesCol": "Shares",
    "startPlaceholder": "Start",
    "statAssetsAtRetireLabel": "Assets at {age}",
    "statAssetsAtRetireSub": "At end of accumulation phase",
    "statBankAtRetireLabel": "Total Cash — at {age}",
    "statBankAtRetireSub": "Projected if monthly deposits continue",
    "statBankCountSub": "Spread across {count} accounts",
    "statBankTotalNowLabel": "Total Cash (Current)",
    "statDepletionAtAge": "Depleted at age {age}",
    "statDepletionSub": "Drawdown pace should be reviewed",
    "statGoldAtTargetLabel": "Gold Assets — at {age}",
    "statGoldGramsEstimateSub": "Estimated {grams}g",
    "statGrowthAnnualRemainingLabel": "Growth Allocation Annual Limit Remaining (based on current pace)",
    "statGrowthLifetimeUsageLabel": "Growth Allocation Lifetime Usage (Projected)",
    "statGrowthOverageLabel": "Growth Allocation Amount Over Limit",
    "statGrowthRemainingLabel": "Growth Allocation Remaining",
    "statGrowthRemainingSub": "{used} used of $120,000 limit",
    "statIdecoAssetsLabel": "Investment Assets: Retirement Account",
    "statIdecoAssetsSub": "Current retirement account value",
    "statInheritanceGapNegative": "{amount} vs. target",
    "statInheritanceGapPositive": "+{amount} vs. target",
    "statInsuranceCountSub": "{count} policies",
    "statInsurancePaidLabel": "Life Insurance Premiums Paid (Lifetime)",
    "statLifetimeRoomSub": "Expected to have lifetime room remaining",
    "statLoanBalanceNowLabel": "Loan Balance (Current)",
    "statLoanCountSub": "{count} loans",
    "statMaxedAtAge": "Expected to reach limit at age {age}",
    "statMonthlyGapCoveredSub": "Pension covers living costs",
    "statMonthlyGapLabel": "Monthly Retirement Cash Flow Gap",
    "statMonthlyGapShortfallSub": "Pension alone is insufficient (requires drawing down assets)",
    "statNetWorthFinalLabel": "Total Assets at {age} (Investments + Gold + Cash, Available to Leave)",
    "statNeverDepletes": "Never depletes",
    "statNisaAssetsLabel": "Investment Assets: Tax-Advantaged Account",
    "statNisaAssetsSub": "Current investment account value",
    "statNoBankAccountsSub": "No bank accounts registered",
    "statNoInsuranceSub": "No insurance registered",
    "statNoLoansSub": "No loans",
    "statNotRegisteredSub": "Not registered",
    "statNotYetMaxed": "Not expected to reach the limit",
    "statOfLifetimeLimit": "of {amount} combined lifetime limit",
    "statOverageOverSub": "Over the limit",
    "statOverageWithinSub": "Within the limit",
    "statPensionPlanCountSub": "{count} pension plans",
    "statPrivatePensionFinalLabel": "Private Pension Balance (At End of Payout)",
    "statRetirementLockedSub": "Cannot be withdrawn until the payout start age",
    "statRetirementOnlyAssetsLabel": "Retirement-Only Assets (Retirement Account)",
    "statSpendableAssetsLabel": "Currently Spendable Assets",
    "statSpendableAssetsSub": "Current assets excluding locked retirement account funds",
    "statStockHoldingsCountSub": "Holdings in {count} stocks",
    "statStockValueNowLabel": "Individual Stock Holdings (Current)",
    "statSustainabilityLabel": "Asset Sustainability",
    "statSustainableSub": "Sustainable under current assumptions",
    "statTotalLifetimeUsageLabel": "Total Investment Account Lifetime Usage (Projected)",
    "statTotalOverageLabel": "Lifetime Limit (Total) Amount Over Limit",
    "statTotalRemainingLabel": "Lifetime Limit (Total) Remaining",
    "statTotalRemainingSub": "{used} used of $180,000 limit",
    "statTsumitateAnnualRemainingLabel": "Regular Allocation Annual Limit Remaining (based on current age's pace)",
    "statTsumitateLifetimeUsageLabel": "Regular Allocation Lifetime Usage (Projected)",
    "statTsumitateOverageLabel": "Regular Allocation Amount Over Limit",
    "statTsumitateRemainingLabel": "Regular Allocation Remaining",
    "statTsumitateRemainingSub": "Shares the $180,000 lifetime limit with growth allocation",
    "statUsedUpAtAge": "Expected to be used up at age {age}",
    "stockAllocationChartLabel": "Allocation by Holding (based on holding value)",
    "stockCurrentTotalLabel": "Individual Stocks Current Value (Total)",
    "stockReturnLabel": "Expected Annual Return Until {age} (All Individual Stocks)",
    "stockWatchlistTitle": "Individual Stock Holdings (enter shares and value)",
    "storageKeyCountDebug": "Number of keys in storage: {count}",
    "storageUnavailableDebug": "Storage is not available (this environment does not support window.storage)",
    "taxNotImplementedNote": "Tax calculations for {country} (tax-savings simulation) have not been implemented yet. This section is hidden rather than showing an unsubstantiated tax rate.",
    "taxSavingCaveatNote": "Tax savings are a simplified estimate based on a tax rate inferred from annual income. Actual amounts depend on taxable income after deductions for salary income, social insurance, dependents, and spouse, so results may differ from the figure shown. If annual income is left blank, a default rate of 20% is used.",
    "taxSavingSimLabel": "Tax Savings Simulation (Estimate)",
    "todayLabel": "Today",
    "todayTotalHidden": "Total assets as of today",
    "todayTotalShown": "Total assets as of today: {amount}",
    "totalOverageDetail": "The lifetime total limit is exceeded by {amount}.",
    "tsumitateAllocationLabel": "Breakdown by Holding for Regular Allocation (enter an amount to auto-calculate the percentage)",
    "tsumitateAsOfNote": "Calculated based on the reference age for this balance. (Actual balance plus growth: {manual}) + (Contribution schedule plus growth: {catchup}) = current investment account total.",
    "tsumitateFrameLabel": "Regular Allocation",
    "tsumitateHoldingsLabel": "Regular Investment Allocation: Actual Balance (Holding & Amount)",
    "tsumitateScheduleCategoryLabel": "Regular Allocation Schedule",
    "tsumitateScheduleLabel": "Regular Investment Allocation: Monthly Contribution (by age range)",
    "uncategorizedLabel": "Uncategorized",
    "unitMonths": "months",
    "unitYears": "years",
    "unitYearsShort": "y",
    "unknownError": "Unknown error",
    "unknownShort": "Unknown",
    "us401kLabel": "401(k)",
    "usAccountBreakdownChartTitle": "Breakdown by Account at {age} (401(k)/Traditional IRA/Roth IRA/Brokerage)",
    "usAccountBreakdownNote": "The current data model does not track individual holdings within each account, so this shows the breakdown by account type instead.",
    "usAnnualContributionLabel": "Annual Contribution",
    "usBrokerageBalanceLabel": "Investment Assets: Brokerage (Taxable)",
    "usBrokerageBalanceSub": "Current brokerage account value",
    "usBrokerageLabel": "Brokerage Account (Taxable)",
    "usBrokerageNoLimitNote": "No contribution limit (taxable account with no special tax treatment).",
    "usCapGainsTaxLabel": "Capital Gains Tax (Estimate)",
    "usCapGainsTaxSub": "Assumes long-term gains (0/15/20%)",
    "usCapitalGainLabel": "Estimated Annual Capital Gains Realized",
    "usClaimAgeLabel": "Claiming Age (choose between 62 and 70)",
    "usCombinedLimitLabel": "Combined Employee + Employer Limit (2026)",
    "usCoveredByPlanLabel": "Covered by a workplace retirement plan",
    "usDeductibleAmountLabel": "Estimated Tax-Deductible Amount",
    "usEarlyWithdrawalWarning": "Early withdrawals from retirement accounts may be subject to taxes and penalties. This planner uses a simplified model.",
    "usEmployeeLimitLabel": "Employee Contribution Limit (2026)",
    "usExpensesLabel": "Retirement Expenses",
    "usExpensesMonthlyLabel": "Estimated Monthly Living Expenses",
    "usExpensesTotalLabel": "Expenses (Living + Healthcare)",
    "usExpensesTotalSub": "Annual living costs plus healthcare costs",
    "usFederalTaxLabel": "Federal Income Tax (Estimate)",
    "usFilingHoh": "Head of Household",
    "usFilingMarriedJoint": "Married Filing Jointly",
    "usFilingMarriedSeparate": "Married Filing Separately",
    "usFilingSingle": "Single",
    "usFilingStatusLabel": "Filing Status",
    "usFraNote": "Full Retirement Age: {age}",
    "usHealthInsuranceLabel": "Private Health Insurance Premium (Monthly, excl. Medicare)",
    "usHealthInsuranceSub": "Monthly amount entered × 12",
    "usHealthInsuranceTotalLabel": "Private Health Insurance (Annual)",
    "usHealthcareSourceNote": "Medicare Part B premiums are calculated automatically using 2026 CMS figures (standard premium plus income-based IRMAA tiers). Please enter your own estimates for private insurance and out-of-pocket costs.",
    "usHealthcareTotalLabel": "Total Healthcare Costs (Annual)",
    "usHealthcareTotalSub": "Medicare + private insurance + out-of-pocket combined",
    "usInvestmentSourceNote": "The contribution limits shown are 2026 figures published by the IRS (Notice 2025-67, released Nov 13, 2025). Please consult a tax professional for your actual tax situation.",
    "usIraCombinedNote": "Traditional and Roth IRA contributions share one annual limit. Combined remaining room: {amount}",
    "usIraSharedLimitLabel": "IRA Contribution Limit (Traditional + Roth combined, 2026)",
    "usIraSharedRemainingSub": "Remaining room before the combined IRA limit",
    "usLiquidAssetsLabel": "Liquid / Accessible Assets",
    "usLiquidAssetsSub": "Cash, Brokerage, and 401(k)/Traditional IRA once age 59½ or older",
    "usMedicareAutoLabel": "Medicare Part B (Auto-calculated, Annual)",
    "usMedicareAutoNote": "Calculated automatically, including IRMAA (income-based surcharge), using the filing status and MAGI entered in the Investment section above.",
    "usMedicareLabel": "Medicare Part B (Annual)",
    "usMedicareSub": "Auto-calculated, includes IRMAA",
    "usModifiedAGILabel": "Modified AGI (annual)",
    "usNiitLabel": "NIIT (Net Investment Income Tax)",
    "usNiitSub": "3.8% of income over the threshold",
    "usNoDeductionNote": "Based on your income, this contribution is not tax-deductible (fully phased out).",
    "usOutOfPocketLabel": "Estimated Annual Out-of-Pocket Costs",
    "usOutOfPocketSub": "As estimated",
    "usOutOfPocketTotalLabel": "Out-of-Pocket Costs (Annual)",
    "usOverLimitLabel": "{amount} over the limit",
    "usPartialDeductionNote": "Based on your income, only part of this contribution is deductible (phase-out applies).",
    "usPiaLabel": "Estimated Monthly Benefit at Full Retirement Age (67, PIA)",
    "usRemainingLabel": "{amount} remaining before the limit",
    "usRemainingOfLimitSub": "Remaining room before the 2026 limit",
    "usRestrictedAssetsLabel": "Retirement / Restricted Assets",
    "usRestrictedAssetsSubOver595": "Roth IRA (treated as restricted in this simplified model)",
    "usRestrictedAssetsSubUnder595": "401(k)/Traditional IRA + Roth IRA, since you are under 59½",
    "usRetirementIncomeLabel": "Retirement Income",
    "usRetirementIncomeSub": "Annual Social Security benefit",
    "usRothAllowedLabel": "Allowed Contribution (after income phase-out)",
    "usRothIneligibleNote": "Based on your income, you are not eligible to contribute directly to a Roth IRA (fully phased out).",
    "usRothIraLabel": "Roth IRA",
    "usRothOverEligibleNote": "The contribution amount entered exceeds what your income allows after the phase-out.",
    "usRothPartialNote": "Based on your income, your allowed contribution is reduced (phase-out applies).",
    "usSpouseCoveredByPlanLabel": "Spouse is covered by a workplace retirement plan",
    "usSsAnnualLabel": "Annual Benefit",
    "usSsAnnualSub": "Continues for life (excludes future COLA adjustments)",
    "usSsMonthlyLabel": "Monthly Benefit at Claiming Age",
    "usSsMonthlySub": "If claimed at age {age}",
    "usSsSourceNote": "The claiming-age adjustment factors are calculated exactly per SSA (Social Security Administration) rules. However, please enter your estimated monthly benefit (PIA) from your own my Social Security account statement — automatic calculation from lifetime earnings is not supported.",
    "usStateTaxLabel": "State Tax (Estimate)",
    "usStateTaxRateLabel": "State Tax: Estimated Effective Rate",
    "usStateTaxSub": "Based on the effective rate you entered",
    "usSurplusLabel": "Income Surplus",
    "usSurplusSub": "Annual amount by which income exceeds expenses",
    "usTaxAdvantagedTotalLabel": "Investment Assets: Tax-Advantaged (401k+IRA+Roth)",
    "usTaxAdvantagedTotalSub": "Combined value of 401(k), Traditional IRA, and Roth IRA",
    "usTaxSectionLabel": "Tax (Simplified)",
    "usTaxSourceNote": "Federal tax, capital gains tax, and NIIT are estimates based on 2026 IRS figures (Revenue Procedure 2025-32). State tax varies widely by state, so please enter your own estimated effective rate.",
    "usTaxableIncomeSub": "Taxable income: {amount}",
    "usTotalInvestmentLabel": "Total Investment Account Value",
    "usTotalInvestmentSub": "Combined 401(k) + Traditional IRA + Roth IRA + Brokerage",
    "usTotalTaxLabel": "Total Tax (Estimate)",
    "usTotalTaxSub": "Federal + Capital Gains + NIIT + State",
    "usTraditionalIraLabel": "Traditional IRA",
    "usWithdrawalLabel": "Withdrawal (Needed from Investment Accounts)",
    "usWithdrawalSub": "Annual shortfall not covered by Social Security",
  },
};

// ============================================================================
// ---------- イギリス向け表示差分（en-GB） ----------
// アメリカ版の英語辞書（en）をベースに、米国特有の表現だけをイギリス向けに
// 上書きする差分オブジェクト。ここに列挙していないキーはすべて en の値を
// そのまま継承するため、二重管理を避けられる。
// 例：Retirement Account → Pension Account、Social Security → State Pension、
//     Individual Stocks → Stocks & Shares、Bank Deposits → Cash Savings。
// ============================================================================
const EN_GB_OVERRIDES = {
  disclaimerBanner: "Disclaimer: This app is provided for information and simulation purposes only. It does not constitute tax, investment, or legal advice. Allowances and tax rates can change, and all figures are estimates based on the assumptions you enter. Please consult a qualified professional \u2014 such as an FCA-regulated financial adviser or an accountant \u2014 before acting on any result.",
  localePreviewWarning: "UK edition: ISA and pension allowances, State Pension, Income Tax, Dividend Tax and Capital Gains Tax use GOV.UK figures for the 2026/27 tax year (England, Wales & Northern Ireland). Scottish Income Tax, National Insurance and Inheritance Tax are not implemented. This is a planning tool, not financial advice.",
  appSubtitle: "Investment Accounts × Retirement Assets × Pensions × Healthcare Costs × Inheritance Planning — Integrated Simulation",
  idecoCurrentValueAutoLabel: "Current Pension Value (Auto-calculated)",
  idecoIntroNote: "A SIPP or Personal Pension is a retirement savings account. In principle, funds cannot be withdrawn before the eligible age. Investment returns are not guaranteed. The tax savings shown are estimates.",
  payoutAccountingNote: "After payout begins, a lump-sum payment is added once, in the year received, to Current Spendable Assets. Annuity payments are added to Annual Income during the payout period and offset against the living-cost shortfall. Once the payout period ends, income from the pension stops.",
  pensionNamePlaceholder: "e.g. State Pension, Workplace Pension",
  pensionSourcesLabel: "Expected Pension Income (State Pension, workplace pension, etc. — add as many as you like)",
  legendStocks: "Stocks & Shares",
  statStockValueNowLabel: "Stocks & Shares Holdings (Current)",
  stockCurrentTotalLabel: "Stocks & Shares Current Value (Total)",
  stockReturnLabel: "Expected Annual Return Until {age} (All Stocks & Shares)",
  stockWatchlistTitle: "Stocks & Shares Holdings (enter shares and value)",
  statIdecoAssetsLabel: "Investment Assets: Pension Account",
  statRetirementOnlyAssetsLabel: "Retirement-Only Assets (Pension Account)",
  legendIdecoAssets: "Pension Account",
  netWorthChartTitle: "Net Worth Over Time \u2014 Investments + Gold + Cash + Stocks & Shares + Private Pension + Pension Account \u2212 Loans \u2212 Cumulative Insurance Premiums ({currentAge} \u2013 {deathAge})",
  legendBankDeposits: "Cash Savings",
  bankTotalNowLabel: "Total Cash Savings (Current)",
  statBankTotalNowLabel: "Total Cash Savings (Current)",
  statBankAtRetireLabel: "Total Cash Savings — at {age}",
  bankBreakdownChartTitle: "Cash Savings Balance by Bank — Projected by Age (Current / {retireAge} / {deathAge})",
  goldPriceRefNote: "The gold price uses the retail spot price as of July 2026 (about £125/g) as a reference. Actual prices fluctuate daily, so replace this with the latest price when using the tool.",
  growthScheduleExampleNote: "Example: you can split growth allocation contributions into ranges by year and month, such as \u201c50y0m to 55y11m: \u00a31,500/month\u201d and \u201c56y0m to 65y0m: \u00a3500/month.\u201d Overlapping ranges are added together.",
  scheduleExampleNote: "Example: you can split contributions into ranges by year and month, such as \u201c58y0m to 61y11m: \u00a31,100/month\u201d and \u201c62y0m to 65y0m: \u00a3900/month.\u201d Overlapping ranges are added together.",
  nisaCapSummaryNote: "Annual caps: regular allocation \u00a312,000 (\u00a31,000/month), growth allocation \u00a324,000 (\u00a32,000/month). Lifetime limit is \u00a3180,000 total (up to \u00a3120,000 of which can be growth allocation). Once the limit is reached, the simulation assumes no further tax-advantaged investment.",
  statTsumitateRemainingSub: "Shares the \u00a3180,000 lifetime limit with growth allocation",
};

// en-GB は「en を完全に継承しつつ、上記の差分だけを上書きした完全な辞書」として
// モジュール読み込み時に一度だけ組み立てる（実行時に毎回マージし直す必要がない）。
TRANSLATIONS["en-GB"] = { ...TRANSLATIONS.en, ...EN_GB_OVERRIDES };

function translateWith(language, key, vars) {
  const dict = TRANSLATIONS[language] || TRANSLATIONS.ja;
  let str = dict[key];
  if (str === undefined) str = TRANSLATIONS.ja[key];
  if (str === undefined) return key; // 未登録キーは開発時に気付けるようキー名をそのまま返す
  if (vars) {
    Object.keys(vars).forEach((k) => {
      str = str.split(`{${k}}`).join(vars[k]);
    });
  }
  return str;
}

// 金額フォーマットは「表示国」ではなく「基準通貨（baseCurrency）」に基づく。
// 国と通貨は別データとして保持するため、将来は国と無関係に通貨だけを切り替えられる。
// baseCurrencyがJPY（＝未設定を含む）の場合は、既存のyen()と完全に同一の出力を維持する
// （＝国・通貨を選択しない/日本のままなら、見た目は1文字も変わらない）。
function formatMoneyFor(baseCurrency, n) {
  if (!baseCurrency || baseCurrency === "JPY") return yen(n);
  if (n === null || n === undefined || isNaN(n)) n = 0;
  const cfg = CURRENCY_BY_CODE[baseCurrency] || CURRENCY_BY_CODE.JPY;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  return `${sign}${cfg.symbol}${abs.toLocaleString(cfg.locale)}`;
}

// 表示層（見出し・金額フォーマット・現在の国/通貨/言語設定）だけを配布するための軽量Context。
// AllocationCharts等、メインコンポーネントの外側にある小コンポーネントからも
// props経由でバケツリレーせずに現在の設定へアクセスできるようにする。
const LocaleContext = createContext({
  country: "JP",
  baseCurrency: "JPY",
  language: "ja",
  money: yen,
  label: (key) => getCategoryLabel(key, "JP"),
  t: (key) => translateWith("ja", key),
});

function monthlyRate(annualPct) {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

// ============================================================================
// ---------- 国別計算エンジン（countryRules/ 相当） ----------
// 目的：投資枠・年金・医療費・税制などの「計算ルール」を、画面コードや共通計算関数に
// 直接書き込むのではなく、国ごとに独立した設定・実装オブジェクトへ完全に分離する。
//
// 各国のオブジェクトは共通インターフェースを持つ：
//   rules.investment   … NISA / 401(k)・IRA・Roth・Brokerage / ISA・SIPP などの投資制度
//   rules.retirement   … iDeCo / Social Security・Medicare / State Pension・Workplace Pension
//   rules.healthcare   … 医療費モデル（自己負担の考え方）
//   rules.tax          … 税制・所得控除まわり（節税額シミュレーション等）
//   rules.labels       … その国固有の制度名（画面表示用。CATEGORY_LABELSとは別に、
//                         計算結果に付随する注記文言などをここにまとめる）
//   rules.defaults     … その国向けにアプリを開いたときの初期値（現状は空データ方針のため未使用）
//
// 各カテゴリは必ず `implemented: boolean` を持つ。true の国だけが実際の計算式を持ち、
// false の国は「まだ実装されていない」ことを示すプレースホルダーのみを持つ。
// falseのときにJPの数値へフォールバックすることは絶対にしない
// （フォールバックすると「日本の制度の数値が、あたかも米国・英国の制度の数値であるかのように」
//   表示されてしまうため。未実装の場合は呼び出し側が明示的にプレビュー/未対応表示を出す）。
//
// 1ファイル運用（GitHub上でApp.jsx単体を差し替える運用）の制約上、実体は現在このファイル内に
// まとめているが、将来的に複数ファイルへ分割する場合は、この COUNTRY_RULES オブジェクトの
// 各国キーの中身をそのまま
//   countryRules/JP.js
//   countryRules/US.js
//   countryRules/GB.js
// へ切り出し、ここで import してマージするだけで移行できる設計にしてある。
// 次に米国制度を実装する場合は US.js（＝下記 COUNTRY_RULES.US）だけを変更すればよく、
// 日本版・英国版のコードには一切触れる必要がない。英国も同様に GB.js のみで完結する。
// ============================================================================

// ---------- countryRules/JP.js 相当 ----------
// 現行の新NISA制度（2024年〜）・iDeCo・医療費モデル。既存の計算結果と完全に同一。
export const JP_COUNTRY_RULES = {
  investment: {
    implemented: true,
    // つみたて投資枠 年間上限 / 成長投資枠 年間上限 / 成長投資枠 生涯（簿価）上限 / 総枠 生涯（簿価）上限
    annualInstallmentLimit: 1200000,
    annualGrowthLimit: 2400000,
    growthLifetimeLimit: 12000000,
    taxFreeInvestmentLimit: 18000000,
    accountTypes: ["tsumitate", "growth", "lumpSum"], // つみたて投資枠・成長投資枠・一括投資
  },
  retirement: {
    implemented: true,
    // iDeCo（個人型確定拠出年金）。拠出上限は加入区分により異なるため、現行仕様では
    // 画面から自由入力（ユーザーが自身の上限を把握している前提）としており、
    // アプリ側で固定の上限値は持たない。
    accountTypes: ["ideco"],
    hasFixedContributionLimit: false,
  },
  healthcare: {
    implemented: true,
    // 高額療養費制度を考慮した自己負担額を、年代別にユーザーが直接入力するモデル。
    model: "selfInputByAgeBracket",
  },
  tax: {
    implemented: true,
    // iDeCoの節税額（概算）は年収から推定した実効税率で簡易計算する。
    model: "estimatedMarginalRateFromIncome",
  },
  labels: {
    investmentNote: null, // JPは実際のNISA制度の説明文（TRANSLATIONS側）をそのまま使うため未使用
    retirementNote: null,
    healthcareNote: null,
    taxNote: null,
  },
  defaults: {},
};

// ---------- countryRules/US.js 相当（仮実装：未実装のプレースホルダーのみ） ----------
// 実装時にはこのオブジェクトの中身だけを差し替えればよく、JP.js・GB.js・共通エンジン・
// React画面側のコードは一切変更不要な設計にしてある。
export const US_COUNTRY_RULES = {
  investment: {
    implemented: true,
    accountTypes: ["401k", "traditionalIra", "rothIra", "brokerage"],
    // 出典：IRS Notice 2025-67（2026年分の物価連動調整）。
    // "401(k) limit increases to $24,500 for 2026, IRA limit increases to $7,500"
    // https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500
    sourceNote: "IRS Notice 2025-67 (published Nov 13, 2025): 2026 cost-of-living adjustments for retirement plans.",
    limits2026: {
      k401: {
        employeeDeferral: 24500,     // 従業員拠出（elective deferral）上限
        catchUp50: 8000,             // 50歳以上の追加拠出（catch-up）
        catchUp60to63: 11250,        // 60〜63歳の特例追加拠出（"super catch-up"）
        combinedEmployerEmployee: 72000, // 従業員＋雇用主合計（IRC §415(c)）上限
      },
      ira: {
        // Traditional IRAとRoth IRAは拠出上限を共有する（合算で上限まで）
        contribution: 7500,
        catchUp50: 1100,
      },
    },
    // Roth IRAへ拠出できるかどうかのMAGI（修正調整後総所得）フェーズアウト範囲（2026年）
    rothPhaseOut2026: {
      single: [153000, 168000],
      headOfHousehold: [153000, 168000],
      marriedJoint: [242000, 252000],
      marriedSeparate: [0, 10000],
    },
    // Traditional IRAの「掛金控除」が縮小され始めるMAGI範囲（2026年）。
    // 本人・配偶者どちらも勤務先の企業年金制度に加入していない場合は、
    // 所得にかかわらず全額控除できる（フェーズアウト適用外）。
    traditionalIraDeductionPhaseOut2026: {
      // 本人が企業年金制度に加入している場合
      coveredSingleOrHoh: [81000, 91000],
      coveredMarriedJoint: [129000, 149000],
      coveredMarriedSeparate: [0, 10000],
      // 本人は非加入だが配偶者が加入している場合（共同申告）
      notCoveredSpouseCoveredMarriedJoint: [242000, 252000],
    },
    brokerage: {
      contributionLimit: null, // 上限なし（課税口座）
      taxAdvantaged: false,
    },

    // ---------- 計算関数（すべて純粋関数。共通エンジンやJPのコードからは呼ばれない） ----------

    // 401(k) の年間拠出上限（従業員拠出分のみ。雇用主分は含まない）
    get401kEmployeeLimit(age) {
      const l = this.limits2026.k401;
      if (age >= 60 && age <= 63) return l.employeeDeferral + l.catchUp60to63;
      if (age >= 50) return l.employeeDeferral + l.catchUp50;
      return l.employeeDeferral;
    },
    // 401(k) の従業員＋雇用主合計拠出上限（IRC §415(c)）
    get401kCombinedLimit(age) {
      const l = this.limits2026.k401;
      const catchUp = age >= 60 && age <= 63 ? l.catchUp60to63 : (age >= 50 ? l.catchUp50 : 0);
      return l.combinedEmployerEmployee + catchUp;
    },
    // IRA（Traditional + Roth 合算）の年間拠出上限
    getIraContributionLimit(age) {
      const l = this.limits2026.ira;
      return age >= 50 ? l.contribution + l.catchUp50 : l.contribution;
    },
    // 直線的なフェーズアウト計算（範囲内で上限から0へ比例的に減少）。
    // full を超えていれば1、start未満なら0、範囲内ならその比率を返す。
    _phaseOutRatio(magi, [start, end]) {
      if (end <= start) return magi >= start ? 1 : 0;
      if (magi <= start) return 0;
      if (magi >= end) return 1;
      return (magi - start) / (end - start);
    },
    // Roth IRAへ拠出可能な割合（1=満額拠出可, 0=拠出不可, 間の値=一部のみ）
    getRothIraEligibleFraction(filingStatus, magi) {
      const range = this.rothPhaseOut2026[filingStatus] || this.rothPhaseOut2026.single;
      return 1 - this._phaseOutRatio(magi, range);
    },
    // Traditional IRA拠出額のうち、所得控除の対象となる割合
    // （本人・配偶者とも企業年金制度未加入なら、所得に関係なく常に1＝全額控除）
    getTraditionalIraDeductibleFraction({ filingStatus, magi, coveredByWorkplacePlan, spouseCoveredByWorkplacePlan }) {
      if (!coveredByWorkplacePlan && !spouseCoveredByWorkplacePlan) return 1;
      let range;
      if (coveredByWorkplacePlan) {
        if (filingStatus === "marriedJoint") range = this.traditionalIraDeductionPhaseOut2026.coveredMarriedJoint;
        else if (filingStatus === "marriedSeparate") range = this.traditionalIraDeductionPhaseOut2026.coveredMarriedSeparate;
        else range = this.traditionalIraDeductionPhaseOut2026.coveredSingleOrHoh;
      } else {
        // 本人は非加入・配偶者のみ加入（共同申告のときだけこの優遇レンジが使える）
        range = filingStatus === "marriedJoint"
          ? this.traditionalIraDeductionPhaseOut2026.notCoveredSpouseCoveredMarriedJoint
          : [0, 0]; // 単身などでこのケースは通常発生しない
      }
      return 1 - this._phaseOutRatio(magi, range);
    },
    // 401(k)/Traditional IRA/Roth IRA/Brokerageの残高を、現在の年齢から死亡想定年齢まで
    // 口座ごとに年単位で積み上げる（退職年齢までは各口座へ拠出を継続、退職後は年間取崩し額を
    // 差し引く）。取崩しは「Brokerage → Traditional IRA → 401(k) → Roth IRA」の順に行う
    // （課税口座を先に使い、Rothを最後まで温存する一般的な考え方の簡易モデル）。
    // JPのrunSimulation（NISA専用）とは完全に別関数。US_COUNTRY_RULES以外からは呼ばれない。
    simulateGrowth({ currentAge, retireAge, deathAge, accounts, returnPct, annualWithdrawalNeeded }) {
      const rate = (Number(returnPct) || 0) / 100;
      const balances = {
        k401: Number(accounts.k401.currentValue) || 0,
        traditionalIra: Number(accounts.traditionalIra.currentValue) || 0,
        rothIra: Number(accounts.rothIra.currentValue) || 0,
        brokerage: Number(accounts.brokerage.currentValue) || 0,
      };
      const contributions = {
        k401: Number(accounts.k401.annualContribution) || 0,
        traditionalIra: Number(accounts.traditionalIra.annualContribution) || 0,
        rothIra: Number(accounts.rothIra.annualContribution) || 0,
        brokerage: Number(accounts.brokerage.annualContribution) || 0,
      };
      const withdrawalOrder = ["brokerage", "traditionalIra", "k401", "rothIra"];
      const combinedValue = (b) => b.k401 + b.traditionalIra + b.rothIra + b.brokerage;
      const startAge = Math.round(currentAge);
      const endAge = Math.round(deathAge);
      const yearly = [{ age: startAge, value: combinedValue(balances), accounts: { ...balances } }];
      for (let age = startAge + 1; age <= endAge; age++) {
        Object.keys(balances).forEach((k) => { balances[k] = balances[k] * (1 + rate); });
        if (age <= retireAge) {
          Object.keys(balances).forEach((k) => { balances[k] += contributions[k]; });
        } else {
          let remaining = Number(annualWithdrawalNeeded) || 0;
          for (const key of withdrawalOrder) {
            if (remaining <= 0) break;
            const take = Math.min(balances[key], remaining);
            balances[key] -= take;
            remaining -= take;
          }
        }
        yearly.push({ age, value: combinedValue(balances), accounts: { ...balances } });
      }
      return { yearly, finalValue: combinedValue(balances), finalAccounts: { ...balances } };
    },
    // 59½歳未満の場合、401(k)・Traditional IRAは早期引き出しに税金・ペナルティが伴うため
    // 「制約付き資産」として扱う。Roth IRAは拠出元本と運用益を分離できない現在のデータ構造の
    // 制約上、簡易的に常に「退職資産（制約付き）」として扱う。Brokerageは常に「引き出し可能資産」。
    // 今回は完全な税額計算は行わない（画面上に注意書きを表示するのみ）。
    earlyWithdrawalAge: 59.5,
    splitLiquidRestricted(age, accounts) {
      const isAccessibleAge = age >= this.earlyWithdrawalAge;
      const k401 = Number(accounts.k401) || 0;
      const traditionalIra = Number(accounts.traditionalIra) || 0;
      const rothIra = Number(accounts.rothIra) || 0;
      const brokerage = Number(accounts.brokerage) || 0;
      const liquid = brokerage + (isAccessibleAge ? k401 + traditionalIra : 0);
      const restricted = rothIra + (isAccessibleAge ? 0 : k401 + traditionalIra);
      return { liquid, restricted, isAccessibleAge };
    },
  },
  retirement: {
    implemented: true,
    accountTypes: ["socialSecurity"],
    // 出典：SSA "Retirement Age and Benefit Reduction" / "Delayed Retirement Credits"（ssa.gov）。
    // 1960年以降生まれの満額支給開始年齢（Full Retirement Age）は67歳で固定。
    sourceNote: "SSA rules (ssa.gov): full retirement age 67 for anyone born 1960 or later. Early claiming reduces benefits; delayed claiming increases them.",
    socialSecurity: {
      fullRetirementAge: 67,
      earliestClaimAge: 62,
      latestClaimAge: 70,
      // 早期受給：FRAより前の最初の36ヶ月は月あたり5/9%減額、それ以前（36ヶ月超）は月あたり5/12%減額
      earlyReductionPerMonthFirst36: 5 / 9 / 100,
      earlyReductionPerMonthBeyond36: 5 / 12 / 100,
      // 繰下げ受給：FRAより後は月あたり2/3%増額（年8%）、70歳で頭打ち
      delayedCreditPerMonth: (2 / 3) / 100,
    },
    // 満額（FRA）受給額に対する倍率を、実際に受給を開始する年齢から計算する（月単位で正確に計算）。
    getClaimingFactor(claimAgeInYears) {
      const ss = this.socialSecurity;
      const fraMonths = ss.fullRetirementAge * 12;
      const claimMonths = Math.round(claimAgeInYears * 12);
      const diffMonths = claimMonths - fraMonths;
      if (diffMonths >= 0) {
        // 繰下げ受給（70歳＝FRA+36ヶ月で頭打ち）
        const cappedMonths = Math.min(diffMonths, (ss.latestClaimAge - ss.fullRetirementAge) * 12);
        return 1 + cappedMonths * ss.delayedCreditPerMonth;
      }
      // 早期受給
      const monthsEarly = Math.min(-diffMonths, (ss.fullRetirementAge - ss.earliestClaimAge) * 12);
      const first36 = Math.min(monthsEarly, 36);
      const beyond36 = Math.max(0, monthsEarly - 36);
      const reduction = first36 * ss.earlyReductionPerMonthFirst36 + beyond36 * ss.earlyReductionPerMonthBeyond36;
      return 1 - reduction;
    },
    // 月額の実受給額 = FRA時点の月額（PIA、ユーザー入力） × 受給開始年齢に応じた倍率
    getMonthlyBenefit(piaMonthly, claimAgeInYears) {
      return piaMonthly * this.getClaimingFactor(claimAgeInYears);
    },
  },
  healthcare: {
    implemented: true,
    model: "medicarePartBWithIrmaa",
    // 出典：CMS "2026 Medicare Parts A & B Premiums and Deductibles"（cms.gov、2025年11月14日発表）。
    sourceNote: "CMS 2026 Medicare Part B premium and IRMAA brackets (announced Nov 14, 2025).",
    medicare2026: {
      standardPartB: 202.90,
      // IRMAA（所得に応じた追加保険料）区分。しきい値はMAGI（修正調整後総所得）。
      irmaaSingleOrHoh: [
        { upTo: 109000, premium: 202.90 },
        { upTo: 137000, premium: 284.10 },
        { upTo: 171000, premium: 405.80 },
        { upTo: 205000, premium: 527.50 },
        { upTo: 499999, premium: 649.20 },
        { upTo: Infinity, premium: 689.90 },
      ],
      irmaaMarriedJoint: [
        { upTo: 218000, premium: 202.90 },
        { upTo: 274000, premium: 284.10 },
        { upTo: 342000, premium: 405.80 },
        { upTo: 410000, premium: 527.50 },
        { upTo: 749999, premium: 649.20 },
        { upTo: Infinity, premium: 689.90 },
      ],
      // 別居していない夫婦の個別申告（Married Filing Separately）は中間区分がなく急に跳ね上がる
      irmaaMarriedSeparate: [
        { upTo: 109000, premium: 202.90 },
        { upTo: 390999, premium: 649.20 },
        { upTo: Infinity, premium: 689.90 },
      ],
    },
    // 年間のMedicare Part B保険料（IRMAA込み）を試算する
    getAnnualMedicarePartB(filingStatus, magi) {
      const table = filingStatus === "marriedJoint"
        ? this.medicare2026.irmaaMarriedJoint
        : filingStatus === "marriedSeparate"
          ? this.medicare2026.irmaaMarriedSeparate
          : this.medicare2026.irmaaSingleOrHoh;
      const bracket = table.find((b) => magi <= b.upTo) || table[table.length - 1];
      return bracket.premium * 12;
    },
  },
  tax: {
    implemented: true,
    model: "federalBracketsPlusLtcgPlusNiit",
    // 出典：IRS "2026 tax inflation adjustments"（Revenue Procedure 2025-32）。州税は州により大きく異なるため、
    // このアプリでは固定税率を推測せず、ユーザー自身が概算の実効税率を入力する方式にしている。
    sourceNote: "IRS Revenue Procedure 2025-32 (2026 federal brackets, standard deduction, LTCG brackets, NIIT threshold). State tax is user-entered since it varies by state.",
    federalBrackets2026: {
      single: [
        { upTo: 12400, rate: 0.10 },
        { upTo: 50400, rate: 0.12 },
        { upTo: 105700, rate: 0.22 },
        { upTo: 201775, rate: 0.24 },
        { upTo: 256225, rate: 0.32 },
        { upTo: 640600, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 },
      ],
      marriedJoint: [
        { upTo: 24800, rate: 0.10 },
        { upTo: 100800, rate: 0.12 },
        { upTo: 211400, rate: 0.22 },
        { upTo: 403550, rate: 0.24 },
        { upTo: 512450, rate: 0.32 },
        { upTo: 768700, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 },
      ],
    },
    standardDeduction2026: {
      single: 16100,
      marriedJoint: 32200,
      marriedSeparate: 16100,
      headOfHousehold: 24150,
    },
    // 長期キャピタルゲイン税率（0/15/20%）の所得区分（課税所得ベース）
    ltcgBrackets2026: {
      single: [{ upTo: 49450, rate: 0 }, { upTo: 545500, rate: 0.15 }, { upTo: Infinity, rate: 0.20 }],
      marriedJoint: [{ upTo: 98900, rate: 0 }, { upTo: 613700, rate: 0.15 }, { upTo: Infinity, rate: 0.20 }],
      marriedSeparate: [{ upTo: 49450, rate: 0 }, { upTo: 306850, rate: 0.15 }, { upTo: Infinity, rate: 0.20 }],
      headOfHousehold: [{ upTo: 66200, rate: 0 }, { upTo: 579600, rate: 0.15 }, { upTo: Infinity, rate: 0.20 }],
    },
    // Net Investment Income Tax：3.8%が投資所得にかかる追加税（MAGIが閾値を超えた分にのみ適用）
    niitRate: 0.038,
    niitThreshold: { single: 200000, marriedJoint: 250000, marriedSeparate: 125000, headOfHousehold: 200000 },
    // 累進課税：課税所得（gross - standard deduction）に区分ごとの税率を順番に適用する
    calculateFederalTax(grossIncome, filingStatus) {
      const fs = this.federalBrackets2026[filingStatus] ? filingStatus : "single";
      const deduction = this.standardDeduction2026[fs] || this.standardDeduction2026.single;
      const taxableIncome = Math.max(0, grossIncome - deduction);
      const brackets = this.federalBrackets2026[fs === "marriedSeparate" || fs === "headOfHousehold" ? "single" : fs] || this.federalBrackets2026.single;
      let tax = 0;
      let lower = 0;
      for (const b of brackets) {
        if (taxableIncome > lower) {
          const taxableAtThisRate = Math.min(taxableIncome, b.upTo) - lower;
          tax += taxableAtThisRate * b.rate;
          lower = b.upTo;
        } else break;
      }
      return { taxableIncome, tax };
    },
    // 長期キャピタルゲイン税額（他の所得の上に積み上がるものとして概算）
    calculateLtcgTax(ordinaryTaxableIncome, gain, filingStatus) {
      const fs = this.ltcgBrackets2026[filingStatus] ? filingStatus : "single";
      const brackets = this.ltcgBrackets2026[fs];
      let tax = 0;
      let stackStart = ordinaryTaxableIncome;
      let remainingGain = gain;
      let lower = 0;
      for (const b of brackets) {
        if (remainingGain <= 0) break;
        const bandTop = b.upTo;
        const bandRemaining = Math.max(0, bandTop - Math.max(lower, stackStart));
        const amountInBand = Math.min(remainingGain, bandRemaining);
        if (stackStart < bandTop && amountInBand > 0) {
          tax += amountInBand * b.rate;
          remainingGain -= amountInBand;
          stackStart += amountInBand;
        }
        lower = bandTop;
      }
      return tax;
    },
    calculateNiit(magi, netInvestmentIncome, filingStatus) {
      const threshold = this.niitThreshold[filingStatus] || this.niitThreshold.single;
      const excess = Math.max(0, magi - threshold);
      return Math.min(excess, Math.max(0, netInvestmentIncome)) * this.niitRate;
    },
  },
  labels: {
    investmentNote: "investmentLimitsNotImplementedNote",
    retirementNote: "retirementNotImplementedNote",
    healthcareNote: "healthcareNotImplementedNote",
    taxNote: "taxNotImplementedNote",
  },
  defaults: {},
};

// ---------- countryRules/GB.js 相当（英国版：実装済み） ----------
// 対象年度：2026/27（2026年4月6日〜2027年4月5日）。
// 制度上限・税率はすべて GB_COUNTRY_RULES 内に集約し、画面や共通計算関数へ直接書かない。
// 各セクションは effectiveYear / lastUpdated / sourceName / sourceUrl を持つ。
// 根拠が確認できない数値は推測で入れず、未確認・未対応の項目は notImplemented に明示する。
// 【重要】このオブジェクトは JP_COUNTRY_RULES / US_COUNTRY_RULES を一切参照せず、
// 逆に JP/US 側からも参照されない。英国版の変更はこのオブジェクト内で完結する。
export const GB_COUNTRY_RULES = {
  investment: {
    implemented: true,
    effectiveTaxYear: "2026/27",
    lastUpdated: "2026-07-13",
    sourceName: "GOV.UK — Individual Savings Accounts (ISAs) / Tax on your private pension contributions",
    sourceUrl: "https://www.gov.uk/individual-savings-accounts",
    sourceUrls: {
      isaAllowance: "https://www.gov.uk/individual-savings-accounts",
      pensionAnnualAllowance: "https://www.gov.uk/tax-on-your-private-pension/annual-allowance",
      pensionAccessAge: "https://www.gov.uk/personal-pensions-your-rights",
      taxFreeLumpSum: "https://www.gov.uk/tax-on-pension",
    },
    // 英国版で別々に管理・計算する口座
    accountTypes: ["stocksSharesIsa", "cashIsa", "sipp", "workplacePension", "gia", "cashSavings"],
    isaAccounts: ["stocksSharesIsa", "cashIsa"],
    pensionAccounts: ["sipp", "workplacePension"],
    taxAdvantagedAccounts: ["stocksSharesIsa", "cashIsa", "sipp", "workplacePension"],
    limits: {
      // ISA：全ISA合算での年間拠出上限（2026/27）
      isaAnnualAllowance: 20000,
      lifetimeIsaAnnual: 4000,
      juniorIsaAnnual: 9000,
      // 年金（SIPP＋職域年金の合算）：Annual Allowance（2026/27）
      pensionAnnualAllowance: 60000,
      pensionTaperThresholdIncome: 200000,
      pensionTaperAdjustedIncome: 260000,
      pensionAnnualAllowanceFloor: 10000,
      moneyPurchaseAnnualAllowance: 10000,
    },
    // 予定されている制度変更（2026/27時点では未適用。計算には反映していない）
    scheduled: {
      // 2027年4月6日から、65歳未満のCash ISA年間拠出上限は £12,000 になる予定（65歳以上は £20,000 のまま）
      cashIsaLimitUnder65From2027: 12000,
      cashIsaLimitEffectiveDate: "2027-04-06",
      // 私的年金の受給可能最低年齢は2028年4月6日から57歳へ引き上げ予定
      pensionAccessAgeFrom2028: 57,
      pensionAccessAgeEffectiveDate: "2028-04-06",
    },
    // 私的年金（SIPP・職域年金）にアクセスできる最低年齢（2026/27時点）
    pensionAccessAge: 55,
    // 非課税一時金：年金資産の25%（Lump Sum Allowance の範囲内）
    taxFreeLumpSumRate: 0.25,
    lumpSumAllowance: 268275,

    // ---------- 計算関数（すべて純粋関数。JP/USや共通エンジンからは呼ばれない） ----------
    _num(v) { return Number(v) || 0; },
    getIsaAnnualAllowance() { return this.limits.isaAnnualAllowance; },
    // ISA年間拠出額（Stocks and Shares ISA + Cash ISA の合算）
    getIsaContributed(accounts) {
      return this._num((accounts.stocksSharesIsa || {}).annualContribution)
        + this._num((accounts.cashIsa || {}).annualContribution);
    },
    getIsaRemaining(accounts) {
      return this.limits.isaAnnualAllowance - this.getIsaContributed(accounts);
    },
    // 年金のAnnual Allowance。高所得者はテーパリングにより最低 £10,000 まで逓減する。
    // （threshold income が £200,000 以下、または adjusted income が £260,000 以下なら満額）
    getPensionAnnualAllowance(adjustedIncome, thresholdIncome) {
      const l = this.limits;
      const ai = this._num(adjustedIncome);
      const ti = (thresholdIncome === undefined || thresholdIncome === null) ? ai : this._num(thresholdIncome);
      if (ti <= l.pensionTaperThresholdIncome || ai <= l.pensionTaperAdjustedIncome) return l.pensionAnnualAllowance;
      const reduction = (ai - l.pensionTaperAdjustedIncome) / 2;
      return Math.max(l.pensionAnnualAllowanceFloor, l.pensionAnnualAllowance - reduction);
    },
    // 年金年間拠出額（SIPP + 職域年金の合算）
    getPensionContributed(accounts) {
      return this._num((accounts.sipp || {}).annualContribution)
        + this._num((accounts.workplacePension || {}).annualContribution);
    },
    getPensionRemaining(accounts, adjustedIncome) {
      return this.getPensionAnnualAllowance(adjustedIncome) - this.getPensionContributed(accounts);
    },

    // 6口座の残高を、現在の年齢から死亡想定年齢まで年単位で積み上げる。
    // 口座ごとに「現在額・年間積立額・想定利回り・積立終了年齢」を個別に持つ点がJP/US版と異なる。
    // 退職後は、年金収入で賄えない不足額（annualWithdrawalNeeded）を口座から取り崩す。
    // 取崩し順：General Investment Account → Cash Savings → Cash ISA → Stocks and Shares ISA
    //           → Workplace Pension → SIPP
    // （税制優遇の小さい口座から先に取り崩し、年金資産は受給可能年齢に達するまで手を付けない）
    simulateGrowth({ currentAge, retireAge, deathAge, accounts, annualWithdrawalNeeded, pensionAccessAge }) {
      const keys = this.accountTypes;
      const accessAge = (pensionAccessAge === undefined || pensionAccessAge === null)
        ? this.pensionAccessAge
        : Number(pensionAccessAge);
      const balances = {};
      const contributions = {};
      const rates = {};
      const endAges = {};
      keys.forEach((k) => {
        const a = accounts[k] || {};
        balances[k] = Number(a.currentValue) || 0;
        contributions[k] = Number(a.annualContribution) || 0;
        rates[k] = (Number(a.expectedReturnPct) || 0) / 100;
        endAges[k] = Number(a.contributionEndAge) || 0;
      });
      const withdrawalOrder = ["gia", "cashSavings", "cashIsa", "stocksSharesIsa", "workplacePension", "sipp"];
      const totalOf = (b) => keys.reduce((s, k) => s + b[k], 0);
      const startAge = Math.round(currentAge);
      const endAge = Math.round(deathAge);
      const yearly = [{ age: startAge, value: totalOf(balances), accounts: { ...balances } }];
      for (let age = startAge + 1; age <= endAge; age++) {
        keys.forEach((k) => { balances[k] = balances[k] * (1 + rates[k]); });
        // 積立は口座ごとの「積立終了年齢」まで継続する
        keys.forEach((k) => { if (age <= endAges[k]) balances[k] += contributions[k]; });
        if (age > retireAge) {
          let remaining = Number(annualWithdrawalNeeded) || 0;
          for (const key of withdrawalOrder) {
            if (remaining <= 0) break;
            const isPension = (key === "sipp" || key === "workplacePension");
            if (isPension && age < accessAge) continue; // 受給可能年齢前の年金資産は取り崩せない
            const take = Math.min(balances[key], remaining);
            balances[key] -= take;
            remaining -= take;
          }
        }
        yearly.push({ age, value: totalOf(balances), accounts: { ...balances } });
      }
      return { yearly, finalValue: totalOf(balances), finalAccounts: { ...balances } };
    },

    // 資産区分。
    // ・Liquid / Accessible：Cash Savings・Cash ISA・GIA・Stocks and Shares ISA（＋受給可能年齢に達していれば年金資産）
    // ・Retirement / Restricted：SIPP・職域年金（受給可能年齢に達するまで）
    // ・Tax-Advantaged：ISA（S&S・Cash）＋SIPP＋職域年金 ＝ 上2区分と重なる「横断的な内訳」
    // 総資産（total）は6口座すべての単純合計であり、Liquid + Restricted と必ず一致する。
    splitAssets(age, accounts) {
      const v = {};
      this.accountTypes.forEach((k) => { v[k] = Number((accounts[k] || {}).currentValue) || 0; });
      const isAccessibleAge = age >= this.pensionAccessAge;
      const pensions = v.sipp + v.workplacePension;
      const liquidBase = v.cashSavings + v.cashIsa + v.gia + v.stocksSharesIsa;
      const liquid = liquidBase + (isAccessibleAge ? pensions : 0);
      const restricted = isAccessibleAge ? 0 : pensions;
      const taxAdvantaged = v.stocksSharesIsa + v.cashIsa + v.sipp + v.workplacePension;
      return { liquid, restricted, taxAdvantaged, total: liquidBase + pensions, isAccessibleAge, accounts: v };
    },
    notImplemented: [
      "Lifetime ISA（LISA）の政府ボーナス25%および60歳前引出時のペナルティ",
      "Junior ISA / Junior SIPP",
      "年金拠出のキャリーフォワード（過去3年分の未使用枠の繰越）",
      "2027年4月からのCash ISA年間上限£12,000（65歳未満）— 上限額のみ scheduled に保持",
    ],
  },

  retirement: {
    implemented: true,
    effectiveTaxYear: "2026/27",
    lastUpdated: "2026-07-13",
    sourceName: "GOV.UK — The new State Pension",
    sourceUrl: "https://www.gov.uk/new-state-pension",
    sourceUrls: {
      fullRate: "https://www.gov.uk/new-state-pension/what-youll-get",
      statePensionAge: "https://www.gov.uk/state-pension-age",
      deferral: "https://www.gov.uk/deferring-state-pension",
      forecast: "https://www.gov.uk/check-state-pension",
    },
    accountTypes: ["statePension"],
    statePension: {
      // 2026/27：新State Pension満額 週£241.30（三重ロックにより2026年4月から4.8%増額）
      fullWeeklyRate: 241.30,
      fullAnnualRate: 241.30 * 52, // = £12,547.60
      // 2016年4月より前に受給開始年齢に達した人の基礎年金（Basic State Pension）満額
      basicFullWeeklyRate: 184.90,
      qualifyingYearsForFull: 35,
      minimumQualifyingYears: 10,
      // State Pension age は2026年4月〜2028年4月にかけて66歳→67歳へ段階的に引き上げ中。
      // 生年月日により66〜67歳と異なるため、アプリ側では固定せずユーザーが入力する。
      ageBefore2026: 66,
      ageAfterTransition: 67,
      defaultAge: 67,
      // 繰下げ受給：9週ごとに1%増額（1年＝52週の繰下げで約5.78%増）。英国では繰上げ受給はできない。
      // GOV.UK "Delay (defer) your State Pension"：最低9週間の繰下げが必要で、それ以降は比例して増額する。
      deferralUpliftPerNineWeeks: 0.01,
      deferralUnitWeeks: 9,      // 増額の単位（9週間ごとに1%）
      deferralMinimumWeeks: 9,   // これ未満の繰下げでは増額しない
      weeksPerYear: 52,
      earlyClaimAllowed: false,
    },
    // 繰下げ受給による増額率（State Pension age より前は増額なし＝1.0）。
    // 端数を切り捨てず比例計算する（52週 → 52/9 × 1% ≒ 5.78%増）。
    // ただし最低繰下げ週数（9週）未満の場合は増額しない。
    getDeferralFactor(claimAge, statePensionAge) {
      const sp = this.statePension;
      const deferredYears = Math.max(0, (Number(claimAge) || 0) - (Number(statePensionAge) || 0));
      const weeks = deferredYears * sp.weeksPerYear;
      if (weeks < sp.deferralMinimumWeeks) return 1;
      return 1 + (weeks / sp.deferralUnitWeeks) * sp.deferralUpliftPerNineWeeks;
    },
    // 繰下げ週数から直接増額率を求める（テスト・表示用）
    getDeferralFactorFromWeeks(weeks) {
      const sp = this.statePension;
      const w = Math.max(0, Number(weeks) || 0);
      if (w < sp.deferralMinimumWeeks) return 1;
      return 1 + (w / sp.deferralUnitWeeks) * sp.deferralUpliftPerNineWeeks;
    },
    // 英国では繰上げ受給ができないため、実際の受給開始年齢は State Pension age を下回らない
    getEffectiveClaimAge(claimAge, statePensionAge) {
      return Math.max(Number(claimAge) || 0, Number(statePensionAge) || 0);
    },
    // 年間受給額 ＝ 利用者が入力した年間受給見込額 × 繰下げ増額率
    getAnnualBenefit(estimatedAnnual, claimAge, statePensionAge) {
      return (Number(estimatedAnnual) || 0) * this.getDeferralFactor(claimAge, statePensionAge);
    },
    getFullAnnualRate() { return this.statePension.fullAnnualRate; },
    notImplemented: [
      "National Insurance納付記録からの受給資格年数・受給見込額の自動判定（利用者が見込額を入力する方式）",
      "Additional State Pension（SERPS / S2P）・Protected Payment",
      "Pension Credit",
    ],
  },

  healthcare: {
    implemented: true,
    // NHSでカバーされることを前提に、自己負担が生じうる費目のみ年間費用を入力する簡易モデル。
    // 日本式（高額療養費を織り込んだ年代別自己負担）の計算式は使用しない。
    model: "selfInputAnnualCostsWithNhs",
    effectiveTaxYear: "2026/27",
    lastUpdated: "2026-07-13",
    sourceName: "NHS (nhs.uk) — Help with health costs",
    sourceUrl: "https://www.nhs.uk/nhs-services/help-with-health-costs/",
    costItems: [
      "nhsBasicAnnual",
      "privateHealthInsuranceMonthly",
      "dentalAnnual",
      "prescriptionAnnual",
      "longTermCareAnnual",
      "otherOutOfPocketAnnual",
    ],
    getAnnualTotal(healthcare) {
      const h = healthcare || {};
      const n = (v) => Number(v) || 0;
      return n(h.nhsBasicAnnual)
        + n(h.privateHealthInsuranceMonthly) * 12
        + n(h.dentalAnnual)
        + n(h.prescriptionAnnual)
        + n(h.longTermCareAnnual)
        + n(h.otherOutOfPocketAnnual);
    },
    notImplemented: [
      "NHS処方箋料・歯科料金の自動計算（England / Scotland / Wales / Northern Ireland で制度が異なるため、金額は利用者入力）",
      "自治体によるLong-term care（社会的介護）の資力調査（means test）判定",
    ],
  },

  tax: {
    implemented: true,
    model: "ukIncomeTaxPlusDividendPlusCgt",
    effectiveTaxYear: "2026/27",
    lastUpdated: "2026-07-13",
    sourceName: "GOV.UK / HMRC — Income Tax rates and Personal Allowances, Tax on dividends, Capital Gains Tax",
    sourceUrl: "https://www.gov.uk/income-tax-rates",
    sourceUrls: {
      incomeTax: "https://www.gov.uk/income-tax-rates",
      personalAllowance: "https://www.gov.uk/income-tax-rates/income-over-100000",
      dividend: "https://www.gov.uk/tax-on-dividends",
      capitalGains: "https://www.gov.uk/capital-gains-tax/rates",
      savings: "https://www.gov.uk/apply-tax-free-interest-on-savings",
      pensionTaxRelief: "https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief",
      scotland: "https://www.gov.uk/scottish-income-tax",
    },
    // 【重要】本実装は England / Wales / Northern Ireland の税率のみ。
    // スコットランドは非貯蓄・非配当所得について独自の税率・バンドを持つため未実装。
    region: "England, Wales & Northern Ireland",
    regionsImplemented: ["england", "wales", "northernIreland"],
    // スコットランドの非貯蓄・非配当所得の税率・バンドは未実装（推測値を入れない）
    scotland: { implemented: false, bands: null, rates: null },
    incomeTax: {
      personalAllowance: 12570,
      personalAllowanceTaperStart: 100000,
      personalAllowanceTaperEnd: 125140,
      // 課税所得（総所得 − Personal Allowance）に対する累進バンド
      bands: [
        { upTo: 37700, rate: 0.20 },    // Basic rate（総所得 £50,270 まで）
        { upTo: 112570, rate: 0.40 },   // Higher rate（総所得 £125,140 まで）
        { upTo: Infinity, rate: 0.45 }, // Additional rate
      ],
    },
    dividend: {
      allowance: 500,
      // 2026年4月6日から基本税率・高税率が2ポイント引き上げ（Autumn Budget 2025 / Finance Act 2026）
      basicRate: 0.1075,
      higherRate: 0.3575,
      additionalRate: 0.3935,
    },
    capitalGains: {
      annualExemptAmount: 3000,
      // 2024年10月30日以降、住宅用不動産もその他資産も同率
      basicRate: 0.18,
      higherRate: 0.24,
    },
    savings: {
      personalSavingsAllowanceBasic: 1000,
      personalSavingsAllowanceHigher: 500,
      personalSavingsAllowanceAdditional: 0,
      // 2027年4月から貯蓄利子の税率が 22 / 42 / 47% へ引き上げ予定。2026/27では未適用。
      scheduledRatesFrom2027: { basic: 0.22, higher: 0.42, additional: 0.47 },
    },
    // ISA内の利子・配当・譲渡益はすべて非課税
    isaTaxFree: true,
    pensionTaxRelief: {
      model: "marginalRate",
      taxFreeLumpSumRate: 0.25,
      lumpSumAllowance: 268275,
    },

    // Personal Allowance（£100,000超で£2につき£1ずつ逓減し、£125,140でゼロ）
    getPersonalAllowance(grossIncome) {
      const it = this.incomeTax;
      const g = Number(grossIncome) || 0;
      if (g <= it.personalAllowanceTaperStart) return it.personalAllowance;
      return Math.max(0, it.personalAllowance - (g - it.personalAllowanceTaperStart) / 2);
    },
    calculateIncomeTax(grossIncome) {
      const g = Number(grossIncome) || 0;
      const personalAllowance = this.getPersonalAllowance(g);
      const taxableIncome = Math.max(0, g - personalAllowance);
      let tax = 0;
      let lower = 0;
      for (const b of this.incomeTax.bands) {
        if (taxableIncome > lower) {
          tax += (Math.min(taxableIncome, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      return { personalAllowance, taxableIncome, tax };
    },
    // 限界税率。£100,000〜£125,140 は Personal Allowance の逓減により実効60%となる。
    getMarginalRate(grossIncome) {
      const it = this.incomeTax;
      const g = Number(grossIncome) || 0;
      if (g > it.personalAllowanceTaperStart && g <= it.personalAllowanceTaperEnd) return 0.60;
      const { taxableIncome } = this.calculateIncomeTax(g);
      if (taxableIncome <= 0) return 0;
      if (taxableIncome <= it.bands[0].upTo) return it.bands[0].rate;
      if (taxableIncome <= it.bands[1].upTo) return it.bands[1].rate;
      return it.bands[2].rate;
    },
    // 基本税率帯の残り（譲渡益・配当を積み上げる際に使う）
    getBasicRateBandRemaining(grossIncome) {
      const { taxableIncome } = this.calculateIncomeTax(grossIncome);
      return Math.max(0, this.incomeTax.bands[0].upTo - taxableIncome);
    },
    // 配当課税：配当は所得の最上位に積み上げて税率帯を判定する
    calculateDividendTax(dividendIncome, grossIncome) {
      const taxable = Math.max(0, (Number(dividendIncome) || 0) - this.dividend.allowance);
      if (taxable <= 0) return 0;
      const it = this.incomeTax;
      const bands = [
        { upTo: it.bands[0].upTo, rate: this.dividend.basicRate },
        { upTo: it.bands[1].upTo, rate: this.dividend.higherRate },
        { upTo: Infinity, rate: this.dividend.additionalRate },
      ];
      let stack = this.calculateIncomeTax(grossIncome).taxableIncome;
      let remaining = taxable;
      let tax = 0;
      for (const b of bands) {
        if (remaining <= 0) break;
        const room = Math.max(0, b.upTo - stack);
        const amount = Math.min(remaining, room);
        tax += amount * b.rate;
        remaining -= amount;
        stack += amount;
      }
      return tax;
    },
    // 譲渡益課税：年間非課税枠を控除し、基本税率帯の残りに18%、それを超える分に24%
    calculateCapitalGainsTax(gain, grossIncome) {
      const cg = this.capitalGains;
      const taxableGain = Math.max(0, (Number(gain) || 0) - cg.annualExemptAmount);
      if (taxableGain <= 0) return 0;
      const atBasic = Math.min(taxableGain, this.getBasicRateBandRemaining(grossIncome));
      const atHigher = taxableGain - atBasic;
      return atBasic * cg.basicRate + atHigher * cg.higherRate;
    },
    // 年金拠出による所得税の軽減額（概算）＝ Annual Allowance の範囲内の拠出額 × 限界税率
    calculatePensionTaxRelief(annualPensionContribution, grossIncome, annualAllowance) {
      const contribution = Math.max(0, Number(annualPensionContribution) || 0);
      const cap = (annualAllowance === undefined || annualAllowance === null)
        ? Infinity
        : Math.max(0, Number(annualAllowance) || 0);
      return Math.min(contribution, cap) * this.getMarginalRate(grossIncome);
    },
    notImplemented: [
      "スコットランド税率（Scottish Income Tax）",
      "National Insurance拠出額（NICs）",
      "貯蓄利子への課税額計算（Personal Savings Allowanceは保持。2027年4月からの22/42/47%への引上げも未適用）",
      "2027年4月からの不動産所得税率（22/42/47%）",
      "Inheritance Tax（相続税）",
      "Marriage Allowance / Married Couple's Allowance",
    ],
  },

  labels: {
    // 英国版は投資・年金・医療費・税制のすべてを実装済みのため、未実装の注記は使用しない。
    // ただしiDeCoセクション（JP専用）内の税制表示だけは英国向けの案内文へ差し替える。
    investmentNote: null,
    retirementNote: null,
    healthcareNote: null,
    taxNote: "gbTaxHandledInInvestmentNote",
  },
  defaults: {},
};

// ---------- countryRules/CA.js 相当（カナダ版：実装済み） ----------
// country: CA
// lastUpdated: 2026-07-13
// source: canada.ca（CRA / Service Canada / ESDC）
// 対象年度：2026課税年度（暦年）。CPP・OASの給付額は四半期ごとに物価連動で改定される。
// 制度上限・税率はすべて CA_COUNTRY_RULES 内に集約し、画面や共通計算関数へ直接書かない。
// 各セクションは effectiveTaxYear / lastUpdated / sourceName / sourceUrl を持つ。
// 根拠が確認できない数値は推測で入れず、未実装項目は notImplemented に明示する。
// 【重要】このオブジェクトは JP / US / GB のルールを一切参照せず、逆に参照もされない。
export const CA_COUNTRY_RULES = {
  investment: {
    implemented: true,
    effectiveTaxYear: "2026",
    lastUpdated: "2026-07-13",
    sourceName: "Government of Canada (CRA) — TFSA / RRSP contribution limits, RRIF minimum withdrawals",
    sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html",
    sourceUrls: {
      tfsa: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html",
      rrsp: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans.html",
      limitsTable: "https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html",
      rrif: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/registered-retirement-income-fund-rrif.html",
    },
    // カナダ版で別々に管理・計算する口座
    accountTypes: ["tfsa", "rrsp", "nonRegistered", "cashSavings"],
    taxAdvantagedAccounts: ["tfsa", "rrsp"],
    limits: {
      // TFSA：2026年の年間拠出上限（2024・2025年と同額）
      tfsaAnnualLimit: 7000,
      // 2009年から一度も拠出していない場合の累積上限（2026年1月1日時点）
      tfsaCumulativeRoom2026: 109000,
      // RRSP：前年の稼得所得の18% と 年間上限額 の低い方
      rrspAnnualDollarLimit: 33810,
      rrspIncomePercent: 0.18,
    },
    // RRSPは71歳の年末までにRRIF（またはアニュイティ）へ強制転換され、
    // 翌年から年齢別の最低取崩し率に従って引き出さなければならない。
    rrifConversionAge: 71,
    // RRIF最低取崩し率（CRA公表テーブル。71歳以降が強制、65〜70歳は任意のRRIF開始時に適用）
    rrifMinimumFactors: {
      65: 0.0400, 66: 0.0417, 67: 0.0435, 68: 0.0455, 69: 0.0476, 70: 0.0500,
      71: 0.0528, 72: 0.0540, 73: 0.0553, 74: 0.0567, 75: 0.0582, 76: 0.0598,
      77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682, 81: 0.0708, 82: 0.0738,
      83: 0.0771, 84: 0.0808, 85: 0.0851, 86: 0.0899, 87: 0.0955, 88: 0.1021,
      89: 0.1099, 90: 0.1192, 91: 0.1306, 92: 0.1449, 93: 0.1634, 94: 0.1879,
    },
    rrifMinimumFactorAt95Plus: 0.2000,

    // ---------- 計算関数（すべて純関数） ----------
    _num(v) { return Number(v) || 0; },
    getTfsaAnnualLimit() { return this.limits.tfsaAnnualLimit; },
    getTfsaRemaining(accounts) {
      return this.limits.tfsaAnnualLimit - this._num((accounts.tfsa || {}).annualContribution);
    },
    // RRSPの拠出枠：前年の稼得所得の18% と 年間上限額（$33,810）の低い方。
    // （職域年金がある場合の pension adjustment は未実装）
    getRrspRoom(priorEarnedIncome) {
      const l = this.limits;
      return Math.min(this._num(priorEarnedIncome) * l.rrspIncomePercent, l.rrspAnnualDollarLimit);
    },
    getRrspRemaining(accounts, priorEarnedIncome) {
      return this.getRrspRoom(priorEarnedIncome) - this._num((accounts.rrsp || {}).annualContribution);
    },
    // RRIFの年齢別最低取崩し率。95歳以上は一律20%。
    getRrifMinimumFactor(age) {
      const a = Math.floor(Number(age) || 0);
      if (a >= 95) return this.rrifMinimumFactorAt95Plus;
      return this.rrifMinimumFactors[a] || 0;
    },
    getRrifMinimumWithdrawal(age, rrspBalance) {
      return (Number(rrspBalance) || 0) * this.getRrifMinimumFactor(age);
    },

    // 4口座の残高を、現在の年齢から死亡想定年齢まで年単位で積み上げる。
    // 口座ごとに「現在額・年間積立額・想定利回り・積立終了年齢」を個別に持つ。
    // 取崩し順：Non-Registered → Cash Savings → TFSA → RRSP
    // （課税口座から先に取り崩し、非課税のTFSAとRRSPは後回しにする）
    // ただし rrifConversionAge 以降は、RRSPからの最低取崩し額が強制的に発生する。
    simulateGrowth({ currentAge, retireAge, deathAge, accounts, annualWithdrawalNeeded }) {
      const keys = this.accountTypes;
      const balances = {}, contributions = {}, rates = {}, endAges = {};
      keys.forEach((k) => {
        const a = accounts[k] || {};
        balances[k] = Number(a.currentValue) || 0;
        contributions[k] = Number(a.annualContribution) || 0;
        rates[k] = (Number(a.expectedReturnPct) || 0) / 100;
        endAges[k] = Number(a.contributionEndAge) || 0;
      });
      const withdrawalOrder = ["nonRegistered", "cashSavings", "tfsa", "rrsp"];
      const totalOf = (b) => keys.reduce((s, k) => s + b[k], 0);
      const startAge = Math.round(currentAge);
      const endAge = Math.round(deathAge);
      const yearly = [{ age: startAge, value: totalOf(balances), accounts: { ...balances }, rrifMinimum: 0 }];
      for (let age = startAge + 1; age <= endAge; age++) {
        keys.forEach((k) => { balances[k] = balances[k] * (1 + rates[k]); });
        keys.forEach((k) => { if (age <= endAges[k]) balances[k] += contributions[k]; });

        // RRIF強制取崩し（71歳以降）。引き出した額は非登録口座へ移し、生活費に充てられる状態にする。
        let rrifMinimum = 0;
        if (age >= this.rrifConversionAge && balances.rrsp > 0) {
          rrifMinimum = Math.min(balances.rrsp, this.getRrifMinimumWithdrawal(age, balances.rrsp));
          balances.rrsp -= rrifMinimum;
          balances.nonRegistered += rrifMinimum;
        }

        if (age > retireAge) {
          let remaining = Number(annualWithdrawalNeeded) || 0;
          for (const key of withdrawalOrder) {
            if (remaining <= 0) break;
            const take = Math.min(balances[key], remaining);
            balances[key] -= take;
            remaining -= take;
          }
        }
        yearly.push({ age, value: totalOf(balances), accounts: { ...balances }, rrifMinimum });
      }
      return { yearly, finalValue: totalOf(balances), finalAccounts: { ...balances } };
    },

    // 資産区分。
    // ・Liquid / Accessible：TFSA・非登録口座・現金（いつでも引き出せ、引出しに課税されない or 既に課税済み）
    // ・Restricted：RRSP（引き出し自体は可能だが全額が課税所得となり源泉徴収もあるため、
    //                実質的に自由に使える資産ではない。71歳でRRIFへ強制転換される）
    // ・Tax-Advantaged：TFSA + RRSP（上2区分と重なる横断的な内訳）
    // 総資産（total）は4口座の単純合計であり、Liquid + Restricted と必ず一致する。
    splitAssets(age, accounts) {
      const v = {};
      this.accountTypes.forEach((k) => { v[k] = Number((accounts[k] || {}).currentValue) || 0; });
      const liquid = v.tfsa + v.nonRegistered + v.cashSavings;
      const restricted = v.rrsp;
      const taxAdvantaged = v.tfsa + v.rrsp;
      return {
        liquid, restricted, taxAdvantaged,
        total: liquid + restricted,
        isRrifPhase: age >= this.rrifConversionAge,
        accounts: v,
      };
    },
    notImplemented: [
      "職域年金加入者のPension Adjustment（PA）によるRRSP枠の減額",
      "RRSP・TFSAの未使用枠の繰越（キャリーフォワード）",
      "FHSA（First Home Savings Account）／RESP／RDSP",
      "RRSPからの引出し時の源泉徴収税（withholding tax）",
      "ケベック州のQPP（CPPと拠出率・給付が異なる）",
    ],
  },

  retirement: {
    implemented: true,
    effectiveTaxYear: "2026",
    lastUpdated: "2026-07-13",
    sourceName: "Service Canada / ESDC — Canada Pension Plan, Old Age Security",
    sourceUrl: "https://www.canada.ca/en/services/benefits/publicpensions.html",
    sourceUrls: {
      cpp: "https://www.canada.ca/en/services/benefits/publicpensions/cpp.html",
      cppAmounts: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-benefit/amount.html",
      oas: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security.html",
      oasRecoveryTax: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security/recovery-tax.html",
    },
    accountTypes: ["cpp", "oas"],
    cpp: {
      // 2026年に65歳で受給を開始した場合の満額（月額）。実際の受給額は拠出履歴により大きく異なるため、
      // 利用者が My Service Canada Account で確認した見込額で上書きできるようにする。
      maxMonthlyAt65: 1507.65,
      standardAge: 65,
      earliestAge: 60,
      latestAge: 70,
      // 繰上げ：65歳より前は1か月あたり0.6%減額（60歳で -36%）
      earlyReductionPerMonth: 0.006,
      // 繰下げ：65歳より後は1か月あたり0.7%増額（70歳で +42%）
      lateIncreasePerMonth: 0.007,
    },
    oas: {
      // 2026年4〜6月期の満額（月額）。OASは四半期ごとに物価連動で改定される。
      maxMonthly65to74: 743.05,
      maxMonthly75plus: 817.36,
      enhancedAge: 75,   // 75歳以降は10%上乗せ
      standardAge: 65,
      latestAge: 70,
      earlyClaimAllowed: false, // OASは65歳より前には受給できない
      // 繰下げ：1か月あたり0.6%増額（70歳で +36%）
      lateIncreasePerMonth: 0.006,
      // 回収（クローバック）：2026課税年度、純所得がこの額を超えると超過分の15%が回収される
      recoveryTaxThreshold2026: 95323,
      recoveryTaxRate: 0.15,
      // 満額受給には18歳以降40年のカナダ居住が必要（10年で最低受給資格）
      fullResidenceYears: 40,
      minimumResidenceYears: 10,
    },

    // CPPの受給開始年齢による増減率。65歳が基準（=1.0）。
    getCppFactor(startAge) {
      const c = this.cpp;
      const a = Math.min(Math.max(Number(startAge) || c.standardAge, c.earliestAge), c.latestAge);
      const months = (a - c.standardAge) * 12;
      if (months < 0) return 1 + months * c.earlyReductionPerMonth;  // months負 → 減額
      return 1 + months * c.lateIncreasePerMonth;
    },
    getCppMaxAnnualAt65() { return this.cpp.maxMonthlyAt65 * 12; },
    // 年間受給額 ＝ 利用者が入力した「65歳時点の見込み年額」× 受給開始年齢による増減率
    getCppAnnualBenefit(estimatedAnnualAt65, startAge) {
      return (Number(estimatedAnnualAt65) || 0) * this.getCppFactor(startAge);
    },

    // OASの受給開始年齢による増額率。65歳が基準（=1.0）。繰上げ受給はできない。
    getOasFactor(startAge) {
      const o = this.oas;
      const a = Math.min(Math.max(Number(startAge) || o.standardAge, o.standardAge), o.latestAge);
      const months = (a - o.standardAge) * 12;
      return 1 + months * o.lateIncreasePerMonth;
    },
    getOasEffectiveStartAge(startAge) {
      const o = this.oas;
      return Math.min(Math.max(Number(startAge) || o.standardAge, o.standardAge), o.latestAge);
    },
    // 年齢に応じたOAS満額（年額）。75歳以降は10%上乗せされる。
    getOasMaxAnnual(age) {
      const o = this.oas;
      const monthly = (Number(age) || 0) >= o.enhancedAge ? o.maxMonthly75plus : o.maxMonthly65to74;
      return monthly * 12;
    },
    // 居住年数による按分（40年で満額、10年未満は受給資格なし）
    getOasResidenceFraction(residenceYears) {
      const o = this.oas;
      const y = Number(residenceYears) || 0;
      if (y < o.minimumResidenceYears) return 0;
      return Math.min(1, y / o.fullResidenceYears);
    },
    // クローバック前のOAS年額
    getOasAnnualBeforeClawback(age, startAge, residenceYears) {
      return this.getOasMaxAnnual(age)
        * this.getOasFactor(startAge)
        * this.getOasResidenceFraction(residenceYears);
    },
    // OAS回収税（クローバック）：純所得が閾値を超えた分の15%を、OAS年額を上限として回収する
    getOasClawback(netIncome, oasAnnualBeforeClawback) {
      const o = this.oas;
      const excess = Math.max(0, (Number(netIncome) || 0) - o.recoveryTaxThreshold2026);
      return Math.min(Math.max(0, Number(oasAnnualBeforeClawback) || 0), excess * o.recoveryTaxRate);
    },
    getOasAnnualAfterClawback(netIncome, oasAnnualBeforeClawback) {
      const before = Math.max(0, Number(oasAnnualBeforeClawback) || 0);
      return before - this.getOasClawback(netIncome, before);
    },
    notImplemented: [
      "GIS（Guaranteed Income Supplement）およびAllowance",
      "ケベック州のQPP（受給額・拠出率がCPPと異なる）",
      "CPP拠出履歴からの受給見込額の自動算出（利用者が見込額を入力する方式）",
      "CPP post-retirement benefit（受給開始後も就労を続けた場合の増額）",
      "配偶者との年金分割（pension income splitting / CPP sharing）",
    ],
  },

  healthcare: {
    implemented: true,
    // 州・準州の公的医療保険（Medicare）でカバーされることを前提に、
    // 自己負担が生じうる費目のみ年間費用を入力する簡易モデル。
    model: "selfInputAnnualCostsWithProvincialCoverage",
    effectiveTaxYear: "2026",
    lastUpdated: "2026-07-13",
    sourceName: "Government of Canada — Canada's health care system",
    sourceUrl: "https://www.canada.ca/en/health-canada/services/canada-health-care-system.html",
    costItems: [
      "basicAnnual",
      "privateHealthInsuranceMonthly",
      "prescriptionAnnual",
      "dentalAnnual",
      "visionAnnual",
      "longTermCareAnnual",
      "otherOutOfPocketAnnual",
    ],
    getAnnualTotal(healthcare) {
      const h = healthcare || {};
      const n = (v) => Number(v) || 0;
      return n(h.basicAnnual)
        + n(h.privateHealthInsuranceMonthly) * 12
        + n(h.prescriptionAnnual)
        + n(h.dentalAnnual)
        + n(h.visionAnnual)
        + n(h.longTermCareAnnual)
        + n(h.otherOutOfPocketAnnual);
    },
    notImplemented: [
      "州・準州ごとの医療保険料（British Columbia の MSP など）の自動計算",
      "処方薬・歯科・視力の公的補助（州により制度が大きく異なるため、金額は利用者入力）",
      "長期介護（Long-term care）の州別自己負担額",
    ],
  },

  tax: {
    implemented: true,
    model: "canadaFederalIncomeTax",
    effectiveTaxYear: "2026",
    lastUpdated: "2026-07-13",
    sourceName: "Canada Revenue Agency (CRA) — Federal tax rates and income brackets",
    sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
    sourceUrls: {
      brackets: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
      bpa: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/basic-personal-amount.html",
      capitalGains: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains.html",
    },
    // 【重要】連邦税のみ実装。州・準州（13地域）はそれぞれ独自の税率・バンド・控除を持つため未実装。
    region: "Federal only (provincial / territorial tax not included)",
    province: { implemented: false, brackets: null, rates: null, basicPersonalAmount: null },

    // 2026課税年度の連邦税バンド（最低税率は2025年7月に15%→14%へ引下げ済み）
    incomeTax: {
      bands: [
        { upTo: 58523, rate: 0.14 },
        { upTo: 117045, rate: 0.205 },
        { upTo: 181440, rate: 0.26 },
        { upTo: 258482, rate: 0.29 },
        { upTo: Infinity, rate: 0.33 },
      ],
      // Basic Personal Amount（基礎控除）。「所得控除」ではなく「最低税率で計算される税額控除」。
      // 高所得者は逓減し、最上位バンドで下限額になる。
      basicPersonalAmount: 16452,
      basicPersonalAmountMinimum: 14829,
      bpaTaperStart: 181440,
      bpaTaperEnd: 258482,
      bpaCreditRate: 0.14, // BPAは最低税率で税額控除される
    },
    // 譲渡益の課税所得算入率（2026年時点で50%）
    capitalGains: { inclusionRate: 0.50 },
    // TFSA内の運用益・引出しは完全非課税
    tfsaTaxFree: true,
    // RRSPは拠出時に所得控除、引出し時に全額が課税所得
    rrspModel: "deductOnContributionTaxOnWithdrawal",

    // BPA（高所得で逓減）
    getBasicPersonalAmount(income) {
      const it = this.incomeTax;
      const g = Number(income) || 0;
      if (g <= it.bpaTaperStart) return it.basicPersonalAmount;
      if (g >= it.bpaTaperEnd) return it.basicPersonalAmountMinimum;
      const range = it.bpaTaperEnd - it.bpaTaperStart;
      const reduction = (it.basicPersonalAmount - it.basicPersonalAmountMinimum) * ((g - it.bpaTaperStart) / range);
      return it.basicPersonalAmount - reduction;
    },
    // 連邦所得税（BPAの税額控除適用後）
    calculateFederalTax(taxableIncome) {
      const it = this.incomeTax;
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of it.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      const bpa = this.getBasicPersonalAmount(income);
      const bpaCredit = bpa * it.bpaCreditRate;
      return {
        taxableIncome: income,
        grossTax,
        basicPersonalAmount: bpa,
        bpaCredit,
        tax: Math.max(0, grossTax - bpaCredit),
      };
    },
    getMarginalRate(income) {
      const it = this.incomeTax;
      const g = Math.max(0, Number(income) || 0);
      for (const b of it.bands) {
        if (g <= b.upTo) return b.rate;
      }
      return it.bands[it.bands.length - 1].rate;
    },
    // 譲渡益課税：利益の50%が課税所得に算入され、限界税率で課税される
    calculateCapitalGainsTax(gain, otherIncome) {
      const g = Math.max(0, Number(gain) || 0);
      if (g <= 0) return 0;
      const taxableGain = g * this.capitalGains.inclusionRate;
      const base = this.calculateFederalTax(otherIncome).tax;
      const withGain = this.calculateFederalTax((Number(otherIncome) || 0) + taxableGain).tax;
      return Math.max(0, withGain - base);
    },
    // RRSP拠出による所得税の軽減額。拠出は所得控除なので、課税所得そのものが減る。
    calculateRrspTaxSaving(contribution, income, rrspRoom) {
      const cap = (rrspRoom === undefined || rrspRoom === null) ? Infinity : Math.max(0, Number(rrspRoom) || 0);
      const c = Math.min(Math.max(0, Number(contribution) || 0), cap);
      if (c <= 0) return 0;
      const g = Math.max(0, Number(income) || 0);
      const base = this.calculateFederalTax(g).tax;
      const reduced = this.calculateFederalTax(Math.max(0, g - c)).tax;
      return Math.max(0, base - reduced);
    },
    notImplemented: [
      "州・準州の所得税（13地域すべてで税率・バンド・控除が異なる）",
      "オンタリオ州などのサータックス（surtax）",
      "ケベック州の連邦税減額（Quebec abatement 16.5%）",
      "配当税額控除（eligible / non-eligible dividend tax credit）",
      "CPP拠出金・EI保険料（所得税とは別の天引き）",
      "Alternative Minimum Tax（AMT）",
      "年金所得の分割（pension income splitting）",
    ],
  },

  labels: {
    // カナダ版は投資・年金・医療費・税制のすべてを実装済みのため、未実装の注記は使用しない。
    // ただしiDeCoセクション（JP専用）内の税制表示だけはカナダ向けの案内文へ差し替える。
    investmentNote: null,
    retirementNote: null,
    healthcareNote: null,
    taxNote: "caTaxHandledInInvestmentNote",
  },
  defaults: {},
};

// ---------- countryRules/AU.js 相当（オーストラリア版：実装済み） ----------
// country: AU
// lastUpdated: 2026-07-13
// source: ato.gov.au（税制・Superannuation）／ servicesaustralia.gov.au（Age Pension）
// 対象年度：2026-27会計年度（2026年7月1日〜2027年6月30日）。
//   ※オーストラリアの会計年度は7月1日開始。2026年7月13日現在、2026-27年度が進行中。
//   ※Age Pensionの給付額は毎年3月20日・9月20日に物価連動で改定される（本データは2026年3月20日改定値）。
// 制度上限・税率はすべて AU_COUNTRY_RULES 内に集約し、画面や共通計算関数へ直接書かない。
// 各セクションは effectiveTaxYear / lastUpdated / sourceName / sourceUrl を持つ。
// 【重要】このオブジェクトは JP / US / GB / CA のルールを一切参照せず、逆に参照もされない。
export const AU_COUNTRY_RULES = {
  investment: {
    implemented: true,
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-07-13",
    sourceName: "Australian Taxation Office (ATO) — Key superannuation rates and thresholds",
    sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds",
    sourceUrls: {
      contributionsCaps: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/contributions-caps",
      paymentsFromSuper: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/payments-from-super",
      superGuarantee: "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-contributions/how-much-super-to-pay",
      preservationAge: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super",
    },
    // オーストラリア版で別々に管理・計算する口座
    accountTypes: ["superannuation", "investmentAccount", "cashSavings"],
    taxAdvantagedAccounts: ["superannuation"],
    limits: {
      // 2026年7月1日からの拠出上限（前年度は $30,000 / $120,000）
      concessionalCap: 32500,        // 税引前拠出（SG＋給与犠牲＋個人控除拠出の合計）
      nonConcessionalCap: 130000,    // 税引後拠出
      // 3年分の前倒し拠出（bring-forward）。総残高により利用可否が変わる。
      bringForwardMax: 390000,
      // Superannuation Guarantee（雇用主の義務拠出率）。2025年7月1日に12%へ到達し、以降据置。
      superGuaranteeRate: 0.12,
      // SG算定の対象となる四半期あたり収入の上限（年額換算・2026-27）
      maximumContributionBase: 270830,
      // Transfer Balance Cap：退職フェーズ（非課税）へ移せる上限（2026年7月1日から）
      transferBalanceCap: 2100000,
      // 繰越拠出（carry-forward）が使える総残高の上限
      carryForwardBalanceThreshold: 500000,
    },
    // Preservation age：Superにアクセスできる最低年齢。1964年7月1日以降生まれは60歳。
    // 60歳＋「条件を満たす退職」で引き出し可能。65歳になれば就労状況に関わらず無条件で引き出せる。
    preservationAge: 60,
    unrestrictedAccessAge: 65,
    // Account-based pension の年齢別「最低取崩し率」（ATO公表テーブル）
    minimumDrawdownFactors: {
      under65: 0.04,
      "65to74": 0.05,
      "75to79": 0.06,
      "80to84": 0.07,
      "85to89": 0.09,
      "90to94": 0.11,
      "95plus": 0.14,
    },

    // ---------- 計算関数（すべて純関数） ----------
    _num(v) { return Number(v) || 0; },
    getConcessionalCap() { return this.limits.concessionalCap; },
    getNonConcessionalCap() { return this.limits.nonConcessionalCap; },
    getSuperGuaranteeRate() { return this.limits.superGuaranteeRate; },
    // 雇用主のSG拠出額。SG算定の対象収入には上限（maximum contribution base）がある。
    getEmployerSgContribution(annualSalary) {
      const l = this.limits;
      const base = Math.min(this._num(annualSalary), l.maximumContributionBase);
      return base * l.superGuaranteeRate;
    },
    // 税引前拠出の合計（雇用主SG ＋ 本人の給与犠牲・個人控除拠出）
    getTotalConcessional(annualSalary, voluntaryConcessional) {
      return this.getEmployerSgContribution(annualSalary) + this._num(voluntaryConcessional);
    },
    getConcessionalRemaining(annualSalary, voluntaryConcessional) {
      return this.limits.concessionalCap - this.getTotalConcessional(annualSalary, voluntaryConcessional);
    },
    getNonConcessionalRemaining(nonConcessionalContribution) {
      return this.limits.nonConcessionalCap - this._num(nonConcessionalContribution);
    },
    // Superへアクセスできるか（60歳以上。65歳で無条件）
    canAccessSuper(age) {
      return (Number(age) || 0) >= this.preservationAge;
    },
    // 年齢別の最低取崩し率（Account-based pension）
    getMinimumDrawdownFactor(age) {
      const a = Number(age) || 0;
      const f = this.minimumDrawdownFactors;
      if (a < 65) return f.under65;
      if (a < 75) return f["65to74"];
      if (a < 80) return f["75to79"];
      if (a < 85) return f["80to84"];
      if (a < 90) return f["85to89"];
      if (a < 95) return f["90to94"];
      return f["95plus"];
    },
    getMinimumDrawdown(age, superBalance) {
      return (Number(superBalance) || 0) * this.getMinimumDrawdownFactor(age);
    },

    // 3口座の残高を、現在の年齢から死亡想定年齢まで年単位で積み上げる。
    // Superの特殊な扱い：
    //   ・税引前拠出は「拠出時に15%課税」されてから口座へ入る
    //   ・積立期（accumulation phase）の運用益には15%課税 → 実効利回りが下がる
    //   ・退職フェーズ（preservation age以降かつ退職後）では運用益が非課税
    //   ・退職後は年齢別の最低取崩し率に従って引き出す義務がある
    // 取崩し順：Investment Account → Cash Savings → Superannuation
    //           （Superは preservation age に達するまで取り崩せない）
    simulateGrowth({
      currentAge, retireAge, deathAge, accounts, annualWithdrawalNeeded,
      annualSalary, voluntaryConcessional, contributionsTaxRate, earningsTaxAccumulation,
    }) {
      const keys = this.accountTypes;
      const contribTax = (contributionsTaxRate === undefined || contributionsTaxRate === null) ? 0.15 : Number(contributionsTaxRate);
      const earnTax = (earningsTaxAccumulation === undefined || earningsTaxAccumulation === null) ? 0.15 : Number(earningsTaxAccumulation);

      const balances = {}, contributions = {}, rates = {}, endAges = {};
      keys.forEach((k) => {
        const a = accounts[k] || {};
        balances[k] = Number(a.currentValue) || 0;
        contributions[k] = Number(a.annualContribution) || 0;
        rates[k] = (Number(a.expectedReturnPct) || 0) / 100;
        endAges[k] = Number(a.contributionEndAge) || 0;
      });
      // Superへの税引前拠出（SG＋任意拠出）は、上限を超えた分も含めて15%課税後に口座へ入る。
      const concessionalGross = this.getTotalConcessional(annualSalary, voluntaryConcessional);
      const concessionalNet = concessionalGross * (1 - contribTax);

      const withdrawalOrder = ["investmentAccount", "cashSavings", "superannuation"];
      const totalOf = (b) => keys.reduce((s, k) => s + b[k], 0);
      const startAge = Math.round(currentAge);
      const endAge = Math.round(deathAge);
      const yearly = [{ age: startAge, value: totalOf(balances), accounts: { ...balances }, minimumDrawdown: 0 }];

      for (let age = startAge + 1; age <= endAge; age++) {
        // 退職フェーズか（preservation age以降かつ退職後）。運用益が非課税になる。
        const inRetirementPhase = age > retireAge && this.canAccessSuper(age);

        keys.forEach((k) => {
          let r = rates[k];
          // Superの積立期は運用益に15%課税されるため、実効利回りが下がる
          if (k === "superannuation" && !inRetirementPhase) r = r * (1 - earnTax);
          balances[k] = balances[k] * (1 + r);
        });

        // 積立（Superは税引前拠出が15%課税後に入る＋任意の税引後拠出）
        keys.forEach((k) => {
          if (age > endAges[k]) return;
          if (k === "superannuation") {
            balances[k] += concessionalNet + contributions[k]; // contributions[k] は税引後拠出（non-concessional）
          } else {
            balances[k] += contributions[k];
          }
        });

        // 退職フェーズでの最低取崩し（引き出した額は投資口座へ移し、生活費に充てられる状態にする）
        let minimumDrawdown = 0;
        if (inRetirementPhase && balances.superannuation > 0) {
          minimumDrawdown = Math.min(
            balances.superannuation,
            this.getMinimumDrawdown(age, balances.superannuation)
          );
          balances.superannuation -= minimumDrawdown;
          balances.investmentAccount += minimumDrawdown;
        }

        if (age > retireAge) {
          let remaining = Number(annualWithdrawalNeeded) || 0;
          for (const key of withdrawalOrder) {
            if (remaining <= 0) break;
            if (key === "superannuation" && !this.canAccessSuper(age)) continue;
            const take = Math.min(balances[key], remaining);
            balances[key] -= take;
            remaining -= take;
          }
        }
        yearly.push({ age, value: totalOf(balances), accounts: { ...balances }, minimumDrawdown });
      }
      return { yearly, finalValue: totalOf(balances), finalAccounts: { ...balances } };
    },

    // 資産区分。
    // ・Liquid / Accessible：Investment Account・Cash Savings（＋preservation age以降のSuper）
    // ・Restricted：Superannuation（preservation age未満は一切引き出せない）
    // ・Tax-Advantaged：Superannuation（上2区分と重なる横断的な内訳）
    // 総資産（total）は3口座の単純合計であり、Liquid + Restricted と必ず一致する。
    splitAssets(age, accounts) {
      const v = {};
      this.accountTypes.forEach((k) => { v[k] = Number((accounts[k] || {}).currentValue) || 0; });
      const accessible = this.canAccessSuper(age);
      const liquidBase = v.investmentAccount + v.cashSavings;
      const liquid = liquidBase + (accessible ? v.superannuation : 0);
      const restricted = accessible ? 0 : v.superannuation;
      return {
        liquid, restricted,
        taxAdvantaged: v.superannuation,
        total: liquidBase + v.superannuation,
        isAccessibleAge: accessible,
        accounts: v,
      };
    },
    notImplemented: [
      "繰越拠出（carry-forward）：総残高$500,000未満なら過去5年分の未使用枠を繰り越せる",
      "3年分の前倒し拠出（bring-forward）の可否判定",
      "Transfer Balance Capを超えた分の課税（超過分は積立フェーズに留まり15%課税）",
      "Downsizer contribution（自宅売却時の最大$300,000拠出）",
      "政府のco-contribution（低・中所得者への最大$500の上乗せ）",
      "残高$3M超の運用益への追加課税（Division 296）",
    ],
  },

  retirement: {
    implemented: true,
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-07-13",
    sourceName: "Services Australia — Age Pension（給付額は2026年3月20日改定値、資産・所得基準は2026年7月1日改定値）",
    sourceUrl: "https://www.servicesaustralia.gov.au/age-pension",
    sourceUrls: {
      howMuch: "https://www.servicesaustralia.gov.au/how-much-age-pension-you-can-get",
      incomeTest: "https://www.servicesaustralia.gov.au/income-test-for-age-pension",
      assetsTest: "https://www.servicesaustralia.gov.au/assets-test-for-age-pension",
      eligibility: "https://www.servicesaustralia.gov.au/who-can-get-age-pension",
    },
    accountTypes: ["agePension"],
    agePension: {
      // 受給資格年齢（引き上げは2023年7月に完了し、67歳で確定）
      qualifyingAge: 67,
      fortnightsPerYear: 26,
      // 最大給付額（2026年3月20日〜9月19日。年金補助・エネルギー補助を含む）
      maxFortnightlySingle: 1200.90,
      maxFortnightlyCoupleEach: 905.20,
      // 所得テスト：無影響枠を超えた分、1ドルにつき50セント減額
      incomeFreeAreaFortnightlySingle: 226,
      incomeFreeAreaFortnightlyCoupleCombined: 396,
      incomeTaperPerDollar: 0.50,
      // 資産テスト：無影響枠を超えた1,000ドルごとに、隔週3ドル減額
      assetsFreeAreaSingleHomeowner: 333000,
      assetsFreeAreaSingleNonHomeowner: 600000,
      assetsFreeAreaCoupleHomeowner: 499000,
      assetsFreeAreaCoupleNonHomeowner: 766000,
      assetsTaperPerThousandFortnightly: 3,
      // Work Bonus：就労収入のうち、所得テストから除外される年額
      workBonusAnnual: 11800,
    },

    getQualifyingAge() { return this.agePension.qualifyingAge; },
    // 最大給付額（年額）
    getMaxAnnual(status) {
      const p = this.agePension;
      const fortnightly = status === "couple" ? p.maxFortnightlyCoupleEach : p.maxFortnightlySingle;
      return fortnightly * p.fortnightsPerYear;
    },
    // 資産テストの無影響枠
    getAssetsFreeArea(status, homeowner) {
      const p = this.agePension;
      if (status === "couple") {
        return homeowner ? p.assetsFreeAreaCoupleHomeowner : p.assetsFreeAreaCoupleNonHomeowner;
      }
      return homeowner ? p.assetsFreeAreaSingleHomeowner : p.assetsFreeAreaSingleNonHomeowner;
    },
    // 所得テストの無影響枠（年額）
    getIncomeFreeAreaAnnual(status) {
      const p = this.agePension;
      const fortnightly = status === "couple"
        ? p.incomeFreeAreaFortnightlyCoupleCombined
        : p.incomeFreeAreaFortnightlySingle;
      return fortnightly * p.fortnightsPerYear;
    },
    // 所得テストによる給付額（年額）。就労収入はWork Bonus分が除外される。
    getAgePensionByIncomeTest(annualIncome, status) {
      const p = this.agePension;
      const max = this.getMaxAnnual(status);
      const excess = Math.max(0, (Number(annualIncome) || 0) - this.getIncomeFreeAreaAnnual(status));
      return Math.max(0, max - excess * p.incomeTaperPerDollar);
    },
    // 資産テストによる給付額（年額）
    getAgePensionByAssetsTest(assessableAssets, status, homeowner) {
      const p = this.agePension;
      const max = this.getMaxAnnual(status);
      const excess = Math.max(0, (Number(assessableAssets) || 0) - this.getAssetsFreeArea(status, homeowner));
      const reductionPerYear = (excess / 1000) * p.assetsTaperPerThousandFortnightly * p.fortnightsPerYear;
      return Math.max(0, max - reductionPerYear);
    },
    // 実際の給付額 ＝ 所得テストと資産テストの「低い方」。受給資格年齢未満はゼロ。
    getAgePension({ age, annualIncome, assessableAssets, status, homeowner }) {
      if ((Number(age) || 0) < this.agePension.qualifyingAge) return 0;
      const byIncome = this.getAgePensionByIncomeTest(annualIncome, status);
      const byAssets = this.getAgePensionByAssetsTest(assessableAssets, status, homeowner);
      return Math.min(byIncome, byAssets);
    },
    notImplemented: [
      "Deeming（金融資産のみなし収入）— 実際の運用益ではなく、みなし利率で所得を算定する制度",
      "Work Bonusの income bank（未使用分の繰越）",
      "Rent Assistance（賃貸住宅手当）",
      "Transitional rate pension（2009年以前からの受給者への経過措置）",
      "Commonwealth Seniors Health Card",
    ],
  },

  healthcare: {
    implemented: true,
    // Medicare（公的医療保険）でカバーされることを前提に、
    // 自己負担が生じうる費目のみ年間費用を入力する簡易モデル。
    model: "selfInputAnnualCostsWithMedicare",
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-07-13",
    sourceName: "Services Australia — Medicare",
    sourceUrl: "https://www.servicesaustralia.gov.au/medicare",
    costItems: [
      "gapAnnual",
      "privateHealthInsuranceMonthly",
      "pharmaceuticalAnnual",
      "dentalAnnual",
      "opticalAnnual",
      "agedCareAnnual",
      "otherOutOfPocketAnnual",
    ],
    getAnnualTotal(healthcare) {
      const h = healthcare || {};
      const n = (v) => Number(v) || 0;
      return n(h.gapAnnual)
        + n(h.privateHealthInsuranceMonthly) * 12
        + n(h.pharmaceuticalAnnual)
        + n(h.dentalAnnual)
        + n(h.opticalAnnual)
        + n(h.agedCareAnnual)
        + n(h.otherOutOfPocketAnnual);
    },
    notImplemented: [
      "Medicare Levy Surcharge（民間医療保険未加入の高所得者への1〜1.5%の追加課税）",
      "PBS Safety Net（薬剤費の自己負担上限）",
      "Medicare Safety Net（診療費の自己負担上限）",
      "Aged care（高齢者介護）の資力調査に基づく自己負担額",
    ],
  },

  tax: {
    implemented: true,
    model: "australiaIncomeTaxPlusMedicareLevy",
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-07-13",
    sourceName: "Australian Taxation Office (ATO) — Tax rates for Australian residents",
    sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents",
    sourceUrls: {
      incomeTax: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents",
      medicareLevy: "https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy",
      capitalGains: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax",
      div293: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-your-super/how-to-save-more-in-your-super/division-293-tax",
    },
    region: "Australian residents (foreign residents not implemented)",
    // 2026-27年度の税率。第2バンドは2026年7月1日に16%→15%へ引下げ済み。
    // （さらに2027年7月1日から14%へ引下げが法制化されているが、本年度は未適用）
    incomeTax: {
      taxFreeThreshold: 18200,
      bands: [
        { upTo: 18200, rate: 0.00 },
        { upTo: 45000, rate: 0.15 },
        { upTo: 135000, rate: 0.30 },
        { upTo: 190000, rate: 0.37 },
        { upTo: Infinity, rate: 0.45 },
      ],
      scheduledSecondBandRateFrom2027: 0.14, // 2027年7月1日から。本年度は未適用。
    },
    medicareLevy: { rate: 0.02 },
    // Superannuationの税制
    superannuation: {
      contributionsTaxRate: 0.15,           // 税引前拠出への課税
      earningsTaxAccumulation: 0.15,        // 積立期の運用益への課税
      earningsTaxRetirementPhase: 0.00,     // 退職フェーズの運用益（Transfer Balance Capの範囲内）
      withdrawalTaxAfter60: 0.00,           // 60歳以降の引き出しは非課税（課税済みファンドの場合）
      div293Threshold: 250000,              // 所得＋拠出額がこの額を超えると
      div293AdditionalRate: 0.15,           //   税引前拠出に追加15%（合計30%）
      lowRateCap: 260000,                   // 60歳未満の一時金の低税率枠（2026年7月1日から）
    },
    // 譲渡益：12か月超保有した資産は50%割引
    capitalGains: { discountRate: 0.50, minimumHoldingMonths: 12 },

    // 所得税（Medicare levyを除く）
    calculateIncomeTax(taxableIncome) {
      const income = Math.max(0, Number(taxableIncome) || 0);
      let tax = 0;
      let lower = 0;
      for (const b of this.incomeTax.bands) {
        if (income > lower) {
          tax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      return tax;
    },
    // Medicare levy（2%）。低所得者の減免は未実装。
    calculateMedicareLevy(taxableIncome) {
      return Math.max(0, Number(taxableIncome) || 0) * this.medicareLevy.rate;
    },
    // 所得税＋Medicare levy の合計
    calculateTotalTax(taxableIncome) {
      const incomeTax = this.calculateIncomeTax(taxableIncome);
      const medicareLevy = this.calculateMedicareLevy(taxableIncome);
      return { incomeTax, medicareLevy, total: incomeTax + medicareLevy };
    },
    getMarginalRate(taxableIncome) {
      const income = Math.max(0, Number(taxableIncome) || 0);
      for (const b of this.incomeTax.bands) {
        if (income <= b.upTo) return b.rate;
      }
      return this.incomeTax.bands[this.incomeTax.bands.length - 1].rate;
    },
    // Medicare levyを含む実効限界税率
    getMarginalRateWithLevy(taxableIncome) {
      return this.getMarginalRate(taxableIncome) + this.medicareLevy.rate;
    },
    // 税引前拠出への課税。所得＋拠出額が$250,000を超えるとDivision 293で追加15%。
    calculateSuperContributionTax(concessionalContribution, taxableIncome) {
      const s = this.superannuation;
      const c = Math.max(0, Number(concessionalContribution) || 0);
      const income = Math.max(0, Number(taxableIncome) || 0);
      const baseTax = c * s.contributionsTaxRate;
      const div293Applies = (income + c) > s.div293Threshold;
      const div293Tax = div293Applies ? c * s.div293AdditionalRate : 0;
      return {
        baseTax,
        div293Tax,
        total: baseTax + div293Tax,
        effectiveRate: c > 0 ? (baseTax + div293Tax) / c : 0,
        div293Applies,
      };
    },
    // 給与犠牲による節税額 ＝ 拠出額 ×（限界税率＋Medicare levy − 拠出課税の実効税率）
    calculateSalarySacrificeSaving(concessionalContribution, taxableIncome) {
      const c = Math.max(0, Number(concessionalContribution) || 0);
      if (c <= 0) return 0;
      const income = Math.max(0, Number(taxableIncome) || 0);
      // 拠出前の税額 − 拠出後（課税所得が減る）の税額
      const before = this.calculateTotalTax(income).total;
      const after = this.calculateTotalTax(Math.max(0, income - c)).total;
      const personalTaxSaved = before - after;
      const superTax = this.calculateSuperContributionTax(c, Math.max(0, income - c)).total;
      return Math.max(0, personalTaxSaved - superTax);
    },
    // 譲渡益課税：12か月超保有なら利益の50%が課税所得に算入され、限界税率＋levyで課税される
    calculateCapitalGainsTax(gain, otherIncome, heldOver12Months) {
      const g = Math.max(0, Number(gain) || 0);
      if (g <= 0) return 0;
      const discount = (heldOver12Months === false) ? 0 : this.capitalGains.discountRate;
      const taxableGain = g * (1 - discount);
      const base = this.calculateTotalTax(otherIncome).total;
      const withGain = this.calculateTotalTax((Number(otherIncome) || 0) + taxableGain).total;
      return Math.max(0, withGain - base);
    },
    notImplemented: [
      "Low Income Tax Offset（LITO・最大$700）",
      "Seniors and Pensioners Tax Offset（SAPTO・最大$2,230）",
      "Medicare levyの低所得者減免",
      "Medicare Levy Surcharge（民間医療保険未加入の高所得者）",
      "HECS-HELP（学生ローン）の返済",
      "非居住者（foreign resident）の税率",
      "60歳未満のSuper引き出しへの課税（low rate capは保持）",
    ],
  },

  labels: {
    investmentNote: null,
    retirementNote: null,
    healthcareNote: null,
    taxNote: "auTaxHandledInInvestmentNote",
  },
  defaults: {},
};

const COUNTRY_RULES = {
  JP: JP_COUNTRY_RULES,
  US: US_COUNTRY_RULES,
  GB: GB_COUNTRY_RULES,
  CA: CA_COUNTRY_RULES,
  AU: AU_COUNTRY_RULES,
  // CA / AU: SUPPORTED_COUNTRIES 側でまだ enabled:false（Coming Soon）のため、
  // ここに追加しなくても getCountryRules() は自動的に JP へフォールバック値を
  // 返さず、下記の通り「未定義国は最も安全側の＝未実装として扱う」ようにしてある。
};

const UNIMPLEMENTED_COUNTRY_RULES = {
  investment: { implemented: false, plannedAccountTypes: [], annualInstallmentLimit: null, annualGrowthLimit: null, growthLifetimeLimit: null, taxFreeInvestmentLimit: null },
  retirement: { implemented: false, plannedAccountTypes: [], hasFixedContributionLimit: null },
  healthcare: { implemented: false, model: null },
  tax: { implemented: false, model: null },
  labels: {},
  defaults: {},
};

// 共通計算エンジンの入口。`const rules = getCountryRules(country);` の形で呼び出す。
// 重要：未対応の国であっても JP の数値へフォールバックしない
// （フォールバックすると日本の制度の数値が、あたかもその国の制度の数値であるかのように
//   表示されてしまうため）。JPだけが実装済みの計算式を持ち、それ以外は
// 「未実装であることが明確に分かるプレースホルダー」を返す。
function getCountryRules(country) {
  return COUNTRY_RULES[country] || UNIMPLEMENTED_COUNTRY_RULES;
}

// ---------- NISA quota rules (2024- new NISA system) ----------
// 数値そのものは countryRules/JP.js 相当（JP_COUNTRY_RULES.investment）に集約し、
// ここでは既存コード互換のための別名として参照するのみ。
// （NISA_LIMITS.xxx という参照は既存コード全体にそのまま残しているため、ここを書き換えても
//   計算結果・呼び出し側のコードには一切影響しない。）
export const NISA_LIMITS = {
  tsumitateAnnual: JP_COUNTRY_RULES.investment.annualInstallmentLimit,
  growthAnnual: JP_COUNTRY_RULES.investment.annualGrowthLimit,
  growthLifetime: JP_COUNTRY_RULES.investment.growthLifetimeLimit,
  totalLifetime: JP_COUNTRY_RULES.investment.taxFreeInvestmentLimit,
};

// 生年月日から、今日時点での正確な年齢（年・月・日・小数の年齢）を計算する
// 銘柄名からよくある想定年率の目安を推測する（実際の市場データではなく、一般的な傾向に基づく参考値）
// マッチしない場合は中立的な既定値 5% を返す。あくまで初期値で、いつでも手動で書き換え可能。
const RETURN_GUESS_TABLE = [
  { keywords: ["半導体", "ai", "エヌビディア", "nvidia"], pct: 8 },
  { keywords: ["ナスダック", "nasdaq"], pct: 7 },
  { keywords: ["インド"], pct: 7 },
  { keywords: ["新興国", "emerging"], pct: 6.5 },
  { keywords: ["s&p500", "sp500", "s&p 500", "米国株", "全米"], pct: 6 },
  { keywords: ["全世界", "オルカン", "先進国"], pct: 5 },
  { keywords: ["高配当"], pct: 5 },
  { keywords: ["日経", "topix", "日本株"], pct: 4 },
  { keywords: ["reit", "リート", "不動産"], pct: 4 },
  { keywords: ["ゴールド", "gold", "金"], pct: 3 },
  { keywords: ["バランス"], pct: 3 },
  { keywords: ["債券", "国債", "ボンド", "bond"], pct: 2 },
  { keywords: ["預金", "貯金", "定期"], pct: 0.2 },
];
function guessDefaultReturn(name) {
  const lower = (name || "").toLowerCase();
  for (const row of RETURN_GUESS_TABLE) {
    if (row.keywords.some((k) => lower.includes(k))) return row.pct;
  }
  return 5;
}

// iDeCoの節税額（概算）用：所得税＋住民税をまとめた大まかな実効税率の目安
// ※実際の税額は控除の状況等により異なります。あくまで概算です。
export function estimateMarginalTaxRate(annualIncome) {
  if (!annualIncome || annualIncome <= 0) return 0.2; // 年収未入力時の目安
  if (annualIncome <= 1950000) return 0.15;
  if (annualIncome <= 3300000) return 0.2;
  if (annualIncome <= 6950000) return 0.3;
  if (annualIncome <= 9000000) return 0.33;
  if (annualIncome <= 18000000) return 0.43;
  return 0.5;
}

export function computeAgeFromBirthDate(birthDateStr, asOfDate) {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr + "T00:00:00");
  const now = asOfDate || new Date();
  if (isNaN(birth.getTime()) || now < birth) return null;

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const diffMs = now - birth;
  const decimal = diffMs / (365.2425 * 24 * 3600 * 1000);

  return { years, months, days, decimal };
}

export function healthAnnualCost(age, brackets) {
  if (age < 60) return 0;
  if (age < 70) return brackets.b60;
  if (age < 80) return brackets.b70;
  return brackets.b80;
}

// 年齢レンジごとの毎月投資額スケジュールから、指定年齢時点の該当額を合算して返す（つみたて枠・成長投資枠で共用）
function scheduledAmount(schedule, age) {
  if (!schedule || !schedule.length) return 0;
  return schedule.reduce((sum, r) => {
    if (age >= r.fromAge && age <= r.toAge) return sum + (r.monthlyYen || 0);
    return sum;
  }, 0);
}

// スケジュールのうち「現在の年齢より前」の区間分を、経過月数×月額で合算する
// （すでに実行済みの積立として、これまでの使用累計に自動で反映するため）
function elapsedScheduleAmount(schedule, currentAge) {
  if (!schedule || !schedule.length) return 0;
  return schedule.reduce((sum, r) => {
    if (r.fromAge >= currentAge) return sum;
    const monthsElapsed = Math.max(0, Math.min(r.toAge, currentAge) - r.fromAge) * 12;
    return sum + monthsElapsed * (r.monthlyYen || 0);
  }, 0);
}

// スケジュールの毎月の拠出額を、それぞれ「引き落とされた月」に元本として加え、
// そこから現在（toAge）まで想定利回りで複利運用したものとして、経過分の評価額を計算する
// （実際に投資してきた金額が、これまでの運用成果も含めて今いくらになっているかを近似するため）
function compoundedElapsedValue(schedule, fromAge, toAge, annualReturnPct) {
  if (!schedule || !schedule.length || fromAge === null || fromAge === undefined || fromAge >= toAge) return 0;
  const totalMonths = Math.max(0, Math.round((toAge - fromAge) * 12));
  const r = monthlyRate(annualReturnPct || 0);
  let value = 0;
  for (let m = 0; m < totalMonths; m++) {
    const age = fromAge + m / 12;
    const contribution = scheduledAmount(schedule, age);
    value = value * (1 + r) + contribution;
  }
  return value;
}

// 手入力した「その時点での実際の金額」を、基準日から現在まで想定利回りで複利成長させる
function compoundPrincipal(value, fromAge, toAge, annualReturnPct) {
  if (fromAge === null || fromAge === undefined || fromAge >= toAge) return value || 0;
  const months = Math.max(0, Math.round((toAge - fromAge) * 12));
  const r = monthlyRate(annualReturnPct || 0);
  return (value || 0) * Math.pow(1 + r, months);
}

// 一括投資のうち「すでに投資時期を迎えた（現在の年齢より前の）」ものを合算する（簿価ベース、NISA枠の使用量トラッキング用）
// ※ ちょうど現在の年齢と同じものは、以降のシミュレーションのm=0処理側で計上されるためここでは含めない
function elapsedLumpSumAmount(lumpSums, currentAge) {
  if (!lumpSums || !lumpSums.length) return 0;
  return lumpSums.reduce((sum, e) => (e.age < currentAge ? sum + (e.amount || 0) : sum), 0);
}

// 一括投資のうち「すでに投資時期を迎えた（現在の年齢より前の）」ものを、
// それぞれの投資日から現在まで想定利回りで複利運用したものとして合算する（現在資産の評価額用）
function compoundedLumpSumValue(lumpSums, currentAge, annualReturnPct) {
  if (!lumpSums || !lumpSums.length) return 0;
  const r = monthlyRate(annualReturnPct || 0);
  return lumpSums.reduce((sum, e) => {
    if (e.age >= currentAge) return sum;
    const months = Math.max(0, Math.round((currentAge - e.age) * 12));
    return sum + (e.amount || 0) * Math.pow(1 + r, months);
  }, 0);
}

export function runSimulation(inputs, uncategorizedLabel, phaseAccumLabel, phaseDrawdownLabel) {
  const {
    currentAge, retireAge, deathAge,
    currentAssets, tsumitateSchedule, growthSchedule, lumpSums,
    tsumitateUsed, growthUsed,
    dynamicFunds,
    pensionMonthly, livingCostMonthly, postRetireReturn,
    healthBrackets, inheritanceTarget,
    privatePensionPlans,
    // 追加パラメータ（省略時は既存のNISA計算と完全に同一の結果になる、後方互換の任意フック）
    // iDeCoの年金受取分など、老後の収支に上乗せしたい追加収入を年齢から算出する関数
    extraRetirementIncomeMonthly,
    // iDeCo一時金など、指定月に一度だけ使用可能資産へ移す金額を年齢から算出する関数
    extraSpendableLumpSum,
  } = inputs;

  // 積立・成長投資枠・一括投資の内訳に入力された銘柄だけで配分リストを作る（固定カテゴリなし）
  const allFundEntries = (dynamicFunds && dynamicFunds.length)
    ? dynamicFunds
    : [{ id: uncategorizedLabel || "未分類", pct: 100, returnPct: 5 }];

  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  let funds = {};
  allFundEntries.forEach((f) => {
    funds[f.id] = currentAssets * (f.pct / 100);
  });

  // lump-sum growth-quota investments, indexed by month offset from currentAge
  const lumpByMonth = new Map();
  (lumpSums || []).forEach((entry) => {
    const targetMonth = Math.max(1, Math.round((entry.age - currentAge) * 12));
    if (targetMonth >= 0 && targetMonth <= totalMonths) {
      lumpByMonth.set(targetMonth, (lumpByMonth.get(targetMonth) || 0) + entry.amount);
    }
  });
  const lumpTruncations = [];

  // quota tracking (簿価ベース累計投資額)
  const tsumitateMonthlyCap = NISA_LIMITS.tsumitateAnnual / 12;
  const growthMonthlyCap = NISA_LIMITS.growthAnnual / 12;
  let tsumitateCum = (tsumitateUsed || 0) + elapsedScheduleAmount(tsumitateSchedule, currentAge);
  let growthCum = (growthUsed || 0) + elapsedScheduleAmount(growthSchedule, currentAge) + elapsedLumpSumAmount(lumpSums, currentAge);
  let growthMaxedAge = null;
  let totalMaxedAge = null;

  const initialTotal = Object.values(funds).reduce((sum, value) => sum + value, 0);
  const yearly = [{
    age: Math.round(currentAge),
    total: initialTotal,
    funds: { ...funds },
    phase: currentAge < retireAge ? (phaseAccumLabel || "積立期") : (phaseDrawdownLabel || "取崩期"),
    tsumitateCum,
    growthCum,
  }];
  let depletionAge = null;
  let peakAssets = initialTotal;
  let assetsAtRetire = currentAge >= retireAge ? initialTotal : null;

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    const inAccumulation = age < retireAge;
    const lumpGross = lumpByMonth.get(m) || 0;
    // iDeCo一時金などの外部一時金。呼び出し側が受取月だけ金額を返すため、二重加算されない。
    const extraSpendableLump = typeof extraSpendableLumpSum === "function" ? (extraSpendableLumpSum(age) || 0) : 0;

    if (inAccumulation) {
      // enforce annual-rate caps
      let effGrowth = Math.min(scheduledAmount(growthSchedule, age), growthMonthlyCap);
      let effTsumitate = Math.min(scheduledAmount(tsumitateSchedule, age), tsumitateMonthlyCap);

      // enforce growth lifetime cap
      const growthRoom = Math.max(0, NISA_LIMITS.growthLifetime - growthCum);
      if (effGrowth > growthRoom) effGrowth = growthRoom;

      // enforce combined lifetime cap (growth counted first, then tsumitate fills remainder)
      let totalRoom = Math.max(0, NISA_LIMITS.totalLifetime - (tsumitateCum + growthCum));
      if (effGrowth > totalRoom) effGrowth = totalRoom;
      totalRoom -= effGrowth;
      if (effTsumitate > totalRoom) effTsumitate = totalRoom;

      if (effGrowth > 0) growthCum += effGrowth;
      if (effTsumitate > 0) tsumitateCum += effTsumitate;

      // lump-sum investment this month (goes into growth quota)
      let lumpEff = 0;
      if (lumpGross > 0) {
        const gRoom = Math.max(0, NISA_LIMITS.growthLifetime - growthCum);
        const tRoom = Math.max(0, NISA_LIMITS.totalLifetime - (tsumitateCum + growthCum));
        lumpEff = Math.min(lumpGross, gRoom, tRoom);
        if (lumpEff > 0) growthCum += lumpEff;
        if (lumpEff < lumpGross) {
          lumpTruncations.push({ age: Math.round(age * 10) / 10, shortfall: lumpGross - lumpEff });
        }
      }

      if (growthMaxedAge === null && growthCum >= NISA_LIMITS.growthLifetime - 1) growthMaxedAge = age;
      if (totalMaxedAge === null && tsumitateCum + growthCum >= NISA_LIMITS.totalLifetime - 1) totalMaxedAge = age;

      const contribution = effGrowth + effTsumitate + lumpEff;

      allFundEntries.forEach((f) => {
        const r = monthlyRate(f.returnPct);
        funds[f.id] = funds[f.id] * (1 + r) + contribution * (f.pct / 100);
      });
      // 退職前にiDeCo一時金を受け取った場合も、使用可能な現金として保持する。
      if (extraSpendableLump > 0) {
        funds.__ideco_cash__ = (funds.__ideco_cash__ || 0) + extraSpendableLump;
      }
    } else {
      let total = Object.values(funds).reduce((s, v) => s + v, 0);
      const r = monthlyRate(postRetireReturn);
      total = total * (1 + r);
      // 受取開始月に一度だけ、iDeCo一時金を生活費に使える資産へ移す。
      total += extraSpendableLump;
      const healthMonthly = healthAnnualCost(age, healthBrackets) / 12;
      const privatePensionIncome = (privatePensionPlans || []).reduce(
        (s, pl) => (age >= pl.payoutFromAge && age <= pl.payoutToAge ? s + (pl.monthlyPayout || 0) : s),
        0
      );
      // 追加収入（iDeCo年金受取分など）：未指定なら0のため、既存の計算結果に一切影響しない
      const extraIncome = typeof extraRetirementIncomeMonthly === "function" ? extraRetirementIncomeMonthly(age) : 0;
      const netOutflow = livingCostMonthly + healthMonthly - pensionMonthly - privatePensionIncome - extraIncome;
      total -= netOutflow;
      if (total < 0) {
        if (depletionAge === null) depletionAge = age;
        total = 0;
      }
      // lump-sum investment during decumulation (e.g. retirement bonus reinvested)
      if (lumpGross > 0) {
        const gRoom = Math.max(0, NISA_LIMITS.growthLifetime - growthCum);
        const tRoom = Math.max(0, NISA_LIMITS.totalLifetime - (tsumitateCum + growthCum));
        const lumpEff = Math.min(lumpGross, gRoom, tRoom);
        if (lumpEff > 0) growthCum += lumpEff;
        if (lumpEff < lumpGross) {
          lumpTruncations.push({ age: Math.round(age * 10) / 10, shortfall: lumpGross - lumpEff });
        }
        total += lumpEff;
      }
      // collapse into a single post-retirement bucket for simplicity so chart total stays coherent
      funds = { __cash__: total };
    }

    if (Math.abs(age - retireAge) < (1 / 24) && assetsAtRetire === null) {
      assetsAtRetire = Object.values(funds).reduce((s, v) => s + v, 0);
    }

    if (m % 12 === 0) {
      const total = Object.values(funds).reduce((s, v) => s + v, 0);
      peakAssets = Math.max(peakAssets, total);
      yearly.push({
        age: Math.round(age),
        total,
        funds: { ...funds },
        phase: inAccumulation ? (phaseAccumLabel || "積立期") : (phaseDrawdownLabel || "取崩期"),
        tsumitateCum,
        growthCum,
      });
    }
  }

  const finalAssets = yearly.length ? yearly[yearly.length - 1].total : 0;
  if (assetsAtRetire === null) assetsAtRetire = finalAssets;

  return {
    yearly,
    finalAssets,
    assetsAtRetire,
    depletionAge,
    peakAssets,
    inheritanceGap: finalAssets - inheritanceTarget,
    tsumitateCum,
    growthCum,
    growthMaxedAge,
    totalMaxedAge,
    lumpTruncations,
  };
}

// ---------- gold (純金積立) simulation ----------
export function runGoldSimulation({ currentAge, deathAge, gold }) {
  const { currentGrams, pricePerGram, priceGrowthPct, monthlyYen, accumulateUntilAge, asOfAge } = gold;
  const r = monthlyRate(priceGrowthPct);

  // 「基準年齢」時点の保有量（currentGrams）を、基準年齢〜現在の年齢まで
  // 毎月積立を加算しながら複利成長させ、"現在"時点の実際の保有量・評価額を算出する
  let grams = currentGrams;
  let price = pricePerGram;
  if (asOfAge !== null && asOfAge !== undefined && asOfAge < currentAge) {
    const catchUpMonths = Math.max(0, Math.round((currentAge - asOfAge) * 12));
    for (let m = 1; m <= catchUpMonths; m++) {
      const age = asOfAge + m / 12;
      if (age < accumulateUntilAge && monthlyYen > 0 && price > 0) {
        grams += monthlyYen / price;
      }
      price = price * (1 + r);
    }
  }
  const currentValue = grams * price; // 現在の日付時点での金資産評価額

  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const yearly = [{ age: Math.round(currentAge), grams, price, value: grams * price }];
  let valueAtTarget = currentAge >= accumulateUntilAge ? grams * price : null;

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    // その月の積立は「月初の価格」で購入する
    if (age < accumulateUntilAge && monthlyYen > 0 && price > 0) {
      grams += monthlyYen / price;
    }
    // 【修正】その月の価格上昇を反映してから年次データへ記録・評価する。
    // （記録が先だと、各年の評価額が1ヶ月分古い価格で計算されていた）
    price = price * (1 + r);
    if (m % 12 === 0) {
      yearly.push({ age: Math.round(age), grams, price, value: grams * price });
    }
    if (valueAtTarget === null && age >= accumulateUntilAge) {
      valueAtTarget = grams * price;
    }
  }
  const finalValue = yearly.length ? yearly[yearly.length - 1].value : grams * price;
  if (valueAtTarget === null) valueAtTarget = finalValue;

  return { yearly, finalGrams: grams, finalValue, valueAtTarget, currentValue, currentGrams: grams };
}

// ---------- bank savings (銀行別) simulation ----------
export function runBankSimulation({ currentAge, retireAge, deathAge, banks }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const balances = banks.map((b) => b.balance);
  const initialBankRow = { age: Math.round(currentAge), total: balances.reduce((sum, value) => sum + value, 0) };
  banks.forEach((b, i) => { initialBankRow[`bank_${i}`] = balances[i]; });
  const yearly = [initialBankRow];

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    banks.forEach((b, i) => {
      const r = monthlyRate(b.interestPct || 0);
      balances[i] = balances[i] * (1 + r);
      if (age < retireAge) balances[i] += b.monthlyDeposit || 0;
    });
    if (m % 12 === 0) {
      const row = { age: Math.round(age), total: balances.reduce((s, v) => s + v, 0) };
      banks.forEach((b, i) => { row[`bank_${i}`] = balances[i]; });
      yearly.push(row);
    }
  }
  const totalNow = banks.reduce((s, b) => s + b.balance, 0);
  const totalFinal = yearly.length ? yearly[yearly.length - 1].total : totalNow;
  const totalAtRetire = yearly.find((y) => y.age >= retireAge)?.total ?? totalFinal;

  return { yearly, totalNow, totalAtRetire, totalFinal };
}

// ---------- individual stock portfolio (保有中の個別株) ----------
export function runStockSim({ currentAge, deathAge, totalValue, returnPct }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const r = monthlyRate(returnPct);
  let value = totalValue;
  const yearly = [{ age: Math.round(currentAge), value }];
  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    // 【修正】その月の運用益を反映してから年次データへ記録する。
    // （記録が先だと、各年のデータが1ヶ月分だけ古い値になり、最終評価額も1ヶ月分少なくなっていた）
    value = value * (1 + r);
    if (m % 12 === 0) yearly.push({ age: Math.round(age), value });
  }
  return { yearly, finalValue: yearly.length ? yearly[yearly.length - 1].value : totalValue };
}

// ---------- loan repayment (借入金返済シミュレーション) ----------
function simpleMonthlyRate(annualPct) {
  return (annualPct || 0) / 1200;
}
export function runLoanSimulation({ currentAge, deathAge, loans }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const balances = loans.map((l) => l.principal);
  const payoffAges = loans.map(() => null);
  const initialLoanRow = { age: Math.round(currentAge), total: balances.reduce((sum, value) => sum + value, 0) };
  loans.forEach((l, i) => { initialLoanRow[`loan_${i}`] = balances[i]; });
  const yearly = [initialLoanRow];

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    loans.forEach((l, i) => {
      if (balances[i] > 0) {
        const interest = balances[i] * simpleMonthlyRate(l.annualRatePct);
        balances[i] = balances[i] + interest - (l.monthlyPayment || 0);
        if (balances[i] <= 0) {
          balances[i] = 0;
          if (payoffAges[i] === null) payoffAges[i] = age;
        }
      }
    });
    if (m % 12 === 0) {
      const row = { age: Math.round(age), total: balances.reduce((s, v) => s + v, 0) };
      loans.forEach((l, i) => { row[`loan_${i}`] = balances[i]; });
      yearly.push(row);
    }
  }
  const totalNow = loans.reduce((s, l) => s + l.principal, 0);
  const totalFinal = yearly.length ? yearly[yearly.length - 1].total : totalNow;

  return { yearly, totalNow, totalFinal, payoffAges };
}

// ---------- 生命保険：払込期間中の保険料を累計（将来資産から控除するため） ----------
export function runInsuranceSimulation({ currentAge, deathAge, policies }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  let cumulative = 0;
  const yearly = [{ age: Math.round(currentAge), total: 0 }];
  let cumulativeAtCurrentAge = 0;

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    (policies || []).forEach((p) => {
      if (age >= p.premiumFromAge && age <= p.premiumToAge) {
        cumulative += p.monthlyPremium || 0;
      }
    });
    if (m % 12 === 0) yearly.push({ age: Math.round(age), total: cumulative });
  }
  const totalFinal = yearly.length ? yearly[yearly.length - 1].total : cumulative;
  return { yearly, totalFinal, cumulativeAtCurrentAge };
}

// ---------- 民間年金積立：積立期間で貯め、受給期間で取り崩す個人年金のシミュレーション ----------
export function runPrivatePensionSimulation({ currentAge, deathAge, plans }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  // 現在の年齢より前（例：35歳〜現在）にすでに積み立ててきた分を遡って開始残高に反映する。
  // ただし、証書などで実際の現在残高が手入力されている場合はそちらを優先する。
  const balances = (plans || []).map((pl) => {
    if (pl.currentBalance !== null && pl.currentBalance !== undefined) {
      return pl.currentBalance;
    }
    const priorContribEndAge = Math.min(pl.contribToAge, currentAge);
    const priorContribMonths = Math.max(0, Math.round((priorContribEndAge - pl.contribFromAge) * 12));
    return priorContribMonths * (pl.monthlyContribution || 0);
  });
  const initialPrivatePensionRow = { age: Math.round(currentAge), total: balances.reduce((sum, value) => sum + value, 0) };
  (plans || []).forEach((pl, i) => { initialPrivatePensionRow[`pension_${i}`] = balances[i]; });
  const yearly = [initialPrivatePensionRow];

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    (plans || []).forEach((pl, i) => {
      if (age >= pl.contribFromAge && age <= pl.contribToAge) {
        balances[i] += pl.monthlyContribution || 0;
      }
      if (age >= pl.payoutFromAge && age <= pl.payoutToAge) {
        balances[i] = Math.max(0, balances[i] - (pl.monthlyPayout || 0));
      }
    });
    if (m % 12 === 0) {
      const row = { age: Math.round(age), total: balances.reduce((s, v) => s + v, 0) };
      (plans || []).forEach((pl, i) => { row[`pension_${i}`] = balances[i]; });
      yearly.push(row);
    }
  }
  const totalFinal = yearly.length ? yearly[yearly.length - 1].total : 0;
  return { yearly, totalFinal, totalNow: yearly[0] ? yearly[0].total : 0 };
}

// ---------- iDeCo（個人型確定拠出年金）シミュレーション ----------
// NISAの計算式（runSimulation）は変更していません。iDeCo専用の計算関数として独立させています。
// 受取開始年齢までは生活費に使わず増やすだけ。受取開始後は受取方法に応じて、
// 一時金は「使用可能資産へ一度だけ加算」、年金は「受取期間中、年間収入へ加算」します。
function levelMonthlyPayment(principal, annualRatePct, years) {
  const safePrincipal = Math.max(0, Number(principal) || 0);
  const safeYears = Math.max(1, Number(years) || 1);
  const months = Math.max(1, Math.round(safeYears * 12));
  const r = monthlyRate(Number(annualRatePct) || 0);
  if (Math.abs(r) < 1e-12) return safePrincipal / months;
  return (safePrincipal * r) / (1 - Math.pow(1 + r, -months));
}

export function runIdecoSimulation({ currentAge, deathAge, ideco }) {
  const {
    currentValue, monthlyContribution, startAge, endAge, returnPct,
    payoutStartAge, payoutMethod, payoutYears, lumpPortionPct, payoutReturnPct, asOfAge,
  } = ideco;

  // 「現在評価額」の基準年齢が設定されていれば、基準年齢〜現在の年齢まで
  // 掛金を加算しながら複利成長させ、"現在"時点の実際の評価額を算出する（金・NISAと同じ考え方）
  const accRPre = monthlyRate(returnPct);
  let currentValueAdjusted = currentValue || 0;
  if (asOfAge !== null && asOfAge !== undefined && asOfAge < currentAge) {
    const catchUpMonths = Math.max(0, Math.round((currentAge - asOfAge) * 12));
    for (let m = 1; m <= catchUpMonths; m++) {
      const age = asOfAge + m / 12;
      const contributing = age >= startAge && age < endAge;
      const contribution = contributing ? (monthlyContribution || 0) : 0;
      currentValueAdjusted = currentValueAdjusted * (1 + accRPre) + contribution;
    }
  }

  // 既存データ（新項目未設定の場合）でもエラーにならないよう安全な既定値を使用
  const safePayoutYears = Math.max(1, Number(payoutYears) || 10);
  const safeLumpPct = Math.min(1, Math.max(0, Number(lumpPortionPct ?? 50) / 100));
  const safePayoutReturn = Number(payoutReturnPct) || 0;

  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const accR = monthlyRate(returnPct);
  let value = currentValueAdjusted;
  let contributedSinceNow = 0;

  let valueAtPayout = null;
  let lumpAmount = 0;      // 受取開始年に一度だけ「使用可能資産」へ加算される金額
  let annualPayout = 0;    // 受取期間中、毎年「年間収入」へ加算される金額
  let payoutEndAge = payoutStartAge;

  const yearly = [{
    age: Math.round(currentAge),
    value,
    lumpAmount: 0,
    annualIncomeThisYear: 0,
  }];

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;

    if (age < payoutStartAge) {
      // 受取開始前：掛金を積み立てて運用するだけ（生活費には使用しない）
      const contributing = age >= startAge && age < endAge;
      const contribution = contributing ? (monthlyContribution || 0) : 0;
      value = value * (1 + accR) + contribution;
      if (contributing) contributedSinceNow += contribution;
    } else {
      if (valueAtPayout === null) {
        valueAtPayout = value;
        if (payoutMethod === "lump") {
          lumpAmount = valueAtPayout;
          annualPayout = 0;
          value = 0;
          payoutEndAge = payoutStartAge;
        } else if (payoutMethod === "pension") {
          lumpAmount = 0;
          annualPayout = levelMonthlyPayment(valueAtPayout, safePayoutReturn, safePayoutYears) * 12;
          payoutEndAge = payoutStartAge + safePayoutYears;
        } else {
          // 併用：指定割合を一時金、残りを年金原資として指定年数で分割
          lumpAmount = valueAtPayout * safeLumpPct;
          const pensionBase = valueAtPayout * (1 - safeLumpPct);
          annualPayout = levelMonthlyPayment(pensionBase, safePayoutReturn, safePayoutYears) * 12;
          payoutEndAge = payoutStartAge + safePayoutYears;
          value = pensionBase;
        }
      }
      if (age < payoutEndAge && annualPayout > 0) {
        const payR = monthlyRate(safePayoutReturn);
        value = Math.max(0, value * (1 + payR) - annualPayout / 12);
      } else if (age >= payoutEndAge) {
        value = 0;
      }
    }

    if (m % 12 === 0) {
      const inPayoutPeriod = age >= payoutStartAge && age < payoutEndAge;
      yearly.push({
        age: Math.round(age),
        value,
        lumpAmount, // 一度だけ加算する金額（表示・加算判定は呼び出し側でage===payoutStartAgeの年にのみ使用）
        annualIncomeThisYear: inPayoutPeriod ? annualPayout : 0,
      });
    }
  }

  return {
    yearly,
    finalValue: yearly.length ? yearly[yearly.length - 1].value : value,
    valueAtPayout,
    lumpAmount,
    annualPayout,
    payoutStartAge,
    payoutEndAge,
    contributedSinceNow,
    currentValueAdjusted,
  };
}

// ---------- default watchlist ----------
// 以前はサンプルの保有銘柄を初期表示していたが、初回起動時の画面を完全に空にするため、
// 日本・アメリカとも初期候補は空リストにしている。銘柄は「追加」ボタンから自由に登録できる。
// （参考：以前の日本版サンプル銘柄は 東京エレクトロン／アドバンテスト／信越化学工業／東京応化工業／
//  ローム／ファナック／安川電機／ダイキン工業／三菱重工業／INPEX。米国版サンプル銘柄は
//  Apple／Microsoft／NVIDIA／Amazon／Alphabet／Tesla／Berkshire Hathaway／JPMorgan Chase。
//  再度サンプルを表示したい場合は、この配列にオブジェクトを追加すればよい。）
const DEFAULT_WATCHLIST_JP = [];
const DEFAULT_WATCHLIST_US = [];
const DEFAULT_WATCHLIST_GB = [];
const DEFAULT_WATCHLIST_CA = [];
const DEFAULT_WATCHLIST_AU = [];

// 既存の呼び出し箇所（初期状態の既定値）との後方互換のための別名。
const DEFAULT_WATCHLIST = DEFAULT_WATCHLIST_JP;

function defaultWatchlistFor(country) {
  if (country === "US") return DEFAULT_WATCHLIST_US;
  if (country === "GB") return DEFAULT_WATCHLIST_GB;
  if (country === "CA") return DEFAULT_WATCHLIST_CA;
  if (country === "AU") return DEFAULT_WATCHLIST_AU;
  return DEFAULT_WATCHLIST_JP;
}

// ---------- UI atoms ----------
// ---------- 入力ガイド（「?」ボタンを押すと、何を入力する欄なのかが開く） ----------
// 金額の入力欄・入力ブロックの見出しの隣に置き、迷わず入力できるようにする。
// 計算やデータ構造には一切関与しない、表示専用のUI部品。
function GuideButton({ open, onToggle }) {
  const { t } = useContext(LocaleContext);
  return (
    <button
      type="button"
      className={`guide-btn ${open ? "guide-btn-open" : ""}`}
      aria-label={t("guideButtonLabel")}
      aria-expanded={open}
      title={t("guideButtonLabel")}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
    >
      ?
    </button>
  );
}

// 入力ブロックの見出し（例：「積立枠の保有銘柄」）にガイドを付けるためのラッパー。
// <GuideLabel guide={t("...Guide")}>{t("...Label")}</GuideLabel> の形で使う。
// セクション見出しの直下に置く、単独のガイドボタン（テーブル形式のセクション用）
function SectionGuide({ guide }) {
  const { t } = useContext(LocaleContext);
  const [open, setOpen] = useState(false);
  if (!guide) return null;
  return (
    <div style={{ marginBottom: 10, marginTop: -4 }}>
      <button
        type="button"
        className={`section-guide-btn ${open ? "guide-btn-open" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="guide-btn" aria-hidden="true">?</span>
        <span>{t("guideButtonLabel")}</span>
      </button>
      {open && <div className="guide-text">{guide}</div>}
    </div>
  );
}

function GuideLabel({ children, guide, style }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 6, ...(style || {}) }}>
      <div className="field-label-row">
        <span className="field-label">{children}</span>
        {guide && <GuideButton open={open} onToggle={() => setOpen((v) => !v)} />}
      </div>
      {guide && open && <div className="guide-text">{guide}</div>}
    </div>
  );
}

// NISA合計の見出し（span内に置くため、GuideLabelとは別に用意した専用のガイド）
function NisaTotalGuide() {
  const { t } = useContext(LocaleContext);
  const [open, setOpen] = useState(false);
  return (
    <>
      <GuideButton open={open} onToggle={() => setOpen((v) => !v)} />
      {open && <span className="guide-text">{t("nisaTotalGuide")}</span>}
    </>
  );
}

function Field({ label, unit, value, onChange, step = 1, min = 0, max, mono = true, disabled = false, guide }) {
  const [showGuide, setShowGuide] = useState(false);
  return (
    <label className="field">
      <span className="field-label-row">
        <span className="field-label">{label}</span>
        {guide && <GuideButton open={showGuide} onToggle={() => setShowGuide((v) => !v)} />}
      </span>
      {guide && showGuide && <span className="guide-text">{guide}</span>}
      <div className="field-input-wrap">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          onFocus={(e) => e.target.select()}
          className={mono ? "mono" : ""}
        />
        {unit && <span className="field-unit">{unit}</span>}
      </div>
    </label>
  );
}

// 年齢の「歳＋ヶ月」表示は、言語設定を必要とするためコンポーネント内のformatAge（下記）で行う。

// 年齢を「歳」と「ヶ月」の2つの入力欄に分けて、小数の年齢値として扱う
function AgeField({ label, value, onChange, disabled, guide }) {
  const { t } = useContext(LocaleContext);
  const [showGuide, setShowGuide] = useState(false);
  const years = Math.floor(value + 1e-9);
  const months = Math.round((value - years) * 12);
  const commit = (y, m) => {
    let yy = y, mm = m;
    if (mm >= 12) { yy += Math.floor(mm / 12); mm = mm % 12; }
    if (mm < 0) { mm = 0; }
    onChange(yy + mm / 12);
  };
  return (
    <label className="field">
      <span className="field-label-row">
        <span className="field-label">{label}</span>
        {guide && <GuideButton open={showGuide} onToggle={() => setShowGuide((v) => !v)} />}
      </span>
      {guide && showGuide && <span className="guide-text">{guide}</span>}
      <div style={{ display: "flex", gap: 6 }}>
        <div className="field-input-wrap" style={{ flex: 1 }}>
          <input type="number" className="mono" value={years} disabled={disabled} onChange={(e) => commit(Number(e.target.value), months)} onFocus={(e) => e.target.select()} />
          <span className="field-unit">{t("unitYears")}</span>
        </div>
        <div className="field-input-wrap" style={{ flex: 1 }}>
          <input type="number" className="mono" min={0} max={11} value={months} disabled={disabled} onChange={(e) => commit(years, Number(e.target.value))} onFocus={(e) => e.target.select()} />
          <span className="field-unit">{t("unitMonths")}</span>
        </div>
      </div>
    </label>
  );
}

// 追加フォーム用の小型「歳＋ヶ月」入力（2つの数値を親のuseState断片として管理）
function AgeYMInput({ years, months, onYears, onMonths, placeholder }) {
  const { t } = useContext(LocaleContext);
  const inputStyle = {
    width: "50%",
    background: "var(--panel-2)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    padding: "7px 9px",
    borderRadius: 3,
    fontSize: 12,
    outline: "none",
  };
  return (
    <div style={{ display: "flex", gap: 4, flex: 1 }}>
      <input
        type="number" placeholder={`${placeholder}${t("unitYearsShort")}`} value={years}
        onChange={(e) => onYears(e.target.value)}
        onFocus={(e) => e.target.select()}
        style={inputStyle}
      />
      <input
        type="number" placeholder={t("unitMonths")} min={0} max={11} value={months}
        onChange={(e) => onMonths(e.target.value)}
        onFocus={(e) => e.target.select()}
        style={inputStyle}
      />
    </div>
  );
}

// 常に表示されるラベル付き入力（placeholderは入力すると消えてしまい何の欄か分からなくなるため、
// ラベルを別要素として常時表示する）
function LabeledMiniInput({ label, value, onChange, type = "number" }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: "#7C8A90", marginBottom: 2 }}>{label}</div>
      <input type={type} value={value} onChange={onChange} style={{ width: "100%" }} />
    </div>
  );
}

// 保険の保障内容に、任意の項目名と金額を自由に追加できる小さな編集フォーム
function CustomBenefitEditor({ onAdd }) {
  const { t } = useContext(LocaleContext);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <div className="add-row" style={{ marginTop: 6 }}>
      <input placeholder={t("customBenefitNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder={t("amountPlaceholder")} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button
        className="add-btn"
        onClick={() => {
          if (!name.trim()) return;
          onAdd(name.trim(), Number(amount) || 0);
          setName("");
          setAmount("");
        }}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

const PIE_COLORS = ["#4FA8D8", "#D9A54F", "#8FBF7F", "#B08FD6", "#C2694F", "#7BC9E0", "#E6B0A6", "#6FA88A"];

// 銘柄別の内訳（金額を入れると割合を自動計算し、円グラフで表示）
// 円グラフ＋棒グラフ（同じitems/合計から生成するので常に連動する）。編集UIを持たない読み取り専用版。
function AllocationCharts({ items, height = 180 }) {
  const { money, t } = useContext(LocaleContext);
  const total = items.reduce((s, it) => s + (it.amount || 0), 0);
  if (total <= 0) return null;
  const renderPieLabel = ({ cx, cy, midAngle, outerRadius, percent, name, value }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 4;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#B7C2C7" fontSize={7.5} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
        {`${name} ${money(value)}（${(percent * 100).toFixed(0)}%）`}
      </text>
    );
  };
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={items} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={65}
            label={renderPieLabel}
            labelLine={false}
          >
            {items.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => money(v)} contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={Math.max(90, items.length * 32)}>
        <BarChart
          data={items.map((it) => ({ name: it.name, pct: (it.amount / total) * 100, amount: it.amount }))}
          layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}
        >
          <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} stroke="#7C8A90" fontSize={10} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="name" stroke="#7C8A90" fontSize={10} width={90} />
          <Tooltip
            formatter={(v, n, p) => (n === "pct" ? [`${v.toFixed(1)}% (${money(p.payload.amount)})`, t("colPercent")] : [money(v), n])}
            contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }}
          />
          <Bar dataKey="pct" radius={[0, 2, 2, 0]}>
            {items.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            <LabelList
              dataKey="amount"
              position="right"
              formatter={(v) => money(v)}
              style={{ fill: "#E7ECEE", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function AllocationBreakdown({ items, newItem, onNewItemChange, onAdd, onRemove, onUpdate }) {
  const { t } = useContext(LocaleContext);
  const total = items.reduce((s, it) => s + (it.amount || 0), 0);
  return (
    <div>
      {items.length > 0 && (
        <table className="watchlist" style={{ marginBottom: 8 }}>
          <thead><tr><th>{t("colName")}</th><th>{t("colAmount")}</th><th>{t("colPercent")}</th><th></th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="inline-num" value={it.name}
                    onChange={(e) => onUpdate(i, "name", e.target.value)}
                  />
                </td>
                <td style={{ width: 96 }}>
                  <input
                    type="number" className="inline-num" value={it.amount}
                    onChange={(e) => onUpdate(i, "amount", Number(e.target.value))}
                  />
                </td>
                <td className="mono" style={{ width: 52 }}>{total > 0 ? `${((it.amount / total) * 100).toFixed(1)}%` : "—"}</td>
                <td style={{ width: 24 }}>
                  <button className="del-btn" onClick={() => onRemove(i)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="add-row" style={{ marginBottom: total > 0 ? 8 : 0 }}>
        <input placeholder={t("holdingNamePlaceholder")} value={newItem.name} onChange={(e) => onNewItemChange({ ...newItem, name: e.target.value })} />
        <input placeholder={t("amountPlaceholder")} type="number" value={newItem.amount} onChange={(e) => onNewItemChange({ ...newItem, amount: e.target.value })} />
        <button className="add-btn" onClick={onAdd}><Plus size={15} /></button>
      </div>
      <AllocationCharts items={items} />
    </div>
  );
}

// ---------- アメリカ選択時：投資口座パネル（401(k) / Traditional IRA / Roth IRA / Brokerage） ----------
// JP側のNISA関連ステート・計算（tsumitateSchedule, NISA_LIMITS, runSimulation等）とは
// 完全に独立している。計算ロジックは US_COUNTRY_RULES.investment の純粋関数のみを使用する。
function USInvestmentAccountsPanel({ usInvestment, onUpdate, onUpdateAccount, age, investmentRules, taxRules, taxResult }) {
  const { t, money } = useContext(LocaleContext);
  const fs = usInvestment.filingStatus;
  const magi = Number(usInvestment.modifiedAGI) || 0;

  const k401Limit = investmentRules.get401kEmployeeLimit(age);
  const k401Combined = investmentRules.get401kCombinedLimit(age);
  const k401Contribution = Number(usInvestment.k401.annualContribution) || 0;
  const k401Remaining = k401Limit - k401Contribution;

  const iraLimit = investmentRules.getIraContributionLimit(age);
  const traditionalContribution = Number(usInvestment.traditionalIra.annualContribution) || 0;
  const rothContribution = Number(usInvestment.rothIra.annualContribution) || 0;
  const combinedIraContribution = traditionalContribution + rothContribution;
  const iraRemaining = iraLimit - combinedIraContribution;

  const deductibleFraction = investmentRules.getTraditionalIraDeductibleFraction({
    filingStatus: fs,
    magi,
    coveredByWorkplacePlan: usInvestment.coveredByWorkplacePlan,
    spouseCoveredByWorkplacePlan: usInvestment.spouseCoveredByWorkplacePlan,
  });
  const traditionalDeductibleAmount = traditionalContribution * deductibleFraction;

  const rothEligibleFraction = investmentRules.getRothIraEligibleFraction(fs, magi);
  const rothAllowedContribution = iraLimit * rothEligibleFraction;
  const rothOverEligible = rothContribution > rothAllowedContribution + 0.01;

  const brokerageValue = Number(usInvestment.brokerage.currentValue) || 0;
  const brokerageContribution = Number(usInvestment.brokerage.annualContribution) || 0;

  const liquidRestricted = investmentRules.splitLiquidRestricted(age, {
    k401: usInvestment.k401.currentValue,
    traditionalIra: usInvestment.traditionalIra.currentValue,
    rothIra: usInvestment.rothIra.currentValue,
    brokerage: usInvestment.brokerage.currentValue,
  });

  return (
    <div>
      <div className="note" style={{ marginBottom: 14 }}>
        <Info size={13} />
        <span>{t("usInvestmentSourceNote")}</span>
      </div>

      <div className="field-label" style={{ marginBottom: 6 }}>{t("usFilingStatusLabel")}</div>
      <div className="add-row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { key: "single", label: t("usFilingSingle") },
          { key: "marriedJoint", label: t("usFilingMarriedJoint") },
          { key: "marriedSeparate", label: t("usFilingMarriedSeparate") },
          { key: "headOfHousehold", label: t("usFilingHoh") },
        ].map((opt) => (
          <button
            key={opt.key}
            onClick={() => onUpdate("filingStatus", opt.key)}
            style={{
              flex: "1 1 auto", padding: "8px 8px", borderRadius: 4, fontSize: 12, cursor: "pointer",
              border: fs === opt.key ? "1px solid #4FA8D8" : "1px solid var(--line)",
              background: fs === opt.key ? "rgba(79,168,216,0.15)" : "var(--panel)",
              color: fs === opt.key ? "#4FA8D8" : "var(--text)",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <Field
        guide={t("usModifiedAGIGuide")}
        label={t("usModifiedAGILabel")} unit="$" step={1000}
        value={usInvestment.modifiedAGI}
        onChange={(v) => onUpdate("modifiedAGI", v)}
      />
      <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox" checked={usInvestment.coveredByWorkplacePlan}
          onChange={(e) => onUpdate("coveredByWorkplacePlan", e.target.checked)}
        />
        <span className="field-label" style={{ margin: 0 }}>{t("usCoveredByPlanLabel")}</span>
      </label>
      {fs === "marriedJoint" && (
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox" checked={usInvestment.spouseCoveredByWorkplacePlan}
            onChange={(e) => onUpdate("spouseCoveredByWorkplacePlan", e.target.checked)}
          />
          <span className="field-label" style={{ margin: 0 }}>{t("usSpouseCoveredByPlanLabel")}</span>
        </label>
      )}

      <div className="section-block" style={{ borderColor: "#4FA8D8", marginTop: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t("us401kLabel")}</div>
        <Field guide={t("usCurrentBalanceGuide")} label={t("currentBalancePlaceholder")} unit="$" step={1000} value={usInvestment.k401.currentValue} onChange={(v) => onUpdateAccount("k401", "currentValue", v)} />
        <Field guide={t("usAnnualContributionGuide")} label={t("usAnnualContributionLabel")} unit="$" step={500} value={usInvestment.k401.annualContribution} onChange={(v) => onUpdateAccount("k401", "annualContribution", v)} />
        <div className="stat-sub">{t("usEmployeeLimitLabel")}：<span className="mono">{money(k401Limit)}</span></div>
        <div className="stat-sub">{t("usCombinedLimitLabel")}：<span className="mono">{money(k401Combined)}</span></div>
        <div className="stat-sub" style={{ color: k401Remaining < 0 ? "#C2694F" : "#7C8A90" }}>
          {k401Remaining >= 0
            ? t("usRemainingLabel", { amount: money(k401Remaining) })
            : t("usOverLimitLabel", { amount: money(-k401Remaining) })}
        </div>
      </div>

      <div className="section-block" style={{ borderColor: "#D9A54F", marginTop: 12 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t("usTraditionalIraLabel")}</div>
        <Field guide={t("usCurrentBalanceGuide")} label={t("currentBalancePlaceholder")} unit="$" step={500} value={usInvestment.traditionalIra.currentValue} onChange={(v) => onUpdateAccount("traditionalIra", "currentValue", v)} />
        <Field guide={t("usAnnualContributionGuide")} label={t("usAnnualContributionLabel")} unit="$" step={100} value={usInvestment.traditionalIra.annualContribution} onChange={(v) => onUpdateAccount("traditionalIra", "annualContribution", v)} />
        <div className="stat-sub">{t("usIraSharedLimitLabel")}：<span className="mono">{money(iraLimit)}</span></div>
        <div className="stat-sub">{t("usDeductibleAmountLabel")}：<span className="mono">{money(traditionalDeductibleAmount)}</span></div>
        {deductibleFraction < 1 && deductibleFraction > 0 && (
          <div className="stat-sub" style={{ color: "#D9A54F" }}>{t("usPartialDeductionNote")}</div>
        )}
        {deductibleFraction === 0 && traditionalContribution > 0 && (
          <div className="stat-sub" style={{ color: "#C2694F" }}>{t("usNoDeductionNote")}</div>
        )}
      </div>

      <div className="section-block" style={{ borderColor: "#8FBF7F", marginTop: 12 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t("usRothIraLabel")}</div>
        <Field guide={t("usCurrentBalanceGuide")} label={t("currentBalancePlaceholder")} unit="$" step={500} value={usInvestment.rothIra.currentValue} onChange={(v) => onUpdateAccount("rothIra", "currentValue", v)} />
        <Field guide={t("usAnnualContributionGuide")} label={t("usAnnualContributionLabel")} unit="$" step={100} value={usInvestment.rothIra.annualContribution} onChange={(v) => onUpdateAccount("rothIra", "annualContribution", v)} />
        <div className="stat-sub">{t("usIraSharedLimitLabel")}：<span className="mono">{money(iraLimit)}</span></div>
        <div className="stat-sub">{t("usRothAllowedLabel")}：<span className="mono">{money(rothAllowedContribution)}</span></div>
        {rothEligibleFraction === 0 && (
          <div className="stat-sub" style={{ color: "#C2694F" }}>{t("usRothIneligibleNote")}</div>
        )}
        {rothEligibleFraction > 0 && rothEligibleFraction < 1 && (
          <div className="stat-sub" style={{ color: "#D9A54F" }}>{t("usRothPartialNote")}</div>
        )}
        {rothOverEligible && (
          <div className="stat-sub" style={{ color: "#C2694F" }}>{t("usRothOverEligibleNote")}</div>
        )}
      </div>

      <div className="note" style={{ marginTop: 12 }}>
        <Info size={13} />
        <span>{t("usIraCombinedNote", { amount: money(iraRemaining >= 0 ? iraRemaining : 0) })}</span>
      </div>
      {combinedIraContribution > iraLimit && (
        <div className="note" style={{ borderLeftColor: "#C2694F" }}>
          <Info size={13} style={{ color: "#C2694F" }} />
          <span>{t("usOverLimitLabel", { amount: money(combinedIraContribution - iraLimit) })}</span>
        </div>
      )}

      <div className="section-block" style={{ borderColor: "#B08FD6", marginTop: 12 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t("usBrokerageLabel")}</div>
        <Field guide={t("usCurrentBalanceGuide")} label={t("currentBalancePlaceholder")} unit="$" step={1000} value={usInvestment.brokerage.currentValue} onChange={(v) => onUpdateAccount("brokerage", "currentValue", v)} />
        <Field guide={t("usAnnualContributionGuide")} label={t("usAnnualContributionLabel")} unit="$" step={500} value={usInvestment.brokerage.annualContribution} onChange={(v) => onUpdateAccount("brokerage", "annualContribution", v)} />
        <div className="stat-sub">{t("usBrokerageNoLimitNote")}</div>
      </div>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <StatCard label={t("usTotalInvestmentLabel")} value={money(Number(usInvestment.k401.currentValue || 0) + Number(usInvestment.traditionalIra.currentValue || 0) + Number(usInvestment.rothIra.currentValue || 0) + brokerageValue)} sub={t("usTotalInvestmentSub")} />
      </div>
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("usLiquidAssetsLabel")} value={money(liquidRestricted.liquid)} sub={t("usLiquidAssetsSub")} tone="good" />
        <StatCard
          label={t("usRestrictedAssetsLabel")}
          value={money(liquidRestricted.restricted)}
          sub={liquidRestricted.isAccessibleAge ? t("usRestrictedAssetsSubOver595") : t("usRestrictedAssetsSubUnder595")}
        />
      </div>
      <div className="note" style={{ marginTop: 10 }}>
        <Info size={13} />
        <span>{t("usEarlyWithdrawalWarning")}</span>
      </div>

      <div className="section-block" style={{ borderColor: "#5FB0A0", marginTop: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t("usTaxSectionLabel")}</div>
        <div className="note" style={{ marginBottom: 12 }}>
          <Info size={13} />
          <span>{t("usTaxSourceNote")}</span>
        </div>
        <Field guide={t("usStateTaxRateGuide")} label={t("usStateTaxRateLabel")} unit="%" step={0.5} value={usInvestment.stateTaxRatePct} onChange={(v) => onUpdate("stateTaxRatePct", v)} />
        <Field guide={t("usCapitalGainGuide")} label={t("usCapitalGainLabel")} unit="$" step={1000} value={usInvestment.estimatedCapitalGainAnnual} onChange={(v) => onUpdate("estimatedCapitalGainAnnual", v)} />
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <StatCard label={t("usFederalTaxLabel")} value={money(taxResult.federalTax)} sub={t("usTaxableIncomeSub", { amount: money(taxResult.taxableIncome) })} />
          <StatCard label={t("usCapGainsTaxLabel")} value={money(taxResult.ltcgTax)} sub={t("usCapGainsTaxSub")} />
          <StatCard label={t("usNiitLabel")} value={money(taxResult.niit)} sub={t("usNiitSub")} />
          <StatCard label={t("usStateTaxLabel")} value={money(taxResult.stateTax)} sub={t("usStateTaxSub")} />
        </div>
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <StatCard label={t("usTotalTaxLabel")} value={money(taxResult.totalTax)} sub={t("usTotalTaxSub")} tone="danger" />
        </div>
      </div>
    </div>
  );
}

// ---------- アメリカ選択時：退職後パネル（Social Security → Expenses → Withdrawal） ----------
function USRetirementPanel({ usInvestment, onUpdateSS, onUpdate, retirementRules, claimAge, ssMonthly, ssAnnual, expensesAnnual, healthcareAnnual, withdrawalNeeded, incomeSurplus }) {
  const { t, money } = useContext(LocaleContext);
  const ss = retirementRules.socialSecurity;
  return (
    <div>
      <div className="note" style={{ marginBottom: 12 }}>
        <Info size={13} />
        <span>{t("usSsSourceNote")}</span>
      </div>
      <Field guide={t("usPiaGuide")} label={t("usPiaLabel")} unit="$" step={50} value={usInvestment.socialSecurity.piaMonthly} onChange={(v) => onUpdateSS("piaMonthly", v)} />
      <AgeField
        label={t("usClaimAgeLabel")}
        value={claimAge}
        onChange={(v) => onUpdateSS("claimAge", Math.min(ss.latestClaimAge, Math.max(ss.earliestClaimAge, Math.round(v))))}
      />
      <div className="stat-sub">{t("usFraNote", { age: ss.fullRetirementAge })}</div>
      <div className="stat-grid" style={{ marginTop: 10, marginBottom: 14 }}>
        <StatCard label={t("usSsMonthlyLabel")} value={money(ssMonthly)} sub={t("usSsMonthlySub", { age: claimAge })} />
        <StatCard label={t("usSsAnnualLabel")} value={money(ssAnnual)} sub={t("usSsAnnualSub")} />
      </div>

      <div className="field-label" style={{ marginBottom: 6 }}>{t("usExpensesLabel")}</div>
      <Field guide={t("usExpensesMonthlyGuide")} label={t("usExpensesMonthlyLabel")} unit="$" step={100} value={usInvestment.expensesMonthly} onChange={(v) => onUpdate("expensesMonthly", v)} />

      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("usRetirementIncomeLabel")} value={money(ssAnnual)} sub={t("usRetirementIncomeSub")} tone="good" />
        <StatCard label={t("usExpensesTotalLabel")} value={money(expensesAnnual + healthcareAnnual)} sub={t("usExpensesTotalSub")} />
        {withdrawalNeeded > 0 ? (
          <StatCard label={t("usWithdrawalLabel")} value={money(withdrawalNeeded)} sub={t("usWithdrawalSub")} tone="danger" />
        ) : (
          <StatCard label={t("usSurplusLabel")} value={money(incomeSurplus)} sub={t("usSurplusSub")} tone="good" />
        )}
      </div>
    </div>
  );
}

// ---------- アメリカ選択時：医療費パネル（Medicare / Health Insurance / Out of Pocket） ----------
function USHealthcarePanel({ usInvestment, onUpdate, medicareAnnual, healthInsuranceAnnual, outOfPocketAnnual, totalAnnual }) {
  const { t, money } = useContext(LocaleContext);
  return (
    <div>
      <div className="note" style={{ marginBottom: 12 }}>
        <Info size={13} />
        <span>{t("usHealthcareSourceNote")}</span>
      </div>
      <div className="stat-sub">{t("usMedicareAutoLabel")}：<span className="mono">{money(medicareAnnual)}</span></div>
      <div className="note" style={{ marginTop: -4, marginBottom: 12 }}>
        <Info size={13} />
        <span>{t("usMedicareAutoNote")}</span>
      </div>
      <Field guide={t("usHealthInsuranceGuide")} label={t("usHealthInsuranceLabel")} unit="$" step={50} value={usInvestment.healthcare.healthInsuranceMonthly} onChange={(v) => onUpdate("healthInsuranceMonthly", v)} />
      <Field guide={t("usOutOfPocketGuide")} label={t("usOutOfPocketLabel")} unit="$" step={100} value={usInvestment.healthcare.outOfPocketAnnual} onChange={(v) => onUpdate("outOfPocketAnnual", v)} />
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("usMedicareLabel")} value={money(medicareAnnual)} sub={t("usMedicareSub")} />
        <StatCard label={t("usHealthInsuranceTotalLabel")} value={money(healthInsuranceAnnual)} sub={t("usHealthInsuranceSub")} />
        <StatCard label={t("usOutOfPocketTotalLabel")} value={money(outOfPocketAnnual)} sub={t("usOutOfPocketSub")} />
      </div>
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("usHealthcareTotalLabel")} value={money(totalAnnual)} sub={t("usHealthcareTotalSub")} tone="danger" />
      </div>
    </div>
  );
}

// ---------- イギリス選択時：1口座分の入力欄（現在額・年間積立額・想定利回り・積立終了年齢） ----------
// 6口座（Stocks and Shares ISA / Cash ISA / SIPP / Workplace Pension / GIA / Cash Savings）で共通利用する。
function GBAccountFields({ accountKey, title, account, onUpdateAccount, borderColor, note }) {
  const { t } = useContext(LocaleContext);
  return (
    <div className="section-block" style={{ borderColor, marginTop: 12 }}>
      <div className="field-label" style={{ marginBottom: 6 }}>{title}</div>
      <Field guide={t("gbCurrentValueGuide")} label={t("gbCurrentValueLabel")} unit="£" step={500} value={account.currentValue} onChange={(v) => onUpdateAccount(accountKey, "currentValue", v)} />
      <Field guide={t("gbAnnualContributionGuide")} label={t("gbAnnualContributionLabel")} unit="£" step={100} value={account.annualContribution} onChange={(v) => onUpdateAccount(accountKey, "annualContribution", v)} />
      <Field guide={t("gbExpectedReturnGuide")} label={t("expectedAnnualReturnLabel")} unit="%" step={0.5} value={account.expectedReturnPct} onChange={(v) => onUpdateAccount(accountKey, "expectedReturnPct", v)} />
      <AgeField guide={t("gbContributionEndAgeGuide")} label={t("gbContributionEndAgeLabel")} value={account.contributionEndAge} onChange={(v) => onUpdateAccount(accountKey, "contributionEndAge", v)} />
      {note && <div className="stat-sub">{note}</div>}
    </div>
  );
}

// ---------- イギリス選択時：投資口座パネル（ISA / SIPP / Workplace Pension / GIA / Cash Savings ＋ 税制） ----------
// JPのNISA関連UI・USの401(k)関連UIとは完全に独立しており、GB_COUNTRY_RULES の関数のみを使用する。
function GBInvestmentAccountsPanel({ gbInvestment, onUpdate, onUpdateAccount, age, investmentRules, taxRules, taxResult, pensionAllowance }) {
  const { t, money } = useContext(LocaleContext);

  // 画面に出す数値・年度・税率はすべて GB_COUNTRY_RULES（investmentRules / taxRules）から取り出す。
  // 表示文にリテラルの数値を書かないことで、制度改正時に計算と説明文が食い違う事故を防ぐ。
  const pct = (rate) => `${Number((rate * 100).toFixed(2))}`;

  const isaAllowance = investmentRules.getIsaAnnualAllowance();
  const isaContributed = investmentRules.getIsaContributed(gbInvestment);
  const isaRemaining = isaAllowance - isaContributed;

  const pensionContributed = investmentRules.getPensionContributed(gbInvestment);
  const pensionRemaining = pensionAllowance - pensionContributed;
  const isTapered = pensionAllowance < investmentRules.limits.pensionAnnualAllowance;

  const split = investmentRules.splitAssets(age, gbInvestment);
  const accessAge = investmentRules.pensionAccessAge;
  const cgtExempt = taxRules.capitalGains.annualExemptAmount;

  return (
    <div>
      <div className="note" style={{ marginBottom: 14 }}>
        <Info size={13} />
        <span>{t("gbInvestmentSourceNote", { taxYear: investmentRules.effectiveTaxYear, region: taxRules.region })}</span>
      </div>

      <Field guide={t("gbAnnualIncomeGuide")} label={t("gbAnnualIncomeLabel")} unit="£" step={1000} value={gbInvestment.annualIncome} onChange={(v) => onUpdate("annualIncome", v)} />
      <Field guide={t("gbAdjustedIncomeGuide")} label={t("gbAdjustedIncomeLabel")} unit="£" step={1000} value={gbInvestment.adjustedIncome} onChange={(v) => onUpdate("adjustedIncome", v)} />

      <GBAccountFields
        accountKey="stocksSharesIsa" title={t("gbStocksSharesIsaLabel")} account={gbInvestment.stocksSharesIsa}
        onUpdateAccount={onUpdateAccount} borderColor="#8FBF7F"
      />
      <GBAccountFields
        accountKey="cashIsa" title={t("gbCashIsaLabel")} account={gbInvestment.cashIsa}
        onUpdateAccount={onUpdateAccount} borderColor="#8FBF7F"
      />

      <div className="stat-grid" style={{ marginTop: 12 }}>
        <StatCard
          label={t("gbIsaAllowanceLabel", { taxYear: investmentRules.effectiveTaxYear })}
          value={money(isaAllowance)}
          sub={t("gbIsaRemainingSub", { amount: money(isaAllowance) })}
        />
        <StatCard
          label={t("gbIsaRemainingLabel")}
          value={money(Math.max(0, isaRemaining))}
          sub={t("gbIsaTaxFreeNote")}
          tone={isaRemaining < 0 ? "danger" : "good"}
        />
      </div>
      {isaRemaining < 0 && (
        <div className="note" style={{ borderLeftColor: "#C2694F", marginTop: 10 }}>
          <Info size={13} style={{ color: "#C2694F" }} />
          <span>{t("gbIsaOverLabel", { amount: money(-isaRemaining) })}</span>
        </div>
      )}

      <GBAccountFields
        accountKey="sipp" title={t("gbSippLabel")} account={gbInvestment.sipp}
        onUpdateAccount={onUpdateAccount} borderColor="#B08FD6"
      />
      <GBAccountFields
        accountKey="workplacePension" title={t("gbWorkplacePensionLabel")} account={gbInvestment.workplacePension}
        onUpdateAccount={onUpdateAccount} borderColor="#B08FD6"
      />

      <div className="stat-grid" style={{ marginTop: 12 }}>
        <StatCard
          label={t("gbPensionAllowanceLabel", { taxYear: investmentRules.effectiveTaxYear })}
          value={money(pensionAllowance)}
          sub={t("gbPensionRemainingSub", { amount: money(pensionAllowance) })}
        />
        <StatCard
          label={t("gbPensionRemainingLabel")}
          value={money(Math.max(0, pensionRemaining))}
          sub={t("gbPensionAccessNote", {
            age: accessAge,
            futureAge: investmentRules.scheduled.pensionAccessAgeFrom2028,
            date: investmentRules.scheduled.pensionAccessAgeEffectiveDate,
          })}
          tone={pensionRemaining < 0 ? "danger" : "good"}
        />
      </div>
      {isTapered && (
        <div className="note" style={{ borderLeftColor: "#D9A54F", marginTop: 10 }}>
          <Info size={13} style={{ color: "#D9A54F" }} />
          <span>{t("gbPensionTaperNote", {
            amount: money(pensionAllowance),
            threshold: money(investmentRules.limits.pensionTaperAdjustedIncome),
            floor: money(investmentRules.limits.pensionAnnualAllowanceFloor),
          })}</span>
        </div>
      )}
      {pensionRemaining < 0 && (
        <div className="note" style={{ borderLeftColor: "#C2694F", marginTop: 10 }}>
          <Info size={13} style={{ color: "#C2694F" }} />
          <span>{t("gbPensionOverLabel", { amount: money(-pensionRemaining) })}</span>
        </div>
      )}
      <div className="note" style={{ marginTop: 10 }}>
        <Info size={13} />
        <span>{t("gbLumpSumNote", {
          amount: money(investmentRules.lumpSumAllowance),
          pct: pct(investmentRules.taxFreeLumpSumRate),
        })}</span>
      </div>

      <GBAccountFields
        accountKey="gia" title={t("gbGiaLabel")} account={gbInvestment.gia}
        onUpdateAccount={onUpdateAccount} borderColor="#D9A54F"
      />
      <GBAccountFields
        accountKey="cashSavings" title={t("gbCashSavingsLabel")} account={gbInvestment.cashSavings}
        onUpdateAccount={onUpdateAccount} borderColor="#7BC9E0"
      />

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <StatCard label={t("gbTotalAssetsLabel")} value={money(split.total)} sub={t("gbTotalAssetsSub")} />
      </div>
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard
          label={t("gbLiquidAssetsLabel")}
          value={money(split.liquid)}
          sub={t("gbLiquidAssetsSub", { age: accessAge })}
          tone="good"
        />
        <StatCard
          label={t("gbRestrictedAssetsLabel")}
          value={money(split.restricted)}
          sub={split.isAccessibleAge
            ? t("gbRestrictedAssetsSubAccessible", { age: accessAge })
            : t("gbRestrictedAssetsSubLocked", { age: accessAge })}
        />
        <StatCard
          label={t("gbTaxAdvantagedLabel")}
          value={money(split.taxAdvantaged)}
          sub={t("gbTaxAdvantagedSub")}
        />
      </div>

      <div className="section-block" style={{ borderColor: "#5FB0A0", marginTop: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>
          {t("gbTaxSectionLabel", { taxYear: taxRules.effectiveTaxYear, region: taxRules.region })}
        </div>
        <div className="note" style={{ marginBottom: 12 }}>
          <Info size={13} />
          <span>{t("gbTaxSourceNote", { taxYear: taxRules.effectiveTaxYear, region: taxRules.region })}</span>
        </div>
        <Field guide={t("gbDividendIncomeGuide")} label={t("gbDividendIncomeLabel")} unit="£" step={100} value={gbInvestment.dividendIncomeAnnual} onChange={(v) => onUpdate("dividendIncomeAnnual", v)} />
        <Field guide={t("gbCapitalGainGuide")} label={t("gbCapitalGainLabel")} unit="£" step={500} value={gbInvestment.estimatedCapitalGainAnnual} onChange={(v) => onUpdate("estimatedCapitalGainAnnual", v)} />
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <StatCard label={t("gbIncomeTaxLabel")} value={money(taxResult.incomeTax)} sub={t("gbIncomeTaxSub", { amount: money(taxResult.taxableIncome) })} />
          <StatCard
            label={t("gbDividendTaxLabel")}
            value={money(taxResult.dividendTax)}
            sub={t("gbDividendTaxSub", {
              amount: money(taxRules.dividend.allowance),
              basic: pct(taxRules.dividend.basicRate),
              higher: pct(taxRules.dividend.higherRate),
              additional: pct(taxRules.dividend.additionalRate),
            })}
          />
          <StatCard
            label={t("gbCgtLabel")}
            value={money(taxResult.capitalGainsTax)}
            sub={t("gbCgtSub", {
              amount: money(cgtExempt),
              basic: pct(taxRules.capitalGains.basicRate),
              higher: pct(taxRules.capitalGains.higherRate),
            })}
          />
          <StatCard
            label={t("gbPensionReliefLabel")}
            value={money(taxResult.pensionTaxRelief)}
            sub={t("gbPensionReliefSub", { pct: Math.round(taxResult.marginalRate * 100) })}
            tone="good"
          />
        </div>
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <StatCard label={t("gbTotalTaxLabel")} value={money(taxResult.totalTax)} sub={t("gbTotalTaxSub")} tone="danger" />
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          <Info size={13} />
          <span>{t("gbIsaTaxFreeNote")}</span>
        </div>
      </div>
    </div>
  );
}

// ---------- イギリス選択時：退職後パネル（State Pension → Expenses → Withdrawal） ----------
function GBRetirementPanel({
  gbInvestment, onUpdateStatePension, onUpdate, retirementRules,
  statePensionAge, claimAge, effectiveClaimAge, deferralFactor,
  statePensionAnnual, retirementIncomeAnnual, fullStatePensionAnnual,
  expensesAnnual, healthcareAnnual, withdrawalNeeded, incomeSurplus,
}) {
  const { t, money, baseCurrency } = useContext(LocaleContext);
  // 表示に使う数値はすべて GB_COUNTRY_RULES（retirementRules）から取り出す。
  const sp = retirementRules.statePension;
  const symbol = (CURRENCY_BY_CODE[baseCurrency] || CURRENCY_BY_CODE.GBP).symbol;
  const weeklyFull = `${symbol}${sp.fullWeeklyRate.toFixed(2)}`;
  // 繰下げ増額率（小数第2位まで。52週の繰下げなら 5.78%）
  const deferralPct = Number(((deferralFactor - 1) * 100).toFixed(2));
  return (
    <div>
      <div className="note" style={{ marginBottom: 12 }}>
        <Info size={13} />
        <span>{t("gbStatePensionSourceNote", {
          years: sp.qualifyingYearsForFull,
          weeks: sp.deferralUnitWeeks,
          unitPct: Number((sp.deferralUpliftPerNineWeeks * 100).toFixed(2)),
        })}</span>
      </div>

      <AgeField
        label={t("gbStatePensionAgeLabel")}
        value={statePensionAge}
        onChange={(v) => onUpdateStatePension("statePensionAge", Math.round(v))}
      />
      <div className="note" style={{ marginTop: -8, marginBottom: 8 }}>
        <Info size={13} />
        <span>{t("gbStatePensionAgeNote", { from: sp.ageBefore2026, to: sp.ageAfterTransition })}</span>
      </div>

      <Field
        guide={t("gbStatePensionEstimateGuide")}
        label={t("gbStatePensionEstimateLabel")} unit="£" step={100}
        value={gbInvestment.statePension.estimatedAnnual}
        onChange={(v) => onUpdateStatePension("estimatedAnnual", v)}
      />
      <div className="stat-sub" style={{ marginBottom: 8 }}>
        {t("gbFullStatePensionNote", {
          amount: money(fullStatePensionAnnual),
          weekly: weeklyFull,
          taxYear: retirementRules.effectiveTaxYear,
        })}
      </div>

      <AgeField
        label={t("gbClaimAgeLabel")}
        value={claimAge}
        onChange={(v) => onUpdateStatePension("claimAge", Math.round(v))}
      />
      {effectiveClaimAge > claimAge && (
        <div className="note" style={{ marginTop: -8, borderLeftColor: "#D9A54F" }}>
          <Info size={13} style={{ color: "#D9A54F" }} />
          <span>{t("gbEffectiveClaimAgeNote", { age: t("ageYears", { age: effectiveClaimAge }) })}</span>
        </div>
      )}
      {deferralFactor > 1 && (
        <div className="note" style={{ marginTop: -8 }}>
          <Info size={13} />
          <span>{t("gbDeferralNote", {
            pct: deferralPct,
            unitPct: Number((sp.deferralUpliftPerNineWeeks * 100).toFixed(2)),
            weeks: sp.deferralUnitWeeks,
          })}</span>
        </div>
      )}

      <Field
        guide={t("gbOverlapYearsGuide")}
        label={t("gbOverlapYearsLabel")} unit={t("gbOverlapYearsUnit")} step={1}
        value={gbInvestment.statePension.incomeOverlapYears}
        onChange={(v) => onUpdateStatePension("incomeOverlapYears", v)}
      />
      <div className="stat-sub" style={{ marginBottom: 8 }}>{t("gbOverlapYearsSub")}</div>

      <Field
        guide={t("gbAdditionalPensionGuide")}
        label={t("gbAdditionalPensionLabel")} unit="£" step={100}
        value={gbInvestment.statePension.additionalPensionAnnual}
        onChange={(v) => onUpdateStatePension("additionalPensionAnnual", v)}
      />

      <div className="stat-grid" style={{ marginTop: 10, marginBottom: 14 }}>
        <StatCard label={t("gbStatePensionAnnualLabel")} value={money(statePensionAnnual)} sub={t("gbStatePensionAnnualSub")} />
        <StatCard label={t("gbRetirementIncomeLabel")} value={money(retirementIncomeAnnual)} sub={t("gbRetirementIncomeSub")} tone="good" />
      </div>

      <Field
        guide={t("gbExpensesMonthlyGuide")}
        label={t("gbExpensesMonthlyLabel")} unit="£" step={50}
        value={gbInvestment.expensesMonthly}
        onChange={(v) => onUpdate("expensesMonthly", v)}
      />

      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("gbExpensesTotalLabel")} value={money(expensesAnnual + healthcareAnnual)} sub={t("gbExpensesTotalSub")} />
        {withdrawalNeeded > 0 ? (
          <StatCard label={t("gbWithdrawalLabel")} value={money(withdrawalNeeded)} sub={t("gbWithdrawalSub")} tone="danger" />
        ) : (
          <StatCard label={t("gbSurplusLabel")} value={money(incomeSurplus)} sub={t("gbSurplusSub")} tone="good" />
        )}
      </div>
    </div>
  );
}

// ---------- イギリス選択時：医療費パネル（NHS前提の簡易モデル） ----------
function GBHealthcarePanel({ gbInvestment, onUpdate, totalAnnual }) {
  const { t, money } = useContext(LocaleContext);
  const h = gbInvestment.healthcare;
  return (
    <div>
      <div className="note" style={{ marginBottom: 12 }}>
        <Info size={13} />
        <span>{t("gbHealthcareSourceNote")}</span>
      </div>
      <Field guide={t("gbHealthcareGuide")} label={t("gbNhsBasicLabel")} unit="£" step={50} value={h.nhsBasicAnnual} onChange={(v) => onUpdate("nhsBasicAnnual", v)} />
      <Field label={t("gbPrivateHealthLabel")} unit="£" step={10} value={h.privateHealthInsuranceMonthly} onChange={(v) => onUpdate("privateHealthInsuranceMonthly", v)} />
      <Field label={t("gbDentalLabel")} unit="£" step={50} value={h.dentalAnnual} onChange={(v) => onUpdate("dentalAnnual", v)} />
      <Field label={t("gbPrescriptionLabel")} unit="£" step={10} value={h.prescriptionAnnual} onChange={(v) => onUpdate("prescriptionAnnual", v)} />
      <Field label={t("gbLongTermCareLabel")} unit="£" step={500} value={h.longTermCareAnnual} onChange={(v) => onUpdate("longTermCareAnnual", v)} />
      <Field label={t("gbOtherOutOfPocketLabel")} unit="£" step={50} value={h.otherOutOfPocketAnnual} onChange={(v) => onUpdate("otherOutOfPocketAnnual", v)} />
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("gbHealthcareTotalLabel")} value={money(totalAnnual)} sub={t("gbHealthcareTotalSub")} tone="danger" />
      </div>
    </div>
  );
}

// ---------- カナダ選択時：1口座分の入力欄（現在額・年間積立額・想定利回り・積立終了年齢） ----------
function CAAccountFields({ accountKey, title, account, onUpdateAccount, borderColor, note }) {
  const { t } = useContext(LocaleContext);
  return (
    <div className="section-block" style={{ borderColor, marginTop: 12 }}>
      <div className="field-label" style={{ marginBottom: 6 }}>{title}</div>
      <Field guide={t("caCurrentValueGuide")} label={t("caCurrentValueLabel")} unit="C$" step={500} value={account.currentValue} onChange={(v) => onUpdateAccount(accountKey, "currentValue", v)} />
      <Field guide={t("caAnnualContributionGuide")} label={t("caAnnualContributionLabel")} unit="C$" step={100} value={account.annualContribution} onChange={(v) => onUpdateAccount(accountKey, "annualContribution", v)} />
      <Field guide={t("gbExpectedReturnGuide")} label={t("expectedAnnualReturnLabel")} unit="%" step={0.5} value={account.expectedReturnPct} onChange={(v) => onUpdateAccount(accountKey, "expectedReturnPct", v)} />
      <AgeField guide={t("gbContributionEndAgeGuide")} label={t("caContributionEndAgeLabel")} value={account.contributionEndAge} onChange={(v) => onUpdateAccount(accountKey, "contributionEndAge", v)} />
      {note && <div className="stat-sub">{note}</div>}
    </div>
  );
}

// ---------- カナダ選択時：投資口座パネル（TFSA / RRSP / 非登録口座 / 現金 ＋ 税制） ----------
// 他国のUIとは完全に独立しており、CA_COUNTRY_RULES の関数のみを使用する。
function CAInvestmentAccountsPanel({ caInvestment, onUpdate, onUpdateAccount, age, investmentRules, taxRules, taxResult, rrspRoom }) {
  const { t, money } = useContext(LocaleContext);
  // 画面に出す数値・年度・税率はすべて CA_COUNTRY_RULES から取り出す（表示文にリテラルを書かない）。
  const pct = (rate) => `${Number((rate * 100).toFixed(2))}`;

  const tfsaLimit = investmentRules.getTfsaAnnualLimit();
  const tfsaRemaining = investmentRules.getTfsaRemaining(caInvestment);
  const rrspRemaining = rrspRoom - (Number(caInvestment.rrsp.annualContribution) || 0);
  const split = investmentRules.splitAssets(age, caInvestment);
  const rrifAge = investmentRules.rrifConversionAge;

  return (
    <div>
      <div className="note" style={{ marginBottom: 14 }}>
        <Info size={13} />
        <span>{t("caInvestmentSourceNote", { taxYear: investmentRules.effectiveTaxYear, region: taxRules.region })}</span>
      </div>

      <Field guide={t("caAnnualIncomeGuide")} label={t("caAnnualIncomeLabel")} unit="C$" step={1000} value={caInvestment.annualIncome} onChange={(v) => onUpdate("annualIncome", v)} />
      <Field guide={t("caPriorEarnedIncomeGuide")} label={t("caPriorEarnedIncomeLabel")} unit="C$" step={1000} value={caInvestment.priorEarnedIncome} onChange={(v) => onUpdate("priorEarnedIncome", v)} />

      <CAAccountFields
        accountKey="tfsa" title={t("caTfsaLabel")} account={caInvestment.tfsa}
        onUpdateAccount={onUpdateAccount} borderColor="#8FBF7F"
      />
      <div className="stat-grid" style={{ marginTop: 12 }}>
        <StatCard
          label={t("caTfsaLimitLabel", { taxYear: investmentRules.effectiveTaxYear })}
          value={money(tfsaLimit)}
          sub={t("caTfsaRemainingSub", { amount: money(tfsaLimit) })}
        />
        <StatCard
          label={t("caTfsaRemainingLabel")}
          value={money(Math.max(0, tfsaRemaining))}
          sub={t("caTfsaTaxFreeNote")}
          tone={tfsaRemaining < 0 ? "danger" : "good"}
        />
      </div>
      {tfsaRemaining < 0 && (
        <div className="note" style={{ borderLeftColor: "#C2694F", marginTop: 10 }}>
          <Info size={13} style={{ color: "#C2694F" }} />
          <span>{t("caTfsaOverLabel", { amount: money(-tfsaRemaining) })}</span>
        </div>
      )}

      <CAAccountFields
        accountKey="rrsp" title={t("caRrspLabel")} account={caInvestment.rrsp}
        onUpdateAccount={onUpdateAccount} borderColor="#B08FD6"
      />
      <div className="stat-grid" style={{ marginTop: 12 }}>
        <StatCard
          label={t("caRrspRoomLabel")}
          value={money(rrspRoom)}
          sub={t("caRrspRoomSub", {
            pct: pct(investmentRules.limits.rrspIncomePercent),
            cap: money(investmentRules.limits.rrspAnnualDollarLimit),
          })}
        />
        <StatCard
          label={t("caRrspRemainingLabel")}
          value={money(Math.max(0, rrspRemaining))}
          sub={t("caRrspTaxSavingSub", { pct: pct(taxResult.marginalRate) })}
          tone={rrspRemaining < 0 ? "danger" : "good"}
        />
      </div>
      {rrspRemaining < 0 && (
        <div className="note" style={{ borderLeftColor: "#C2694F", marginTop: 10 }}>
          <Info size={13} style={{ color: "#C2694F" }} />
          <span>{t("caRrspOverLabel", { amount: money(-rrspRemaining) })}</span>
        </div>
      )}
      <div className="note" style={{ marginTop: 10 }}>
        <Info size={13} />
        <span>{t("caRrifNote", {
          age: rrifAge,
          pct: pct(investmentRules.getRrifMinimumFactor(rrifAge)),
          pct80: pct(investmentRules.getRrifMinimumFactor(80)),
          pct95: pct(investmentRules.rrifMinimumFactorAt95Plus),
        })}</span>
      </div>

      <CAAccountFields
        accountKey="nonRegistered" title={t("caNonRegisteredLabel")} account={caInvestment.nonRegistered}
        onUpdateAccount={onUpdateAccount} borderColor="#D9A54F"
      />
      <CAAccountFields
        accountKey="cashSavings" title={t("caCashSavingsLabel")} account={caInvestment.cashSavings}
        onUpdateAccount={onUpdateAccount} borderColor="#7BC9E0"
      />

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <StatCard label={t("caTotalAssetsLabel")} value={money(split.total)} sub={t("caTotalAssetsSub")} />
      </div>
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("caLiquidAssetsLabel")} value={money(split.liquid)} sub={t("caLiquidAssetsSub")} tone="good" />
        <StatCard label={t("caRestrictedAssetsLabel")} value={money(split.restricted)} sub={t("caRestrictedAssetsSub", { age: rrifAge })} />
        <StatCard label={t("caTaxAdvantagedLabel")} value={money(split.taxAdvantaged)} sub={t("caTaxAdvantagedSub")} />
      </div>

      <div className="section-block" style={{ borderColor: "#5FB0A0", marginTop: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>
          {t("caTaxSectionLabel", { taxYear: taxRules.effectiveTaxYear })}
        </div>
        <div className="note" style={{ marginBottom: 12 }}>
          <Info size={13} />
          <span>{t("caTaxSourceNote", { taxYear: taxRules.effectiveTaxYear })}</span>
        </div>
        <Field guide={t("caCapitalGainGuide")} label={t("caCapitalGainLabel")} unit="C$" step={500} value={caInvestment.estimatedCapitalGainAnnual} onChange={(v) => onUpdate("estimatedCapitalGainAnnual", v)} />
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <StatCard
            label={t("caFederalTaxLabel")}
            value={money(taxResult.federalTax)}
            sub={t("caFederalTaxSub", { amount: money(taxResult.basicPersonalAmount) })}
          />
          <StatCard
            label={t("caCgtLabel")}
            value={money(taxResult.capitalGainsTax)}
            sub={t("caCgtSub", { pct: pct(taxRules.capitalGains.inclusionRate) })}
          />
          <StatCard
            label={t("caRrspTaxSavingLabel")}
            value={money(taxResult.rrspTaxSaving)}
            sub={t("caRrspTaxSavingSub", { pct: pct(taxResult.marginalRate) })}
            tone="good"
          />
        </div>
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <StatCard label={t("caTotalTaxLabel")} value={money(taxResult.totalTax)} sub={t("caTotalTaxSub")} tone="danger" />
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          <Info size={13} />
          <span>{t("caTfsaTaxFreeNote")}</span>
        </div>
      </div>
    </div>
  );
}

// ---------- カナダ選択時：退職後パネル（CPP → OAS → Expenses → Withdrawal） ----------
function CARetirementPanel({
  caInvestment, onUpdateCpp, onUpdateOas, onUpdate, retirementRules,
  cppStartAge, cppFactor, cppAnnual, cppMaxAnnual,
  oasStartAge, oasEffectiveStartAge, oasResidenceFraction,
  oasBeforeClawback, oasClawback, oasAnnual,
  retirementIncomeAnnual, expensesAnnual, healthcareAnnual, withdrawalNeeded, incomeSurplus,
}) {
  const { t, money } = useContext(LocaleContext);
  const cpp = retirementRules.cpp;
  const oas = retirementRules.oas;
  const pct = (rate) => `${Number((rate * 100).toFixed(2))}`;
  const residenceYears = Number(caInvestment.oas.residenceYears) || 0;

  return (
    <div>
      {/* ---- CPP ---- */}
      <div className="field-label" style={{ marginBottom: 6 }}>{t("caCppAnnualLabel")}</div>
      <Field
        guide={t("caCppEstimateGuide")}
        label={t("caCppEstimateLabel")} unit="C$" step={100}
        value={caInvestment.cpp.estimatedAnnualAt65}
        onChange={(v) => onUpdateCpp("estimatedAnnualAt65", v)}
      />
      <div className="stat-sub" style={{ marginBottom: 8 }}>
        {t("caCppFullNote", { taxYear: retirementRules.effectiveTaxYear, amount: money(cppMaxAnnual) })}
      </div>
      <AgeField
        label={t("caCppStartAgeLabel", { min: cpp.earliestAge, max: cpp.latestAge })}
        value={cppStartAge}
        onChange={(v) => onUpdateCpp("startAge", Math.round(v))}
      />
      {cppFactor !== 1 && (
        <div className="note" style={{ marginTop: -8 }}>
          <Info size={13} />
          <span>{t("caCppFactorNote", {
            age: cppStartAge,
            pct: Number((cppFactor * 100).toFixed(1)),
            early: pct(cpp.earlyReductionPerMonth),
            late: pct(cpp.lateIncreasePerMonth),
          })}</span>
        </div>
      )}

      {/* ---- OAS ---- */}
      <div className="field-label" style={{ marginTop: 16, marginBottom: 6 }}>{t("caOasAnnualLabel")}</div>
      <AgeField
        label={t("caOasStartAgeLabel", { min: oas.standardAge, max: oas.latestAge })}
        value={oasStartAge}
        onChange={(v) => onUpdateOas("startAge", Math.round(v))}
      />
      {oasEffectiveStartAge > oasStartAge && (
        <div className="note" style={{ marginTop: -8, borderLeftColor: "#D9A54F" }}>
          <Info size={13} style={{ color: "#D9A54F" }} />
          <span>{t("caOasNoEarlyNote", { age: oasEffectiveStartAge })}</span>
        </div>
      )}
      <Field
        guide={t("caOasResidenceGuide")}
        label={t("caOasResidenceLabel", { full: oas.fullResidenceYears })}
        unit={t("caYearsUnit")} step={1}
        value={caInvestment.oas.residenceYears}
        onChange={(v) => onUpdateOas("residenceYears", v)}
      />
      <div className="stat-sub" style={{ marginBottom: 8 }}>
        {t("caOasResidenceSub", {
          years: residenceYears,
          pct: Number((oasResidenceFraction * 100).toFixed(1)),
          min: oas.minimumResidenceYears,
        })}
      </div>
      <div className="note" style={{ marginBottom: 8 }}>
        <Info size={13} />
        <span>{t("caOasEnhancedNote", {
          base: money(oas.maxMonthly65to74 * 12),
          enhanced: money(oas.maxMonthly75plus * 12),
        })}</span>
      </div>
      {oasClawback > 0 && (
        <div className="note" style={{ borderLeftColor: "#C2694F", marginBottom: 8 }}>
          <Info size={13} style={{ color: "#C2694F" }} />
          <span>{t("caOasClawbackNote", {
            threshold: money(oas.recoveryTaxThreshold2026),
            pct: pct(oas.recoveryTaxRate),
            amount: money(oasClawback),
          })}</span>
        </div>
      )}

      <Field
        guide={t("caAdditionalPensionGuide")}
        label={t("caAdditionalPensionLabel")} unit="C$" step={100}
        value={caInvestment.additionalPensionAnnual}
        onChange={(v) => onUpdate("additionalPensionAnnual", v)}
      />

      <div className="stat-grid" style={{ marginTop: 10, marginBottom: 14 }}>
        <StatCard label={t("caCppAnnualLabel")} value={money(cppAnnual)} sub={t("caCppAnnualSub")} />
        <StatCard label={t("caOasAnnualLabel")} value={money(oasAnnual)} sub={t("caOasAnnualSub")} />
        <StatCard
          label={t("caOasClawbackLabel")}
          value={money(oasClawback)}
          sub={t("caOasClawbackSub", { threshold: money(oas.recoveryTaxThreshold2026), pct: pct(oas.recoveryTaxRate) })}
          tone={oasClawback > 0 ? "danger" : undefined}
        />
        <StatCard label={t("caRetirementIncomeLabel")} value={money(retirementIncomeAnnual)} sub={t("caRetirementIncomeSub")} tone="good" />
      </div>

      <Field
        guide={t("caExpensesMonthlyGuide")}
        label={t("caExpensesMonthlyLabel")} unit="C$" step={50}
        value={caInvestment.expensesMonthly}
        onChange={(v) => onUpdate("expensesMonthly", v)}
      />
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("caExpensesTotalLabel")} value={money(expensesAnnual + healthcareAnnual)} sub={t("caExpensesTotalSub")} />
        {withdrawalNeeded > 0 ? (
          <StatCard label={t("caWithdrawalLabel")} value={money(withdrawalNeeded)} sub={t("caWithdrawalSub")} tone="danger" />
        ) : (
          <StatCard label={t("caSurplusLabel")} value={money(incomeSurplus)} sub={t("caSurplusSub")} tone="good" />
        )}
      </div>
    </div>
  );
}

// ---------- カナダ選択時：医療費パネル（州の公的医療保険を前提とした簡易モデル） ----------
function CAHealthcarePanel({ caInvestment, onUpdate, totalAnnual }) {
  const { t, money } = useContext(LocaleContext);
  const h = caInvestment.healthcare;
  return (
    <div>
      <div className="note" style={{ marginBottom: 12 }}>
        <Info size={13} />
        <span>{t("caHealthcareSourceNote")}</span>
      </div>
      <Field guide={t("caHealthcareGuide")} label={t("caBasicHealthLabel")} unit="C$" step={50} value={h.basicAnnual} onChange={(v) => onUpdate("basicAnnual", v)} />
      <Field label={t("caPrivateHealthLabel")} unit="C$" step={10} value={h.privateHealthInsuranceMonthly} onChange={(v) => onUpdate("privateHealthInsuranceMonthly", v)} />
      <Field label={t("caPrescriptionLabel")} unit="C$" step={50} value={h.prescriptionAnnual} onChange={(v) => onUpdate("prescriptionAnnual", v)} />
      <Field label={t("caDentalLabel")} unit="C$" step={50} value={h.dentalAnnual} onChange={(v) => onUpdate("dentalAnnual", v)} />
      <Field label={t("caVisionLabel")} unit="C$" step={50} value={h.visionAnnual} onChange={(v) => onUpdate("visionAnnual", v)} />
      <Field label={t("caLongTermCareLabel")} unit="C$" step={500} value={h.longTermCareAnnual} onChange={(v) => onUpdate("longTermCareAnnual", v)} />
      <Field label={t("caOtherOutOfPocketLabel")} unit="C$" step={50} value={h.otherOutOfPocketAnnual} onChange={(v) => onUpdate("otherOutOfPocketAnnual", v)} />
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("caHealthcareTotalLabel")} value={money(totalAnnual)} sub={t("caHealthcareTotalSub")} tone="danger" />
      </div>
    </div>
  );
}

// ---------- オーストラリア選択時：1口座分の入力欄 ----------
function AUAccountFields({ accountKey, title, account, onUpdateAccount, borderColor, contributionLabel, note }) {
  const { t } = useContext(LocaleContext);
  return (
    <div className="section-block" style={{ borderColor, marginTop: 12 }}>
      <div className="field-label" style={{ marginBottom: 6 }}>{title}</div>
      <Field guide={t("auCurrentValueGuide")} label={t("auCurrentValueLabel")} unit="A$" step={500} value={account.currentValue} onChange={(v) => onUpdateAccount(accountKey, "currentValue", v)} />
      <Field guide={t("auAnnualContributionGuide")} label={contributionLabel || t("auAnnualContributionLabel")} unit="A$" step={100} value={account.annualContribution} onChange={(v) => onUpdateAccount(accountKey, "annualContribution", v)} />
      <Field guide={t("gbExpectedReturnGuide")} label={t("expectedAnnualReturnLabel")} unit="%" step={0.5} value={account.expectedReturnPct} onChange={(v) => onUpdateAccount(accountKey, "expectedReturnPct", v)} />
      <AgeField guide={t("gbContributionEndAgeGuide")} label={t("auContributionEndAgeLabel")} value={account.contributionEndAge} onChange={(v) => onUpdateAccount(accountKey, "contributionEndAge", v)} />
      {note && <div className="stat-sub">{note}</div>}
    </div>
  );
}

// ---------- オーストラリア選択時：投資口座パネル（Super / 投資口座 / 現金 ＋ 税制） ----------
function AUInvestmentAccountsPanel({
  auInvestment, onUpdate, onUpdateAccount, age, investmentRules, taxRules,
  sgContribution, totalConcessional, concessionalRemaining, nonConcessionalRemaining,
  superContributionTax, salarySacrificeSaving, taxResult, capitalGainsTax, totalTax, marginalRate,
}) {
  const { t, money } = useContext(LocaleContext);
  // 画面に出す数値・年度・税率はすべて AU_COUNTRY_RULES から取り出す。
  const pct = (rate) => `${Number((rate * 100).toFixed(2))}`;
  const l = investmentRules.limits;
  const superTax = taxRules.superannuation;
  const split = investmentRules.splitAssets(age, auInvestment);
  const preservationAge = investmentRules.preservationAge;

  return (
    <div>
      <div className="note" style={{ marginBottom: 14 }}>
        <Info size={13} />
        <span>{t("auInvestmentSourceNote", { taxYear: investmentRules.effectiveTaxYear })}</span>
      </div>

      <Field guide={t("auAnnualSalaryGuide")} label={t("auAnnualSalaryLabel")} unit="A$" step={1000} value={auInvestment.annualSalary} onChange={(v) => onUpdate("annualSalary", v)} />
      <Field guide={t("auSalarySacrificeGuide")} label={t("auSalarySacrificeLabel")} unit="A$" step={500} value={auInvestment.voluntaryConcessional} onChange={(v) => onUpdate("voluntaryConcessional", v)} />

      <div className="stat-grid" style={{ marginTop: 12 }}>
        <StatCard
          label={t("auSgContributionLabel", { pct: pct(l.superGuaranteeRate) })}
          value={money(sgContribution)}
          sub={t("auSgContributionSub", { pct: pct(l.superGuaranteeRate) })}
        />
        <StatCard
          label={t("auConcessionalCapLabel", { taxYear: investmentRules.effectiveTaxYear })}
          value={money(l.concessionalCap)}
          sub={t("auConcessionalCapSub", { amount: money(l.concessionalCap) })}
        />
        <StatCard
          label={t("auConcessionalRemainingLabel")}
          value={money(Math.max(0, concessionalRemaining))}
          sub={t("auContributionTaxSub")}
          tone={concessionalRemaining < 0 ? "danger" : "good"}
        />
      </div>
      {concessionalRemaining < 0 && (
        <div className="note" style={{ borderLeftColor: "#C2694F", marginTop: 10 }}>
          <Info size={13} style={{ color: "#C2694F" }} />
          <span>{t("auConcessionalOverLabel", { amount: money(-concessionalRemaining) })}</span>
        </div>
      )}
      {superContributionTax.div293Applies && (
        <div className="note" style={{ borderLeftColor: "#D9A54F", marginTop: 10 }}>
          <Info size={13} style={{ color: "#D9A54F" }} />
          <span>{t("auDiv293Note", {
            threshold: money(superTax.div293Threshold),
            pct: pct(superTax.contributionsTaxRate + superTax.div293AdditionalRate),
          })}</span>
        </div>
      )}

      <AUAccountFields
        accountKey="superannuation" title={t("auSuperLabel")} account={auInvestment.superannuation}
        onUpdateAccount={onUpdateAccount} borderColor="#B08FD6"
      />
      <div className="stat-grid" style={{ marginTop: 12 }}>
        <StatCard
          label={t("auContributionTaxLabel", { pct: pct(superTax.contributionsTaxRate) })}
          value={money(superContributionTax.total)}
          sub={t("auContributionTaxSub")}
          tone="danger"
        />
        <StatCard
          label={t("auSalarySacrificeSavingLabel")}
          value={money(salarySacrificeSaving)}
          sub={t("auSalarySacrificeSavingSub", { pct: pct(marginalRate) })}
          tone="good"
        />
      </div>
      <div className="note" style={{ marginTop: 10 }}>
        <Info size={13} />
        <span>{t("auPreservationAgeNote", { age: preservationAge, unrestricted: investmentRules.unrestrictedAccessAge })}</span>
      </div>
      <div className="note" style={{ marginTop: 8 }}>
        <Info size={13} />
        <span>{t("auSuperEarningsTaxNote", {
          pct: pct(superTax.earningsTaxAccumulation),
          age: preservationAge,
          tbc: money(l.transferBalanceCap),
        })}</span>
      </div>
      <div className="note" style={{ marginTop: 8 }}>
        <Info size={13} />
        <span>{t("auMinimumDrawdownNote", {
          under65: pct(investmentRules.minimumDrawdownFactors.under65),
          age65: pct(investmentRules.minimumDrawdownFactors["65to74"]),
          age75: pct(investmentRules.minimumDrawdownFactors["75to79"]),
          age95: pct(investmentRules.minimumDrawdownFactors["95plus"]),
        })}</span>
      </div>

      <AUAccountFields
        accountKey="investmentAccount" title={t("auInvestmentAccountLabel")} account={auInvestment.investmentAccount}
        onUpdateAccount={onUpdateAccount} borderColor="#D9A54F"
      />
      <AUAccountFields
        accountKey="cashSavings" title={t("auCashSavingsLabel")} account={auInvestment.cashSavings}
        onUpdateAccount={onUpdateAccount} borderColor="#7BC9E0"
      />

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <StatCard label={t("auTotalAssetsLabel")} value={money(split.total)} sub={t("auTotalAssetsSub")} />
      </div>
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("auLiquidAssetsLabel")} value={money(split.liquid)} sub={t("auLiquidAssetsSub", { age: preservationAge })} tone="good" />
        <StatCard
          label={t("auRestrictedAssetsLabel")}
          value={money(split.restricted)}
          sub={split.isAccessibleAge
            ? t("auRestrictedAssetsSubAccessible", { age: preservationAge })
            : t("auRestrictedAssetsSubLocked", { age: preservationAge })}
        />
        <StatCard label={t("auTaxAdvantagedLabel")} value={money(split.taxAdvantaged)} sub={t("auTaxAdvantagedSub")} />
      </div>

      <div className="section-block" style={{ borderColor: "#5FB0A0", marginTop: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>
          {t("auTaxSectionLabel", { taxYear: taxRules.effectiveTaxYear })}
        </div>
        <div className="note" style={{ marginBottom: 12 }}>
          <Info size={13} />
          <span>{t("auTaxSourceNote", { taxYear: taxRules.effectiveTaxYear })}</span>
        </div>
        <Field guide={t("auCapitalGainGuide")} label={t("auCapitalGainLabel")} unit="A$" step={500} value={auInvestment.estimatedCapitalGainAnnual} onChange={(v) => onUpdate("estimatedCapitalGainAnnual", v)} />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={!!auInvestment.capitalGainHeldOver12Months}
            onChange={(e) => onUpdate("capitalGainHeldOver12Months", e.target.checked)}
          />
          <span>{t("auCapitalGainDiscountLabel", { pct: pct(taxRules.capitalGains.discountRate) })}</span>
        </label>
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <StatCard
            label={t("auIncomeTaxLabel")}
            value={money(taxResult.incomeTax)}
            sub={t("auIncomeTaxSub", { taxYear: taxRules.effectiveTaxYear })}
          />
          <StatCard
            label={t("auMedicareLevyLabel", { pct: pct(taxRules.medicareLevy.rate) })}
            value={money(taxResult.medicareLevy)}
            sub={t("auMedicareLevySub")}
          />
          <StatCard
            label={t("auCgtLabel")}
            value={money(capitalGainsTax)}
            sub={t("auCgtSub", { pct: pct(taxRules.capitalGains.discountRate) })}
          />
        </div>
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <StatCard label={t("auTotalTaxLabel")} value={money(totalTax)} sub={t("auTotalTaxSub")} tone="danger" />
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          <Info size={13} />
          <span>{t("auSuperTaxFreeNote", { age: preservationAge })}</span>
        </div>
      </div>
    </div>
  );
}

// ---------- オーストラリア選択時：退職後パネル（Age Pension → Expenses → Withdrawal） ----------
function AURetirementPanel({
  auInvestment, onUpdateAgePension, onUpdate, retirementRules,
  qualifyingAge, maxAnnual, agePensionAnnual, retirementIncomeAnnual,
  assessableAssets, expensesAnnual, healthcareAnnual, withdrawalNeeded, incomeSurplus, retireAge,
}) {
  const { t, money } = useContext(LocaleContext);
  const p = retirementRules.agePension;
  const status = auInvestment.agePension.status;
  const homeowner = !!auInvestment.agePension.homeowner;
  const statusLabel = status === "couple" ? t("auCoupleLabel") : t("auSingleLabel");

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <StatCard
          label={t("auAgePensionQualifyingAgeLabel")}
          value={t("ageYears", { age: qualifyingAge })}
          sub={t("auAgePensionMaxSub", { status: statusLabel })}
        />
        <StatCard label={t("auAgePensionMaxLabel")} value={money(maxAnnual)} sub={t("auAgePensionMaxSub", { status: statusLabel })} />
      </div>
      {retireAge < qualifyingAge && (
        <div className="note" style={{ borderLeftColor: "#D9A54F", marginBottom: 10 }}>
          <Info size={13} style={{ color: "#D9A54F" }} />
          <span>{t("auAgePensionNotYetNote", { age: qualifyingAge })}</span>
        </div>
      )}

      <div className="field-label" style={{ marginBottom: 6 }}>{t("auStatusLabel")}</div>
      <div className="chip-row" style={{ marginBottom: 10 }}>
        <button
          className={`chip ${status === "single" ? "chip-active" : ""}`}
          onClick={() => onUpdateAgePension("status", "single")}
        >{t("auSingleLabel")}</button>
        <button
          className={`chip ${status === "couple" ? "chip-active" : ""}`}
          onClick={() => onUpdateAgePension("status", "couple")}
        >{t("auCoupleLabel")}</button>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={homeowner}
          onChange={(e) => onUpdateAgePension("homeowner", e.target.checked)}
        />
        <span>{t("auHomeownerLabel")}</span>
      </label>

      <Field
        guide={t("auOtherIncomeGuide")}
        label={t("auOtherIncomeLabel")} unit="A$" step={500}
        value={auInvestment.agePension.otherAnnualIncome}
        onChange={(v) => onUpdateAgePension("otherAnnualIncome", v)}
      />

      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard
          label={t("auIncomeTestLabel")}
          value={money(retirementRules.getAgePensionByIncomeTest(auInvestment.agePension.otherAnnualIncome, status))}
          sub={t("auIncomeTestSub", {
            amount: money(retirementRules.getIncomeFreeAreaAnnual(status)),
            taper: Math.round(p.incomeTaperPerDollar * 100),
          })}
        />
        <StatCard
          label={t("auAssetsTestLabel")}
          value={money(retirementRules.getAgePensionByAssetsTest(assessableAssets, status, homeowner))}
          sub={t("auAssetsTestSub", {
            amount: money(retirementRules.getAssetsFreeArea(status, homeowner)),
            taper: p.assetsTaperPerThousandFortnightly,
          })}
        />
      </div>
      <div className="stat-grid" style={{ marginTop: 10, marginBottom: 14 }}>
        <StatCard label={t("auAgePensionAnnualLabel")} value={money(agePensionAnnual)} sub={t("auAgePensionAnnualSub")} />
        <StatCard label={t("auRetirementIncomeLabel")} value={money(retirementIncomeAnnual)} sub={t("auRetirementIncomeSub")} tone="good" />
      </div>
      {agePensionAnnual <= 0 && retireAge >= qualifyingAge && (
        <div className="note" style={{ borderLeftColor: "#C2694F", marginBottom: 10 }}>
          <Info size={13} style={{ color: "#C2694F" }} />
          <span>{t("auAgePensionZeroNote")}</span>
        </div>
      )}

      <Field
        guide={t("auExpensesMonthlyGuide")}
        label={t("auExpensesMonthlyLabel")} unit="A$" step={50}
        value={auInvestment.expensesMonthly}
        onChange={(v) => onUpdate("expensesMonthly", v)}
      />
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("auExpensesTotalLabel")} value={money(expensesAnnual + healthcareAnnual)} sub={t("auExpensesTotalSub")} />
        {withdrawalNeeded > 0 ? (
          <StatCard label={t("auWithdrawalLabel")} value={money(withdrawalNeeded)} sub={t("auWithdrawalSub")} tone="danger" />
        ) : (
          <StatCard label={t("auSurplusLabel")} value={money(incomeSurplus)} sub={t("auSurplusSub")} tone="good" />
        )}
      </div>
    </div>
  );
}

// ---------- オーストラリア選択時：医療費パネル（Medicare前提の簡易モデル） ----------
function AUHealthcarePanel({ auInvestment, onUpdate, totalAnnual }) {
  const { t, money } = useContext(LocaleContext);
  const h = auInvestment.healthcare;
  return (
    <div>
      <div className="note" style={{ marginBottom: 12 }}>
        <Info size={13} />
        <span>{t("auTaxSourceNote", { taxYear: "2026-27" })}</span>
      </div>
      <Field guide={t("auHealthcareGuide")} label={t("auGapLabel")} unit="A$" step={50} value={h.gapAnnual} onChange={(v) => onUpdate("gapAnnual", v)} />
      <Field label={t("auPrivateHealthLabel")} unit="A$" step={10} value={h.privateHealthInsuranceMonthly} onChange={(v) => onUpdate("privateHealthInsuranceMonthly", v)} />
      <Field label={t("auPharmaceuticalLabel")} unit="A$" step={50} value={h.pharmaceuticalAnnual} onChange={(v) => onUpdate("pharmaceuticalAnnual", v)} />
      <Field label={t("auDentalLabel")} unit="A$" step={50} value={h.dentalAnnual} onChange={(v) => onUpdate("dentalAnnual", v)} />
      <Field label={t("auOpticalLabel")} unit="A$" step={50} value={h.opticalAnnual} onChange={(v) => onUpdate("opticalAnnual", v)} />
      <Field label={t("auAgedCareLabel")} unit="A$" step={500} value={h.agedCareAnnual} onChange={(v) => onUpdate("agedCareAnnual", v)} />
      <Field label={t("auOtherOutOfPocketLabel")} unit="A$" step={50} value={h.otherOutOfPocketAnnual} onChange={(v) => onUpdate("otherOutOfPocketAnnual", v)} />
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("auTotalTaxLabel")} value={money(totalAnnual)} sub={t("auExpensesTotalSub")} tone="danger" />
      </div>
    </div>
  );
}

function SectionTitle({ index, title, icon: Icon }) {
  return (
    <div className="section-title">
      <span className="section-index">{index}</span>

      <Icon size={15} strokeWidth={1.75} />
      <h2>{title}</h2>
    </div>
  );
}

function StatCard({ label, value, sub, tone }) {
  return (
    <div className={`stat-card ${tone || ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// 保存データを既定値へ深くマージする。
// 【修正】従来は { ...prev, ...parsed.inputs } の浅いマージだったため、旧バージョンで保存された
// 入れ子オブジェクト（ideco / usInvestment / gbInvestment / gold / healthBrackets 等）が
// 既定値をまるごと置き換えてしまい、後から追加したフィールドが undefined になっていた。
// undefined が Field の value に入ると React が非制御コンポーネント警告を出し、計算もNaNになりうる。
// 配列（銘柄リスト等）は「保存された内容そのもの」が正しいため、マージせず置き換える。
export function mergeSavedInputs(defaults, saved) {
  if (!saved || typeof saved !== "object") return defaults;
  const out = { ...defaults };
  Object.keys(saved).forEach((key) => {
    const savedValue = saved[key];
    const defaultValue = defaults[key];
    const bothPlainObjects =
      savedValue && typeof savedValue === "object" && !Array.isArray(savedValue) &&
      defaultValue && typeof defaultValue === "object" && !Array.isArray(defaultValue);
    out[key] = bothPlainObjects ? mergeSavedInputs(defaultValue, savedValue) : savedValue;
  });
  return out;
}

const STORAGE_KEY = "nisa-lifeplan-inputs-v1";
const SNAPSHOT_PREFIX = "snapshot:";
const todayKey = () => new Date().toISOString().slice(0, 10);
const formatDateLabel = (d) => {
  const dt = new Date(d + "T00:00:00");
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
};

export default function NisaLifePlan({ onOpenBlog } = {}) {
  const [inputs, setInputs] = useState({
    country: "JP", // 表示名の切替に使用。計算ロジックは現状すべて日本のルールのまま
    baseCurrency: "JPY", // 金額表示に使用。countryとは別データ（将来、国と通貨の組み合わせを自由に変更可能にするため）
    language: "ja", // 将来のUI言語切替用（現時点ではlabel()は country ベースの表示名切替のみ）
    userName: "",
    birthDate: "",
    currentAge: 35,
    retireAge: 65,
    deathAge: 90,
    currentAssets: 0,
    currentAssetHoldings: [],
    tsumitateHoldings: [],
    tsumitateHoldingsAsOfYears: "", tsumitateHoldingsAsOfMonths: "", // この残高の基準年齢（未入力なら現在の年齢＝追加計算なし）
    growthHoldings: [],
    growthHoldingsAsOfYears: "", growthHoldingsAsOfMonths: "", // この残高の基準年齢（未入力なら現在の年齢＝追加計算なし）
    tsumitateSchedule: [],
    growthSchedule: [],
    tsumitateUsed: 0,
    growthUsed: 0,
    lumpSums: [],
    lumpAllocation: [],
    tsumitateAllocation: [],
    growthAllocation: [],
    extraFundReturns: {},
    pensionMonthly: 0,
    pensionSources: [],
    livingCostMonthly: 0,
    postRetireReturn: 3,
    postRetireReturnAuto: true,
    healthBrackets: { b60: 0, b70: 0, b80: 0 },
    inheritanceTarget: 0,
    inheritancePlans: [],
    gold: {
      currentGrams: 0,
      pricePerGram: 0,
      priceGrowthPct: 3,
      priceGrowthPctAuto: true,
      monthlyYen: 0,
      accumulateUntilAge: 65,
      asOfYears: "",
      asOfMonths: "",
    },
    banks: [],
    stockReturnPct: 6,
    stockReturnPctAuto: true,
    ideco: {
      currentValue: 0,
      principalTotal: 0,
      monthlyContribution: 0,
      startAge: 35,
      endAge: 60,
      productName: "", // 初期値は空。国を切り替えても、未入力のままなら何も入れ替わらない
      returnPct: 5,
      returnPctAuto: true,
      payoutStartAge: 60,
      payoutMethod: "lump", // "lump" | "pension" | "both"
      payoutYears: 10,
      lumpPortionPct: 50, // 併用時の一時金割合（%）
      payoutReturnPct: 0, // 受取中の想定運用利回り
      annualIncome: 0,
      asOfYears: "",
      asOfMonths: "",
    },
    loans: [],
    insurancePolicies: [],
    privatePensionPlans: [],
    // アメリカ選択時の投資口座（401(k) / Traditional IRA / Roth IRA / Brokerage）。
    // JP側のNISA関連フィールド（tsumitateSchedule等）とは完全に独立した専用データ。
    usInvestment: {
      filingStatus: "single", // "single" | "marriedJoint" | "marriedSeparate" | "headOfHousehold"
      modifiedAGI: 0,
      coveredByWorkplacePlan: false,
      spouseCoveredByWorkplacePlan: false,
      k401: { currentValue: 0, annualContribution: 0 },
      traditionalIra: { currentValue: 0, annualContribution: 0 },
      rothIra: { currentValue: 0, annualContribution: 0 },
      brokerage: { currentValue: 0, annualContribution: 0 },
      expectedReturnPct: 6, // 資産推移グラフ用の想定年率（JP版のデフォルト想定に準じた参考値）
      // ① Social Security（公的年金）
      socialSecurity: {
        piaMonthly: 0, // Full Retirement Age（67歳）時点の月額見込み（ユーザー入力・SSA statement等を参照）
        claimAge: 67, // 62〜70の範囲で選択（早期受給／通常受給／繰下げ受給）
      },
      // ③ Healthcare（米国向け）
      healthcare: {
        healthInsuranceMonthly: 0, // Medicare以外の民間医療保険料（該当する場合）
        outOfPocketAnnual: 0, // 自己負担分の年間見込み額
      },
      // ④ Tax（簡易版）
      stateTaxRatePct: 0, // 州税は州により大きく異なるため、概算の実効税率をユーザーが入力する
      estimatedCapitalGainAnnual: 0, // 年間のキャピタルゲイン実現見込み額（Brokerage口座想定）
      // ⑤ 退職後の生活費（Expenses）。JPのlivingCostMonthlyとは別データ
      expensesMonthly: 0,
    },
    // イギリス選択時の投資口座・年金・医療費。
    // JP側（NISA/iDeCo）・US側（usInvestment）とは完全に独立した専用データ。
    // 6口座それぞれが「現在額・年間積立額・想定利回り・積立終了年齢」を個別に持つ。
    gbInvestment: {
      annualIncome: 0,   // 年間総所得（Income Tax・配当税・CGT・年金税軽減の判定に使用）
      adjustedIncome: 0, // 年金拠出上限のテーパリング判定用（0なら annualIncome を使用）
      dividendIncomeAnnual: 0,
      estimatedCapitalGainAnnual: 0,
      stocksSharesIsa:  { currentValue: 0, annualContribution: 0, expectedReturnPct: 5, contributionEndAge: 65 },
      cashIsa:          { currentValue: 0, annualContribution: 0, expectedReturnPct: 3, contributionEndAge: 65 },
      sipp:             { currentValue: 0, annualContribution: 0, expectedReturnPct: 5, contributionEndAge: 65 },
      workplacePension: { currentValue: 0, annualContribution: 0, expectedReturnPct: 5, contributionEndAge: 65 },
      gia:              { currentValue: 0, annualContribution: 0, expectedReturnPct: 5, contributionEndAge: 65 },
      cashSavings:      { currentValue: 0, annualContribution: 0, expectedReturnPct: 2, contributionEndAge: 65 },
      // ② State Pension（英国の公的年金）
      statePension: {
        statePensionAge: 67,       // 生年月日により66〜67歳。GOV.UKで確認した値を入力
        claimAge: 67,              // 繰下げ受給する場合はここを引き上げる（繰上げ受給は不可）
        // 初期値は2026/27年度の満額（参考値）。実際の受給額はNational Insuranceの加入記録により
        // 異なるため、利用者がGOV.UKのforecastで確認した見込額で必ず上書きできる。
        // 数値そのものは GB_COUNTRY_RULES にのみ持たせ、ここでは参照するだけにしている。
        estimatedAnnual: Math.round(GB_COUNTRY_RULES.retirement.statePension.fullAnnualRate),
        incomeOverlapYears: 0,     // 受給開始後も収入が続く年数
        additionalPensionAnnual: 0,
      },
      // ④ Healthcare（NHS前提の簡易モデル）
      healthcare: {
        nhsBasicAnnual: 0,
        privateHealthInsuranceMonthly: 0,
        dentalAnnual: 0,
        prescriptionAnnual: 0,
        longTermCareAnnual: 0,
        otherOutOfPocketAnnual: 0,
      },
      // ⑤ 退職後の生活費。JPのlivingCostMonthly・USのusInvestment.expensesMonthlyとは別データ
      expensesMonthly: 0,
    },
    // カナダ選択時の投資口座・年金・医療費。
    // JP（NISA/iDeCo）・US（usInvestment）・GB（gbInvestment）とは完全に独立した専用データ。
    // 4口座それぞれが「現在額・年間積立額・想定利回り・積立終了年齢」を個別に持つ。
    caInvestment: {
      annualIncome: 0,        // 年間総所得（連邦所得税・RRSP税軽減・OASクローバックの判定に使用）
      priorEarnedIncome: 0,   // 前年の稼得所得（RRSP拠出枠 = この18% と $33,810 の低い方）
      estimatedCapitalGainAnnual: 0,
      tfsa:          { currentValue: 0, annualContribution: 0, expectedReturnPct: 5, contributionEndAge: 65 },
      rrsp:          { currentValue: 0, annualContribution: 0, expectedReturnPct: 5, contributionEndAge: 65 },
      nonRegistered: { currentValue: 0, annualContribution: 0, expectedReturnPct: 5, contributionEndAge: 65 },
      cashSavings:   { currentValue: 0, annualContribution: 0, expectedReturnPct: 2, contributionEndAge: 65 },
      // CPP（拠出型の公的年金）
      cpp: {
        startAge: 65,           // 60〜70歳で選択可
        // 初期値は2026年の満額（参考値）。実際の受給額は拠出履歴により大きく異なるため、
        // My Service Canada Account で確認した見込額で必ず上書きできる。
        estimatedAnnualAt65: Math.round(CA_COUNTRY_RULES.retirement.getCppMaxAnnualAt65()),
      },
      // OAS（居住年数ベースの公的年金）
      oas: {
        startAge: 65,           // 65〜70歳（繰上げ不可）
        residenceYears: 40,     // 18歳以降のカナダ居住年数（40年で満額）
      },
      additionalPensionAnnual: 0, // 職域年金など、任意の追加年金収入（年額）
      // 医療費（州の公的医療保険でカバーされる前提の簡易モデル）
      healthcare: {
        basicAnnual: 0,
        privateHealthInsuranceMonthly: 0,
        prescriptionAnnual: 0,
        dentalAnnual: 0,
        visionAnnual: 0,
        longTermCareAnnual: 0,
        otherOutOfPocketAnnual: 0,
      },
      // 退職後の生活費。他国のデータとは別項目
      expensesMonthly: 0,
    },
    // オーストラリア選択時の投資口座・年金・医療費。
    // 他国（JP/US/GB/CA）とは完全に独立した専用データ。
    auInvestment: {
      annualSalary: 0,             // 年間給与（SG拠出額・所得税・Div293の判定に使用）
      voluntaryConcessional: 0,    // 給与犠牲などの任意の税引前拠出（年額）
      estimatedCapitalGainAnnual: 0,
      capitalGainHeldOver12Months: true,
      superannuation:    { currentValue: 0, annualContribution: 0, expectedReturnPct: 7, contributionEndAge: 65 }, // annualContributionは税引後（non-concessional）拠出
      investmentAccount: { currentValue: 0, annualContribution: 0, expectedReturnPct: 7, contributionEndAge: 65 },
      cashSavings:       { currentValue: 0, annualContribution: 0, expectedReturnPct: 2, contributionEndAge: 65 },
      // Age Pension（資産・所得テストあり）
      agePension: {
        status: "single",          // "single" または "couple"
        homeowner: true,           // 持家かどうか（資産テストの無影響枠が変わる）
        otherAnnualIncome: 0,      // Age Pensionの所得テストで評価される、年金以外の年間収入
      },
      // 医療費（Medicare前提の簡易モデル）
      healthcare: {
        gapAnnual: 0,
        privateHealthInsuranceMonthly: 0,
        pharmaceuticalAnnual: 0,
        dentalAnnual: 0,
        opticalAnnual: 0,
        agedCareAnnual: 0,
        otherOutOfPocketAnnual: 0,
      },
      expensesMonthly: 0,
    },
  });
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);

  // ---------- 国際化（i18n）：国が"JP"のままなら、moneyはyenと完全に同じ結果を返す ----------
  // 重要：このブロックはファイル内で最初期（他のuseMemo/useCallbackより前）に置くこと。
  // useMemoのファクトリ関数はレンダー中に同期的に即時実行されるため、
  // t/money/label をこれより後方で定義すると初期化前アクセスのエラーになる。
  const country = inputs.country || "JP";
  const baseCurrency = inputs.baseCurrency || "JPY";
  const language = inputs.language || "ja";
  // 国別計算エンジンのルールセット。投資/年金/医療費/税制それぞれの implemented フラグを
  // 見て、未実装の国では日本の数値をそのまま見せないよう画面側で分岐する。
  const rules = useMemo(() => getCountryRules(country), [country]);
  const countryDisplayName = useMemo(
    () => SUPPORTED_COUNTRIES.find((c) => c.code === country)?.name || country,
    [country]
  );

  // ---------- アメリカ選択時の派生計算（すべて US_COUNTRY_RULES の関数のみを使用） ----------
  // country !== "US" のときは呼び出さない（JP_COUNTRY_RULES 等には同名メソッドが存在しないため）。
  const usFilingStatus = inputs.usInvestment.filingStatus;
  const usMagi = Number(inputs.usInvestment.modifiedAGI) || 0;
  const usFederalTaxResult = (country === "US" && rules.tax.implemented)
    ? rules.tax.calculateFederalTax(usMagi, usFilingStatus)
    : { taxableIncome: 0, tax: 0 };
  const usCapitalGain = Number(inputs.usInvestment.estimatedCapitalGainAnnual) || 0;
  const usLtcgTax = (country === "US" && rules.tax.implemented)
    ? rules.tax.calculateLtcgTax(usFederalTaxResult.taxableIncome, usCapitalGain, usFilingStatus)
    : 0;
  const usNiit = (country === "US" && rules.tax.implemented)
    ? rules.tax.calculateNiit(usMagi, usCapitalGain, usFilingStatus)
    : 0;
  const usStateTax = country === "US" ? usMagi * ((Number(inputs.usInvestment.stateTaxRatePct) || 0) / 100) : 0;
  const usTotalTax = usFederalTaxResult.tax + usLtcgTax + usNiit + usStateTax;

  const usMedicareAnnual = (country === "US" && rules.healthcare.implemented)
    ? rules.healthcare.getAnnualMedicarePartB(usFilingStatus, usMagi)
    : 0;
  const usHealthInsuranceAnnual = (Number(inputs.usInvestment.healthcare.healthInsuranceMonthly) || 0) * 12;
  const usOutOfPocketAnnual = Number(inputs.usInvestment.healthcare.outOfPocketAnnual) || 0;
  const usTotalHealthcareAnnual = usMedicareAnnual + usHealthInsuranceAnnual + usOutOfPocketAnnual;

  const usClaimAge = Number(inputs.usInvestment.socialSecurity.claimAge) || 67;
  const usPiaMonthly = Number(inputs.usInvestment.socialSecurity.piaMonthly) || 0;
  const usSSMonthlyBenefit = (country === "US" && rules.retirement.implemented)
    ? rules.retirement.getMonthlyBenefit(usPiaMonthly, usClaimAge)
    : 0;
  const usSSAnnualBenefit = usSSMonthlyBenefit * 12;

  const usExpensesAnnual = (Number(inputs.usInvestment.expensesMonthly) || 0) * 12;
  const usRetirementIncomeAnnual = usSSAnnualBenefit;
  const usWithdrawalNeeded = Math.max(0, usExpensesAnnual + usTotalHealthcareAnnual - usRetirementIncomeAnnual);
  const usIncomeSurplus = Math.max(0, usRetirementIncomeAnnual - (usExpensesAnnual + usTotalHealthcareAnnual));
  const usTotalInvestmentBalance =
    (Number(inputs.usInvestment.k401.currentValue) || 0) +
    (Number(inputs.usInvestment.traditionalIra.currentValue) || 0) +
    (Number(inputs.usInvestment.rothIra.currentValue) || 0) +
    (Number(inputs.usInvestment.brokerage.currentValue) || 0);

  // ---------- イギリス選択時の派生計算（すべて GB_COUNTRY_RULES の関数のみを使用） ----------
  // country !== "GB" のときは各ルール関数を呼び出さない（JP/USのルールには同名メソッドが存在しないため）。
  const gbInvestment = inputs.gbInvestment;
  const gbIsGB = country === "GB";
  const gbGrossIncome = Number(gbInvestment.annualIncome) || 0;
  const gbAdjustedIncome = Number(gbInvestment.adjustedIncome) || gbGrossIncome;

  const gbIncomeTaxResult = (gbIsGB && rules.tax.implemented)
    ? rules.tax.calculateIncomeTax(gbGrossIncome)
    : { personalAllowance: 0, taxableIncome: 0, tax: 0 };
  const gbDividendTax = (gbIsGB && rules.tax.implemented)
    ? rules.tax.calculateDividendTax(gbInvestment.dividendIncomeAnnual, gbGrossIncome)
    : 0;
  const gbCapitalGainsTax = (gbIsGB && rules.tax.implemented)
    ? rules.tax.calculateCapitalGainsTax(gbInvestment.estimatedCapitalGainAnnual, gbGrossIncome)
    : 0;
  const gbMarginalRate = (gbIsGB && rules.tax.implemented)
    ? rules.tax.getMarginalRate(gbGrossIncome)
    : 0;
  const gbPensionAnnualAllowance = (gbIsGB && rules.investment.implemented)
    ? rules.investment.getPensionAnnualAllowance(gbAdjustedIncome)
    : 0;
  const gbPensionContribution = (gbIsGB && rules.investment.implemented)
    ? rules.investment.getPensionContributed(gbInvestment)
    : 0;
  const gbPensionTaxRelief = (gbIsGB && rules.tax.implemented)
    ? rules.tax.calculatePensionTaxRelief(gbPensionContribution, gbGrossIncome, gbPensionAnnualAllowance)
    : 0;
  // 年金拠出による軽減額が税額を上回る場合でもマイナス表示にはしない
  const gbTotalTax = Math.max(0, gbIncomeTaxResult.tax + gbDividendTax + gbCapitalGainsTax - gbPensionTaxRelief);

  const gbHealthcareAnnual = (gbIsGB && rules.healthcare.implemented)
    ? rules.healthcare.getAnnualTotal(gbInvestment.healthcare)
    : 0;

  const gbStatePensionAge = Number(gbInvestment.statePension.statePensionAge) || 67;
  const gbClaimAge = Number(gbInvestment.statePension.claimAge) || gbStatePensionAge;
  const gbEffectiveClaimAge = (gbIsGB && rules.retirement.implemented)
    ? rules.retirement.getEffectiveClaimAge(gbClaimAge, gbStatePensionAge)
    : gbClaimAge;
  const gbDeferralFactor = (gbIsGB && rules.retirement.implemented)
    ? rules.retirement.getDeferralFactor(gbEffectiveClaimAge, gbStatePensionAge)
    : 1;
  const gbStatePensionAnnual = (gbIsGB && rules.retirement.implemented)
    ? rules.retirement.getAnnualBenefit(gbInvestment.statePension.estimatedAnnual, gbEffectiveClaimAge, gbStatePensionAge)
    : 0;
  const gbFullStatePensionAnnual = (gbIsGB && rules.retirement.implemented)
    ? rules.retirement.getFullAnnualRate()
    : 0;
  const gbAdditionalPensionAnnual = Number(gbInvestment.statePension.additionalPensionAnnual) || 0;
  const gbRetirementIncomeAnnual = gbStatePensionAnnual + gbAdditionalPensionAnnual;
  const gbExpensesAnnual = (Number(gbInvestment.expensesMonthly) || 0) * 12;
  const gbWithdrawalNeeded = Math.max(0, gbExpensesAnnual + gbHealthcareAnnual - gbRetirementIncomeAnnual);
  const gbIncomeSurplus = Math.max(0, gbRetirementIncomeAnnual - (gbExpensesAnnual + gbHealthcareAnnual));

  // ---------- カナダ選択時の派生計算（すべて CA_COUNTRY_RULES の関数のみを使用） ----------
  // country !== "CA" のときは各ルール関数を呼び出さない（他国のルールには同名メソッドが存在しないため）。
  const caInvestment = inputs.caInvestment;
  const caIsCA = country === "CA";
  const caGrossIncome = Number(caInvestment.annualIncome) || 0;
  const caPriorEarnedIncome = Number(caInvestment.priorEarnedIncome) || caGrossIncome;

  const caFederalTaxResult = (caIsCA && rules.tax.implemented)
    ? rules.tax.calculateFederalTax(caGrossIncome)
    : { taxableIncome: 0, grossTax: 0, basicPersonalAmount: 0, bpaCredit: 0, tax: 0 };
  const caCapitalGainsTax = (caIsCA && rules.tax.implemented)
    ? rules.tax.calculateCapitalGainsTax(caInvestment.estimatedCapitalGainAnnual, caGrossIncome)
    : 0;
  const caMarginalRate = (caIsCA && rules.tax.implemented) ? rules.tax.getMarginalRate(caGrossIncome) : 0;
  const caRrspRoom = (caIsCA && rules.investment.implemented)
    ? rules.investment.getRrspRoom(caPriorEarnedIncome)
    : 0;
  const caRrspTaxSaving = (caIsCA && rules.tax.implemented)
    ? rules.tax.calculateRrspTaxSaving(caInvestment.rrsp.annualContribution, caGrossIncome, caRrspRoom)
    : 0;
  // 税額合計（RRSP拠出による軽減後）。軽減が税額を上回ってもマイナス表示にはしない。
  const caTotalTax = Math.max(0, caFederalTaxResult.tax + caCapitalGainsTax - caRrspTaxSaving);

  const caHealthcareAnnual = (caIsCA && rules.healthcare.implemented)
    ? rules.healthcare.getAnnualTotal(caInvestment.healthcare)
    : 0;

  const caCppStartAge = Number(caInvestment.cpp.startAge) || 65;
  const caCppFactor = (caIsCA && rules.retirement.implemented) ? rules.retirement.getCppFactor(caCppStartAge) : 1;
  const caCppAnnual = (caIsCA && rules.retirement.implemented)
    ? rules.retirement.getCppAnnualBenefit(caInvestment.cpp.estimatedAnnualAt65, caCppStartAge)
    : 0;
  const caCppMaxAnnual = (caIsCA && rules.retirement.implemented) ? rules.retirement.getCppMaxAnnualAt65() : 0;

  const caOasStartAge = Number(caInvestment.oas.startAge) || 65;
  const caOasEffectiveStartAge = (caIsCA && rules.retirement.implemented)
    ? rules.retirement.getOasEffectiveStartAge(caOasStartAge)
    : caOasStartAge;
  const caOasFactor = (caIsCA && rules.retirement.implemented) ? rules.retirement.getOasFactor(caOasStartAge) : 1;
  const caOasResidenceFraction = (caIsCA && rules.retirement.implemented)
    ? rules.retirement.getOasResidenceFraction(caInvestment.oas.residenceYears)
    : 0;
  // 退職時点の年齢でOAS満額を評価する（75歳以降は10%上乗せ）
  const caOasBeforeClawback = (caIsCA && rules.retirement.implemented)
    ? rules.retirement.getOasAnnualBeforeClawback(caOasEffectiveStartAge, caOasStartAge, caInvestment.oas.residenceYears)
    : 0;
  // クローバックの判定に使う純所得＝年間総所得（利用者が退職後の想定所得を入力する）
  const caOasClawback = (caIsCA && rules.retirement.implemented)
    ? rules.retirement.getOasClawback(caGrossIncome, caOasBeforeClawback)
    : 0;
  const caOasAnnual = caOasBeforeClawback - caOasClawback;

  const caAdditionalPensionAnnual = Number(caInvestment.additionalPensionAnnual) || 0;
  const caRetirementIncomeAnnual = caCppAnnual + caOasAnnual + caAdditionalPensionAnnual;
  const caExpensesAnnual = (Number(caInvestment.expensesMonthly) || 0) * 12;
  const caWithdrawalNeeded = Math.max(0, caExpensesAnnual + caHealthcareAnnual - caRetirementIncomeAnnual);
  const caIncomeSurplus = Math.max(0, caRetirementIncomeAnnual - (caExpensesAnnual + caHealthcareAnnual));

  // ---------- オーストラリア選択時の派生計算（すべて AU_COUNTRY_RULES の関数のみを使用） ----------
  const auInvestment = inputs.auInvestment;
  const auIsAU = country === "AU";
  const auSalary = Number(auInvestment.annualSalary) || 0;
  const auVoluntaryConcessional = Number(auInvestment.voluntaryConcessional) || 0;

  const auSgContribution = (auIsAU && rules.investment.implemented)
    ? rules.investment.getEmployerSgContribution(auSalary) : 0;
  const auTotalConcessional = (auIsAU && rules.investment.implemented)
    ? rules.investment.getTotalConcessional(auSalary, auVoluntaryConcessional) : 0;
  const auConcessionalCap = (auIsAU && rules.investment.implemented)
    ? rules.investment.getConcessionalCap() : 0;
  const auConcessionalRemaining = auConcessionalCap - auTotalConcessional;
  const auNonConcessionalRemaining = (auIsAU && rules.investment.implemented)
    ? rules.investment.getNonConcessionalRemaining(auInvestment.superannuation.annualContribution) : 0;

  // 課税所得＝給与 − 給与犠牲（税引前拠出は課税所得から控除される）
  const auTaxableIncome = Math.max(0, auSalary - auVoluntaryConcessional);
  const auTaxResult = (auIsAU && rules.tax.implemented)
    ? rules.tax.calculateTotalTax(auTaxableIncome)
    : { incomeTax: 0, medicareLevy: 0, total: 0 };
  const auMarginalRate = (auIsAU && rules.tax.implemented)
    ? rules.tax.getMarginalRateWithLevy(auTaxableIncome) : 0;
  const auSuperContributionTax = (auIsAU && rules.tax.implemented)
    ? rules.tax.calculateSuperContributionTax(auTotalConcessional, auTaxableIncome)
    : { baseTax: 0, div293Tax: 0, total: 0, effectiveRate: 0, div293Applies: false };
  const auSalarySacrificeSaving = (auIsAU && rules.tax.implemented)
    ? rules.tax.calculateSalarySacrificeSaving(auVoluntaryConcessional, auSalary) : 0;
  const auCapitalGainsTax = (auIsAU && rules.tax.implemented)
    ? rules.tax.calculateCapitalGainsTax(
        auInvestment.estimatedCapitalGainAnnual,
        auTaxableIncome,
        auInvestment.capitalGainHeldOver12Months
      )
    : 0;
  const auTotalTax = auTaxResult.total + auCapitalGainsTax;

  const auHealthcareAnnual = (auIsAU && rules.healthcare.implemented)
    ? rules.healthcare.getAnnualTotal(auInvestment.healthcare) : 0;

  // Age Pension：資産テストの対象資産は、退職時点の総資産（3口座の合計）で評価する。
  // （Superは受給資格年齢に達すると資産テストの対象になる）
  const auAssetSplitAtRetire = (auIsAU && rules.investment.implemented)
    ? rules.investment.splitAssets(inputs.retireAge, inputs.auInvestment)
    : { liquid: 0, restricted: 0, taxAdvantaged: 0, total: 0, isAccessibleAge: false };
  const auAgePensionQualifyingAge = (auIsAU && rules.retirement.implemented)
    ? rules.retirement.getQualifyingAge() : 67;
  const auAgePensionMaxAnnual = (auIsAU && rules.retirement.implemented)
    ? rules.retirement.getMaxAnnual(auInvestment.agePension.status) : 0;
  const auAgePensionAnnual = (auIsAU && rules.retirement.implemented)
    ? rules.retirement.getAgePension({
        age: Math.max(inputs.retireAge, auAgePensionQualifyingAge),
        annualIncome: auInvestment.agePension.otherAnnualIncome,
        assessableAssets: auAssetSplitAtRetire.total,
        status: auInvestment.agePension.status,
        homeowner: auInvestment.agePension.homeowner,
      })
    : 0;
  const auOtherAnnualIncome = Number(auInvestment.agePension.otherAnnualIncome) || 0;
  const auRetirementIncomeAnnual = auAgePensionAnnual + auOtherAnnualIncome;
  const auExpensesAnnual = (Number(auInvestment.expensesMonthly) || 0) * 12;
  const auWithdrawalNeeded = Math.max(0, auExpensesAnnual + auHealthcareAnnual - auRetirementIncomeAnnual);
  const auIncomeSurplus = Math.max(0, auRetirementIncomeAnnual - (auExpensesAnnual + auHealthcareAnnual));

  const money = useCallback((n) => formatMoneyFor(baseCurrency, n), [baseCurrency]);
  const label = useCallback((key) => getCategoryLabel(key, country), [country]);
  const t = useCallback((key, vars) => translateWith(language, key, vars), [language]);
  const localeValue = useMemo(
    () => ({ country, baseCurrency, language, money, label, t, rules }),
    [country, baseCurrency, language, money, label, t, rules]
  );
  // Field/表示用の単位文字列（通貨のみ切替、円建て表示のロジック自体は変更しない）
  const currencySymbol = (CURRENCY_BY_CODE[baseCurrency] || CURRENCY_BY_CODE.JPY).symbol;
  const uCurrency = baseCurrency === "JPY" ? "円" : currencySymbol;
  const uPerMonth = baseCurrency === "JPY" ? "円/月" : `${currencySymbol}/month`;
  const uPerYear = baseCurrency === "JPY" ? "円/年" : `${currencySymbol}/year`;
  const uPerGram = baseCurrency === "JPY" ? "円/g" : `${currencySymbol}/g`;
  const uYears = language === "ja" ? "年" : "years";
  const dateLocale = language === "ja" ? "ja-JP" : (language === "en-GB" ? "en-GB" : "en-US");
  const formatAge = useCallback((age) => {
    const y = Math.floor(age + 1e-9);
    const m = Math.round((age - y) * 12);
    return m > 0 ? t("ageYM", { years: y, months: m }) : t("ageYears", { age: y });
  }, [t]);
  const [newStock, setNewStock] = useState({ name: "", sector: "" });
  const [newLump, setNewLump] = useState({ years: "", months: "", amount: "" });
  const [newTsumitateRange, setNewTsumitateRange] = useState({
    fromYears: "", fromMonths: "", toYears: "", toMonths: "", monthlyYen: "",
  });
  const [newGrowthRange, setNewGrowthRange] = useState({
    fromYears: "", fromMonths: "", toYears: "", toMonths: "", monthlyYen: "",
  });
  const [newBank, setNewBank] = useState({ name: "", balance: "", monthlyDeposit: "", interestPct: "" });
  const [newInheritance, setNewInheritance] = useState({ name: "", relation: "", amount: "" });
  const [newPensionSource, setNewPensionSource] = useState({ name: "", monthlyAmount: "" });
  const [newAssetHolding, setNewAssetHolding] = useState({ name: "", value: "" });
  const [newTsumitateHolding, setNewTsumitateHolding] = useState({ name: "", value: "" });
  const [newGrowthHolding, setNewGrowthHolding] = useState({ name: "", value: "" });
  const [newLoan, setNewLoan] = useState({ name: "", principal: "", annualRatePct: "", monthlyPayment: "" });
  const [newInsurance, setNewInsurance] = useState({
    name: "",
    premiumFromYears: "", premiumFromMonths: "",
    premiumToYears: "", premiumToMonths: "",
    monthlyPremium: "",
    coverageUntilYears: "", coverageUntilMonths: "",
    hospitalizationPerDay: "", hospitalizationDaysLimit: "", hospitalizationSurgery: "", daySurgery: "",
    radiationPerSession: "", advancedMedical: "", death: "",
  });
  const [newPension, setNewPension] = useState({
    name: "",
    contribFromYears: "", contribFromMonths: "",
    contribToYears: "", contribToMonths: "",
    monthlyContribution: "",
    payoutFromYears: "", payoutFromMonths: "",
    payoutToYears: "", payoutToMonths: "",
    monthlyPayout: "",
    currentBalance: "",
  });
  const [newLumpAllocItem, setNewLumpAllocItem] = useState({ name: "", amount: "" });
  const [newTsumitateAllocItem, setNewTsumitateAllocItem] = useState({ name: "", amount: "" });
  const [newGrowthAllocItem, setNewGrowthAllocItem] = useState({ name: "", amount: "" });
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error | unavailable
  const [saveMessage, setSaveMessage] = useState("");

  // load persisted inputs
  useEffect(() => {
    (async () => {
      if (!window.storage) {
        setSaveStatus("unavailable");
        setSaveMessage(t("saveMessageUnavailable"));
        setLoaded(true);
        return;
      }
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res?.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.inputs) setInputs((prev) => mergeSavedInputs(prev, parsed.inputs));
          if (parsed.watchlist) setWatchlist(parsed.watchlist);
        }
      } catch (e) {
        // no saved data yet — this is normal on first use, not an error
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const [historyDebug, setHistoryDebug] = useState("");
  const [showBackup, setShowBackup] = useState(false);
  const [showTodayTotal, setShowTodayTotal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importOk, setImportOk] = useState(false);

  const backupText = useMemo(() => {
    try {
      return JSON.stringify({ inputs, watchlist }, null, 2);
    } catch (e) {
      return "";
    }
  }, [inputs, watchlist]);

  const importBackup = () => {
    setImportError("");
    setImportOk(false);
    try {
      const parsed = JSON.parse(importText);
      if (!parsed.inputs) throw new Error(t("importInputsNotFoundError"));
      setInputs((prev) => mergeSavedInputs(prev, parsed.inputs));
      if (parsed.watchlist) setWatchlist(parsed.watchlist);
      setImportOk(true);
    } catch (e) {
      setImportError(t("importFailedError", { message: e?.message || "" }));
    }
  };

  const refreshHistory = useCallback(async () => {
    if (!window.storage) {
      setHistoryDebug(t("storageUnavailableDebug"));
      return;
    }
    try {
      const list = await window.storage.list(SNAPSHOT_PREFIX, false);
      const keys = list?.keys || [];
      setHistoryDebug(t("storageKeyCountDebug", { count: keys.length }));
      if (!keys.length) return; // nothing stored yet — leave any locally-known entries as-is
      const entries = await Promise.all(
        keys.map(async (k) => {
          try {
            const res = await window.storage.get(k, false);
            return res?.value ? JSON.parse(res.value) : null;
          } catch (e) { return null; }
        })
      );
      const clean = entries.filter(Boolean);
      // merge with whatever is already in local state instead of replacing outright,
      // so an in-progress save from this session is never clobbered by a stale fetch
      setHistory((prev) => {
        const map = new Map(prev.map((h) => [h.date, h]));
        clean.forEach((h) => map.set(h.date, h));
        return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
      });
    } catch (e) {
      setHistoryDebug(t("historyFetchErrorDebug", { message: e?.message || t("unknownShort") }));
    }
  }, [t]);

  const save = useCallback(async (nextInputs, nextWatchlist) => {
    if (!window.storage) {
      setSaveStatus("unavailable");
      setSaveMessage(t("saveMessageUnavailable"));
      return;
    }
    setSaveStatus("saving");
    try {
      await window.storage.set(
        STORAGE_KEY,
        JSON.stringify({ inputs: nextInputs, watchlist: nextWatchlist }),
        false
      );
      // record (or overwrite) today's dated snapshot so history builds up day by day
      const date = todayKey();
      const bankTotal = (nextInputs.banks || []).reduce((s, b) => s + (b.balance || 0), 0);
      const snapshot = {
        date,
        currentAssets: (nextInputs.tsumitateHoldings || []).reduce((s, h) => s + (h.value || 0), 0)
          + (nextInputs.growthHoldings || []).reduce((s, h) => s + (h.value || 0), 0),
        tsumitateUsed: nextInputs.tsumitateUsed,
        growthUsed: nextInputs.growthUsed,
        goldGrams: nextInputs.gold?.currentGrams ?? 0,
        bankTotal,
        inputs: nextInputs,
        watchlist: nextWatchlist,
      };
      await window.storage.set(SNAPSHOT_PREFIX + date, JSON.stringify(snapshot), false);
      // upsert today's entry locally so the history list reflects it immediately
      // without re-fetching every stored snapshot on each keystroke
      setHistory((prev) => {
        const others = prev.filter((h) => h.date !== date);
        return [snapshot, ...others].sort((a, b) => (a.date < b.date ? 1 : -1));
      });
      setSaveStatus("saved");
      setSaveMessage(t("saveMessageLastSaved", { time: new Date().toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" }) }));
    } catch (e) {
      setSaveStatus("error");
      setSaveMessage(t("saveMessageFailed", { error: e?.message || t("unknownError") }));
    }
  }, [t, dateLocale]);

  useEffect(() => {
    if (loaded) save(inputs, watchlist);
  }, [inputs, watchlist, loaded, save]);

  useEffect(() => {
    if (loaded) refreshHistory();
  }, [loaded, refreshHistory]);

  const restoreSnapshot = (entry) => {
    if (entry.inputs) setInputs((prev) => mergeSavedInputs(prev, entry.inputs));
    if (entry.watchlist) setWatchlist(entry.watchlist);
  };
  const scrollToSimulator = () => {
    document.getElementById("simulator")?.scrollIntoView({ behavior: "smooth" });
  };
  const deleteSnapshot = async (date) => {
    try {
      await window.storage?.delete(SNAPSHOT_PREFIX + date, false);
      setHistory((prev) => prev.filter((h) => h.date !== date));
    } catch (e) {
      // ignore
    }
  };

  const update = (patch) => setInputs((prev) => ({ ...prev, ...patch }));
  const updateExtraFundReturn = (name, val) =>
    setInputs((prev) => ({ ...prev, extraFundReturns: { ...prev.extraFundReturns, [name]: val } }));
  const updateHealth = (key, val) =>
    setInputs((prev) => ({ ...prev, healthBrackets: { ...prev.healthBrackets, [key]: val } }));
  const updateGold = (key, val) =>
    setInputs((prev) => ({ ...prev, gold: { ...prev.gold, [key]: val } }));
  const updateIdeco = (key, val) =>
    setInputs((prev) => ({ ...prev, ideco: { ...prev.ideco, [key]: val } }));
  const updateUsInvestment = (key, val) =>
    setInputs((prev) => ({ ...prev, usInvestment: { ...prev.usInvestment, [key]: val } }));
  const updateUsInvestmentAccount = (accountKey, field, val) =>
    setInputs((prev) => ({
      ...prev,
      usInvestment: {
        ...prev.usInvestment,
        [accountKey]: { ...prev.usInvestment[accountKey], [field]: val },
      },
    }));
  // socialSecurity / healthcare も同じ入れ子構造なので同じ更新関数を流用できる
  const updateUsInvestmentNested = updateUsInvestmentAccount;

  const updateGbInvestment = (key, val) =>
    setInputs((prev) => ({ ...prev, gbInvestment: { ...prev.gbInvestment, [key]: val } }));
  const updateGbInvestmentAccount = (accountKey, field, val) =>
    setInputs((prev) => ({
      ...prev,
      gbInvestment: {
        ...prev.gbInvestment,
        [accountKey]: { ...prev.gbInvestment[accountKey], [field]: val },
      },
    }));
  // statePension / healthcare も同じ入れ子構造なので同じ更新関数を流用できる
  const updateGbInvestmentNested = updateGbInvestmentAccount;

  const updateCaInvestment = (key, val) =>
    setInputs((prev) => ({ ...prev, caInvestment: { ...prev.caInvestment, [key]: val } }));
  const updateCaInvestmentAccount = (accountKey, field, val) =>
    setInputs((prev) => ({
      ...prev,
      caInvestment: {
        ...prev.caInvestment,
        [accountKey]: { ...prev.caInvestment[accountKey], [field]: val },
      },
    }));
  // cpp / oas / healthcare も同じ入れ子構造なので同じ更新関数を流用できる
  const updateCaInvestmentNested = updateCaInvestmentAccount;

  const updateAuInvestment = (key, val) =>
    setInputs((prev) => ({ ...prev, auInvestment: { ...prev.auInvestment, [key]: val } }));
  const updateAuInvestmentAccount = (accountKey, field, val) =>
    setInputs((prev) => ({
      ...prev,
      auInvestment: {
        ...prev.auInvestment,
        [accountKey]: { ...prev.auInvestment[accountKey], [field]: val },
      },
    }));
  // agePension / healthcare も同じ入れ子構造なので同じ更新関数を流用できる
  const updateAuInvestmentNested = updateAuInvestmentAccount;

  // 積立・成長投資枠・一括投資の銘柄別内訳、および「つみたて/成長投資枠：実際の残高」に入力された銘柄を集約して、
  // そのままスライダー（自動計算・操作不可）として表示する
  const allBreakdownItems = [
    ...(inputs.lumpAllocation || []),
    ...(inputs.tsumitateAllocation || []),
    ...(inputs.growthAllocation || []),
    ...(inputs.tsumitateHoldings || []).map((h) => ({ name: h.name, amount: h.value })),
    ...(inputs.growthHoldings || []).map((h) => ({ name: h.name, amount: h.value })),
  ];
  const fundNames = [...new Set(allBreakdownItems.filter((it) => it.name && it.name.trim()).map((it) => it.name))];
  const fundAmounts = fundNames.reduce((acc, name) => {
    acc[name] = allBreakdownItems.reduce((s, it) => (it.name === name ? s + (it.amount || 0) : s), 0);
    return acc;
  }, {});
  const combinedGrandTotal = fundNames.reduce((s, n) => s + fundAmounts[n], 0);
  const dynamicFunds = combinedGrandTotal > 0
    ? fundNames.map((name) => ({
        id: name,
        pct: (fundAmounts[name] / combinedGrandTotal) * 100,
        returnPct: (inputs.extraFundReturns && inputs.extraFundReturns[name] !== undefined) ? inputs.extraFundReturns[name] : guessDefaultReturn(name),
      }))
    : [];

  // 生年月日が入力されていれば、今日時点での正確な年齢（日単位）をそこから自動計算し、
  // 現在の年齢として全体のシミュレーションに反映する
  const preciseAge = useMemo(() => computeAgeFromBirthDate(inputs.birthDate), [inputs.birthDate]);
  const effectiveCurrentAge = preciseAge ? preciseAge.decimal : inputs.currentAge;

  // ①401(k)②Traditional IRA③Roth IRA④Brokerageを、現在の年齢時点で
  // Liquid/Accessible（引き出し可能）とRetirement/Restricted（制約付き）に分ける。
  // 合計は必ずusTotalInvestmentBalanceと一致する（内訳のみの分離のため）。
  const usLiquidRestrictedSplit = (country === "US" && rules.investment.implemented)
    ? rules.investment.splitLiquidRestricted(effectiveCurrentAge, {
        k401: inputs.usInvestment.k401.currentValue,
        traditionalIra: inputs.usInvestment.traditionalIra.currentValue,
        rothIra: inputs.usInvestment.rothIra.currentValue,
        brokerage: inputs.usInvestment.brokerage.currentValue,
      })
    : { liquid: 0, restricted: 0, isAccessibleAge: false };

  // イギリス選択時：6口座を Liquid / Restricted / Tax-Advantaged に分ける。
  // total は6口座の単純合計（＝ Liquid + Restricted）。Tax-Advantaged は横断的な内訳のため合計には含めない。
  const gbAssetSplit = (country === "GB" && rules.investment.implemented)
    ? rules.investment.splitAssets(effectiveCurrentAge, inputs.gbInvestment)
    : { liquid: 0, restricted: 0, taxAdvantaged: 0, total: 0, isAccessibleAge: false };

  // カナダ選択時：4口座を Liquid / Restricted / Tax-Advantaged に分ける。
  // total は4口座の単純合計（＝ Liquid + Restricted）。
  const caAssetSplit = (country === "CA" && rules.investment.implemented)
    ? rules.investment.splitAssets(effectiveCurrentAge, inputs.caInvestment)
    : { liquid: 0, restricted: 0, taxAdvantaged: 0, total: 0, isRrifPhase: false };

  // オーストラリア選択時：3口座を Liquid / Restricted / Tax-Advantaged に分ける。
  const auAssetSplit = (country === "AU" && rules.investment.implemented)
    ? rules.investment.splitAssets(effectiveCurrentAge, inputs.auInvestment)
    : { liquid: 0, restricted: 0, taxAdvantaged: 0, total: 0, isAccessibleAge: false };

  // 銘柄名から、その銘柄の想定年率（利回り）を取得する（銘柄別内訳のスライダーで手動調整した値があればそちらを優先）
  const getFundReturnPct = (name) =>
    (inputs.extraFundReturns && inputs.extraFundReturns[name] !== undefined) ? inputs.extraFundReturns[name] : guessDefaultReturn(name);

  // カテゴリ（つみたて／成長／一括投資）の銘柄別内訳から、加重平均の想定利回りを算出する
  // （経過分の積立額を複利で運用成長させる際の利回りとして使う。内訳が空ならフォールバック値を使う）
  const categoryWeightedReturn = (allocationList, fallback) => {
    const named = (allocationList || []).filter((it) => it.name && it.name.trim());
    if (!named.length) return fallback;
    const total = named.reduce((s, it) => s + (it.amount || 0), 0);
    if (total <= 0) return fallback;
    return named.reduce((s, it) => s + (it.amount / total) * getFundReturnPct(it.name), 0);
  };

  // 一括投資：それぞれの投資日から現在まで、想定利回りで複利運用したものとして評価額を計算する
  // （投資した金額をそのまま元本として加え、その時点から利回りを積み上げていく）
  const lumpScheduleReturn = categoryWeightedReturn(inputs.lumpAllocation, guessDefaultReturn("全世界株式"));
  const lumpElapsedTotal = compoundedLumpSumValue(inputs.lumpSums, effectiveCurrentAge, lumpScheduleReturn);

  const autoHoldingRowsFor = (allocationList, elapsedTotal, categoryLabel) => {
    const named = (allocationList || []).filter((it) => it.name && it.name.trim());
    if (named.length === 0) return [];
    const listTotal = named.reduce((s, it) => s + (it.amount || 0), 0);
    return named.map((it) => ({
      name: `${it.name}（${categoryLabel}）`,
      value: listTotal > 0 ? (it.amount / listTotal) * elapsedTotal : 0,
    }));
  };

  // 「実際の残高」の基準年齢（年・月の入力から小数年齢に変換。未入力なら null＝現在の年齢として扱う＝追加計算なし）
  const tsumitateHoldingsAsOfAge = (inputs.tsumitateHoldingsAsOfYears !== "" && inputs.tsumitateHoldingsAsOfYears !== undefined && inputs.tsumitateHoldingsAsOfYears !== null)
    ? Number(inputs.tsumitateHoldingsAsOfYears || 0) + Number(inputs.tsumitateHoldingsAsOfMonths || 0) / 12
    : null;
  const growthHoldingsAsOfAge = (inputs.growthHoldingsAsOfYears !== "" && inputs.growthHoldingsAsOfYears !== undefined && inputs.growthHoldingsAsOfYears !== null)
    ? Number(inputs.growthHoldingsAsOfYears || 0) + Number(inputs.growthHoldingsAsOfMonths || 0) / 12
    : null;

  // 手入力した「実際の残高」（＝基準年齢時点で実際にいくらだったかという金額）を、
  // その銘柄の想定利回りで基準年齢〜現在まで複利成長させる（基準年齢が未入力ならそのままの金額を使う）
  const tsumitateHoldingsManualTotal = (inputs.tsumitateHoldings || []).reduce((s, h) => {
    const rate = getFundReturnPct(h.name);
    return s + compoundPrincipal(h.value || 0, tsumitateHoldingsAsOfAge, effectiveCurrentAge, rate);
  }, 0);
  const growthHoldingsManualTotal = (inputs.growthHoldings || []).reduce((s, h) => {
    const rate = getFundReturnPct(h.name);
    return s + compoundPrincipal(h.value || 0, growthHoldingsAsOfAge, effectiveCurrentAge, rate);
  }, 0);

  // つみたて・成長投資枠のスケジュール（毎月投資額）に沿って、これまで実際に引き落とされてきたはずの金額を、
  // その都度（引き落とされた月ごとに）想定利回りで複利運用したものとして自動計算する
  // （一括投資と同様、これは基準年齢の入力有無に関わらず常に自動で計算される。手入力の「実際の残高」とは別建てで加算されるため、
  // 　手入力欄にはスケジュールで既に積み立てられている分を重複して含めないよう入力してください）
  const tsumitateScheduleReturn = categoryWeightedReturn(inputs.tsumitateAllocation, guessDefaultReturn("全世界株式"));
  const growthScheduleReturn = categoryWeightedReturn(inputs.growthAllocation, guessDefaultReturn("全世界株式"));
  const tsumitateCatchUp = compoundedElapsedValue(inputs.tsumitateSchedule, 0, effectiveCurrentAge, tsumitateScheduleReturn);
  const growthCatchUp = compoundedElapsedValue(inputs.growthSchedule, 0, effectiveCurrentAge, growthScheduleReturn);

  const tsumitateHoldingsTotal = tsumitateHoldingsManualTotal + tsumitateCatchUp;
  const growthHoldingsTotal = growthHoldingsManualTotal + growthCatchUp;

  // 時価（自動計算）の一覧：一括投資に加え、つみたて・成長投資枠のスケジュール分もまとめて銘柄別に表示する
  const autoHoldingRows = [
    ...autoHoldingRowsFor(inputs.tsumitateAllocation, tsumitateCatchUp, t("tsumitateScheduleCategoryLabel")),
    ...autoHoldingRowsFor(inputs.growthAllocation, growthCatchUp, t("growthScheduleCategoryLabel")),
    ...autoHoldingRowsFor(inputs.lumpAllocation, lumpElapsedTotal, t("lumpSumCategoryLabel")),
  ];
  const autoHoldingsTotal = lumpElapsedTotal;

  // 現在のNISA資産は手入力せず、つみたて/成長投資枠の実際の残高（＋基準年齢以降の複利成長分）＋一括投資の自動計算分から完全に自動算出する
  const currentAssetHoldingsTotal = tsumitateHoldingsTotal + growthHoldingsTotal + autoHoldingsTotal;
  const effectiveCurrentAssets = currentAssetHoldingsTotal;

  // 退職後の想定利回りを、現役時代（銘柄別スライダー）の加重平均利回りの半分から自動で仮設定する
  const weightedAvgReturn = dynamicFunds.reduce((s, f) => s + (f.pct / 100) * f.returnPct, 0);
  const autoPostRetireReturn = dynamicFunds.length > 0 ? Math.round((weightedAvgReturn / 2) * 10) / 10 : inputs.postRetireReturn;
  const effectivePostRetireReturn = (inputs.postRetireReturnAuto && dynamicFunds.length > 0) ? autoPostRetireReturn : inputs.postRetireReturn;

  // iDeCo：NISAとは別の専用計算関数（受取前は生活費に使わず増やすだけ）。
  // ここで先に受取額を算出し、年金・併用の場合のみ「追加収入」としてNISA側の取り崩し計算へ渡す。
  const effectiveIdecoReturn = inputs.ideco.returnPctAuto ? guessDefaultReturn(inputs.ideco.productName) : inputs.ideco.returnPct;
  // 「現在評価額」の基準年齢（年・月の入力から小数年齢に変換。未入力なら null＝現在の年齢として扱う＝追加計算なし）
  const idecoAsOfAge = (inputs.ideco.asOfYears !== "" && inputs.ideco.asOfYears !== undefined && inputs.ideco.asOfYears !== null)
    ? Number(inputs.ideco.asOfYears || 0) + Number(inputs.ideco.asOfMonths || 0) / 12
    : null;
  const idecoSim = useMemo(
    () => runIdecoSimulation({
      currentAge: effectiveCurrentAge, deathAge: inputs.deathAge,
      ideco: { ...inputs.ideco, returnPct: effectiveIdecoReturn, asOfAge: idecoAsOfAge },
    }),
    [effectiveCurrentAge, inputs.deathAge, inputs.ideco, effectiveIdecoReturn, idecoAsOfAge]
  );
  const idecoPayoutMethod = inputs.ideco.payoutMethod;
  const getIdecoMonthlyIncome = useMemo(() => {
    if (idecoPayoutMethod !== "pension" && idecoPayoutMethod !== "both") return null;
    return (age) => (age >= idecoSim.payoutStartAge && age < idecoSim.payoutEndAge) ? idecoSim.annualPayout / 12 : 0;
  }, [idecoPayoutMethod, idecoSim.payoutStartAge, idecoSim.payoutEndAge, idecoSim.annualPayout]);

  const getIdecoSpendableLump = useMemo(() => {
    if (idecoPayoutMethod !== "lump" && idecoPayoutMethod !== "both") return null;
    // 月次シミュレーションのうち、受取開始月にだけ一時金を返す。
    return (age) => Math.abs(age - idecoSim.payoutStartAge) < (1 / 24) ? idecoSim.lumpAmount : 0;
  }, [idecoPayoutMethod, idecoSim.payoutStartAge, idecoSim.lumpAmount]);

  // 年金受給見込み額：国民年金・企業年金基金など複数の項目を追加すると、その合計が自動的に使われる
  const pensionSourcesTotal = inputs.pensionSources.reduce((s, p) => s + (p.monthlyAmount || 0), 0);
  const effectivePensionMonthly = inputs.pensionSources.length > 0 ? pensionSourcesTotal : inputs.pensionMonthly;

  const effectiveInputs = useMemo(
    () => ({
      ...inputs, dynamicFunds, currentAge: effectiveCurrentAge, currentAssets: effectiveCurrentAssets,
      postRetireReturn: effectivePostRetireReturn,
      extraRetirementIncomeMonthly: getIdecoMonthlyIncome,
      extraSpendableLumpSum: getIdecoSpendableLump,
      pensionMonthly: effectivePensionMonthly,
    }),
    [inputs, JSON.stringify(dynamicFunds), effectiveCurrentAge, effectiveCurrentAssets, effectivePostRetireReturn, getIdecoMonthlyIncome, getIdecoSpendableLump, effectivePensionMonthly]
  );

  const sim = useMemo(
    () => runSimulation(effectiveInputs, t("uncategorizedLabel"), t("phaseAccumulation"), t("phaseDrawdown")),
    [effectiveInputs, t]
  );
  const autoGoldReturn = guessDefaultReturn("金");
  const effectiveGoldReturnPct = inputs.gold.priceGrowthPctAuto ? autoGoldReturn : inputs.gold.priceGrowthPct;
  // 「現在の保有量」の基準年齢（年・月の入力から小数年齢に変換。未入力なら null＝現在の年齢として扱う＝追加計算なし）
  const goldAsOfAge = (inputs.gold.asOfYears !== "" && inputs.gold.asOfYears !== undefined && inputs.gold.asOfYears !== null)
    ? Number(inputs.gold.asOfYears || 0) + Number(inputs.gold.asOfMonths || 0) / 12
    : null;
  const goldSim = useMemo(
    () => runGoldSimulation({ currentAge: effectiveCurrentAge, deathAge: inputs.deathAge, gold: { ...inputs.gold, priceGrowthPct: effectiveGoldReturnPct, asOfAge: goldAsOfAge } }),
    [effectiveCurrentAge, inputs.deathAge, inputs.gold, effectiveGoldReturnPct, goldAsOfAge]
  );
  const bankSim = useMemo(
    () => runBankSimulation({
      currentAge: effectiveCurrentAge, retireAge: inputs.retireAge, deathAge: inputs.deathAge, banks: inputs.banks,
    }),
    [effectiveCurrentAge, inputs.retireAge, inputs.deathAge, inputs.banks]
  );
  const stockTotalNow = useMemo(() => watchlist.reduce((s, w) => s + (w.value || 0), 0), [watchlist]);
  const stockAllocationItems = useMemo(
    () => watchlist.filter((w) => (w.value || 0) > 0).map((w) => ({ name: w.name, amount: w.value })),
    [watchlist]
  );
  const autoStockReturn = useMemo(() => {
    const held = watchlist.filter((w) => (w.value || 0) > 0);
    const total = held.reduce((s, w) => s + w.value, 0);
    if (total <= 0) return inputs.stockReturnPct;
    return Math.round((held.reduce((s, w) => s + (w.value / total) * guessDefaultReturn(w.name), 0)) * 10) / 10;
  }, [watchlist, inputs.stockReturnPct]);
  const effectiveStockReturnPct = inputs.stockReturnPctAuto ? autoStockReturn : inputs.stockReturnPct;
  const stockSim = useMemo(
    () => runStockSim({ currentAge: effectiveCurrentAge, deathAge: inputs.deathAge, totalValue: stockTotalNow, returnPct: effectiveStockReturnPct }),
    [effectiveCurrentAge, inputs.deathAge, stockTotalNow, effectiveStockReturnPct]
  );
  const loanSim = useMemo(
    () => runLoanSimulation({ currentAge: effectiveCurrentAge, deathAge: inputs.deathAge, loans: inputs.loans }),
    [effectiveCurrentAge, inputs.deathAge, inputs.loans]
  );
  const insuranceSim = useMemo(
    () => runInsuranceSimulation({ currentAge: effectiveCurrentAge, deathAge: inputs.deathAge, policies: inputs.insurancePolicies }),
    [effectiveCurrentAge, inputs.deathAge, inputs.insurancePolicies]
  );
  const pensionSim = useMemo(
    () => runPrivatePensionSimulation({ currentAge: effectiveCurrentAge, deathAge: inputs.deathAge, plans: inputs.privatePensionPlans }),
    [effectiveCurrentAge, inputs.deathAge, inputs.privatePensionPlans]
  );

  // アメリカ選択時：401(k)/Traditional IRA/Roth IRA/Brokerageの残高推移シミュレーション。
  // JPのrunSimulation（NISA専用）とは完全に独立しており、US_COUNTRY_RULES.investment.simulateGrowth
  // のみを使用する。country !== "US" のときは計算自体を行わない（空データを返すだけ）。
  const usInvestmentSim = useMemo(() => {
    if (country !== "US" || !rules.investment.implemented) {
      return { yearly: [], finalValue: 0 };
    }
    return rules.investment.simulateGrowth({
      currentAge: effectiveCurrentAge,
      retireAge: inputs.retireAge,
      deathAge: inputs.deathAge,
      accounts: inputs.usInvestment,
      returnPct: inputs.usInvestment.expectedReturnPct,
      annualWithdrawalNeeded: usWithdrawalNeeded,
    });
  }, [country, rules, effectiveCurrentAge, inputs.retireAge, inputs.deathAge, inputs.usInvestment, usWithdrawalNeeded]);

  // イギリス選択時：ISA / SIPP / 職域年金 / GIA / Cash Savings の残高推移シミュレーション。
  // GB_COUNTRY_RULES.investment.simulateGrowth のみを使用し、JP（runSimulation）・US（US側のsimulateGrowth）
  // とは完全に独立している。country !== "GB" のときは計算自体を行わない（空データを返すだけ）。
  const gbInvestmentSim = useMemo(() => {
    if (country !== "GB" || !rules.investment.implemented) {
      return { yearly: [], finalValue: 0 };
    }
    return rules.investment.simulateGrowth({
      currentAge: effectiveCurrentAge,
      retireAge: inputs.retireAge,
      deathAge: inputs.deathAge,
      accounts: inputs.gbInvestment,
      annualWithdrawalNeeded: gbWithdrawalNeeded,
    });
  }, [country, rules, effectiveCurrentAge, inputs.retireAge, inputs.deathAge, inputs.gbInvestment, gbWithdrawalNeeded]);

  // カナダ選択時：TFSA / RRSP / 非登録口座 / 現金 の残高推移シミュレーション。
  // CA_COUNTRY_RULES.investment.simulateGrowth のみを使用し、他国とは完全に独立している。
  // country !== "CA" のときは計算自体を行わない（空データを返すだけ）。
  const caInvestmentSim = useMemo(() => {
    if (country !== "CA" || !rules.investment.implemented) {
      return { yearly: [], finalValue: 0 };
    }
    return rules.investment.simulateGrowth({
      currentAge: effectiveCurrentAge,
      retireAge: inputs.retireAge,
      deathAge: inputs.deathAge,
      accounts: inputs.caInvestment,
      annualWithdrawalNeeded: caWithdrawalNeeded,
    });
  }, [country, rules, effectiveCurrentAge, inputs.retireAge, inputs.deathAge, inputs.caInvestment, caWithdrawalNeeded]);

  // オーストラリア選択時：Superannuation / 投資口座 / 現金 の残高推移シミュレーション。
  // AU_COUNTRY_RULES.investment.simulateGrowth のみを使用し、他国とは完全に独立している。
  const auInvestmentSim = useMemo(() => {
    if (country !== "AU" || !rules.investment.implemented) {
      return { yearly: [], finalValue: 0 };
    }
    return rules.investment.simulateGrowth({
      currentAge: effectiveCurrentAge,
      retireAge: inputs.retireAge,
      deathAge: inputs.deathAge,
      accounts: inputs.auInvestment,
      annualWithdrawalNeeded: auWithdrawalNeeded,
      annualSalary: inputs.auInvestment.annualSalary,
      voluntaryConcessional: inputs.auInvestment.voluntaryConcessional,
      contributionsTaxRate: rules.tax.superannuation.contributionsTaxRate,
      earningsTaxAccumulation: rules.tax.superannuation.earningsTaxAccumulation,
    });
  }, [country, rules, effectiveCurrentAge, inputs.retireAge, inputs.deathAge, inputs.auInvestment, auWithdrawalNeeded]);

  // iDeCo 自動計算項目
  const idecoAnnualContribution = (inputs.ideco.monthlyContribution || 0) * 12;
  const idecoRemainingContribYears = Math.max(0, inputs.ideco.endAge - Math.max(inputs.ideco.startAge, effectiveCurrentAge));
  const idecoContributionTotal = (inputs.ideco.principalTotal || 0) + idecoAnnualContribution * idecoRemainingContribYears;
  const idecoInvestmentGain = (inputs.ideco.currentValue || 0) - (inputs.ideco.principalTotal || 0);
  // iDeCo 節税シミュレーション（概算）
  const idecoMarginalTaxRate = estimateMarginalTaxRate(inputs.ideco.annualIncome);
  const idecoAnnualTaxSaving = idecoAnnualContribution * idecoMarginalTaxRate;
  const idecoCumulativeTaxSaving = idecoAnnualTaxSaving * idecoRemainingContribYears;

  // merge NISA + gold + bank + stocks + 民間年金積立 + iDeCo一時金 - loans - 保険料累計 into one net-worth-by-age series for the combined chart
  const netWorthYearly = useMemo(() => {
    return sim.yearly.map((row, i) => {
      const goldValue = goldSim.yearly[i]?.value ?? goldSim.finalValue;
      const bankValue = bankSim.yearly[i]?.total ?? bankSim.totalFinal;
      const stockValue = stockSim.yearly[i]?.value ?? stockSim.finalValue;
      const loanValue = loanSim.yearly[i]?.total ?? loanSim.totalFinal;
      const insuranceValue = insuranceSim.yearly[i]?.total ?? insuranceSim.totalFinal;
      const pensionValue = pensionSim.yearly[i]?.total ?? pensionSim.totalFinal;
      const idecoRow = idecoSim.yearly[i];
      // 受取開始前および年金受取中に残っている、まだロックされたiDeCo残高。
      // 一時金部分は受取開始月にrunSimulation側へ一度だけ移され、row.totalへ含まれる。
      const idecoLockedValue = idecoRow ? idecoRow.value : idecoSim.finalValue;
      // アメリカ選択時のみ：401(k)/IRA/Roth/Brokerageの残高推移をnetWorthへ合算する
      // （country!=="US"のときはusInvestmentSim.yearlyが空のため常に0＝JP版の計算結果に一切影響しない）。
      const usInvestmentValue = usInvestmentSim.yearly[i]?.value ?? usInvestmentSim.finalValue ?? 0;
      // イギリス選択時のみ：ISA/SIPP/職域年金/GIA/Cash Savingsの残高推移をnetWorthへ合算する
      // （country!=="GB"のときはgbInvestmentSim.yearlyが空のため常に0＝JP版・アメリカ版の計算結果に一切影響しない）。
      const gbInvestmentValue = gbInvestmentSim.yearly[i]?.value ?? gbInvestmentSim.finalValue ?? 0;
      // カナダ選択時のみ：TFSA/RRSP/非登録口座/現金の残高推移をnetWorthへ合算する
      // （country!=="CA"のときはcaInvestmentSim.yearlyが空のため常に0＝他国の計算結果に一切影響しない）。
      const caInvestmentValue = caInvestmentSim.yearly[i]?.value ?? caInvestmentSim.finalValue ?? 0;
      // オーストラリア選択時のみ：Super/投資口座/現金の残高推移をnetWorthへ合算する
      // （country!=="AU"のときはauInvestmentSim.yearlyが空のため常に0＝他国の計算結果に一切影響しない）。
      const auInvestmentValue = auInvestmentSim.yearly[i]?.value ?? auInvestmentSim.finalValue ?? 0;
      // 【修正】NISA(row.total)とiDeCoは日本専用の資産。国が日本以外のときは
      // 帯（Area）に描画されないため、純資産（白い線）にも加算してはいけない。
      // 加算したままだと、白い線だけが帯の上へ大きく飛び出して差が年々開いていく。
      const jpInvestmentValue = country === "JP" ? row.total : 0;
      const jpIdecoValue = country === "JP" ? idecoLockedValue : 0;
      const spendableNetWorth = jpInvestmentValue + goldValue + bankValue + stockValue + pensionValue + usInvestmentValue + gbInvestmentValue + caInvestmentValue + auInvestmentValue - loanValue - insuranceValue;
      return {
        ...row, goldValue, bankValue, stockValue, loanValue, insuranceValue, pensionValue,
        idecoLockedValue: jpIdecoValue,
        usInvestmentValue,
        gbInvestmentValue,
        caInvestmentValue,
        auInvestmentValue,
        spendableNetWorth,
        netWorth: spendableNetWorth + jpIdecoValue,
      };
    });
  }, [country, sim, goldSim, bankSim, stockSim, loanSim, insuranceSim, pensionSim, idecoSim, usInvestmentSim, gbInvestmentSim, caInvestmentSim, auInvestmentSim]);
  const netWorthFinal = netWorthYearly.length ? netWorthYearly[netWorthYearly.length - 1].netWorth : sim.finalAssets;
  const inheritanceTotal = inputs.inheritancePlans.reduce((s, p) => s + (p.amount || 0), 0);
  const effectiveInheritanceTarget = inputs.inheritancePlans.length > 0 ? inheritanceTotal : inputs.inheritanceTarget;
  const netInheritanceGap = netWorthFinal - effectiveInheritanceTarget;

  const loanBreakdownByAge = useMemo(() => {
    const ages = [
      { label: t("currentLabelShort"), age: effectiveCurrentAge },
      { label: t("ageYears", { age: inputs.retireAge }), age: inputs.retireAge },
      { label: t("ageYears", { age: inputs.deathAge }), age: inputs.deathAge },
    ];
    return inputs.loans.map((l, i) => {
      const row = { name: l.name };
      ages.forEach(({ label, age }) => {
        const yr = loanSim.yearly.find((y) => y.age >= age) || loanSim.yearly[loanSim.yearly.length - 1];
        row[label] = Math.round(yr ? yr[`loan_${i}`] : l.principal);
      });
      return row;
    });
  }, [inputs.loans, effectiveCurrentAge, inputs.retireAge, inputs.deathAge, loanSim, t]);

  const bankBreakdownByAge = useMemo(() => {
    const ages = [
      { label: t("currentLabelShort"), age: effectiveCurrentAge },
      { label: t("ageYears", { age: inputs.retireAge }), age: inputs.retireAge },
      { label: t("ageYears", { age: inputs.deathAge }), age: inputs.deathAge },
    ];
    return inputs.banks.map((b, i) => {
      const row = { name: b.name };
      ages.forEach(({ label, age }) => {
        const yr = bankSim.yearly.find((y) => y.age >= age) || bankSim.yearly[bankSim.yearly.length - 1];
        row[label] = Math.round(yr ? yr[`bank_${i}`] : b.balance);
      });
      return row;
    });
  }, [inputs.banks, effectiveCurrentAge, inputs.retireAge, inputs.deathAge, bankSim, t]);

  const fundBreakdownAtRetire = useMemo(() => {
    const row = sim.yearly.find((y) => y.age >= inputs.retireAge) || sim.yearly[sim.yearly.length - 1];
    if (!row || !row.funds) return [];
    return dynamicFunds.map((f, i) => ({
      name: f.id,
      value: Math.round(row.funds[f.id] || 0),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [sim, inputs.retireAge, JSON.stringify(dynamicFunds)]);

  // アメリカ選択時：退職時点の401(k)/Traditional IRA/Roth IRA/Brokerage 口座別内訳。
  // JPのfundBreakdownAtRetire（NISA銘柄別）とは別データ・別ロジック。
  const usAccountBreakdownAtRetire = useMemo(() => {
    if (country !== "US" || !rules.investment.implemented) return [];
    const row = usInvestmentSim.yearly.find((y) => y.age >= inputs.retireAge) || usInvestmentSim.yearly[usInvestmentSim.yearly.length - 1];
    if (!row || !row.accounts) return [];
    const labels = [
      { key: "k401", label: t("us401kLabel") },
      { key: "traditionalIra", label: t("usTraditionalIraLabel") },
      { key: "rothIra", label: t("usRothIraLabel") },
      { key: "brokerage", label: t("usBrokerageLabel") },
    ];
    return labels.map((l, i) => ({
      name: l.label,
      value: Math.round(row.accounts[l.key] || 0),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [country, rules, usInvestmentSim, inputs.retireAge, t]);

  // イギリス選択時：退職時点の Stocks and Shares ISA / Cash ISA / SIPP / Workplace Pension /
  // General Investment Account / Cash Savings の口座別内訳。
  // JPのfundBreakdownAtRetire（NISA銘柄別）・USのusAccountBreakdownAtRetireとは別データ・別ロジック。
  const gbAccountBreakdownAtRetire = useMemo(() => {
    if (country !== "GB" || !rules.investment.implemented) return [];
    const row = gbInvestmentSim.yearly.find((y) => y.age >= inputs.retireAge) || gbInvestmentSim.yearly[gbInvestmentSim.yearly.length - 1];
    if (!row || !row.accounts) return [];
    const labels = [
      { key: "stocksSharesIsa", label: t("gbStocksSharesIsaLabel") },
      { key: "cashIsa", label: t("gbCashIsaLabel") },
      { key: "sipp", label: t("gbSippLabel") },
      { key: "workplacePension", label: t("gbWorkplacePensionLabel") },
      { key: "gia", label: t("gbGiaLabel") },
      { key: "cashSavings", label: t("gbCashSavingsLabel") },
    ];
    return labels.map((l, i) => ({
      name: l.label,
      value: Math.round(row.accounts[l.key] || 0),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [country, rules, gbInvestmentSim, inputs.retireAge, t]);

  // カナダ選択時：退職時点の TFSA / RRSP / 非登録口座 / 現金 の口座別内訳。
  const caAccountBreakdownAtRetire = useMemo(() => {
    if (country !== "CA" || !rules.investment.implemented) return [];
    const row = caInvestmentSim.yearly.find((y) => y.age >= inputs.retireAge) || caInvestmentSim.yearly[caInvestmentSim.yearly.length - 1];
    if (!row || !row.accounts) return [];
    const labels = [
      { key: "tfsa", label: t("caTfsaLabel") },
      { key: "rrsp", label: t("caRrspLabel") },
      { key: "nonRegistered", label: t("caNonRegisteredLabel") },
      { key: "cashSavings", label: t("caCashSavingsLabel") },
    ];
    return labels.map((l, i) => ({
      name: l.label,
      value: Math.round(row.accounts[l.key] || 0),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [country, rules, caInvestmentSim, inputs.retireAge, t]);

  // オーストラリア選択時：退職時点の Superannuation / 投資口座 / 現金 の口座別内訳。
  const auAccountBreakdownAtRetire = useMemo(() => {
    if (country !== "AU" || !rules.investment.implemented) return [];
    const row = auInvestmentSim.yearly.find((y) => y.age >= inputs.retireAge) || auInvestmentSim.yearly[auInvestmentSim.yearly.length - 1];
    if (!row || !row.accounts) return [];
    const labels = [
      { key: "superannuation", label: t("auSuperLabel") },
      { key: "investmentAccount", label: t("auInvestmentAccountLabel") },
      { key: "cashSavings", label: t("auCashSavingsLabel") },
    ];
    return labels.map((l, i) => ({
      name: l.label,
      value: Math.round(row.accounts[l.key] || 0),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [country, rules, auInvestmentSim, inputs.retireAge, t]);

  const addBank = () => {
    const balance = Number(newBank.balance) || 0;
    if (!newBank.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      banks: [...prev.banks, {
        name: newBank.name.trim(),
        balance,
        monthlyDeposit: Number(newBank.monthlyDeposit) || 0,
        interestPct: Number(newBank.interestPct) || 0,
      }],
    }));
    setNewBank({ name: "", balance: "", monthlyDeposit: "", interestPct: "" });
  };
  const removeBank = (idx) => setInputs((prev) => ({ ...prev, banks: prev.banks.filter((_, i) => i !== idx) }));

  const addInheritancePlan = () => {
    if (!newInheritance.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      inheritancePlans: [...prev.inheritancePlans, {
        name: newInheritance.name.trim(),
        relation: newInheritance.relation.trim(),
        amount: Number(newInheritance.amount) || 0,
      }],
    }));
    setNewInheritance({ name: "", relation: "", amount: "" });
  };
  const removeInheritancePlan = (idx) =>
    setInputs((prev) => ({ ...prev, inheritancePlans: prev.inheritancePlans.filter((_, i) => i !== idx) }));

  const addPensionSource = () => {
    if (!newPensionSource.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      pensionSources: [...prev.pensionSources, {
        name: newPensionSource.name.trim(),
        monthlyAmount: Number(newPensionSource.monthlyAmount) || 0,
      }],
    }));
    setNewPensionSource({ name: "", monthlyAmount: "" });
  };
  const removePensionSource = (idx) =>
    setInputs((prev) => ({ ...prev, pensionSources: prev.pensionSources.filter((_, i) => i !== idx) }));

  const addAssetHolding = () => {
    if (!newAssetHolding.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      currentAssetHoldings: [...prev.currentAssetHoldings, {
        name: newAssetHolding.name.trim(),
        value: Number(newAssetHolding.value) || 0,
        currency: baseCurrency, // 将来の複数通貨管理用（今回は為替換算は未実装）
      }],
    }));
    setNewAssetHolding({ name: "", value: "" });
  };
  const removeAssetHolding = (idx) =>
    setInputs((prev) => ({ ...prev, currentAssetHoldings: prev.currentAssetHoldings.filter((_, i) => i !== idx) }));

  const addTsumitateHolding = () => {
    if (!newTsumitateHolding.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      tsumitateHoldings: [...prev.tsumitateHoldings, {
        name: newTsumitateHolding.name.trim(),
        value: Number(newTsumitateHolding.value) || 0,
        currency: baseCurrency, // 将来の複数通貨管理用（今回は為替換算は未実装）
      }],
    }));
    setNewTsumitateHolding({ name: "", value: "" });
  };
  const removeTsumitateHolding = (idx) =>
    setInputs((prev) => ({ ...prev, tsumitateHoldings: prev.tsumitateHoldings.filter((_, i) => i !== idx) }));

  const addGrowthHolding = () => {
    if (!newGrowthHolding.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      growthHoldings: [...prev.growthHoldings, {
        name: newGrowthHolding.name.trim(),
        value: Number(newGrowthHolding.value) || 0,
        currency: baseCurrency, // 将来の複数通貨管理用（今回は為替換算は未実装）
      }],
    }));
    setNewGrowthHolding({ name: "", value: "" });
  };
  const removeGrowthHolding = (idx) =>
    setInputs((prev) => ({ ...prev, growthHoldings: prev.growthHoldings.filter((_, i) => i !== idx) }));

  const addLoan = () => {
    const principal = Number(newLoan.principal) || 0;
    if (!newLoan.name.trim() || !principal) return;
    setInputs((prev) => ({
      ...prev,
      loans: [...prev.loans, {
        name: newLoan.name.trim(),
        principal,
        annualRatePct: Number(newLoan.annualRatePct) || 0,
        monthlyPayment: Number(newLoan.monthlyPayment) || 0,
      }],
    }));
    setNewLoan({ name: "", principal: "", annualRatePct: "", monthlyPayment: "" });
  };
  const removeLoan = (idx) => setInputs((prev) => ({ ...prev, loans: prev.loans.filter((_, i) => i !== idx) }));

  const addInsurance = () => {
    const ni = newInsurance;
    if (!ni.name.trim() || !ni.premiumFromYears || !ni.premiumToYears || !ni.coverageUntilYears) return;
    const premiumFromAge = Number(ni.premiumFromYears || 0) + Number(ni.premiumFromMonths || 0) / 12;
    const premiumToAge = Number(ni.premiumToYears || 0) + Number(ni.premiumToMonths || 0) / 12;
    const coverageUntilAge = Number(ni.coverageUntilYears || 0) + Number(ni.coverageUntilMonths || 0) / 12;
    setInputs((prev) => ({
      ...prev,
      insurancePolicies: [...prev.insurancePolicies, {
        name: ni.name.trim(),
        premiumFromAge, premiumToAge,
        monthlyPremium: Number(ni.monthlyPremium) || 0,
        coverageUntilAge,
        benefits: {
          hospitalizationPerDay: Number(ni.hospitalizationPerDay) || 0,
          hospitalizationDaysLimit: Number(ni.hospitalizationDaysLimit) || 0,
          hospitalizationSurgery: Number(ni.hospitalizationSurgery) || 0,
          daySurgery: Number(ni.daySurgery) || 0,
          radiationPerSession: Number(ni.radiationPerSession) || 0,
          advancedMedical: Number(ni.advancedMedical) || 0,
          death: Number(ni.death) || 0,
        },
        customBenefits: [],
      }],
    }));
    setNewInsurance({
      name: "",
      premiumFromYears: "", premiumFromMonths: "",
      premiumToYears: "", premiumToMonths: "",
      monthlyPremium: "",
      coverageUntilYears: "", coverageUntilMonths: "",
      hospitalizationPerDay: "", hospitalizationDaysLimit: "", hospitalizationSurgery: "", daySurgery: "",
      radiationPerSession: "", advancedMedical: "", death: "",
    });
  };
  const addCustomBenefit = (policyIdx, name, amount) =>
    setInputs((prev) => ({
      ...prev,
      insurancePolicies: prev.insurancePolicies.map((p, i) =>
        i === policyIdx ? { ...p, customBenefits: [...(p.customBenefits || []), { name, amount }] } : p
      ),
    }));
  const removeCustomBenefit = (policyIdx, itemIdx) =>
    setInputs((prev) => ({
      ...prev,
      insurancePolicies: prev.insurancePolicies.map((p, i) =>
        i === policyIdx ? { ...p, customBenefits: p.customBenefits.filter((_, j) => j !== itemIdx) } : p
      ),
    }));

  const addPension = () => {
    const np = newPension;
    if (!np.name.trim() || !np.contribFromYears || !np.contribToYears || !np.payoutFromYears || !np.payoutToYears) return;
    const contribFromAge = Number(np.contribFromYears || 0) + Number(np.contribFromMonths || 0) / 12;
    const contribToAge = Number(np.contribToYears || 0) + Number(np.contribToMonths || 0) / 12;
    const payoutFromAge = Number(np.payoutFromYears || 0) + Number(np.payoutFromMonths || 0) / 12;
    const payoutToAge = Number(np.payoutToYears || 0) + Number(np.payoutToMonths || 0) / 12;
    setInputs((prev) => ({
      ...prev,
      privatePensionPlans: [...prev.privatePensionPlans, {
        name: np.name.trim(),
        contribFromAge, contribToAge,
        monthlyContribution: Number(np.monthlyContribution) || 0,
        payoutFromAge, payoutToAge,
        monthlyPayout: Number(np.monthlyPayout) || 0,
        // 任意：現在すでにある実際の残高（証書記載の解約返戻金額など）。未入力なら積立実績から自動概算する。
        currentBalance: np.currentBalance === "" ? null : Number(np.currentBalance) || 0,
      }],
    }));
    setNewPension({
      name: "",
      contribFromYears: "", contribFromMonths: "",
      contribToYears: "", contribToMonths: "",
      monthlyContribution: "",
      payoutFromYears: "", payoutFromMonths: "",
      payoutToYears: "", payoutToMonths: "",
      monthlyPayout: "",
      currentBalance: "",
    });
  };
  const removePension = (idx) =>
    setInputs((prev) => ({ ...prev, privatePensionPlans: prev.privatePensionPlans.filter((_, i) => i !== idx) }));
  const removeInsurance = (idx) =>
    setInputs((prev) => ({ ...prev, insurancePolicies: prev.insurancePolicies.filter((_, i) => i !== idx) }));

  // 汎用：銘柄別内訳リスト（一括投資／つみたて／成長投資枠で共用）の追加・削除・編集
  const addAllocationItem = (field, newItem, resetNewItem) => {
    if (!newItem.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      [field]: [...prev[field], { name: newItem.name.trim(), amount: Number(newItem.amount) || 0 }],
    }));
    resetNewItem({ name: "", amount: "" });
  };
  const removeAllocationItem = (field, idx) =>
    setInputs((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }));
  const updateAllocationItem = (field, idx, key, val) =>
    setInputs((prev) => ({
      ...prev,
      [field]: prev[field].map((it, i) => (i === idx ? { ...it, [key]: val } : it)),
    }));

  const addStock = () => {
    if (!newStock.name.trim()) return;
    setWatchlist((prev) => [...prev, { name: newStock.name.trim(), sector: newStock.sector.trim() || t("uncategorizedLabel"), shares: 0, value: 0, currency: baseCurrency }]);
    setNewStock({ name: "", sector: "" });
  };
  const removeStock = (idx) => setWatchlist((prev) => prev.filter((_, i) => i !== idx));
  const updateStockField = (idx, field, val) =>
    setWatchlist((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s)));

  const addLump = () => {
    const age = Number(newLump.years || 0) + Number(newLump.months || 0) / 12;
    const amount = Number(newLump.amount);
    if (!newLump.years || !amount) return;
    setInputs((prev) => ({
      ...prev,
      lumpSums: [...prev.lumpSums, { age, amount }].sort((a, b) => a.age - b.age),
    }));
    setNewLump({ years: "", months: "", amount: "" });
  };
  const removeLump = (idx) =>
    setInputs((prev) => ({ ...prev, lumpSums: prev.lumpSums.filter((_, i) => i !== idx) }));

  const addTsumitateRange = () => {
    const fromAge = Number(newTsumitateRange.fromYears || 0) + Number(newTsumitateRange.fromMonths || 0) / 12;
    const toAge = Number(newTsumitateRange.toYears || 0) + Number(newTsumitateRange.toMonths || 0) / 12;
    const monthlyYen = Number(newTsumitateRange.monthlyYen);
    if (!newTsumitateRange.fromYears || !newTsumitateRange.toYears || toAge < fromAge || !monthlyYen) return;
    if (tsumitateHoldingsAsOfAge !== null && fromAge < tsumitateHoldingsAsOfAge) {
      window.alert(t("scheduleBeforeBaseAgeAlert", { age: formatAge(tsumitateHoldingsAsOfAge) }));
      return;
    }
    setInputs((prev) => ({
      ...prev,
      tsumitateSchedule: [...prev.tsumitateSchedule, { fromAge, toAge, monthlyYen }].sort((a, b) => a.fromAge - b.fromAge),
    }));
    setNewTsumitateRange({ fromYears: "", fromMonths: "", toYears: "", toMonths: "", monthlyYen: "" });
  };
  const removeTsumitateRange = (idx) =>
    setInputs((prev) => ({ ...prev, tsumitateSchedule: prev.tsumitateSchedule.filter((_, i) => i !== idx) }));

  const addGrowthRange = () => {
    const fromAge = Number(newGrowthRange.fromYears || 0) + Number(newGrowthRange.fromMonths || 0) / 12;
    const toAge = Number(newGrowthRange.toYears || 0) + Number(newGrowthRange.toMonths || 0) / 12;
    const monthlyYen = Number(newGrowthRange.monthlyYen);
    if (!newGrowthRange.fromYears || !newGrowthRange.toYears || toAge < fromAge || !monthlyYen) return;
    if (growthHoldingsAsOfAge !== null && fromAge < growthHoldingsAsOfAge) {
      window.alert(t("scheduleBeforeBaseAgeAlert", { age: formatAge(growthHoldingsAsOfAge) }));
      return;
    }
    setInputs((prev) => ({
      ...prev,
      growthSchedule: [...prev.growthSchedule, { fromAge, toAge, monthlyYen }].sort((a, b) => a.fromAge - b.fromAge),
    }));
    setNewGrowthRange({ fromYears: "", fromMonths: "", toYears: "", toMonths: "", monthlyYen: "" });
  };
  const removeGrowthRange = (idx) =>
    setInputs((prev) => ({ ...prev, growthSchedule: prev.growthSchedule.filter((_, i) => i !== idx) }));

  const netMonthlyGap = inputs.livingCostMonthly - inputs.pensionMonthly;

  // つみたて枠・成長投資枠の「これまでの使用累計」は、手入力の基準額に加えて
  // スケジュール（過去分）・一括投資（実行済み分）から自動集計した金額を合算する
  const tsumitateElapsed = elapsedScheduleAmount(inputs.tsumitateSchedule, effectiveCurrentAge);
  const growthElapsed =
    elapsedScheduleAmount(inputs.growthSchedule, effectiveCurrentAge) +
    elapsedLumpSumAmount(inputs.lumpSums, effectiveCurrentAge);
  const computedTsumitateUsed = inputs.tsumitateUsed + tsumitateElapsed;
  const computedGrowthUsed = inputs.growthUsed + growthElapsed;

  // 現在のNISA資産の内訳（つみたて投資枠 / 成長投資枠）— 円グラフ・棒グラフ用
  const nisaFrameAllocationItems = [
    { name: t("tsumitateFrameLabel"), amount: Math.max(0, computedTsumitateUsed) },
    { name: t("growthFrameLabel"), amount: Math.max(0, computedGrowthUsed) },
  ];

  const growthDiff = NISA_LIMITS.growthLifetime - computedGrowthUsed;
  const remainingGrowth = Math.max(0, growthDiff);
  const growthOverage = Math.max(0, -growthDiff);

  const totalDiff = NISA_LIMITS.totalLifetime - computedTsumitateUsed - computedGrowthUsed;
  const remainingTotal = Math.max(0, totalDiff);
  const totalOverage = Math.max(0, -totalDiff);

  // つみたて投資枠には単独の生涯上限はなく、総枠(1,800万円)を成長投資枠と共有する。
  // そのため「つみたて分の残り」は、総枠の残りのうち今後つみたてに割り当てられる分として扱う。
  const remainingTsumitate = remainingTotal;
  const tsumitateOverage = Math.max(0, computedTsumitateUsed - NISA_LIMITS.totalLifetime);

  // 今年時点でのペース（現在の年齢での積立額 × 12ヶ月）が年間上限に対してどうかを表示
  const currentTsumitateMonthly = scheduledAmount(inputs.tsumitateSchedule, effectiveCurrentAge);
  const tsumitateAnnualPace = currentTsumitateMonthly * 12;
  const tsumitateAnnualDiff = NISA_LIMITS.tsumitateAnnual - tsumitateAnnualPace;
  const tsumitateAnnualRemaining = Math.max(0, tsumitateAnnualDiff);
  const tsumitateAnnualOverage = Math.max(0, -tsumitateAnnualDiff);

  const currentGrowthMonthly = scheduledAmount(inputs.growthSchedule, effectiveCurrentAge);
  const growthAnnualPace = currentGrowthMonthly * 12;
  const growthAnnualDiff = NISA_LIMITS.growthAnnual - growthAnnualPace;
  const growthAnnualRemaining = Math.max(0, growthAnnualDiff);
  const growthAnnualOverage = Math.max(0, -growthAnnualDiff);

  // 各スケジュール区間の横に「月上限まであと幾ら」「その区間終了時点で生涯投資枠があと幾ら残るか」を表示するためのヘルパー
  const tsumitateMonthlyCapValue = NISA_LIMITS.tsumitateAnnual / 12;
  const growthMonthlyCapValue = NISA_LIMITS.growthAnnual / 12;

  const formatCapDiff = (diff, periodLabel) => (diff >= 0 ? t("capDiffRemaining", { period: periodLabel, amount: money(diff) }) : t("capDiffExceeded", { period: periodLabel, amount: money(-diff) }));

  const lifetimeRemainingAtAge = (age) => {
    const row = sim.yearly.find((y) => y.age >= age) || sim.yearly[sim.yearly.length - 1];
    const cum = row ? row.tsumitateCum + row.growthCum : computedTsumitateUsed + computedGrowthUsed;
    return NISA_LIMITS.totalLifetime - cum;
  };

  return (
    <LocaleContext.Provider value={localeValue}>
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&family=Noto+Sans+JP:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        html, body {
          background: #0E1316;
        }

        * { box-sizing: border-box; }
        .app {
          --bg: #0E1316;
          --panel: #151C20;
          --panel-2: #182027;
          --line: #2A363C;
          --line-faint: rgba(79,168,216,0.14);
          --blue: #4FA8D8;
          --blue-dim: #2E5F78;
          --amber: #D9A54F;
          --green: #8FBF7F;
          --text: #E7ECEE;
          --muted: #7C8A90;
          --danger: #C2694F;
          font-family: 'Noto Sans JP', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          padding: 0 0 60px 0;
        }
        .mono { font-family: 'JetBrains Mono', monospace; }

        /* ---------- responsive safety ---------- */
        .app, .app * { box-sizing: border-box; }
        .app { width: 100%; max-width: 100%; overflow-x: hidden; }
        .grid-main, .panel, .content, .two-col, .stat-grid, .chart-frame { min-width: 0; }
        img, svg, canvas { max-width: 100%; }
        img { height: auto; }
        input, select, textarea, button { max-width: 100%; }
        input:disabled {
          color: var(--text) !important;
          -webkit-text-fill-color: var(--text) !important;
          opacity: 1 !important;
        }
        .field-input-wrap, .add-row { min-width: 0; }
        .add-row input { min-width: 0; }
        table.watchlist { table-layout: fixed; }
        table.watchlist th, table.watchlist td { overflow-wrap: anywhere; word-break: break-word; }

        @media (max-width: 640px) {
          .titleblock { padding: 16px 14px 12px; align-items: flex-start; }
          .titleblock h1 { font-size: 19px; line-height: 1.35; }
          .titleblock .meta { width: 100%; gap: 6px 12px; }
          .panel, .content { padding: 16px 14px; border-right: none; }
          .save-warning, .history-panel { padding-left: 14px; padding-right: 14px; }
          .footer-note { padding-left: 14px; padding-right: 14px; }
          .stat-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
          .stat-card { padding: 12px; }
          .stat-value { font-size: 17px; overflow-wrap: anywhere; }
          .chart-frame { padding-left: 0; padding-right: 0; }
          .chart-frame .chart-label { padding-left: 10px; padding-right: 10px; }
          .add-row { flex-wrap: wrap; }
          .add-row input { flex: 1 1 140px; }
          .add-btn { min-height: 36px; }
          table.watchlist { width: 100%; table-layout: fixed; }
          table.watchlist th, table.watchlist td { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
          .landing { padding: 30px 14px 28px; }
          .landing-hero h1 { font-size: 22px; }
          .landing-screenshot { width: 100%; }
          .landing-screenshot img { width: 100%; max-width: 100%; margin: 0; border-radius: 10px; }
        }

        @media (max-width: 420px) {
          .stat-grid { grid-template-columns: 1fr; }
          .titleblock .meta { display: grid; grid-template-columns: 1fr; }
          .landing-cta { width: 100%; }
        }

        .titleblock {
          border-bottom: 1px solid var(--line);
          padding: 22px 28px 16px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 12px;
        }
        .titleblock h1 {
          font-family: 'Zen Kaku Gothic New', sans-serif;
          font-weight: 700;
          font-size: 22px;
          letter-spacing: 0.02em;
          margin: 0;
          color: var(--text);
        }
        .titleblock .sub {
          color: var(--muted);
          font-size: 12px;
          margin-top: 4px;
          font-family: 'JetBrains Mono', monospace;
        }
        .titleblock .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 18px;
          font-size: 11px;
          color: var(--muted);
          font-family: 'JetBrains Mono', monospace;
        }
        .titleblock .meta div span { color: var(--blue); }

        .grid-main {
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 0;
        }
        @media (max-width: 880px) {
          .grid-main { grid-template-columns: 1fr; }
        }

        .panel {
          padding: 20px 24px;
          border-right: 1px solid var(--line);
        }
        .content { padding: 20px 28px; }

        .section-block {
          border: 1.5px solid;
          border-radius: 8px;
          padding: 14px 14px 4px;
          margin-bottom: 18px;
          opacity: 0.92;
        }
        .section-block .section-title {
          margin-top: 4px;
        }
        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 26px 0 12px;
        }
        .section-title:first-child { margin-top: 4px; }
        .section-title .section-index {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: var(--blue);
          border: 1px solid var(--blue-dim);
          padding: 1px 6px;
          border-radius: 2px;
        }
        .section-title h2 {
          font-family: 'Zen Kaku Gothic New', sans-serif;
          font-size: 13px;
          font-weight: 700;
          margin: 0;
          letter-spacing: 0.02em;
        }
        .section-title svg { color: var(--muted); }

        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 12px;
        }
        .field-label {
          font-size: 11px;
          color: var(--muted);
        }
        .field-input-wrap {
          display: flex;
          align-items: center;
          border: 1px solid var(--line);
          background: var(--panel-2);
          border-radius: 3px;
          overflow: hidden;
        }
        .field-input-wrap:focus-within { border-color: var(--blue-dim); }
        .field input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text);
          padding: 8px 10px;
          font-size: 13px;
          min-width: 0;
        }
        .field-unit {
          padding: 0 10px;
          font-size: 11px;
          color: var(--muted);
          border-left: 1px solid var(--line);
          align-self: stretch;
          display: flex;
          align-items: center;
        }

        .alloc-row {
          display: grid;
          grid-template-columns: 16px 1fr 56px;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .alloc-dot { width: 8px; height: 8px; border-radius: 50%; }
        .alloc-row input[type="range"] {
          width: 100%;
          accent-color: var(--blue);
        }
        .alloc-row .alloc-val {
          font-size: 12px;
          text-align: right;
          font-family: 'JetBrains Mono', monospace;
          color: var(--muted);
        }
        .alloc-sum {
          font-size: 11px;
          margin-top: 4px;
          color: var(--muted);
        }
        .alloc-sum.warn { color: var(--danger); }

        .note {
          display: flex;
          gap: 6px;
          font-size: 11px;
          color: var(--muted);
          background: var(--panel-2);
          border: 1px solid var(--line);
          border-left: 2px solid var(--blue-dim);
          padding: 8px 10px;
          border-radius: 2px;
          line-height: 1.5;
          margin: 10px 0 16px;
        }
        .note svg { flex-shrink: 0; margin-top: 1px; color: var(--blue); }

        .stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 22px;
        }
        @media (max-width: 880px) {
          .stat-grid { grid-template-columns: repeat(2, 1fr); }
          .stat-grid > *:last-child:nth-child(odd) { grid-column: 1 / -1; }
        }
        .stat-card {
          border: 1px solid var(--line);
          background: var(--panel);
          padding: 14px 16px;
          border-radius: 3px;
          position: relative;
        }
        .stat-card::before {
          content: "";
          position: absolute; top: 0; left: 0; width: 100%; height: 2px;
          background: var(--blue-dim);
        }
        .stat-card.danger::before { background: var(--danger); }
        .stat-card.good::before { background: var(--green); }
        .stat-label { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
        .stat-value { font-size: 19px; font-weight: 600; }
        .stat-sub { font-size: 11px; color: var(--muted); margin-top: 4px; }

        .chart-frame {
          border: 1px solid var(--line);
          background: var(--panel);
          padding: 16px 8px 8px;
          border-radius: 3px;
          margin-bottom: 22px;
        }
        .chart-frame .chart-label {
          font-size: 11px;
          color: var(--muted);
          padding: 0 12px 8px;
          font-family: 'JetBrains Mono', monospace;
        }

        .two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 880px) { .two-col { grid-template-columns: 1fr; } }

        table.watchlist { width: 100%; border-collapse: collapse; font-size: 12px; }
        table.watchlist th {
          text-align: left; color: var(--muted); font-weight: 500;
          border-bottom: 1px solid var(--line); padding: 6px 8px; font-size: 11px;
        }
        table.watchlist td { padding: 7px 8px; border-bottom: 1px solid rgba(42,54,60,0.5); }
        table.watchlist tr:hover { background: rgba(79,168,216,0.05); }
        .del-btn {
          background: none; border: none; color: var(--muted); cursor: pointer;
          display: flex; align-items: center; padding: 2px;
        }
        .del-btn:hover { color: var(--danger); }

        .add-row {
          display: flex; gap: 8px; margin-top: 10px;
        }
        .add-row input {
          flex: 1; background: var(--panel-2); border: 1px solid var(--line);
          color: var(--text); padding: 7px 9px; border-radius: 3px; font-size: 12px; outline: none;
        }
        .add-row input:focus { border-color: var(--blue-dim); }
        .add-btn {
          background: var(--blue-dim); border: 1px solid var(--blue);
          color: var(--text); border-radius: 3px; padding: 0 12px;
          display: flex; align-items: center; cursor: pointer;
        }
        .add-btn:hover { background: var(--blue); }

        .history-toggle {
          background: var(--panel-2); border: 1px solid var(--line);
          color: var(--blue); font-size: 11px; font-family: 'JetBrains Mono', monospace;
          padding: 5px 10px; border-radius: 3px; cursor: pointer; white-space: nowrap;
        }
        .history-toggle:hover { border-color: var(--blue-dim); }

        .country-select {
          background: var(--panel-2); border: 1px solid var(--line);
          color: var(--text); font-size: 11px; font-family: 'JetBrains Mono', monospace;
          padding: 5px 8px; border-radius: 3px; cursor: pointer; white-space: nowrap;
        }
        .country-select:hover { border-color: var(--blue-dim); }

        .save-badge {
          font-size: 10.5px; font-family: 'JetBrains Mono', monospace;
          padding: 4px 8px; border-radius: 3px; border: 1px solid var(--line);
          cursor: default; white-space: nowrap;
        }
        .save-saved { color: var(--green); border-color: rgba(143,191,127,0.35); }
        .save-saving { color: var(--muted); }
        .save-error, .save-unavailable { color: var(--danger); border-color: rgba(194,105,79,0.4); }
        .save-warning {
          display: flex; gap: 8px; align-items: flex-start;
          font-size: 12px; color: var(--danger); background: rgba(194,105,79,0.08);
          border-bottom: 1px solid var(--line); padding: 10px 28px;
        }
        .locale-preview-warning {
          display: flex; gap: 8px; align-items: flex-start;
          font-size: 12px; color: var(--amber); background: rgba(217,165,79,0.10);
          border-bottom: 1px solid var(--line); padding: 10px 28px; line-height: 1.6;
        }
        /* 免責表示：全ての国で常時表示し、印刷・PDFにも必ず残す（no-printを付けない） */
        .disclaimer-banner {
          display: flex; gap: 8px; align-items: flex-start;
          font-size: 12px; color: var(--muted); background: rgba(124,138,144,0.08);
          border-bottom: 1px solid var(--line); padding: 10px 28px; line-height: 1.6;
        }
        @media (max-width: 640px) { .disclaimer-banner { padding: 10px 16px; font-size: 11px; } }
        /* オーストラリア版で使用する、チェックボックスと選択チップ（他国の画面には影響しない） */
        .checkbox-row {
          display: flex; gap: 8px; align-items: flex-start;
          font-size: 13px; color: var(--text); line-height: 1.6;
          margin: 4px 0 12px; cursor: pointer;
        }
        .checkbox-row input[type="checkbox"] {
          width: 16px; height: 16px; margin-top: 2px; flex-shrink: 0; cursor: pointer;
          accent-color: var(--blue);
        }
        .chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .chip {
          padding: 7px 16px; border-radius: 999px; cursor: pointer;
          border: 1px solid var(--line); background: transparent; color: var(--muted);
          font-size: 13px; font-family: inherit; transition: all 0.15s;
        }
        .chip:hover { border-color: var(--blue); color: var(--text); }
        .chip-active {
          border-color: var(--blue); background: rgba(79,168,216,0.14); color: var(--text); font-weight: 600;
        }
        /* 入力ガイド（「?」ボタンと、開いたときの説明文） */
        .field-label-row {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        }
        .guide-btn {
          width: 17px; height: 17px; flex-shrink: 0; padding: 0;
          border-radius: 50%; cursor: pointer;
          border: 1px solid var(--line); background: transparent; color: var(--muted);
          font-size: 11px; font-weight: 700; line-height: 1; font-family: inherit;
          display: inline-flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .guide-btn:hover { border-color: var(--blue); color: var(--blue); }
        .guide-btn-open {
          border-color: var(--blue); background: var(--blue); color: var(--bg);
        }
        /* 注記内の改行（\n）を反映させる。既存の1行の注記には影響しない。 */
        .note span { white-space: pre-line; }
        .guide-text {
          display: block;
          font-size: 11px; color: var(--muted); line-height: 1.7;
          background: rgba(79,168,216,0.07);
          border-left: 2px solid var(--blue);
          padding: 7px 10px; margin: 5px 0 3px;
          border-radius: 0 4px 4px 0;
          white-space: pre-line;
        }
        .section-guide-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 0; border: none; background: transparent; cursor: pointer;
          color: var(--muted); font-size: 11px; font-family: inherit;
        }
        .section-guide-btn:hover { color: var(--blue); }
        .section-guide-btn:hover .guide-btn { border-color: var(--blue); color: var(--blue); }
        .section-guide-btn.guide-btn-open .guide-btn {
          border-color: var(--blue); background: var(--blue); color: var(--bg);
        }
        @media print { .guide-btn, .section-guide-btn { display: none; } }

        /* NISAセクションの4ブロックを、背景のグラデーションで視覚的に区切る。
           入力欄そのものには手を加えず、囲みの背景色だけで境界を示す。 */
        .nisa-group {
          position: relative;
          padding: 30px 14px 14px;
          margin: 0 -4px 20px;
          border-radius: 10px;
          border: 1px solid var(--line);
        }
        .nisa-group-title {
          position: absolute; top: 9px; left: 14px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
          color: var(--muted); text-transform: uppercase;
        }
        /* ① いま溜まっている金額：青（現状の把握） */
        .nisa-group-holdings {
          background: linear-gradient(160deg, rgba(79,168,216,0.10) 0%, rgba(79,168,216,0.02) 55%, transparent 100%);
          border-color: rgba(79,168,216,0.28);
        }
        .nisa-group-holdings .nisa-group-title { color: #4FA8D8; }
        /* ② つみたて投資枠：緑（コツコツ積み上げる） */
        .nisa-group-tsumitate {
          background: linear-gradient(160deg, rgba(143,191,127,0.10) 0%, rgba(143,191,127,0.02) 55%, transparent 100%);
          border-color: rgba(143,191,127,0.28);
        }
        .nisa-group-tsumitate .nisa-group-title { color: #8FBF7F; }
        /* ③ 成長投資枠：琥珀（攻めの枠） */
        .nisa-group-growth {
          background: linear-gradient(160deg, rgba(217,165,79,0.10) 0%, rgba(217,165,79,0.02) 55%, transparent 100%);
          border-color: rgba(217,165,79,0.28);
        }
        .nisa-group-growth .nisa-group-title { color: #D9A54F; }
        /* ④ 一括投資：紫（まとまった資金） */
        .nisa-group-lump {
          background: linear-gradient(160deg, rgba(176,143,214,0.10) 0%, rgba(176,143,214,0.02) 55%, transparent 100%);
          border-color: rgba(176,143,214,0.28);
        }
        .nisa-group-lump .nisa-group-title { color: #B08FD6; }
        @media (max-width: 640px) {
          .nisa-group { padding: 28px 10px 12px; margin: 0 -2px 16px; }
          .nisa-group-title { left: 10px; }
        }
        @media print {
          .nisa-group { background: none; border-color: var(--line); }
        }
        .history-panel {
          padding: 14px 28px; border-bottom: 1px solid var(--line);
          background: var(--panel);
        }
        .history-empty { font-size: 12px; color: var(--muted); }
        .history-action {
          background: none; border: 1px solid var(--line); color: var(--blue);
          font-size: 11px; padding: 3px 8px; border-radius: 3px; cursor: pointer;
        }
        .history-action:hover { border-color: var(--blue-dim); }

        .inline-num {
          width: 100%; background: var(--panel-2); border: 1px solid var(--line);
          color: var(--text); padding: 4px 6px; border-radius: 3px; font-size: 12px; outline: none;
        }
        .inline-num:focus { border-color: var(--blue-dim); }

        .footer-note {
          font-size: 10.5px; color: var(--muted); padding: 20px 28px 0;
          line-height: 1.6; border-top: 1px solid var(--line); margin-top: 10px;
        }

        @media print {
          .app { background: #fff !important; color: #111 !important; background-image: none !important; }
          button, .add-row, .history-panel, .save-warning, .history-toggle, .country-select, .no-print { display: none !important; }
          .grid-main { grid-template-columns: 1fr !important; }
          .panel { border-right: none !important; border-bottom: 2px solid #ccc; }
          .stat-card, .chart-frame, .panel, .content { background: #fff !important; border-color: #ccc !important; color: #111 !important; }
          .stat-value, h1, h2, .field-label, .stat-label, .stat-sub { color: #111 !important; }
          input, select { border: none !important; background: transparent !important; color: #111 !important; }
          .field-input-wrap { border: none !important; }
          .field-unit { border-left: none !important; color: #555 !important; }
          table.watchlist th, table.watchlist td { color: #111 !important; }
          .chart-frame { break-inside: avoid; }
          .stat-card { break-inside: avoid; }
        }

        /* ---------- Intro section (for first-time visitors) ---------- */
        .landing {
          padding: 40px 24px 36px;
          border-bottom: 1px solid var(--line);
        }
        .landing-hero { max-width: 640px; margin: 0 auto; text-align: center; }
        .landing-hero h1 {
          font-family: 'Zen Kaku Gothic New', sans-serif;
          font-size: 26px; font-weight: 700; line-height: 1.4;
          margin: 0 0 14px; color: var(--text);
        }
        .landing-free-notice {
          font-size: 11.5px; line-height: 1.6; color: var(--green);
          margin: -6px 0 16px;
        }
        .landing-free-notice strong { color: var(--green); font-weight: 700; }
        .landing-catch {
          font-size: 16px; line-height: 1.7; color: var(--blue);
          margin: 0 0 16px; font-weight: 500;
        }
        .landing-sub {
          font-size: 13.5px; line-height: 1.8; color: var(--muted);
          margin: 0 0 26px;
        }
        .landing-cta {
          display: inline-block; width: 100%; max-width: 360px;
          background: var(--blue); color: #0E1316; border: none;
          font-family: 'Zen Kaku Gothic New', sans-serif;
          font-size: 15px; font-weight: 700; letter-spacing: 0.02em;
          padding: 15px 20px; border-radius: 6px; cursor: pointer;
        }
        .landing-cta:hover { background: #6BB8E0; }

        .landing-screenshot {
          max-width: 900px; margin: 36px auto 0; text-align: center;
        }
        .landing-screenshot h2 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 16px; font-weight: 700;
          margin: 0 0 8px; color: var(--text);
        }
        .landing-screenshot p {
          font-size: 12.5px; line-height: 1.7; color: var(--muted);
          margin: 0 0 18px; max-width: 480px; margin-left: auto; margin-right: auto;
        }
        .landing-screenshot img {
          width: 100%; max-width: 900px; height: auto;
          border-radius: 16px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.35);
          border: 1px solid var(--line);
          display: block; margin: 0 auto;
        }

        .landing-features {
          max-width: 640px; margin: 40px auto 0;
          display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
        }
        @media (max-width: 520px) { .landing-features { grid-template-columns: 1fr; } }
        .landing-feature-card {
          border: 1px solid var(--line); background: var(--panel);
          border-radius: 6px; padding: 16px 18px; text-align: left;
          position: relative;
        }
        .landing-feature-card::before {
          content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 2px;
          background: var(--blue-dim);
        }
        .landing-feature-num {
          font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--blue);
          margin-bottom: 6px; display: block;
        }
        .landing-feature-card h3 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 14.5px; font-weight: 700;
          margin: 0 0 6px; color: var(--text);
        }
        .landing-feature-card p {
          font-size: 12.5px; line-height: 1.6; color: var(--muted); margin: 0;
        }

        .landing-audience {
          max-width: 640px; margin: 34px auto 0;
          border: 1px solid var(--line); border-left: 2px solid var(--amber);
          background: var(--panel); border-radius: 4px; padding: 18px 20px;
        }
        .landing-audience h4 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 13.5px; font-weight: 700;
          margin: 0 0 10px; color: var(--amber);
        }
        .landing-audience ul { margin: 0; padding-left: 18px; }
        .landing-audience li { font-size: 13px; line-height: 1.9; color: var(--text); }

        .landing-blog-section {
          max-width: 640px; margin: 34px auto 0; padding: 30px 24px;
          text-align: center; border: 1px solid var(--line); border-radius: 8px;
          background: var(--panel);
        }
        .landing-blog-section h3 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 18px; font-weight: 700;
          margin: 0 0 12px; color: var(--text);
        }
        .landing-blog-section p {
          font-size: 13px; line-height: 1.8; color: var(--muted);
          margin: 0 0 20px;
        }

        .landing-disclaimer {
          max-width: 640px; margin: 22px auto 0;
          font-size: 11px; line-height: 1.7; color: var(--muted); text-align: center;
        }
      `}</style>

      <div className="landing">
        <div className="landing-hero">
          <h1>{t("landingTitle")}</h1>
          <p className="landing-free-notice">
            <strong>{t("landingFreeBadge")}</strong><br />
            {t("landingFreeNotice")}
          </p>
          <p className="landing-catch">
            {t("landingCatch")}
          </p>
          <p className="landing-sub">
            {t("landingSub1")}<br />
            {t("landingSub2")}
          </p>
          <button className="landing-cta" onClick={scrollToSimulator}>
            {t("landingCta")}
          </button>
        </div>

        <div className="landing-screenshot">
          <h2>{t("landingScreenshotTitle")}</h2>
          <p>{t("landingScreenshotDesc")}</p>
          <img src="/ogp.png" alt={t("landingScreenshotAlt")} loading="lazy" />
        </div>

        <div className="landing-features">
          <div className="landing-feature-card">
            <span className="landing-feature-num">01</span>
            <h3>{t("landingFeature1Title")}</h3>
            <p>{t("landingFeature1Desc")}</p>
          </div>
          <div className="landing-feature-card">
            <span className="landing-feature-num">02</span>
            <h3>{t("landingFeature2Title")}</h3>
            <p>{t("landingFeature2Desc")}</p>
          </div>
          <div className="landing-feature-card">
            <span className="landing-feature-num">03</span>
            <h3>{t("landingFeature3Title")}</h3>
            <p>{t("landingFeature3Desc")}</p>
          </div>
          <div className="landing-feature-card">
            <span className="landing-feature-num">04</span>
            <h3>{t("landingFeature4Title")}</h3>
            <p>{t("landingFeature4Desc")}</p>
          </div>
        </div>

        <div className="landing-audience">
          <h4>{t("landingAudienceTitle")}</h4>
          <ul>
            <li>{t("landingAudience1")}</li>
            <li>{t("landingAudience2")}</li>
            <li>{t("landingAudience3")}</li>
            <li>{t("landingAudience4")}</li>
            <li>{t("landingAudience5")}</li>
          </ul>
        </div>

        {onOpenBlog && (
          <div className="landing-blog-section">
            <h3>{t("landingBlogTitle")}</h3>
            <p>
              {t("landingBlogDesc1")}<br />
              {t("landingBlogDesc2")}
            </p>
            <button className="landing-cta" onClick={onOpenBlog}>
              {t("landingBlogCta")}
            </button>
          </div>
        )}

        <p className="landing-disclaimer">
          {t("landingDisclaimer")}
        </p>
      </div>

      <div className="titleblock" id="simulator">
        <div>
          <h1>
            {t("appTitle")}
            {inputs.userName && <><br />{t("appTitleWithName", { name: inputs.userName })}</>}
          </h1>
          <div className="sub">
            {t("appSubtitle")}
            <br />
            {t("todayLabel")}：{new Date().toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
        <div className="meta" style={{ alignItems: "center" }}>
          <div className="no-print">
            <select
              className="country-select"
              value={country}
              onChange={(e) => {
                const nextCountry = e.target.value;
                const meta = SUPPORTED_COUNTRIES.find((c) => c.code === nextCountry);
                if (!meta || !meta.enabled) return; // Coming Soon の国は選択不可
                update({
                  country: nextCountry,
                  baseCurrency: DEFAULT_CURRENCY_BY_COUNTRY[nextCountry] || "JPY",
                  language: DEFAULT_LANGUAGE_BY_COUNTRY[nextCountry] || "ja",
                });
                // 個別株の初期候補も国別に切り替える。ただし、現在のリストが
                // どちらかの国の「未編集の初期候補」と完全一致する場合のみ入れ替え、
                // ユーザーが実際に入力した保有銘柄は絶対に上書きしない。
                const currentJson = JSON.stringify(watchlist);
                const isUntouchedDefault =
                  currentJson === JSON.stringify(DEFAULT_WATCHLIST_JP) ||
                  currentJson === JSON.stringify(DEFAULT_WATCHLIST_US) ||
                  currentJson === JSON.stringify(DEFAULT_WATCHLIST_GB) ||
                  currentJson === JSON.stringify(DEFAULT_WATCHLIST_CA) ||
                  currentJson === JSON.stringify(DEFAULT_WATCHLIST_AU);
                if (isUntouchedDefault) {
                  setWatchlist(defaultWatchlistFor(nextCountry));
                }
                // iDeCo「運用商品名」の初期値も、未編集（既定値のまま）の場合のみ国別に切り替える。
                const untouchedProductNames = [
                  translateWith("ja", "idecoProductDefault"),
                  translateWith("en", "idecoProductDefault"),
                ];
                if (untouchedProductNames.includes(inputs.ideco.productName)) {
                  updateIdeco("productName", translateWith(DEFAULT_LANGUAGE_BY_COUNTRY[nextCountry] || "ja", "idecoProductDefault"));
                }
              }}
              title={t("countrySelectTitle")}
            >
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} disabled={!c.enabled}>
                  {c.flag} {c.name}{!c.enabled ? " (Coming Soon)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            {t("currentAgeLabel")}{" "}
            <span>
              {preciseAge
                ? t("ageYMD", { years: preciseAge.years, months: preciseAge.months, days: preciseAge.days })
                : t("ageYears", { age: effectiveCurrentAge })}
            </span>
          </div>
          <div>{t("retireAgeLabel")} <span>{t("ageYears", { age: inputs.retireAge })}</span></div>
          <div>{t("lifeExpectancyLabel")} <span>{t("ageYears", { age: inputs.deathAge })}</span></div>
          <div
            className={`save-badge save-${saveStatus}`}
            title={saveMessage}
          >
            {saveStatus === "saved" && `● ${t("saveSaved")}`}
            {saveStatus === "saving" && `○ ${t("saveSaving")}`}
            {saveStatus === "error" && `⚠ ${t("saveError")}`}
            {saveStatus === "unavailable" && `⚠ ${t("saveUnavailable")}`}
            {saveStatus === "idle" && "…"}
          </div>
          <button className="history-toggle" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? t("historyToggleClose") : t("historyToggleOpen", { count: history.length })}
          </button>
          <button className="history-toggle" onClick={() => setShowBackup((v) => !v)}>
            {showBackup ? t("backupToggleClose") : t("backupToggleOpen")}
          </button>
          <button className="history-toggle no-print" onClick={() => window.print()}>
            {t("printButton")}
          </button>
          <button className="history-toggle no-print" onClick={() => setShowTodayTotal((v) => !v)}>
            {showTodayTotal
              ? t("todayTotalShown", { amount: money(netWorthYearly[0]?.netWorth ?? netWorthFinal) })
              : t("todayTotalHidden")}
          </button>
        </div>
      </div>
      {/* 免責表示：国・言語を問わず常時表示する（印刷・PDFにも残す） */}
      <div className="disclaimer-banner">
        <Info size={13} />
        <span>{t("disclaimerBanner")}</span>
      </div>
      {country !== "JP" && (
        <div className="locale-preview-warning no-print">
          <Info size={13} />
          <span>{t("localePreviewWarning")}</span>
        </div>
      )}
      {(saveStatus === "unavailable" || saveStatus === "error") && (
        <div className="save-warning">
          <Info size={13} />
          <span>{saveMessage}　{t("saveWarningHint")}</span>
        </div>
      )}
      {showBackup && (
        <div className="history-panel">
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
            {t("backupInstructions")}
          </div>
          <div className="field-label" style={{ marginBottom: 4 }}>{t("backupExportLabel")}</div>
          <textarea
            readOnly value={backupText}
            onClick={(e) => e.target.select()}
            style={{
              width: "100%", height: 120, background: "var(--panel-2)", color: "var(--text)",
              border: "1px solid var(--line)", borderRadius: 3, fontSize: 10.5,
              fontFamily: "'JetBrains Mono', monospace", padding: 8, marginBottom: 14,
            }}
          />
          <div className="field-label" style={{ marginBottom: 4 }}>{t("backupImportLabel")}</div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={t("backupImportPlaceholder")}
            style={{
              width: "100%", height: 100, background: "var(--panel-2)", color: "var(--text)",
              border: "1px solid var(--line)", borderRadius: 3, fontSize: 10.5,
              fontFamily: "'JetBrains Mono', monospace", padding: 8, marginBottom: 8,
            }}
          />
          <button className="history-action" onClick={importBackup}>{t("backupImportButton")}</button>
          {importOk && <span style={{ fontSize: 11, color: "var(--green)", marginLeft: 8 }}>{t("backupImportSuccess")}</span>}
          {importError && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>{importError}</div>}
        </div>
      )}

      {showHistory && (
        <div className="history-panel">
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="history-action" onClick={() => save(inputs, watchlist)}>{t("historyRecordNow")}</button>
            <button className="history-action" onClick={refreshHistory}>{t("historyReload")}</button>
            {historyDebug && <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{historyDebug}</span>}
          </div>
          {history.length === 0 ? (
            <div className="history-empty">{t("historyEmpty")}</div>
          ) : (
            <table className="watchlist">
              <thead>
                <tr>
                  <th>{t("historyColDate")}</th>
                  <th>{t("historyColNisaPrincipal")}</th>
                  <th>{t("historyColGoldGrams")}</th>
                  <th>{t("historyColBankTotal")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.date}>
                    <td className="mono">{formatDateLabel(h.date)}</td>
                    <td className="mono">{money(h.currentAssets)}</td>
                    <td className="mono">{(h.goldGrams || 0).toFixed(1)}g</td>
                    <td className="mono">{money(h.bankTotal)}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button className="history-action" onClick={() => restoreSnapshot(h)}>{t("historyRestore")}</button>
                      <button className="del-btn" onClick={() => deleteSnapshot(h.date)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="grid-main">
        {/* -------- LEFT: INPUT PANEL -------- */}
        <div className="panel">
          <div className="section-block" style={{ borderColor: "#4FA8D8" }}>
          <SectionTitle index="00" title={label("personalInfo")} icon={Users} />
          <label className="field">
            <span className="field-label">{t("nameLabel")}</span>
            <div className="field-input-wrap">
              <input
                type="text"
                value={inputs.userName}
                onChange={(e) => update({ userName: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
          </label>
          <label className="field">
            <span className="field-label">{t("birthDateLabel")}</span>
            <div className="field-input-wrap">
              <input
                type="date" className="mono"
                value={inputs.birthDate}
                onChange={(e) => update({ birthDate: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
          </label>
          {preciseAge && (
            <div className="note">
              <Info size={13} />
              <span>
                {t("birthDateNotePrefix")}<strong>{t("ageYMD", { years: preciseAge.years, months: preciseAge.months, days: preciseAge.days })}</strong>
                {t("birthDateNoteSuffix")}
              </span>
            </div>
          )}

          </div>
          <div className="section-block" style={{ borderColor: "#D9A54F" }}>
          <SectionTitle index="01" title={label("basicInfo")} icon={Ruler} />
          <AgeField guide={t("currentAgeGuide")} label={t("currentAgeFieldLabel")} value={effectiveCurrentAge} disabled={!!preciseAge} onChange={(v) => update({ currentAge: v })} />
          {preciseAge && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>{t("currentAgeAutoNote")}</span>
            </div>
          )}
          <AgeField guide={t("retireAgeGuide")} label={t("retireAgeFieldLabel")} value={inputs.retireAge} onChange={(v) => update({ retireAge: v })} />
          <AgeField guide={t("deathAgeGuide")} label={t("lifeExpectancyLabel")} value={inputs.deathAge} onChange={(v) => update({ deathAge: v })} />

          </div>
          <div className="section-block" style={{ borderColor: "#8FBF7F" }}>
          <SectionTitle index="02" title={label("investmentTaxAdvantaged")} icon={TrendingUp} />

          {country === "JP" ? (
          <>
          {/* ① いま溜まっている金額（保有銘柄＋NISA合計） */}
          <div className="nisa-group nisa-group-holdings">
            <div className="nisa-group-title">{t("nisaGroupHoldings")}</div>
          <GuideLabel guide={t("tsumitateHoldingsGuide")}>{t("tsumitateHoldingsLabel")}</GuideLabel>
          {inputs.tsumitateHoldings.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>{t("colName")}</th><th>{t("colAmount")}</th><th></th></tr></thead>
              <tbody>
                {inputs.tsumitateHoldings.map((h, i) => (
                  <tr key={i}>
                    <td>{h.name}</td>
                    <td className="mono">{money(h.value)}</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeTsumitateHolding(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder={t("holdingNamePlaceholder")} value={newTsumitateHolding.name} onChange={(e) => setNewTsumitateHolding((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder={t("amountPlaceholder")} type="number" value={newTsumitateHolding.value} onChange={(e) => setNewTsumitateHolding((p) => ({ ...p, value: e.target.value }))} />
            <button className="add-btn" onClick={addTsumitateHolding}><Plus size={15} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 10, color: "#E07A5F", whiteSpace: "nowrap", fontWeight: 700 }}>{t("asOfAgeRequired")}</span>
            <AgeYMInput
              placeholder={t("asOfAgePlaceholder")} years={inputs.tsumitateHoldingsAsOfYears} months={inputs.tsumitateHoldingsAsOfMonths}
              onYears={(v) => update({ tsumitateHoldingsAsOfYears: v })}
              onMonths={(v) => update({ tsumitateHoldingsAsOfMonths: v })}
            />
          </div>
          <div className="note" style={{ marginBottom: 12 }}>
            <Info size={13} />
            <span>{t("tsumitateAsOfNote", { manual: money(tsumitateHoldingsManualTotal), catchup: money(tsumitateCatchUp) })}</span>
          </div>

          <GuideLabel guide={t("growthHoldingsGuide")}>{t("growthHoldingsLabel")}</GuideLabel>
          {inputs.growthHoldings.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>{t("colName")}</th><th>{t("colAmount")}</th><th></th></tr></thead>
              <tbody>
                {inputs.growthHoldings.map((h, i) => (
                  <tr key={i}>
                    <td>{h.name}</td>
                    <td className="mono">{money(h.value)}</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeGrowthHolding(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder={t("holdingNamePlaceholder")} value={newGrowthHolding.name} onChange={(e) => setNewGrowthHolding((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder={t("amountPlaceholder")} type="number" value={newGrowthHolding.value} onChange={(e) => setNewGrowthHolding((p) => ({ ...p, value: e.target.value }))} />
            <button className="add-btn" onClick={addGrowthHolding}><Plus size={15} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 10, color: "#E07A5F", whiteSpace: "nowrap", fontWeight: 700 }}>{t("asOfAgeRequired")}</span>
            <AgeYMInput
              placeholder={t("asOfAgePlaceholder")} years={inputs.growthHoldingsAsOfYears} months={inputs.growthHoldingsAsOfMonths}
              onYears={(v) => update({ growthHoldingsAsOfYears: v })}
              onMonths={(v) => update({ growthHoldingsAsOfMonths: v })}
            />
          </div>
          <div className="note" style={{ marginBottom: 12 }}>
            <Info size={13} />
            <span>{t("growthAsOfNote", { manual: money(growthHoldingsManualTotal), catchup: money(growthCatchUp) })}</span>
          </div>

          {autoHoldingRows.length > 0 && (
            <>
              <div className="field-label" style={{ marginBottom: 6 }}>
                {t("autoValuationLabel")}
              </div>
              <table className="watchlist" style={{ marginBottom: 8 }}>
                <thead><tr><th>{t("colName")}</th><th>{t("autoValuationCol")}</th></tr></thead>
                <tbody>
                  {autoHoldingRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td className="mono">{money(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <label className="field">
            <span className="field-label-row">
              <span className="field-label">{t("nisaTotalLabel")}</span>
              <NisaTotalGuide />
            </span>
            <div className="field-input-wrap">
              <div className="mono" style={{ flex: 1, padding: "8px 10px", fontSize: 13 }}>
                {Math.round(effectiveCurrentAssets).toLocaleString()}
              </div>
              <span className="field-unit">{uCurrency}</span>
            </div>
          </label>
          <div className="note" style={{ marginTop: -8 }}>
            <Info size={13} />
            <span>
              {t("nisaTotalExplanation", {
                tsumitate: money(tsumitateHoldingsTotal),
                growth: money(growthHoldingsTotal),
                lump: money(autoHoldingsTotal),
                total: money(effectiveCurrentAssets),
                tsumitateCatchup: money(tsumitateCatchUp),
                growthCatchup: money(growthCatchUp),
              })}
            </span>
          </div>

          </div>

          {/* ② つみたて投資枠（毎月の投資＋銘柄配分） */}
          <div className="nisa-group nisa-group-tsumitate">
            <div className="nisa-group-title">{t("nisaGroupTsumitate")}</div>
          <GuideLabel guide={t("tsumitateScheduleGuide")}>{t("tsumitateScheduleLabel")}</GuideLabel>
          {inputs.tsumitateSchedule.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>{t("colAge")}</th><th>{t("colMonthlyVsCap")}</th><th></th></tr></thead>
              <tbody>
                {inputs.tsumitateSchedule.map((r, i) => (
                  <tr key={i}>
                    <td>{formatAge(r.fromAge)}〜{formatAge(r.toAge)}</td>
                    <td className="mono">
                      <div>{money(r.monthlyYen)}{t("perMonthSuffix")}</div>
                      <div style={{ fontSize: 10, color: r.monthlyYen > tsumitateMonthlyCapValue ? "#C2694F" : "#7C8A90" }}>
                        {formatCapDiff(tsumitateMonthlyCapValue - r.monthlyYen, t("periodMonth"))}
                      </div>
                      <div style={{ fontSize: 10, color: "#7C8A90" }}>
                        {t("lifetimeRemainingAtEnd", { amount: money(lifetimeRemainingAtAge(r.toAge)) })}
                      </div>
                    </td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeTsumitateRange(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row">
            <AgeYMInput
              placeholder={t("startPlaceholder")} years={newTsumitateRange.fromYears} months={newTsumitateRange.fromMonths}
              onYears={(v) => setNewTsumitateRange((p) => ({ ...p, fromYears: v }))}
              onMonths={(v) => setNewTsumitateRange((p) => ({ ...p, fromMonths: v }))}
            />
            <AgeYMInput
              placeholder={t("endPlaceholder")} years={newTsumitateRange.toYears} months={newTsumitateRange.toMonths}
              onYears={(v) => setNewTsumitateRange((p) => ({ ...p, toYears: v }))}
              onMonths={(v) => setNewTsumitateRange((p) => ({ ...p, toMonths: v }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 14 }}>
            <input placeholder={t("monthlyAmountPlaceholder")} type="number" value={newTsumitateRange.monthlyYen} onChange={(e) => setNewTsumitateRange((p) => ({ ...p, monthlyYen: e.target.value }))} />
            <button className="add-btn" onClick={addTsumitateRange}><Plus size={15} /></button>
          </div>
          <div className="note">
            <Info size={13} />
            <span>{t("scheduleExampleNote")}</span>
          </div>

          <GuideLabel guide={t("tsumitateAllocationGuide")}>{t("tsumitateAllocationLabel")}</GuideLabel>
          <AllocationBreakdown
            items={inputs.tsumitateAllocation}
            newItem={newTsumitateAllocItem}
            onNewItemChange={setNewTsumitateAllocItem}
            onAdd={() => addAllocationItem("tsumitateAllocation", newTsumitateAllocItem, setNewTsumitateAllocItem)}
            onRemove={(i) => removeAllocationItem("tsumitateAllocation", i)}
            onUpdate={(i, key, val) => updateAllocationItem("tsumitateAllocation", i, key, val)}
          />
          <div style={{ marginBottom: 18 }} />

          </div>

          {/* ③ 成長投資枠（毎月の投資＋銘柄配分） */}
          <div className="nisa-group nisa-group-growth">
            <div className="nisa-group-title">{t("nisaGroupGrowth")}</div>
          <GuideLabel guide={t("growthScheduleGuide")}>{t("growthScheduleLabel")}</GuideLabel>
          {inputs.growthSchedule.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>{t("colAge")}</th><th>{t("colMonthlyVsCap")}</th><th></th></tr></thead>
              <tbody>
                {inputs.growthSchedule.map((r, i) => (
                  <tr key={i}>
                    <td>{formatAge(r.fromAge)}〜{formatAge(r.toAge)}</td>
                    <td className="mono">
                      <div>{money(r.monthlyYen)}{t("perMonthSuffix")}</div>
                      <div style={{ fontSize: 10, color: r.monthlyYen > growthMonthlyCapValue ? "#C2694F" : "#7C8A90" }}>
                        {formatCapDiff(growthMonthlyCapValue - r.monthlyYen, t("periodMonth"))}
                      </div>
                      <div style={{ fontSize: 10, color: "#7C8A90" }}>
                        {t("lifetimeRemainingAtEnd", { amount: money(lifetimeRemainingAtAge(r.toAge)) })}
                      </div>
                    </td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeGrowthRange(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row">
            <AgeYMInput
              placeholder={t("startPlaceholder")} years={newGrowthRange.fromYears} months={newGrowthRange.fromMonths}
              onYears={(v) => setNewGrowthRange((p) => ({ ...p, fromYears: v }))}
              onMonths={(v) => setNewGrowthRange((p) => ({ ...p, fromMonths: v }))}
            />
            <AgeYMInput
              placeholder={t("endPlaceholder")} years={newGrowthRange.toYears} months={newGrowthRange.toMonths}
              onYears={(v) => setNewGrowthRange((p) => ({ ...p, toYears: v }))}
              onMonths={(v) => setNewGrowthRange((p) => ({ ...p, toMonths: v }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 14 }}>
            <input placeholder={t("monthlyAmountPlaceholder")} type="number" value={newGrowthRange.monthlyYen} onChange={(e) => setNewGrowthRange((p) => ({ ...p, monthlyYen: e.target.value }))} />
            <button className="add-btn" onClick={addGrowthRange}><Plus size={15} /></button>
          </div>
          <div className="note">
            <Info size={13} />
            <span>{t("growthScheduleExampleNote")}</span>
          </div>

          <GuideLabel guide={t("growthAllocationGuide")}>{t("growthAllocationLabel")}</GuideLabel>
          <AllocationBreakdown
            items={inputs.growthAllocation}
            newItem={newGrowthAllocItem}
            onNewItemChange={setNewGrowthAllocItem}
            onAdd={() => addAllocationItem("growthAllocation", newGrowthAllocItem, setNewGrowthAllocItem)}
            onRemove={(i) => removeAllocationItem("growthAllocation", i)}
            onUpdate={(i, key, val) => updateAllocationItem("growthAllocation", i, key, val)}
          />
          <div style={{ marginBottom: 18 }} />

          {rules.investment.implemented && (
            <div className="note">
              <Info size={13} />
              <span>
                {t("nisaCapSummaryNote")}
              </span>
            </div>
          )}

          </div>

          {/* ④ 一括投資枠（成長投資枠を使う一括投資＋銘柄配分） */}
          <div className="nisa-group nisa-group-lump">
            <div className="nisa-group-title">{t("nisaGroupLump")}</div>
          <GuideLabel guide={t("lumpSumGuide")}>{t("lumpSumLabel")}</GuideLabel>
          {inputs.lumpSums.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>{t("colAge")}</th><th>{t("colAmountVsCap")}</th><th></th></tr></thead>
              <tbody>
                {inputs.lumpSums.map((entry, i) => {
                  const annualHeadroom = NISA_LIMITS.growthAnnual - (scheduledAmount(inputs.growthSchedule, entry.age) * 12 + entry.amount);
                  return (
                    <tr key={i}>
                      <td>{formatAge(entry.age)}</td>
                      <td className="mono">
                        <div>{money(entry.amount)}</div>
                        <div style={{ fontSize: 10, color: annualHeadroom < 0 ? "#C2694F" : "#7C8A90" }}>
                          {formatCapDiff(annualHeadroom, t("periodYear"))}
                        </div>
                        <div style={{ fontSize: 10, color: "#7C8A90" }}>
                          {t("lifetimeRemainingAfterInvestment", { amount: money(lifetimeRemainingAtAge(entry.age)) })}
                        </div>
                      </td>
                      <td style={{ width: 24 }}>
                        <button className="del-btn" onClick={() => removeLump(i)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ marginBottom: 14 }}>
            <AgeYMInput
              placeholder={t("investmentTimePlaceholder")} years={newLump.years} months={newLump.months}
              onYears={(v) => setNewLump((p) => ({ ...p, years: v }))}
              onMonths={(v) => setNewLump((p) => ({ ...p, months: v }))}
            />
            <input placeholder={t("amountPlaceholder")} type="number" value={newLump.amount} onChange={(e) => setNewLump((p) => ({ ...p, amount: e.target.value }))} />
            <button className="add-btn" onClick={addLump}><Plus size={15} /></button>
          </div>

          <GuideLabel guide={t("lumpAllocationGuide")}>{t("lumpAllocationLabel")}</GuideLabel>
          <AllocationBreakdown
            items={inputs.lumpAllocation}
            newItem={newLumpAllocItem}
            onNewItemChange={setNewLumpAllocItem}
            onAdd={() => addAllocationItem("lumpAllocation", newLumpAllocItem, setNewLumpAllocItem)}
            onRemove={(i) => removeAllocationItem("lumpAllocation", i)}
            onUpdate={(i, key, val) => updateAllocationItem("lumpAllocation", i, key, val)}
          />
          </div>

          <div className="field-label" style={{ marginTop: 16, marginBottom: 6 }}>
            {t("nisaAllocationSlidersLabel")}
          </div>
          {dynamicFunds.length > 0 ? (
            <>
              {dynamicFunds.map((f, i) => (
                <div key={f.id}>
                  <div className="alloc-row">
                    <span className="alloc-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <div>
                      <div style={{ fontSize: 11, marginBottom: 2 }}>{f.id}</div>
                      <input type="range" min={0} max={100} value={f.pct} disabled />
                    </div>
                    <span className="alloc-val">{f.pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: -4, marginBottom: 10, paddingLeft: 24 }}>
                    <span style={{ fontSize: 10, color: "#7C8A90" }}>{t("expectedReturnLabel")}</span>
                    <input
                      type="number" step={0.5} className="inline-num" style={{ width: 60 }}
                      value={inputs.extraFundReturns[f.id] !== undefined ? inputs.extraFundReturns[f.id] : guessDefaultReturn(f.id)}
                      onChange={(e) => updateExtraFundReturn(f.id, Number(e.target.value))}
                    />
                    <span style={{ fontSize: 10, color: "#7C8A90" }}>%</span>
                  </div>
                </div>
              ))}
              <div className="alloc-sum">
                {t("allocSumNote", { amount: money(combinedGrandTotal) })}
              </div>
              <div className="note" style={{ marginTop: 8 }}>
                <Info size={13} />
                <span>{t("expectedReturnAutoNote")}</span>
              </div>
            </>
          ) : (
            <div className="note">
              <Info size={13} />
              <span>{t("noFundsYetNote")}</span>
            </div>
          )}

          <div className="note">
            <Info size={13} />
            <span>{t("overlapWarningNote")}</span>
          </div>
          </>
          ) : country === "US" && rules.investment.implemented ? (
            <USInvestmentAccountsPanel
              usInvestment={inputs.usInvestment}
              onUpdate={updateUsInvestment}
              onUpdateAccount={updateUsInvestmentAccount}
              age={effectiveCurrentAge}
              investmentRules={rules.investment}
              taxRules={rules.tax}
              taxResult={{
                federalTax: usFederalTaxResult.tax,
                taxableIncome: usFederalTaxResult.taxableIncome,
                ltcgTax: usLtcgTax,
                niit: usNiit,
                stateTax: usStateTax,
                totalTax: usTotalTax,
              }}
            />
          ) : country === "GB" && rules.investment.implemented ? (
            <GBInvestmentAccountsPanel
              gbInvestment={inputs.gbInvestment}
              onUpdate={updateGbInvestment}
              onUpdateAccount={updateGbInvestmentAccount}
              age={effectiveCurrentAge}
              investmentRules={rules.investment}
              taxRules={rules.tax}
              pensionAllowance={gbPensionAnnualAllowance}
              taxResult={{
                incomeTax: gbIncomeTaxResult.tax,
                taxableIncome: gbIncomeTaxResult.taxableIncome,
                dividendTax: gbDividendTax,
                capitalGainsTax: gbCapitalGainsTax,
                pensionTaxRelief: gbPensionTaxRelief,
                marginalRate: gbMarginalRate,
                totalTax: gbTotalTax,
              }}
            />
          ) : country === "CA" && rules.investment.implemented ? (
            <CAInvestmentAccountsPanel
              caInvestment={inputs.caInvestment}
              onUpdate={updateCaInvestment}
              onUpdateAccount={updateCaInvestmentAccount}
              age={effectiveCurrentAge}
              investmentRules={rules.investment}
              taxRules={rules.tax}
              rrspRoom={caRrspRoom}
              taxResult={{
                federalTax: caFederalTaxResult.tax,
                basicPersonalAmount: caFederalTaxResult.basicPersonalAmount,
                capitalGainsTax: caCapitalGainsTax,
                rrspTaxSaving: caRrspTaxSaving,
                marginalRate: caMarginalRate,
                totalTax: caTotalTax,
              }}
            />
          ) : country === "AU" && rules.investment.implemented ? (
            <AUInvestmentAccountsPanel
              auInvestment={inputs.auInvestment}
              onUpdate={updateAuInvestment}
              onUpdateAccount={updateAuInvestmentAccount}
              age={effectiveCurrentAge}
              investmentRules={rules.investment}
              taxRules={rules.tax}
              sgContribution={auSgContribution}
              totalConcessional={auTotalConcessional}
              concessionalRemaining={auConcessionalRemaining}
              nonConcessionalRemaining={auNonConcessionalRemaining}
              superContributionTax={auSuperContributionTax}
              salarySacrificeSaving={auSalarySacrificeSaving}
              taxResult={auTaxResult}
              capitalGainsTax={auCapitalGainsTax}
              totalTax={auTotalTax}
              marginalRate={auMarginalRate}
            />
          ) : (
            <div className="note" style={{ borderLeftColor: "#D9A54F" }}>
              <Info size={13} style={{ color: "#D9A54F" }} />
              <span>{t(rules.labels.investmentNote, { country: countryDisplayName })}</span>
            </div>
          )}

          </div>
          <div className="section-block" style={{ borderColor: "#B08FD6" }}>
          <SectionTitle index="03" title={label("retirementAccount")} icon={Landmark} />

          {!rules.retirement.implemented && (
            <div className="note" style={{ borderLeftColor: "#D9A54F", marginBottom: 12 }}>
              <Info size={13} style={{ color: "#D9A54F" }} />
              <span>{t(rules.labels.retirementNote, { country: countryDisplayName })}</span>
            </div>
          )}

          <div className="note">
            <Info size={13} />
            <span>
              {t("idecoIntroNote")}
            </span>
          </div>

          <Field guide={t("idecoCurrentValueGuide")} label={t("idecoCurrentValueLabel")} unit={uCurrency} step={10000} value={inputs.ideco.currentValue} onChange={(v) => updateIdeco("currentValue", v)} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "#E07A5F", whiteSpace: "nowrap", fontWeight: 700 }}>{t("asOfAgeRequired")}</span>
            <AgeYMInput
              placeholder={t("asOfAgePlaceholder")} years={inputs.ideco.asOfYears} months={inputs.ideco.asOfMonths}
              onYears={(v) => updateIdeco("asOfYears", v)}
              onMonths={(v) => updateIdeco("asOfMonths", v)}
            />
          </div>
          <div className="note" style={{ marginTop: -8 }}>
            <Info size={13} />
            <span>{t("idecoAsOfNote", { amount: money(idecoSim.currentValueAdjusted) })}</span>
          </div>
          <label className="field">
            <span className="field-label">{t("idecoCurrentValueAutoLabel")}</span>
            <div className="field-input-wrap">
              <div className="mono" style={{ flex: 1, padding: "8px 10px", fontSize: 13 }}>
                {Math.round(idecoSim.currentValueAdjusted).toLocaleString()}
              </div>
              <span className="field-unit">{uCurrency}</span>
            </div>
          </label>
          <Field guide={t("idecoPrincipalGuide")} label={t("idecoPrincipalLabel")} unit={uCurrency} step={10000} value={inputs.ideco.principalTotal} onChange={(v) => updateIdeco("principalTotal", v)} />
          <Field guide={t("idecoMonthlyContributionGuide")} label={t("idecoMonthlyContributionLabel")} unit={uCurrency} step={1000} value={inputs.ideco.monthlyContribution} onChange={(v) => updateIdeco("monthlyContribution", v)} />
          <AgeField label={t("idecoContributionStartAgeLabel")} value={inputs.ideco.startAge} onChange={(v) => updateIdeco("startAge", v)} />
          <AgeField label={t("idecoContributionEndAgeLabel")} value={inputs.ideco.endAge} onChange={(v) => updateIdeco("endAge", v)} />

          <label className="field">
            <span className="field-label">{t("idecoProductNameLabel")}</span>
            <div className="field-input-wrap">
              <input
                type="text" value={inputs.ideco.productName}
                onChange={(e) => updateIdeco("productName", e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </label>

          <Field
            label={`${t("expectedAnnualReturnLabel")}${inputs.ideco.returnPctAuto ? t("autoGuessedSuffix") : ""}`}
            unit="%" step={0.5}
            value={effectiveIdecoReturn}
            onChange={(v) => { updateIdeco("returnPct", v); updateIdeco("returnPctAuto", false); }}
          />
          {!inputs.ideco.returnPctAuto && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>
                {t("manualOverrideNote")}
                <span
                  style={{ color: "#4FA8D8", textDecoration: "underline", cursor: "pointer", marginLeft: 4 }}
                  onClick={() => updateIdeco("returnPctAuto", true)}
                >
                  {t("revertToAutoLink")}
                </span>
              </span>
            </div>
          )}

          <AgeField label={t("payoutStartAgeLabel")} value={inputs.ideco.payoutStartAge} onChange={(v) => updateIdeco("payoutStartAge", v)} />

          <div className="field-label" style={{ marginBottom: 6 }}>{t("payoutMethodLabel")}</div>
          <div className="add-row" style={{ marginBottom: 14 }}>
            {[
              { key: "lump", label: t("payoutMethodLump") },
              { key: "pension", label: t("payoutMethodPension") },
              { key: "both", label: t("payoutMethodBoth") },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => updateIdeco("payoutMethod", opt.key)}
                style={{
                  flex: 1, padding: "9px 8px", borderRadius: 4, fontSize: 12.5, cursor: "pointer",
                  border: inputs.ideco.payoutMethod === opt.key ? "1px solid #4FA8D8" : "1px solid var(--line)",
                  background: inputs.ideco.payoutMethod === opt.key ? "rgba(79,168,216,0.15)" : "var(--panel)",
                  color: inputs.ideco.payoutMethod === opt.key ? "#4FA8D8" : "var(--text)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {(inputs.ideco.payoutMethod === "pension" || inputs.ideco.payoutMethod === "both") && (
            <>
              <Field guide={t("idecoPayoutYearsGuide")} label={t("payoutYearsLabel")} unit={uYears} step={1} value={inputs.ideco.payoutYears} onChange={(v) => updateIdeco("payoutYears", v)} />
              <Field guide={t("idecoPayoutReturnGuide")} label={t("payoutReturnPctLabel")} unit="%" step={0.5} value={inputs.ideco.payoutReturnPct} onChange={(v) => updateIdeco("payoutReturnPct", v)} />
            </>
          )}
          {inputs.ideco.payoutMethod === "both" && (
            <Field guide={t("idecoLumpPortionGuide")} label={t("lumpPortionPctLabel")} unit="%" step={5} min={0} max={100} value={inputs.ideco.lumpPortionPct} onChange={(v) => updateIdeco("lumpPortionPct", v)} />
          )}

          <div className="stat-sub" style={{ marginBottom: 4 }}>{t("annualContributionLabel")}：<span className="mono">{money(idecoAnnualContribution)}</span></div>
          <div className="stat-sub" style={{ marginBottom: 4 }}>{t("contributionTotalLabel")}：<span className="mono">{money(idecoContributionTotal)}</span></div>
          <div className="stat-sub" style={{ marginBottom: 4 }}>{t("investmentGainLabel")}：<span className="mono">{money(idecoInvestmentGain)}</span></div>
          <div className="stat-sub" style={{ marginBottom: 4 }}>
            {t("estimatedAssetsAtPayoutLabel")}：<span className="mono">{idecoSim.valueAtPayout !== null ? money(idecoSim.valueAtPayout) : "—"}</span>
          </div>
          {(inputs.ideco.payoutMethod === "lump" || inputs.ideco.payoutMethod === "both") && (
            <div className="stat-sub" style={{ marginBottom: 4 }}>
              {t("lumpPayoutAmountLabel", { age: t("ageYears", { age: inputs.ideco.payoutStartAge }) })}：<span className="mono">{money(idecoSim.lumpAmount)}</span>
            </div>
          )}
          {(inputs.ideco.payoutMethod === "pension" || inputs.ideco.payoutMethod === "both") && (
            <div className="stat-sub" style={{ marginBottom: 14 }}>
              {t("annualPayoutAmountLabel", { from: inputs.ideco.payoutStartAge, to: idecoSim.payoutEndAge - 1 })}：<span className="mono">{money(idecoSim.annualPayout)}</span>
            </div>
          )}

          {country === "GB" || country === "CA" || country === "AU" ? (
            <div className="note" style={{ borderLeftColor: "#5FB0A0" }}>
              <Info size={13} style={{ color: "#5FB0A0" }} />
              <span>{t(rules.labels.taxNote)}</span>
            </div>
          ) : rules.tax.implemented ? (
            <>
              <div className="field-label" style={{ marginBottom: 6 }}>{t("taxSavingSimLabel")}</div>
              <Field guide={t("annualIncomeGuide")} label={t("annualIncomeLabel")} unit={uCurrency} step={100000} value={inputs.ideco.annualIncome} onChange={(v) => updateIdeco("annualIncome", v)} />
              <div className="stat-sub" style={{ marginBottom: 4 }}>{t("annualTaxSavingLabel")}：<span className="mono">{money(idecoAnnualTaxSaving)}</span></div>
              <div className="stat-sub" style={{ marginBottom: 8 }}>{t("cumulativeTaxSavingLabel")}：<span className="mono">{money(idecoCumulativeTaxSaving)}</span></div>
              <div className="note" style={{ marginTop: -4 }}>
                <Info size={13} />
                <span>{t("taxSavingCaveatNote")}</span>
              </div>
            </>
          ) : (
            <div className="note" style={{ borderLeftColor: "#D9A54F" }}>
              <Info size={13} style={{ color: "#D9A54F" }} />
              <span>{t(rules.labels.taxNote, { country: countryDisplayName })}</span>
            </div>
          )}
          <div className="note">
            <Info size={13} />
            <span>{t("payoutAccountingNote")}</span>
          </div>

          </div>
          <div className="section-block" style={{ borderColor: "#C2694F" }}>
          <SectionTitle index="04" title={label("pensionRetirement")} icon={Landmark} />
          {country === "JP" ? (
          <>
          <GuideLabel guide={t("pensionSourcesGuide")}>{t("pensionSourcesLabel")}</GuideLabel>
          {inputs.pensionSources.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>{t("pensionTypeCol")}</th><th>{t("monthlyAmountCol")}</th><th></th></tr></thead>
              <tbody>
                {inputs.pensionSources.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td className="mono">{money(p.monthlyAmount)}</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removePensionSource(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder={t("pensionNamePlaceholder")} value={newPensionSource.name} onChange={(e) => setNewPensionSource((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder={t("monthlyAmountPlaceholder")} type="number" value={newPensionSource.monthlyAmount} onChange={(e) => setNewPensionSource((p) => ({ ...p, monthlyAmount: e.target.value }))} />
            <button className="add-btn" onClick={addPensionSource}><Plus size={15} /></button>
          </div>
          <Field
            label={inputs.pensionSources.length > 0 ? t("pensionTotalAutoLabel") : t("pensionEstimateLabel")}
            unit={uPerMonth}
            value={effectivePensionMonthly}
            disabled={inputs.pensionSources.length > 0}
            step={5000}
            onChange={(v) => update({ pensionMonthly: v })}
          />
          {inputs.pensionSources.length > 0 && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>{t("pensionAutoNote")}</span>
            </div>
          )}
          <Field guide={t("livingCostGuide")} label={t("livingCostLabel")} unit={uPerMonth} value={inputs.livingCostMonthly} step={5000} onChange={(v) => update({ livingCostMonthly: v })} />
          <Field
            label={`${t("postRetireReturnLabel")}${inputs.postRetireReturnAuto && dynamicFunds.length > 0 ? t("autoHalfWeightedSuffix") : ""}`}
            unit="%" step={0.5}
            value={effectivePostRetireReturn}
            onChange={(v) => update({ postRetireReturn: v, postRetireReturnAuto: false })}
          />
          {!inputs.postRetireReturnAuto && dynamicFunds.length > 0 && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>
                {t("manualOverrideNote")}
                <span
                  style={{ color: "#4FA8D8", textDecoration: "underline", cursor: "pointer", marginLeft: 4 }}
                  onClick={() => update({ postRetireReturnAuto: true })}
                >
                  {t("revertToAutoLink")}
                </span>
              </span>
            </div>
          )}
          </>
          ) : country === "US" && rules.retirement.implemented ? (
            <USRetirementPanel
              usInvestment={inputs.usInvestment}
              onUpdateSS={(field, val) => updateUsInvestmentNested("socialSecurity", field, val)}
              onUpdate={updateUsInvestment}
              retirementRules={rules.retirement}
              claimAge={usClaimAge}
              ssMonthly={usSSMonthlyBenefit}
              ssAnnual={usSSAnnualBenefit}
              expensesAnnual={usExpensesAnnual}
              healthcareAnnual={usTotalHealthcareAnnual}
              withdrawalNeeded={usWithdrawalNeeded}
              incomeSurplus={usIncomeSurplus}
            />
          ) : country === "GB" && rules.retirement.implemented ? (
            <GBRetirementPanel
              gbInvestment={inputs.gbInvestment}
              onUpdateStatePension={(field, val) => updateGbInvestmentNested("statePension", field, val)}
              onUpdate={updateGbInvestment}
              retirementRules={rules.retirement}
              statePensionAge={gbStatePensionAge}
              claimAge={gbClaimAge}
              effectiveClaimAge={gbEffectiveClaimAge}
              deferralFactor={gbDeferralFactor}
              statePensionAnnual={gbStatePensionAnnual}
              retirementIncomeAnnual={gbRetirementIncomeAnnual}
              fullStatePensionAnnual={gbFullStatePensionAnnual}
              expensesAnnual={gbExpensesAnnual}
              healthcareAnnual={gbHealthcareAnnual}
              withdrawalNeeded={gbWithdrawalNeeded}
              incomeSurplus={gbIncomeSurplus}
            />
          ) : country === "CA" && rules.retirement.implemented ? (
            <CARetirementPanel
              caInvestment={inputs.caInvestment}
              onUpdateCpp={(field, val) => updateCaInvestmentNested("cpp", field, val)}
              onUpdateOas={(field, val) => updateCaInvestmentNested("oas", field, val)}
              onUpdate={updateCaInvestment}
              retirementRules={rules.retirement}
              cppStartAge={caCppStartAge}
              cppFactor={caCppFactor}
              cppAnnual={caCppAnnual}
              cppMaxAnnual={caCppMaxAnnual}
              oasStartAge={caOasStartAge}
              oasEffectiveStartAge={caOasEffectiveStartAge}
              oasResidenceFraction={caOasResidenceFraction}
              oasBeforeClawback={caOasBeforeClawback}
              oasClawback={caOasClawback}
              oasAnnual={caOasAnnual}
              retirementIncomeAnnual={caRetirementIncomeAnnual}
              expensesAnnual={caExpensesAnnual}
              healthcareAnnual={caHealthcareAnnual}
              withdrawalNeeded={caWithdrawalNeeded}
              incomeSurplus={caIncomeSurplus}
            />
          ) : country === "AU" && rules.retirement.implemented ? (
            <AURetirementPanel
              auInvestment={inputs.auInvestment}
              onUpdateAgePension={(field, val) => updateAuInvestmentNested("agePension", field, val)}
              onUpdate={updateAuInvestment}
              retirementRules={rules.retirement}
              qualifyingAge={auAgePensionQualifyingAge}
              maxAnnual={auAgePensionMaxAnnual}
              agePensionAnnual={auAgePensionAnnual}
              retirementIncomeAnnual={auRetirementIncomeAnnual}
              assessableAssets={auAssetSplitAtRetire.total}
              expensesAnnual={auExpensesAnnual}
              healthcareAnnual={auHealthcareAnnual}
              withdrawalNeeded={auWithdrawalNeeded}
              incomeSurplus={auIncomeSurplus}
              retireAge={inputs.retireAge}
            />
          ) : (
            <div className="note" style={{ borderLeftColor: "#D9A54F" }}>
              <Info size={13} style={{ color: "#D9A54F" }} />
              <span>{t(rules.labels.retirementNote, { country: countryDisplayName })}</span>
            </div>
          )}

          </div>
          <div className="section-block" style={{ borderColor: "#7BC9E0" }}>
          <SectionTitle index="05" title={label("healthCost")} icon={HeartPulse} />
          {country === "JP" ? (
          <>
          <Field guide={t("health60sGuide")} label={t("health60sLabel")} unit={uPerYear} step={10000} value={inputs.healthBrackets.b60} onChange={(v) => updateHealth("b60", v)} />
          <Field guide={t("health70sGuide")} label={t("health70sLabel")} unit={uPerYear} step={10000} value={inputs.healthBrackets.b70} onChange={(v) => updateHealth("b70", v)} />
          <Field guide={t("health80sGuide")} label={t("health80sLabel")} unit={uPerYear} step={10000} value={inputs.healthBrackets.b80} onChange={(v) => updateHealth("b80", v)} />
          <div className="note">
            <Info size={13} />
            <span>{t("healthCostNote")}</span>
          </div>
          </>
          ) : country === "US" && rules.healthcare.implemented ? (
            <USHealthcarePanel
              usInvestment={inputs.usInvestment}
              onUpdate={(field, val) => updateUsInvestmentNested("healthcare", field, val)}
              medicareAnnual={usMedicareAnnual}
              healthInsuranceAnnual={usHealthInsuranceAnnual}
              outOfPocketAnnual={usOutOfPocketAnnual}
              totalAnnual={usTotalHealthcareAnnual}
            />
          ) : country === "GB" && rules.healthcare.implemented ? (
            <GBHealthcarePanel
              gbInvestment={inputs.gbInvestment}
              onUpdate={(field, val) => updateGbInvestmentNested("healthcare", field, val)}
              totalAnnual={gbHealthcareAnnual}
            />
          ) : country === "CA" && rules.healthcare.implemented ? (
            <CAHealthcarePanel
              caInvestment={inputs.caInvestment}
              onUpdate={(field, val) => updateCaInvestmentNested("healthcare", field, val)}
              totalAnnual={caHealthcareAnnual}
            />
          ) : country === "AU" && rules.healthcare.implemented ? (
            <AUHealthcarePanel
              auInvestment={inputs.auInvestment}
              onUpdate={(field, val) => updateAuInvestmentNested("healthcare", field, val)}
              totalAnnual={auHealthcareAnnual}
            />
          ) : (
            <div className="note" style={{ borderLeftColor: "#D9A54F" }}>
              <Info size={13} style={{ color: "#D9A54F" }} />
              <span>{t(rules.labels.healthcareNote, { country: countryDisplayName })}</span>
            </div>
          )}

          </div>
          <div className="section-block" style={{ borderColor: "#E6B0A6" }}>
          <SectionTitle index="06" title={label("inheritance")} icon={Users} />
          {inputs.inheritancePlans.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>{t("nameCol")}</th><th>{t("relationCol")}</th><th>{t("colAmount")}</th><th></th></tr></thead>
              <tbody>
                {inputs.inheritancePlans.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td style={{ color: "#7C8A90" }}>{p.relation || "—"}</td>
                    <td className="mono">{money(p.amount)}</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeInheritancePlan(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ flexWrap: "wrap" }}>
            <input placeholder={t("nameCol")} value={newInheritance.name} onChange={(e) => setNewInheritance((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder={t("relationPlaceholder")} value={newInheritance.relation} onChange={(e) => setNewInheritance((p) => ({ ...p, relation: e.target.value }))} />
          </div>
          <div className="add-row" style={{ marginBottom: 10 }}>
            <input placeholder={t("inheritanceAmountPlaceholder")} type="number" value={newInheritance.amount} onChange={(e) => setNewInheritance((p) => ({ ...p, amount: e.target.value }))} />
            <button className="add-btn" onClick={addInheritancePlan}><Plus size={15} /></button>
          </div>
          {inputs.inheritancePlans.length > 0 && (
            <div className="stat-sub" style={{ marginBottom: 10 }}>
              {t("inheritanceTotalLabel")}：<span className="mono">{money(inheritanceTotal)}</span>（{t("peopleCount", { count: inputs.inheritancePlans.length })}）
            </div>
          )}
          <Field
            guide={t("inheritanceTargetGuide")}
            label={inputs.inheritancePlans.length > 0 ? t("inheritanceTargetAutoLabel") : t("inheritanceTargetLabel")}
            unit={uCurrency} step={100000}
            value={effectiveInheritanceTarget}
            disabled={inputs.inheritancePlans.length > 0}
            onChange={(v) => update({ inheritanceTarget: v })}
          />
          {inputs.inheritancePlans.length > 0 && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>{t("inheritanceAutoNote")}</span>
            </div>
          )}

          </div>
          <div className="section-block" style={{ borderColor: "#6FA88A" }}>
          <SectionTitle index="07" title={label("gold")} icon={Coins} />
          <Field guide={t("goldCurrentHoldingGuide")} label={t("goldCurrentHoldingLabel")} unit="g" step={1} value={inputs.gold.currentGrams} onChange={(v) => updateGold("currentGrams", v)} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "#E07A5F", whiteSpace: "nowrap", fontWeight: 700 }}>{t("asOfAgeRequired")}</span>
            <AgeYMInput
              placeholder={t("asOfAgePlaceholder")} years={inputs.gold.asOfYears} months={inputs.gold.asOfMonths}
              onYears={(v) => updateGold("asOfYears", v)}
              onMonths={(v) => updateGold("asOfMonths", v)}
            />
          </div>
          <div className="note" style={{ marginTop: -8 }}>
            <Info size={13} />
            <span>{t("goldAsOfNote", { grams: goldSim.currentGrams.toFixed(1), amount: money(goldSim.currentValue) })}</span>
          </div>
          <label className="field">
            <span className="field-label">{t("goldCurrentValueAutoLabel")}</span>
            <div className="field-input-wrap">
              <div className="mono" style={{ flex: 1, padding: "8px 10px", fontSize: 13 }}>
                {Math.round(goldSim.currentValue).toLocaleString()}
              </div>
              <span className="field-unit">{uCurrency}</span>
            </div>
          </label>
          <Field guide={t("goldPriceRefGuide")} label={t("goldPriceRefLabel")} unit={uPerGram} step={100} value={inputs.gold.pricePerGram} onChange={(v) => updateGold("pricePerGram", v)} />
          <Field
            guide={t("goldGrowthGuide")}
            label={`${t("goldGrowthRateLabel")}${inputs.gold.priceGrowthPctAuto ? t("autoEstimatedSuffix") : ""}`}
            unit="%" step={0.5}
            value={effectiveGoldReturnPct}
            onChange={(v) => { updateGold("priceGrowthPct", v); updateGold("priceGrowthPctAuto", false); }}
          />
          {!inputs.gold.priceGrowthPctAuto && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>
                {t("manualOverrideNote")}
                <span
                  style={{ color: "#4FA8D8", textDecoration: "underline", cursor: "pointer", marginLeft: 4 }}
                  onClick={() => updateGold("priceGrowthPctAuto", true)}
                >
                  {t("revertToAutoLink")}
                </span>
              </span>
            </div>
          )}
          <Field guide={t("goldMonthlyContributionGuide")} label={t("goldMonthlyContributionLabel")} unit={uPerMonth} step={1000} value={inputs.gold.monthlyYen} onChange={(v) => updateGold("monthlyYen", v)} />
          <AgeField label={t("goldAccumulateUntilLabel")} value={inputs.gold.accumulateUntilAge} onChange={(v) => updateGold("accumulateUntilAge", v)} />
          <div className="note">
            <Info size={13} />
            <span>{t("goldPriceRefNote")}</span>
          </div>

          </div>
          <div className="section-block" style={{ borderColor: "#E0C34F" }}>
          <SectionTitle index="08" title={label("cash")} icon={PiggyBank} />
          <SectionGuide guide={t("bankGuide")} />
          {inputs.banks.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>{t("bankNameCol")}</th><th>{t("balanceCol")}</th><th>{t("monthlyDepositCol")}</th><th></th></tr></thead>
              <tbody>
                {inputs.banks.map((b, i) => (
                  <tr key={i}>
                    <td>{b.name}</td>
                    <td className="mono">{money(b.balance)}</td>
                    <td className="mono">{money(b.monthlyDeposit)}{t("perMonthSuffix")}</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeBank(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {inputs.banks.length > 0 && (
            <div className="stat-sub" style={{ marginBottom: 10 }}>
              {t("bankTotalNowLabel")}：<span className="mono">{money(bankSim.totalNow)}</span>
            </div>
          )}
          <div className="add-row" style={{ flexWrap: "wrap" }}>
            <input placeholder={t("bankNameCol")} value={newBank.name} onChange={(e) => setNewBank((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder={t("currentBalancePlaceholder")} type="number" value={newBank.balance} onChange={(e) => setNewBank((p) => ({ ...p, balance: e.target.value }))} />
          </div>
          <div className="add-row">
            <input placeholder={t("monthlyDepositPlaceholder")} type="number" value={newBank.monthlyDeposit} onChange={(e) => setNewBank((p) => ({ ...p, monthlyDeposit: e.target.value }))} />
            <input placeholder={t("interestRatePlaceholder")} type="number" value={newBank.interestPct} onChange={(e) => setNewBank((p) => ({ ...p, interestPct: e.target.value }))} />
            <button className="add-btn" onClick={addBank}><Plus size={15} /></button>
          </div>
          <div className="note">
            <Info size={13} />
            <span>{t("bankNote", { age: t("ageYears", { age: inputs.retireAge }) })}</span>
          </div>

          </div>
          <div className="section-block" style={{ borderColor: "#9D8FD6" }}>
          <SectionTitle index="09" title={label("loan")} icon={Landmark} />
          <SectionGuide guide={t("loanGuide")} />
          {inputs.loans.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>{t("loanNameCol")}</th><th>{t("loanPrincipalCol")}</th><th>{t("interestRateCol")}</th><th>{t("monthlyPaymentCol")}</th><th></th></tr></thead>
              <tbody>
                {inputs.loans.map((l, i) => (
                  <tr key={i}>
                    <td>{l.name}</td>
                    <td className="mono">{money(l.principal)}</td>
                    <td className="mono">{l.annualRatePct}%</td>
                    <td className="mono">{money(l.monthlyPayment)}{t("perMonthSuffix")}</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeLoan(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ flexWrap: "wrap" }}>
            <input placeholder={t("loanNamePlaceholder")} value={newLoan.name} onChange={(e) => setNewLoan((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder={t("loanBalancePlaceholder")} type="number" value={newLoan.principal} onChange={(e) => setNewLoan((p) => ({ ...p, principal: e.target.value }))} />
          </div>
          <div className="add-row">
            <input placeholder={t("annualRatePlaceholder")} type="number" value={newLoan.annualRatePct} onChange={(e) => setNewLoan((p) => ({ ...p, annualRatePct: e.target.value }))} />
            <input placeholder={t("monthlyPaymentPlaceholder")} type="number" value={newLoan.monthlyPayment} onChange={(e) => setNewLoan((p) => ({ ...p, monthlyPayment: e.target.value }))} />
            <button className="add-btn" onClick={addLoan}><Plus size={15} /></button>
          </div>
          {loanSim.payoffAges.some((a) => a !== null) && (
            <div className="note">
              <Info size={13} />
              <span>
                {t("payoffScheduleLabel")}：{inputs.loans.map((l, i) => (
                  <span key={i}>{i > 0 && t("listSeparator")}{l.name} {loanSim.payoffAges[i] ? t("ageYears", { age: Math.round(loanSim.payoffAges[i]) }) : t("payoffInsufficientNote")}</span>
                ))}
              </span>
            </div>
          )}

          </div>
          <div className="section-block" style={{ borderColor: "#5FB0A0" }}>
          <SectionTitle index="10" title={label("insurance")} icon={HeartPulse} />
          <SectionGuide guide={t("insuranceGuide")} />
          {inputs.insurancePolicies.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 10 }}>
              <thead><tr><th style={{ width: "26%" }}>{t("insuranceNameCol")}</th><th style={{ width: "62%" }}>{t("premiumCoverageCol")}</th><th style={{ width: "24px" }}></th></tr></thead>
              <tbody>
                {inputs.insurancePolicies.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td className="mono" style={{ fontSize: 10.5 }}>
                      <div>{t("premiumRangeLabel")} {formatAge(p.premiumFromAge)}〜{formatAge(p.premiumToAge)}：{money(p.monthlyPremium)}{t("perMonthSuffix")}</div>
                      <div style={{ color: "#7C8A90" }}>{t("coverageUntilLabel", { age: formatAge(p.coverageUntilAge) })}</div>
                      <div style={{ color: "#7C8A90" }}>
                        {t("benefitHospitalization", { amount: money(p.benefits.hospitalizationPerDay), limit: p.benefits.hospitalizationDaysLimit || 0 })}{t("benefitSeparator")}
                        {t("benefitSurgery", { amount: money(p.benefits.hospitalizationSurgery) })}{t("benefitSeparator")}
                        {t("benefitDaySurgery", { amount: money(p.benefits.daySurgery) })}{t("benefitSeparator")}{t("benefitRadiation", { amount: money(p.benefits.radiationPerSession) })}{t("benefitSeparator")}
                        {t("benefitAdvancedMedical", { amount: money(p.benefits.advancedMedical) })}{t("benefitSeparator")}{t("benefitDeath", { amount: money(p.benefits.death) })}
                      </div>
                      {(p.customBenefits || []).length > 0 && (
                        <div style={{ color: "#7C8A90", marginTop: 4 }}>
                          {p.customBenefits.map((cb, j) => (
                            <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span>{cb.name}：{money(cb.amount)}</span>
                              <button className="del-btn" onClick={() => removeCustomBenefit(i, j)}><Trash2 size={11} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <CustomBenefitEditor onAdd={(name, amount) => addCustomBenefit(i, name, amount)} />
                    </td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeInsurance(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="field-label" style={{ marginBottom: 4 }}>{t("insuranceNameCol")}</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder={t("insuranceNamePlaceholder")} value={newInsurance.name} onChange={(e) => setNewInsurance((p) => ({ ...p, name: e.target.value }))} />
          </div>

          <div className="field-label" style={{ marginBottom: 4 }}>{t("premiumPeriodLabel")}</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <AgeYMInput
              placeholder={t("startPlaceholder")} years={newInsurance.premiumFromYears} months={newInsurance.premiumFromMonths}
              onYears={(v) => setNewInsurance((p) => ({ ...p, premiumFromYears: v }))}
              onMonths={(v) => setNewInsurance((p) => ({ ...p, premiumFromMonths: v }))}
            />
            <AgeYMInput
              placeholder={t("endPlaceholder")} years={newInsurance.premiumToYears} months={newInsurance.premiumToMonths}
              onYears={(v) => setNewInsurance((p) => ({ ...p, premiumToYears: v }))}
              onMonths={(v) => setNewInsurance((p) => ({ ...p, premiumToMonths: v }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder={t("monthlyPremiumPlaceholder")} type="number" value={newInsurance.monthlyPremium} onChange={(e) => setNewInsurance((p) => ({ ...p, monthlyPremium: e.target.value }))} />
          </div>

          <div className="field-label" style={{ marginBottom: 4 }}>{t("coverageUntilAgeLabel")}</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <AgeYMInput
              placeholder={t("coveragePlaceholder")} years={newInsurance.coverageUntilYears} months={newInsurance.coverageUntilMonths}
              onYears={(v) => setNewInsurance((p) => ({ ...p, coverageUntilYears: v }))}
              onMonths={(v) => setNewInsurance((p) => ({ ...p, coverageUntilMonths: v }))}
            />
          </div>

          <div className="field-label" style={{ marginBottom: 4 }}>{t("benefitDetailsLabel")}</div>
          <div className="add-row" style={{ marginBottom: 6 }}>
            <LabeledMiniInput label={t("hospitalizationPerDayLabel")} value={newInsurance.hospitalizationPerDay} onChange={(e) => setNewInsurance((p) => ({ ...p, hospitalizationPerDay: e.target.value }))} />
            <LabeledMiniInput label={t("hospitalizationDaysLimitLabel")} value={newInsurance.hospitalizationDaysLimit} onChange={(e) => setNewInsurance((p) => ({ ...p, hospitalizationDaysLimit: e.target.value }))} />
          </div>
          <div className="add-row" style={{ marginBottom: 6 }}>
            <LabeledMiniInput label={t("hospitalizationSurgeryLabel")} value={newInsurance.hospitalizationSurgery} onChange={(e) => setNewInsurance((p) => ({ ...p, hospitalizationSurgery: e.target.value }))} />
            <LabeledMiniInput label={t("daySurgeryLabel")} value={newInsurance.daySurgery} onChange={(e) => setNewInsurance((p) => ({ ...p, daySurgery: e.target.value }))} />
          </div>
          <div className="add-row" style={{ marginBottom: 6 }}>
            <LabeledMiniInput label={t("radiationLabel")} value={newInsurance.radiationPerSession} onChange={(e) => setNewInsurance((p) => ({ ...p, radiationPerSession: e.target.value }))} />
            <LabeledMiniInput label={t("advancedMedicalLabel")} value={newInsurance.advancedMedical} onChange={(e) => setNewInsurance((p) => ({ ...p, advancedMedical: e.target.value }))} />
          </div>
          <div className="add-row" style={{ marginBottom: 10 }}>
            <LabeledMiniInput label={t("deathBenefitLabel")} value={newInsurance.death} onChange={(e) => setNewInsurance((p) => ({ ...p, death: e.target.value }))} />
          </div>
          <div className="add-row" style={{ marginBottom: 14 }}>
            <button className="add-btn" onClick={addInsurance} style={{ width: "100%" }}><Plus size={15} /></button>
          </div>
          <div className="note">
            <Info size={13} />
            <span>{t("insuranceNote")}</span>
          </div>

          </div>
          <div className="section-block" style={{ borderColor: "#D67F9E" }}>
          <SectionTitle index="11" title={label("privatePension")} icon={PiggyBank} />
          <SectionGuide guide={t("privatePensionGuide")} />
          {inputs.privatePensionPlans.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 10 }}>
              <thead><tr><th style={{ width: "26%" }}>{t("pensionNameCol")}</th><th style={{ width: "62%" }}>{t("contribPayoutCol")}</th><th style={{ width: "24px" }}></th></tr></thead>
              <tbody>
                {inputs.privatePensionPlans.map((pl, i) => (
                  <tr key={i}>
                    <td>{pl.name}</td>
                    <td className="mono" style={{ fontSize: 10.5 }}>
                      <div>{t("contribLabel")} {formatAge(pl.contribFromAge)}〜{formatAge(pl.contribToAge)}：{money(pl.monthlyContribution)}{t("perMonthSuffix")}</div>
                      <div style={{ color: "#7C8A90" }}>{t("payoutLabel")} {formatAge(pl.payoutFromAge)}〜{formatAge(pl.payoutToAge)}：{money(pl.monthlyPayout)}{t("perMonthSuffix")}</div>
                      {pl.currentBalance !== null && pl.currentBalance !== undefined && (
                        <div style={{ color: "#6FA88A" }}>{t("currentBalanceManualLabel")}：{money(pl.currentBalance)}</div>
                      )}
                    </td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removePension(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {inputs.privatePensionPlans.length > 0 && (
            <div className="stat-sub" style={{ marginBottom: 10 }}>
              {t("privatePensionTotalNowLabel")}：<span className="mono">{money(pensionSim.totalNow)}</span>
            </div>
          )}

          <div className="field-label" style={{ marginBottom: 4 }}>{t("pensionNameCol")}</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder={t("pensionNamePlaceholderPrivate")} value={newPension.name} onChange={(e) => setNewPension((p) => ({ ...p, name: e.target.value }))} />
          </div>

          <div className="field-label" style={{ marginBottom: 4 }}>{t("contribPeriodLabel")}</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <AgeYMInput
              placeholder={t("startPlaceholder")} years={newPension.contribFromYears} months={newPension.contribFromMonths}
              onYears={(v) => setNewPension((p) => ({ ...p, contribFromYears: v }))}
              onMonths={(v) => setNewPension((p) => ({ ...p, contribFromMonths: v }))}
            />
            <AgeYMInput
              placeholder={t("endPlaceholder")} years={newPension.contribToYears} months={newPension.contribToMonths}
              onYears={(v) => setNewPension((p) => ({ ...p, contribToYears: v }))}
              onMonths={(v) => setNewPension((p) => ({ ...p, contribToMonths: v }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <LabeledMiniInput label={t("monthlyContribAmountLabel")} value={newPension.monthlyContribution} onChange={(e) => setNewPension((p) => ({ ...p, monthlyContribution: e.target.value }))} />
          </div>

          <div className="field-label" style={{ marginBottom: 4 }}>{t("payoutPeriodLabel")}</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <AgeYMInput
              placeholder={t("startPlaceholder")} years={newPension.payoutFromYears} months={newPension.payoutFromMonths}
              onYears={(v) => setNewPension((p) => ({ ...p, payoutFromYears: v }))}
              onMonths={(v) => setNewPension((p) => ({ ...p, payoutFromMonths: v }))}
            />
            <AgeYMInput
              placeholder={t("endPlaceholder")} years={newPension.payoutToYears} months={newPension.payoutToMonths}
              onYears={(v) => setNewPension((p) => ({ ...p, payoutToYears: v }))}
              onMonths={(v) => setNewPension((p) => ({ ...p, payoutToMonths: v }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 10 }}>
            <LabeledMiniInput label={t("monthlyPayoutAmountLabel")} value={newPension.monthlyPayout} onChange={(e) => setNewPension((p) => ({ ...p, monthlyPayout: e.target.value }))} />
          </div>
          <div className="field-label" style={{ marginBottom: 4 }}>{t("currentBalanceOptionalLabel")}</div>
          <div className="add-row" style={{ marginBottom: 10 }}>
            <input
              type="number"
              placeholder={t("currentBalanceAutoPlaceholder")}
              value={newPension.currentBalance}
              onChange={(e) => setNewPension((p) => ({ ...p, currentBalance: e.target.value }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 14 }}>
            <button className="add-btn" onClick={addPension} style={{ width: "100%" }}><Plus size={15} /></button>
          </div>
          <div className="note">
            <Info size={13} />
            <span>{t("privatePensionNote")}</span>
          </div>
          </div>
        </div>

        {/* -------- RIGHT: DASHBOARD -------- */}
        <div className="content">
          <div className="stat-grid" style={{ marginBottom: 10 }}>
            {country === "US" ? (
              <>
                <StatCard
                  label={t("usLiquidAssetsLabel")}
                  value={money(usLiquidRestrictedSplit.liquid)}
                  sub={t("usLiquidAssetsSub")}
                  tone="good"
                />
                <StatCard
                  label={t("usRestrictedAssetsLabel")}
                  value={money(usLiquidRestrictedSplit.restricted)}
                  sub={usLiquidRestrictedSplit.isAccessibleAge ? t("usRestrictedAssetsSubOver595") : t("usRestrictedAssetsSubUnder595")}
                />
              </>
            ) : country === "GB" ? (
              <>
                <StatCard
                  label={t("gbLiquidAssetsLabel")}
                  value={money(gbAssetSplit.liquid)}
                  sub={t("gbLiquidAssetsSub", { age: rules.investment.pensionAccessAge })}
                  tone="good"
                />
                <StatCard
                  label={t("gbRestrictedAssetsLabel")}
                  value={money(gbAssetSplit.restricted)}
                  sub={gbAssetSplit.isAccessibleAge
                    ? t("gbRestrictedAssetsSubAccessible", { age: rules.investment.pensionAccessAge })
                    : t("gbRestrictedAssetsSubLocked", { age: rules.investment.pensionAccessAge })}
                />
                <StatCard
                  label={t("gbTaxAdvantagedLabel")}
                  value={money(gbAssetSplit.taxAdvantaged)}
                  sub={t("gbTaxAdvantagedSub")}
                />
                <StatCard
                  label={t("gbTotalAssetsLabel")}
                  value={money(gbAssetSplit.total)}
                  sub={t("gbTotalAssetsSub")}
                />
              </>
            ) : country === "CA" ? (
              <>
                <StatCard label={t("caLiquidAssetsLabel")} value={money(caAssetSplit.liquid)} sub={t("caLiquidAssetsSub")} tone="good" />
                <StatCard
                  label={t("caRestrictedAssetsLabel")}
                  value={money(caAssetSplit.restricted)}
                  sub={t("caRestrictedAssetsSub", { age: rules.investment.rrifConversionAge })}
                />
                <StatCard label={t("caTaxAdvantagedLabel")} value={money(caAssetSplit.taxAdvantaged)} sub={t("caTaxAdvantagedSub")} />
                <StatCard label={t("caTotalAssetsLabel")} value={money(caAssetSplit.total)} sub={t("caTotalAssetsSub")} />
              </>
            ) : country === "AU" ? (
              <>
                <StatCard label={t("auLiquidAssetsLabel")} value={money(auAssetSplit.liquid)} sub={t("auLiquidAssetsSub", { age: rules.investment.preservationAge })} tone="good" />
                <StatCard
                  label={t("auRestrictedAssetsLabel")}
                  value={money(auAssetSplit.restricted)}
                  sub={auAssetSplit.isAccessibleAge
                    ? t("auRestrictedAssetsSubAccessible", { age: rules.investment.preservationAge })
                    : t("auRestrictedAssetsSubLocked", { age: rules.investment.preservationAge })}
                />
                <StatCard label={t("auTaxAdvantagedLabel")} value={money(auAssetSplit.taxAdvantaged)} sub={t("auTaxAdvantagedSub")} />
                <StatCard label={t("auTotalAssetsLabel")} value={money(auAssetSplit.total)} sub={t("auTotalAssetsSub")} />
              </>
            ) : (
              <>
                <StatCard label={t("statNisaAssetsLabel")} value={money(effectiveCurrentAssets)} sub={t("statNisaAssetsSub")} />
                <StatCard label={t("statIdecoAssetsLabel")} value={money(inputs.ideco.currentValue)} sub={t("statIdecoAssetsSub")} />
              </>
            )}
          </div>
          {country === "US" && (
            <div className="note" style={{ marginBottom: 14, marginTop: -6 }}>
              <Info size={13} />
              <span>{t("usEarlyWithdrawalWarning")}</span>
            </div>
          )}
          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <StatCard
              label={t("statSpendableAssetsLabel")}
              value={money((netWorthYearly[0]?.spendableNetWorth) ?? (netWorthFinal - idecoSim.finalValue))}
              sub={t("statSpendableAssetsSub")}
              tone="good"
            />
            <StatCard
              label={t("statRetirementOnlyAssetsLabel")}
              value={money((netWorthYearly[0]?.idecoLockedValue) ?? idecoSim.finalValue)}
              sub={t("statRetirementLockedSub")}
            />
          </div>
          {country === "JP" ? (
            <>
              <div className="stat-grid" style={{ marginBottom: 10 }}>
                <StatCard
                  label={t("statTsumitateRemainingLabel")}
                  value={money(remainingTsumitate)}
                  sub={t("statTsumitateRemainingSub")}
                  tone={remainingTsumitate <= 0 ? "danger" : "good"}
                />
                <StatCard
                  label={t("statGrowthRemainingLabel")}
                  value={money(remainingGrowth)}
                  sub={t("statGrowthRemainingSub", { used: money(computedGrowthUsed) })}
                  tone={remainingGrowth <= 0 ? "danger" : "good"}
                />
                <StatCard
                  label={t("statTotalRemainingLabel")}
                  value={money(remainingTotal)}
                  sub={t("statTotalRemainingSub", { used: money(computedTsumitateUsed + computedGrowthUsed) })}
                  tone={remainingTotal <= 0 ? "danger" : "good"}
                />
              </div>
              <div className="stat-grid" style={{ marginBottom: 14 }}>
                <StatCard
                  label={t("statTsumitateOverageLabel")}
                  value={money(tsumitateOverage)}
                  sub={tsumitateOverage > 0 ? t("statOverageOverSub") : t("statOverageWithinSub")}
                  tone={tsumitateOverage > 0 ? "danger" : "good"}
                />
                <StatCard
                  label={t("statGrowthOverageLabel")}
                  value={money(growthOverage)}
                  sub={growthOverage > 0 ? t("statOverageOverSub") : t("statOverageWithinSub")}
                  tone={growthOverage > 0 ? "danger" : "good"}
                />
                <StatCard
                  label={t("statTotalOverageLabel")}
                  value={money(totalOverage)}
                  sub={totalOverage > 0 ? t("statOverageOverSub") : t("statOverageWithinSub")}
                  tone={totalOverage > 0 ? "danger" : "good"}
                />
              </div>
              {(growthOverage > 0 || totalOverage > 0) && (
                <div className="note" style={{ borderLeftColor: "#C2694F", marginBottom: 22 }}>
                  <Info size={13} style={{ color: "#C2694F" }} />
                  <span>
                    {t("overageWarningIntro")}
                    {growthOverage > 0 && ` ${t("growthOverageDetail", { amount: money(growthOverage) })}`}
                    {totalOverage > 0 && ` ${t("totalOverageDetail", { amount: money(totalOverage) })}`}
                    {t("overageWarningOutro")}
                  </span>
                </div>
              )}

              <div className="chart-frame" style={{ marginBottom: 22 }}>
                <div className="chart-label">{t("nisaBreakdownChartTitle")}</div>
                <AllocationCharts items={nisaFrameAllocationItems} height={160} />
              </div>

              <div className="stat-grid" style={{ marginBottom: 14 }}>
                <StatCard
                  label={t("statTsumitateAnnualRemainingLabel")}
                  value={money(tsumitateAnnualRemaining)}
                  sub={
                    tsumitateAnnualOverage > 0
                      ? t("annualOverPaceNote", { amount: money(tsumitateAnnualOverage) })
                      : t("monthlyPaceNote", { monthly: money(currentTsumitateMonthly), annual: money(tsumitateAnnualPace) })
                  }
                  tone={tsumitateAnnualOverage > 0 ? "danger" : "good"}
                />
                <StatCard
                  label={t("statGrowthAnnualRemainingLabel")}
                  value={money(growthAnnualRemaining)}
                  sub={
                    growthAnnualOverage > 0
                      ? t("annualOverPaceNoteGrowth", { amount: money(growthAnnualOverage) })
                      : t("monthlyPaceNote", { monthly: money(currentGrowthMonthly), annual: money(growthAnnualPace) })
                  }
                  tone={growthAnnualOverage > 0 ? "danger" : "good"}
                />
              </div>
            </>
          ) : country === "US" && rules.investment.implemented ? (
            <div className="stat-grid" style={{ marginBottom: 22 }}>
              <StatCard
                label={t("us401kLabel")}
                value={money(rules.investment.get401kEmployeeLimit(effectiveCurrentAge) - (Number(inputs.usInvestment.k401.annualContribution) || 0))}
                sub={t("usRemainingOfLimitSub")}
              />
              <StatCard
                label={`${t("usTraditionalIraLabel")} + ${t("usRothIraLabel")}`}
                value={money(Math.max(0, rules.investment.getIraContributionLimit(effectiveCurrentAge) - ((Number(inputs.usInvestment.traditionalIra.annualContribution) || 0) + (Number(inputs.usInvestment.rothIra.annualContribution) || 0))))}
                sub={t("usIraSharedRemainingSub")}
              />
              <StatCard
                label={t("usBrokerageLabel")}
                value={money(Number(inputs.usInvestment.brokerage.currentValue) || 0)}
                sub={t("usBrokerageNoLimitNote")}
              />
            </div>
          ) : country === "GB" && rules.investment.implemented ? (
            <div className="stat-grid" style={{ marginBottom: 22 }}>
              <StatCard
                label={t("gbIsaRemainingLabel")}
                value={money(Math.max(0, rules.investment.getIsaRemaining(inputs.gbInvestment)))}
                sub={t("gbIsaRemainingSub", { amount: money(rules.investment.getIsaAnnualAllowance()) })}
                tone={rules.investment.getIsaRemaining(inputs.gbInvestment) < 0 ? "danger" : "good"}
              />
              <StatCard
                label={t("gbPensionRemainingLabel")}
                value={money(Math.max(0, gbPensionAnnualAllowance - gbPensionContribution))}
                sub={t("gbPensionRemainingSub", { amount: money(gbPensionAnnualAllowance) })}
                tone={(gbPensionAnnualAllowance - gbPensionContribution) < 0 ? "danger" : "good"}
              />
              <StatCard
                label={t("gbTotalTaxLabel")}
                value={money(gbTotalTax)}
                sub={t("gbTotalTaxSub")}
                tone="danger"
              />
            </div>
          ) : country === "CA" && rules.investment.implemented ? (
            <div className="stat-grid" style={{ marginBottom: 22 }}>
              <StatCard
                label={t("caTfsaRemainingLabel")}
                value={money(Math.max(0, rules.investment.getTfsaRemaining(inputs.caInvestment)))}
                sub={t("caTfsaRemainingSub", { amount: money(rules.investment.getTfsaAnnualLimit()) })}
                tone={rules.investment.getTfsaRemaining(inputs.caInvestment) < 0 ? "danger" : "good"}
              />
              <StatCard
                label={t("caRrspRemainingLabel")}
                value={money(Math.max(0, caRrspRoom - (Number(inputs.caInvestment.rrsp.annualContribution) || 0)))}
                sub={t("caRrspRoomSub", {
                  pct: Number((rules.investment.limits.rrspIncomePercent * 100).toFixed(2)),
                  cap: money(rules.investment.limits.rrspAnnualDollarLimit),
                })}
                tone={(caRrspRoom - (Number(inputs.caInvestment.rrsp.annualContribution) || 0)) < 0 ? "danger" : "good"}
              />
              <StatCard label={t("caTotalTaxLabel")} value={money(caTotalTax)} sub={t("caTotalTaxSub")} tone="danger" />
            </div>
          ) : country === "AU" && rules.investment.implemented ? (
            <div className="stat-grid" style={{ marginBottom: 22 }}>
              <StatCard
                label={t("auConcessionalRemainingLabel")}
                value={money(Math.max(0, auConcessionalRemaining))}
                sub={t("auConcessionalCapSub", { amount: money(rules.investment.getConcessionalCap()) })}
                tone={auConcessionalRemaining < 0 ? "danger" : "good"}
              />
              <StatCard
                label={t("auAgePensionAnnualLabel")}
                value={money(auAgePensionAnnual)}
                sub={t("auAgePensionAnnualSub")}
              />
              <StatCard label={t("auTotalTaxLabel")} value={money(auTotalTax)} sub={t("auTotalTaxSub")} tone="danger" />
            </div>
          ) : (
            <div className="note" style={{ borderLeftColor: "#D9A54F", marginBottom: 22 }}>
              <Info size={13} style={{ color: "#D9A54F" }} />
              <span>{t(rules.labels.investmentNote, { country: countryDisplayName })}</span>
            </div>
          )}

          <div className="stat-grid">
            <StatCard label={t("statAssetsAtRetireLabel", { age: t("ageYears", { age: inputs.retireAge }) })} value={money(sim.assetsAtRetire)} sub={t("statAssetsAtRetireSub")} />
            <StatCard
              label={t("statNetWorthFinalLabel", { age: t("ageYears", { age: inputs.deathAge }) })}
              value={money(netWorthFinal)}
              sub={netInheritanceGap >= 0 ? t("statInheritanceGapPositive", { amount: money(netInheritanceGap) }) : t("statInheritanceGapNegative", { amount: money(netInheritanceGap) })}
              tone={netInheritanceGap >= 0 ? "good" : "danger"}
            />
            <StatCard
              label={t("statMonthlyGapLabel")}
              value={`${netMonthlyGap >= 0 ? "" : "+"}${money(-netMonthlyGap)}`}
              sub={netMonthlyGap >= 0 ? t("statMonthlyGapShortfallSub") : t("statMonthlyGapCoveredSub")}
              tone={netMonthlyGap > 0 ? "danger" : "good"}
            />
            <StatCard
              label={t("statSustainabilityLabel")}
              value={sim.depletionAge ? t("statDepletionAtAge", { age: Math.round(sim.depletionAge) }) : t("statNeverDepletes")}
              sub={sim.depletionAge ? t("statDepletionSub") : t("statSustainableSub")}
              tone={sim.depletionAge ? "danger" : "good"}
            />
          </div>

          {country === "JP" && (
            <div className="stat-grid" style={{ marginBottom: 22 }}>
              <StatCard
                label={t("statTsumitateLifetimeUsageLabel")}
                value={money(sim.tsumitateCum)}
                sub={t("statOfLifetimeLimit", { amount: money(NISA_LIMITS.totalLifetime) })}
              />
              <StatCard
                label={t("statGrowthLifetimeUsageLabel")}
                value={`${money(sim.growthCum)} / ${money(NISA_LIMITS.growthLifetime)}`}
                sub={sim.growthMaxedAge ? t("statMaxedAtAge", { age: Math.round(sim.growthMaxedAge) }) : t("statNotYetMaxed")}
                tone={sim.growthMaxedAge ? "danger" : "good"}
              />
              <StatCard
                label={t("statTotalLifetimeUsageLabel")}
                value={`${money(sim.tsumitateCum + sim.growthCum)} / ${money(NISA_LIMITS.totalLifetime)}`}
                sub={sim.totalMaxedAge ? t("statUsedUpAtAge", { age: Math.round(sim.totalMaxedAge) }) : t("statLifetimeRoomSub")}
                tone={sim.totalMaxedAge ? "danger" : "good"}
              />
            </div>
          )}

          <div className="stat-grid" style={{ marginBottom: 22 }}>
            <StatCard
              label={t("statGoldAtTargetLabel", { age: formatAge(inputs.gold.accumulateUntilAge) })}
              value={money(goldSim.valueAtTarget)}
              sub={t("statGoldGramsEstimateSub", { grams: goldSim.yearly.find((y) => y.age >= inputs.gold.accumulateUntilAge)?.grams.toFixed(1) ?? goldSim.finalGrams.toFixed(1) })}
            />
            <StatCard
              label={t("statBankTotalNowLabel")}
              value={money(bankSim.totalNow)}
              sub={inputs.banks.length ? t("statBankCountSub", { count: inputs.banks.length }) : t("statNoBankAccountsSub")}
            />
            <StatCard
              label={t("statBankAtRetireLabel", { age: t("ageYears", { age: inputs.retireAge }) })}
              value={money(bankSim.totalAtRetire)}
              sub={t("statBankAtRetireSub")}
            />
            <StatCard
              label={t("statStockValueNowLabel")}
              value={money(stockTotalNow)}
              sub={t("statStockHoldingsCountSub", { count: watchlist.filter((w) => w.value > 0).length })}
            />
            <StatCard
              label={t("statLoanBalanceNowLabel")}
              value={money(loanSim.totalNow)}
              sub={inputs.loans.length ? t("statLoanCountSub", { count: inputs.loans.length }) : t("statNoLoansSub")}
              tone={loanSim.totalNow > 0 ? "danger" : "good"}
            />
            <StatCard
              label={t("statInsurancePaidLabel")}
              value={money(insuranceSim.totalFinal)}
              sub={inputs.insurancePolicies.length ? t("statInsuranceCountSub", { count: inputs.insurancePolicies.length }) : t("statNoInsuranceSub")}
              tone={insuranceSim.totalFinal > 0 ? "danger" : "good"}
            />
            <StatCard
              label={t("statPrivatePensionFinalLabel")}
              value={money(pensionSim.totalFinal)}
              sub={inputs.privatePensionPlans.length ? t("statPensionPlanCountSub", { count: inputs.privatePensionPlans.length }) : t("statNotRegisteredSub")}
              tone="good"
            />
          </div>

          <div className="chart-frame">
            {/* 【修正】年齢に端数があると「57.66478859472867歳」と表示されていたため、整数に丸める。 */}
            <div className="chart-label">{t("netWorthChartTitle", { currentAge: t("ageYears", { age: Math.round(effectiveCurrentAge) }), deathAge: t("ageYears", { age: Math.round(inputs.deathAge) }) })}</div>
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={netWorthYearly} margin={{ top: 10, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" />
                <XAxis dataKey="age" stroke="#7C8A90" fontSize={11} tickFormatter={(a) => `${a}`} />
                <YAxis stroke="#7C8A90" fontSize={11} tickFormatter={(v) => money(v)} width={64} />
                <Tooltip
                  contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }}
                  labelFormatter={(a) => t("ageYears", { age: a })}
                  formatter={(v, n) => [money(v), n]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine x={inputs.retireAge} stroke="#D9A54F" strokeDasharray="4 4" label={{ value: t("retirementMarkerLabel"), position: "top", fill: "#D9A54F", fontSize: 11 }} />
                {inputs.lumpSums.map((entry, i) => (
                  <ReferenceLine key={i} x={entry.age} stroke="#8FBF7F" strokeDasharray="2 3" label={{ value: t("lumpSumMarkerLabel"), position: "insideTop", fill: "#8FBF7F", fontSize: 10 }} />
                ))}
                {sim.depletionAge && (
                  <ReferenceLine x={Math.round(sim.depletionAge)} stroke="#C2694F" strokeDasharray="4 4" label={{ value: t("depletionMarkerLabel"), position: "top", fill: "#C2694F", fontSize: 11 }} />
                )}
                {country === "JP" && (
                  <Area type="monotone" dataKey="total" name={t("legendNisaAssets")} stackId="net" stroke="#4FA8D8" fill="rgba(79,168,216,0.35)" strokeWidth={1.5} legendType="rect" />
                )}
                {country === "US" && (
                  <Area type="monotone" dataKey="usInvestmentValue" name={t("legendUsInvestment")} stackId="net" stroke="#4FA8D8" fill="rgba(79,168,216,0.35)" strokeWidth={1.5} legendType="rect" />
                )}
                {/* 【修正】イギリス・カナダ・オーストラリアの資産が帯に描かれておらず、
                    純資産（白い線）だけが帯の上へ飛び出していた。 */}
                {country === "GB" && (
                  <Area type="monotone" dataKey="gbInvestmentValue" name={t("legendGbInvestment")} stackId="net" stroke="#4FA8D8" fill="rgba(79,168,216,0.35)" strokeWidth={1.5} legendType="rect" />
                )}
                {country === "CA" && (
                  <Area type="monotone" dataKey="caInvestmentValue" name={t("legendCaInvestment")} stackId="net" stroke="#4FA8D8" fill="rgba(79,168,216,0.35)" strokeWidth={1.5} legendType="rect" />
                )}
                {country === "AU" && (
                  <Area type="monotone" dataKey="auInvestmentValue" name={t("legendAuInvestment")} stackId="net" stroke="#4FA8D8" fill="rgba(79,168,216,0.35)" strokeWidth={1.5} legendType="rect" />
                )}
                <Area type="monotone" dataKey="goldValue" name={t("legendGoldAssets")} stackId="net" stroke="#D9A54F" fill="rgba(217,165,79,0.35)" strokeWidth={1.5} legendType="rect" />
                <Area type="monotone" dataKey="bankValue" name={t("legendBankDeposits")} stackId="net" stroke="#8FBF7F" fill="rgba(143,191,127,0.35)" strokeWidth={1.5} legendType="rect" />
                <Area type="monotone" dataKey="stockValue" name={t("legendStocks")} stackId="net" stroke="#B08FD6" fill="rgba(176,143,214,0.35)" strokeWidth={1.5} legendType="rect" />
                <Area type="monotone" dataKey="pensionValue" name={t("legendPrivatePension")} stackId="net" stroke="#6FA88A" fill="rgba(111,168,138,0.35)" strokeWidth={1.5} legendType="rect" />
                {country === "JP" && (
                  <Area type="monotone" dataKey="idecoLockedValue" name={t("legendIdecoAssets")} stackId="net" stroke="#D68FB0" fill="rgba(214,143,176,0.35)" strokeWidth={1.5} legendType="rect" />
                )}
                <Line type="monotone" dataKey="netWorth" name={t("legendNetWorth")} stroke="#F2F5F6" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="note" style={{ marginBottom: 22 }}>
            <Info size={13} />
            <span>{t("netWorthChartNote")}</span>
          </div>

          {sim.lumpTruncations.length > 0 && (
            <div className="note" style={{ borderLeftColor: "#C2694F", marginBottom: 22 }}>
              <Info size={13} style={{ color: "#C2694F" }} />
              <span>
                {t("lumpTruncationIntro")}
                {sim.lumpTruncations.map((trunc, i) => (
                  <span key={i}>{i > 0 && t("listSeparator")}{t("ageYears", { age: trunc.age })}{t("lumpTruncationAt", { amount: money(trunc.shortfall) })}</span>
                ))}
                {t("lumpTruncationOutro")}
              </span>
            </div>
          )}

          <div className="two-col">
            <div className="chart-frame">
              <div className="chart-label">
                {country === "US"
                  ? t("usAccountBreakdownChartTitle", { age: t("ageYears", { age: inputs.retireAge }) })
                  : country === "GB"
                    ? t("gbAccountBreakdownChartTitle", { age: t("ageYears", { age: inputs.retireAge }) })
                    : country === "CA"
                      ? t("caAccountBreakdownChartTitle", { age: t("ageYears", { age: inputs.retireAge }) })
                      : country === "AU"
                        ? t("auAccountBreakdownChartTitle", { age: t("ageYears", { age: inputs.retireAge }) })
                        : t("fundBreakdownChartTitle", { age: t("ageYears", { age: inputs.retireAge }) })}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={country === "US" ? usAccountBreakdownAtRetire : country === "GB" ? gbAccountBreakdownAtRetire : country === "CA" ? caAccountBreakdownAtRetire : country === "AU" ? auAccountBreakdownAtRetire : fundBreakdownAtRetire} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#7C8A90" fontSize={11} tickFormatter={(v) => money(v)} />
                  <YAxis type="category" dataKey="name" stroke="#7C8A90" fontSize={11} width={90} />
                  <Tooltip contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }} formatter={(v) => money(v)} />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {(country === "US" ? usAccountBreakdownAtRetire : country === "GB" ? gbAccountBreakdownAtRetire : country === "CA" ? caAccountBreakdownAtRetire : country === "AU" ? auAccountBreakdownAtRetire : fundBreakdownAtRetire).map((f, i) => (
                      <Cell key={i} fill={f.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {country === "US" && (
                <div className="note" style={{ marginTop: 8 }}>
                  <Info size={13} />
                  <span>{t("usAccountBreakdownNote")}</span>
                </div>
              )}
              {country === "GB" && (
                <div className="note" style={{ marginTop: 8 }}>
                  <Info size={13} />
                  <span>{t("gbAccountBreakdownNote")}</span>
                </div>
              )}
              {country === "CA" && (
                <div className="note" style={{ marginTop: 8 }}>
                  <Info size={13} />
                  <span>{t("caAccountBreakdownNote")}</span>
                </div>
              )}
              {country === "AU" && (
                <div className="note" style={{ marginTop: 8 }}>
                  <Info size={13} />
                  <span>{t("auAccountBreakdownNote")}</span>
                </div>
              )}
            </div>

            <div className="chart-frame" style={{ padding: "16px 16px 18px" }}>
              <div className="chart-label" style={{ padding: 0, marginBottom: 10 }}>{t("stockWatchlistTitle")}</div>
              <table className="watchlist">
                <thead>
                  <tr><th>{t("colName")}</th><th>{t("sectorCol")}</th><th>{t("sharesCol")}</th><th>{t("holdingValueCol")}</th><th></th></tr>
                </thead>
                <tbody>
                  {watchlist.map((s, i) => (
                    <tr key={i}>
                      <td>{s.name}</td>
                      <td style={{ color: "#7C8A90" }}>{s.sector}</td>
                      <td style={{ width: 64 }}>
                        <input
                          type="number" value={s.shares} className="mono inline-num"
                          onChange={(e) => updateStockField(i, "shares", Number(e.target.value))}
                        />
                      </td>
                      <td style={{ width: 96 }}>
                        <input
                          type="number" value={s.value} className="mono inline-num"
                          onChange={(e) => updateStockField(i, "value", Number(e.target.value))}
                        />
                      </td>
                      <td style={{ width: 24 }}>
                        <button className="del-btn" onClick={() => removeStock(i)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="add-row">
                <input placeholder={t("holdingNamePlaceholder")} value={newStock.name} onChange={(e) => setNewStock((p) => ({ ...p, name: e.target.value }))} />
                <input placeholder={t("sectorCol")} value={newStock.sector} onChange={(e) => setNewStock((p) => ({ ...p, sector: e.target.value }))} />
                <button className="add-btn" onClick={addStock}><Plus size={15} /></button>
              </div>
              <div className="stat-sub" style={{ marginTop: 10 }}>{t("stockCurrentTotalLabel")}：<span className="mono">{money(stockTotalNow)}</span></div>
              <Field
                label={`${t("stockReturnLabel", { age: t("ageYears", { age: inputs.deathAge }) })}${inputs.stockReturnPctAuto ? t("autoGuessedFromHoldingsSuffix") : ""}`} unit="%" step={0.5}
                value={effectiveStockReturnPct} onChange={(v) => update({ stockReturnPct: v, stockReturnPctAuto: false })}
              />
              {!inputs.stockReturnPctAuto && (
                <div className="note" style={{ marginTop: -8 }}>
                  <Info size={13} />
                  <span>
                    {t("manualOverrideNote")}
                    <span
                      style={{ color: "#4FA8D8", textDecoration: "underline", cursor: "pointer", marginLeft: 4 }}
                      onClick={() => update({ stockReturnPctAuto: true })}
                    >
                      {t("revertToAutoLink")}
                    </span>
                  </span>
                </div>
              )}
              {stockAllocationItems.length > 0 && (
                <>
                  <div className="chart-label" style={{ padding: 0, margin: "12px 0 4px" }}>{t("stockAllocationChartLabel")}</div>
                  <AllocationCharts items={stockAllocationItems} height={160} />
                </>
              )}
            </div>
          </div>

          {inputs.loans.length > 0 && (
            <div className="chart-frame" style={{ marginTop: 16 }}>
              <div className="chart-label">{t("loanBreakdownChartTitle", { retireAge: t("ageYears", { age: inputs.retireAge }), deathAge: t("ageYears", { age: inputs.deathAge }) })}</div>
              <ResponsiveContainer width="100%" height={Math.max(180, inputs.loans.length * 46)}>
                <BarChart data={loanBreakdownByAge} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#7C8A90" fontSize={11} tickFormatter={(v) => money(v)} />
                  <YAxis type="category" dataKey="name" stroke="#7C8A90" fontSize={11} width={90} />
                  <Tooltip contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }} formatter={(v) => money(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey={t("currentLabelShort")} fill="#C2694F" radius={[0, 2, 2, 0]} />
                  <Bar dataKey={t("ageYears", { age: inputs.retireAge })} fill="#D9877A" radius={[0, 2, 2, 0]} />
                  <Bar dataKey={t("ageYears", { age: inputs.deathAge })} fill="#E6B0A6" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {inputs.banks.length > 0 && (
            <div className="chart-frame" style={{ marginTop: 16 }}>
              <div className="chart-label">{t("bankBreakdownChartTitle", { retireAge: t("ageYears", { age: inputs.retireAge }), deathAge: t("ageYears", { age: inputs.deathAge }) })}</div>
              <ResponsiveContainer width="100%" height={Math.max(180, inputs.banks.length * 46)}>
                <BarChart data={bankBreakdownByAge} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#7C8A90" fontSize={11} tickFormatter={(v) => money(v)} />
                  <YAxis type="category" dataKey="name" stroke="#7C8A90" fontSize={11} width={90} />
                  <Tooltip contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }} formatter={(v) => money(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey={t("currentLabelShort")} fill="#4FA8D8" radius={[0, 2, 2, 0]} />
                  <Bar dataKey={t("ageYears", { age: inputs.retireAge })} fill="#D9A54F" radius={[0, 2, 2, 0]} />
                  <Bar dataKey={t("ageYears", { age: inputs.deathAge })} fill="#8FBF7F" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="footer-note">
        {t("footerDisclaimer")}
      </div>
    </div>
    </LocaleContext.Provider>
  );
}
