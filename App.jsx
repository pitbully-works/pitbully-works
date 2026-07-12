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
  { code: "CA", flag: "🇨🇦", name: "Canada", enabled: false },
  { code: "AU", flag: "🇦🇺", name: "Australia", enabled: false },
];

// 通貨（コード・記号・ロケール）。キーは通貨コード（ISO 4217）そのものにし、
// 「表示国」からは独立したデータとして管理する（例：日本在住でもUSD表示、海外在住の日本人でもJPY表示、が将来可能）。
// 将来通貨を追加する場合もここに1行追加するだけでよい。
const CURRENCY_BY_CODE = {
  JPY: { symbol: "¥", locale: "ja-JP" },
  USD: { symbol: "$", locale: "en-US" },
  GBP: { symbol: "£", locale: "en-GB" },
  CAD: { symbol: "$", locale: "en-CA" },
  AUD: { symbol: "$", locale: "en-AU" },
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
    "netWorthChartNote": "塗りつぶし部分は資産の内訳（総額）、白い線が借入金・生命保険の払込累計額を差し引いた実質的な純資産です。",
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
    "netWorthChartNote": "The filled areas show the breakdown of total assets; the white line shows net worth after subtracting cumulative loan balances and life insurance premiums paid.",
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
const JP_COUNTRY_RULES = {
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
const US_COUNTRY_RULES = {
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
const GB_COUNTRY_RULES = {
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

const COUNTRY_RULES = {
  JP: JP_COUNTRY_RULES,
  US: US_COUNTRY_RULES,
  GB: GB_COUNTRY_RULES,
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
const NISA_LIMITS = {
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
function estimateMarginalTaxRate(annualIncome) {
  if (!annualIncome || annualIncome <= 0) return 0.2; // 年収未入力時の目安
  if (annualIncome <= 1950000) return 0.15;
  if (annualIncome <= 3300000) return 0.2;
  if (annualIncome <= 6950000) return 0.3;
  if (annualIncome <= 9000000) return 0.33;
  if (annualIncome <= 18000000) return 0.43;
  return 0.5;
}

function computeAgeFromBirthDate(birthDateStr, asOfDate) {
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

function healthAnnualCost(age, brackets) {
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

function runSimulation(inputs, uncategorizedLabel, phaseAccumLabel, phaseDrawdownLabel) {
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
function runGoldSimulation({ currentAge, deathAge, gold }) {
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
    if (age < accumulateUntilAge && monthlyYen > 0 && price > 0) {
      grams += monthlyYen / price;
    }
    if (m % 12 === 0) {
      yearly.push({ age: Math.round(age), grams, price, value: grams * price });
    }
    if (valueAtTarget === null && age >= accumulateUntilAge) {
      valueAtTarget = grams * price;
    }
    price = price * (1 + r);
  }
  const finalValue = yearly.length ? yearly[yearly.length - 1].value : grams * price;
  if (valueAtTarget === null) valueAtTarget = finalValue;

  return { yearly, finalGrams: grams, finalValue, valueAtTarget, currentValue, currentGrams: grams };
}

// ---------- bank savings (銀行別) simulation ----------
function runBankSimulation({ currentAge, retireAge, deathAge, banks }) {
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
function runStockSim({ currentAge, deathAge, totalValue, returnPct }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const r = monthlyRate(returnPct);
  let value = totalValue;
  const yearly = [{ age: Math.round(currentAge), value }];
  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    if (m % 12 === 0) yearly.push({ age: Math.round(age), value });
    value = value * (1 + r);
  }
  return { yearly, finalValue: yearly.length ? yearly[yearly.length - 1].value : totalValue };
}

// ---------- loan repayment (借入金返済シミュレーション) ----------
function simpleMonthlyRate(annualPct) {
  return (annualPct || 0) / 1200;
}
function runLoanSimulation({ currentAge, deathAge, loans }) {
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
function runInsuranceSimulation({ currentAge, deathAge, policies }) {
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
function runPrivatePensionSimulation({ currentAge, deathAge, plans }) {
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

function runIdecoSimulation({ currentAge, deathAge, ideco }) {
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

// 既存の呼び出し箇所（初期状態の既定値）との後方互換のための別名。
const DEFAULT_WATCHLIST = DEFAULT_WATCHLIST_JP;

function defaultWatchlistFor(country) {
  if (country === "US") return DEFAULT_WATCHLIST_US;
  if (country === "GB") return DEFAULT_WATCHLIST_GB;
  return DEFAULT_WATCHLIST_JP;
}

// ---------- UI atoms ----------
function Field({ label, unit, value, onChange, step = 1, min = 0, max, mono = true, disabled = false }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
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
function AgeField({ label, value, onChange, disabled }) {
  const { t } = useContext(LocaleContext);
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
      <span className="field-label">{label}</span>
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
        <Field label={t("currentBalancePlaceholder")} unit="$" step={1000} value={usInvestment.k401.currentValue} onChange={(v) => onUpdateAccount("k401", "currentValue", v)} />
        <Field label={t("usAnnualContributionLabel")} unit="$" step={500} value={usInvestment.k401.annualContribution} onChange={(v) => onUpdateAccount("k401", "annualContribution", v)} />
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
        <Field label={t("currentBalancePlaceholder")} unit="$" step={500} value={usInvestment.traditionalIra.currentValue} onChange={(v) => onUpdateAccount("traditionalIra", "currentValue", v)} />
        <Field label={t("usAnnualContributionLabel")} unit="$" step={100} value={usInvestment.traditionalIra.annualContribution} onChange={(v) => onUpdateAccount("traditionalIra", "annualContribution", v)} />
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
        <Field label={t("currentBalancePlaceholder")} unit="$" step={500} value={usInvestment.rothIra.currentValue} onChange={(v) => onUpdateAccount("rothIra", "currentValue", v)} />
        <Field label={t("usAnnualContributionLabel")} unit="$" step={100} value={usInvestment.rothIra.annualContribution} onChange={(v) => onUpdateAccount("rothIra", "annualContribution", v)} />
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
        <Field label={t("currentBalancePlaceholder")} unit="$" step={1000} value={usInvestment.brokerage.currentValue} onChange={(v) => onUpdateAccount("brokerage", "currentValue", v)} />
        <Field label={t("usAnnualContributionLabel")} unit="$" step={500} value={usInvestment.brokerage.annualContribution} onChange={(v) => onUpdateAccount("brokerage", "annualContribution", v)} />
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
        <Field label={t("usStateTaxRateLabel")} unit="%" step={0.5} value={usInvestment.stateTaxRatePct} onChange={(v) => onUpdate("stateTaxRatePct", v)} />
        <Field label={t("usCapitalGainLabel")} unit="$" step={1000} value={usInvestment.estimatedCapitalGainAnnual} onChange={(v) => onUpdate("estimatedCapitalGainAnnual", v)} />
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
      <Field label={t("usPiaLabel")} unit="$" step={50} value={usInvestment.socialSecurity.piaMonthly} onChange={(v) => onUpdateSS("piaMonthly", v)} />
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
      <Field label={t("usExpensesMonthlyLabel")} unit="$" step={100} value={usInvestment.expensesMonthly} onChange={(v) => onUpdate("expensesMonthly", v)} />

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
      <Field label={t("usHealthInsuranceLabel")} unit="$" step={50} value={usInvestment.healthcare.healthInsuranceMonthly} onChange={(v) => onUpdate("healthInsuranceMonthly", v)} />
      <Field label={t("usOutOfPocketLabel")} unit="$" step={100} value={usInvestment.healthcare.outOfPocketAnnual} onChange={(v) => onUpdate("outOfPocketAnnual", v)} />
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
      <Field label={t("gbCurrentValueLabel")} unit="£" step={500} value={account.currentValue} onChange={(v) => onUpdateAccount(accountKey, "currentValue", v)} />
      <Field label={t("gbAnnualContributionLabel")} unit="£" step={100} value={account.annualContribution} onChange={(v) => onUpdateAccount(accountKey, "annualContribution", v)} />
      <Field label={t("expectedAnnualReturnLabel")} unit="%" step={0.5} value={account.expectedReturnPct} onChange={(v) => onUpdateAccount(accountKey, "expectedReturnPct", v)} />
      <AgeField label={t("gbContributionEndAgeLabel")} value={account.contributionEndAge} onChange={(v) => onUpdateAccount(accountKey, "contributionEndAge", v)} />
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

      <Field label={t("gbAnnualIncomeLabel")} unit="£" step={1000} value={gbInvestment.annualIncome} onChange={(v) => onUpdate("annualIncome", v)} />
      <Field label={t("gbAdjustedIncomeLabel")} unit="£" step={1000} value={gbInvestment.adjustedIncome} onChange={(v) => onUpdate("adjustedIncome", v)} />

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
        <Field label={t("gbDividendIncomeLabel")} unit="£" step={100} value={gbInvestment.dividendIncomeAnnual} onChange={(v) => onUpdate("dividendIncomeAnnual", v)} />
        <Field label={t("gbCapitalGainLabel")} unit="£" step={500} value={gbInvestment.estimatedCapitalGainAnnual} onChange={(v) => onUpdate("estimatedCapitalGainAnnual", v)} />
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
        label={t("gbOverlapYearsLabel")} unit={t("gbOverlapYearsUnit")} step={1}
        value={gbInvestment.statePension.incomeOverlapYears}
        onChange={(v) => onUpdateStatePension("incomeOverlapYears", v)}
      />
      <div className="stat-sub" style={{ marginBottom: 8 }}>{t("gbOverlapYearsSub")}</div>

      <Field
        label={t("gbAdditionalPensionLabel")} unit="£" step={100}
        value={gbInvestment.statePension.additionalPensionAnnual}
        onChange={(v) => onUpdateStatePension("additionalPensionAnnual", v)}
      />

      <div className="stat-grid" style={{ marginTop: 10, marginBottom: 14 }}>
        <StatCard label={t("gbStatePensionAnnualLabel")} value={money(statePensionAnnual)} sub={t("gbStatePensionAnnualSub")} />
        <StatCard label={t("gbRetirementIncomeLabel")} value={money(retirementIncomeAnnual)} sub={t("gbRetirementIncomeSub")} tone="good" />
      </div>

      <Field
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
      <Field label={t("gbNhsBasicLabel")} unit="£" step={50} value={h.nhsBasicAnnual} onChange={(v) => onUpdate("nhsBasicAnnual", v)} />
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
          if (parsed.inputs) setInputs((prev) => ({ ...prev, ...parsed.inputs }));
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
      setInputs((prev) => ({ ...prev, ...parsed.inputs }));
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
    if (entry.inputs) setInputs((prev) => ({ ...prev, ...entry.inputs }));
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
      const spendableNetWorth = row.total + goldValue + bankValue + stockValue + pensionValue + usInvestmentValue + gbInvestmentValue - loanValue - insuranceValue;
      return {
        ...row, goldValue, bankValue, stockValue, loanValue, insuranceValue, pensionValue,
        idecoLockedValue,
        usInvestmentValue,
        gbInvestmentValue,
        spendableNetWorth,
        netWorth: spendableNetWorth + idecoLockedValue,
      };
    });
  }, [sim, goldSim, bankSim, stockSim, loanSim, insuranceSim, pensionSim, idecoSim, usInvestmentSim, gbInvestmentSim]);
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
                  currentJson === JSON.stringify(DEFAULT_WATCHLIST_GB);
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
          <AgeField label={t("currentAgeFieldLabel")} value={effectiveCurrentAge} disabled={!!preciseAge} onChange={(v) => update({ currentAge: v })} />
          {preciseAge && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>{t("currentAgeAutoNote")}</span>
            </div>
          )}
          <AgeField label={t("retireAgeFieldLabel")} value={inputs.retireAge} onChange={(v) => update({ retireAge: v })} />
          <AgeField label={t("lifeExpectancyLabel")} value={inputs.deathAge} onChange={(v) => update({ deathAge: v })} />

          </div>
          <div className="section-block" style={{ borderColor: "#8FBF7F" }}>
          <SectionTitle index="02" title={label("investmentTaxAdvantaged")} icon={TrendingUp} />

          {country === "JP" ? (
          <>
          <div className="field-label" style={{ marginBottom: 6 }}>{t("tsumitateHoldingsLabel")}</div>
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

          <div className="field-label" style={{ marginBottom: 6 }}>{t("growthHoldingsLabel")}</div>
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
            <span className="field-label">{t("nisaTotalLabel")}</span>
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

          <div className="field-label" style={{ marginBottom: 6 }}>{t("tsumitateScheduleLabel")}</div>
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

          <div className="field-label" style={{ marginBottom: 6 }}>{t("tsumitateAllocationLabel")}</div>
          <AllocationBreakdown
            items={inputs.tsumitateAllocation}
            newItem={newTsumitateAllocItem}
            onNewItemChange={setNewTsumitateAllocItem}
            onAdd={() => addAllocationItem("tsumitateAllocation", newTsumitateAllocItem, setNewTsumitateAllocItem)}
            onRemove={(i) => removeAllocationItem("tsumitateAllocation", i)}
            onUpdate={(i, key, val) => updateAllocationItem("tsumitateAllocation", i, key, val)}
          />
          <div style={{ marginBottom: 18 }} />

          <div className="field-label" style={{ marginBottom: 6 }}>{t("growthScheduleLabel")}</div>
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

          <div className="field-label" style={{ marginBottom: 6 }}>{t("growthAllocationLabel")}</div>
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

          <div className="field-label" style={{ marginBottom: 6 }}>{t("lumpSumLabel")}</div>
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

          <div className="field-label" style={{ marginBottom: 6 }}>{t("lumpAllocationLabel")}</div>
          <AllocationBreakdown
            items={inputs.lumpAllocation}
            newItem={newLumpAllocItem}
            onNewItemChange={setNewLumpAllocItem}
            onAdd={() => addAllocationItem("lumpAllocation", newLumpAllocItem, setNewLumpAllocItem)}
            onRemove={(i) => removeAllocationItem("lumpAllocation", i)}
            onUpdate={(i, key, val) => updateAllocationItem("lumpAllocation", i, key, val)}
          />

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

          <Field label={t("idecoCurrentValueLabel")} unit={uCurrency} step={10000} value={inputs.ideco.currentValue} onChange={(v) => updateIdeco("currentValue", v)} />
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
          <Field label={t("idecoPrincipalLabel")} unit={uCurrency} step={10000} value={inputs.ideco.principalTotal} onChange={(v) => updateIdeco("principalTotal", v)} />
          <Field label={t("idecoMonthlyContributionLabel")} unit={uCurrency} step={1000} value={inputs.ideco.monthlyContribution} onChange={(v) => updateIdeco("monthlyContribution", v)} />
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
              <Field label={t("payoutYearsLabel")} unit={uYears} step={1} value={inputs.ideco.payoutYears} onChange={(v) => updateIdeco("payoutYears", v)} />
              <Field label={t("payoutReturnPctLabel")} unit="%" step={0.5} value={inputs.ideco.payoutReturnPct} onChange={(v) => updateIdeco("payoutReturnPct", v)} />
            </>
          )}
          {inputs.ideco.payoutMethod === "both" && (
            <Field label={t("lumpPortionPctLabel")} unit="%" step={5} min={0} max={100} value={inputs.ideco.lumpPortionPct} onChange={(v) => updateIdeco("lumpPortionPct", v)} />
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

          {country === "GB" ? (
            <div className="note" style={{ borderLeftColor: "#5FB0A0" }}>
              <Info size={13} style={{ color: "#5FB0A0" }} />
              <span>{t("gbTaxHandledInInvestmentNote")}</span>
            </div>
          ) : rules.tax.implemented ? (
            <>
              <div className="field-label" style={{ marginBottom: 6 }}>{t("taxSavingSimLabel")}</div>
              <Field label={t("annualIncomeLabel")} unit={uCurrency} step={100000} value={inputs.ideco.annualIncome} onChange={(v) => updateIdeco("annualIncome", v)} />
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
          <div className="field-label" style={{ marginBottom: 6 }}>{t("pensionSourcesLabel")}</div>
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
          <Field label={t("livingCostLabel")} unit={uPerMonth} value={inputs.livingCostMonthly} step={5000} onChange={(v) => update({ livingCostMonthly: v })} />
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
          <Field label={t("health60sLabel")} unit={uPerYear} step={10000} value={inputs.healthBrackets.b60} onChange={(v) => updateHealth("b60", v)} />
          <Field label={t("health70sLabel")} unit={uPerYear} step={10000} value={inputs.healthBrackets.b70} onChange={(v) => updateHealth("b70", v)} />
          <Field label={t("health80sLabel")} unit={uPerYear} step={10000} value={inputs.healthBrackets.b80} onChange={(v) => updateHealth("b80", v)} />
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
          <Field label={t("goldCurrentHoldingLabel")} unit="g" step={1} value={inputs.gold.currentGrams} onChange={(v) => updateGold("currentGrams", v)} />
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
          <Field label={t("goldPriceRefLabel")} unit={uPerGram} step={100} value={inputs.gold.pricePerGram} onChange={(v) => updateGold("pricePerGram", v)} />
          <Field
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
          <Field label={t("goldMonthlyContributionLabel")} unit={uPerMonth} step={1000} value={inputs.gold.monthlyYen} onChange={(v) => updateGold("monthlyYen", v)} />
          <AgeField label={t("goldAccumulateUntilLabel")} value={inputs.gold.accumulateUntilAge} onChange={(v) => updateGold("accumulateUntilAge", v)} />
          <div className="note">
            <Info size={13} />
            <span>{t("goldPriceRefNote")}</span>
          </div>

          </div>
          <div className="section-block" style={{ borderColor: "#E0C34F" }}>
          <SectionTitle index="08" title={label("cash")} icon={PiggyBank} />
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
            <div className="chart-label">{t("netWorthChartTitle", { currentAge: t("ageYears", { age: effectiveCurrentAge }), deathAge: t("ageYears", { age: inputs.deathAge }) })}</div>
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
                  <Area type="monotone" dataKey="total" name={t("legendNisaAssets")} stackId="net" stroke="#4FA8D8" fill="rgba(79,168,216,0.35)" strokeWidth={1.5} />
                )}
                {country === "US" && (
                  <Area type="monotone" dataKey="usInvestmentValue" name={t("legendUsInvestment")} stackId="net" stroke="#4FA8D8" fill="rgba(79,168,216,0.35)" strokeWidth={1.5} />
                )}
                <Area type="monotone" dataKey="goldValue" name={t("legendGoldAssets")} stackId="net" stroke="#D9A54F" fill="rgba(217,165,79,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="bankValue" name={t("legendBankDeposits")} stackId="net" stroke="#8FBF7F" fill="rgba(143,191,127,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="stockValue" name={t("legendStocks")} stackId="net" stroke="#B08FD6" fill="rgba(176,143,214,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="pensionValue" name={t("legendPrivatePension")} stackId="net" stroke="#6FA88A" fill="rgba(111,168,138,0.35)" strokeWidth={1.5} />
                {country === "JP" && (
                  <Area type="monotone" dataKey="idecoLockedValue" name={t("legendIdecoAssets")} stackId="net" stroke="#D68FB0" fill="rgba(214,143,176,0.35)" strokeWidth={1.5} />
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
                    : t("fundBreakdownChartTitle", { age: t("ageYears", { age: inputs.retireAge }) })}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={country === "US" ? usAccountBreakdownAtRetire : country === "GB" ? gbAccountBreakdownAtRetire : fundBreakdownAtRetire} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#7C8A90" fontSize={11} tickFormatter={(v) => money(v)} />
                  <YAxis type="category" dataKey="name" stroke="#7C8A90" fontSize={11} width={90} />
                  <Tooltip contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }} formatter={(v) => money(v)} />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {(country === "US" ? usAccountBreakdownAtRetire : country === "GB" ? gbAccountBreakdownAtRetire : fundBreakdownAtRetire).map((f, i) => (
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
