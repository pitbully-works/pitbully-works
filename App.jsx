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
  { code: "GB", flag: "🇬🇧", name: "United Kingdom", enabled: false },
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
const DEFAULT_LANGUAGE_BY_COUNTRY = { JP: "ja", US: "en", GB: "en", CA: "en", AU: "en" };

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
    GB: "SIPP (Self-Invested Personal Pension)",
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
    GB: "Healthcare Costs (Out-of-Pocket Estimate)",
    CA: "Healthcare Costs (Out-of-Pocket Estimate)",
    AU: "Healthcare Costs (Out-of-Pocket Estimate)",
  },
  inheritance: {
    JP: "相続プラン",
    US: "Estate & Inheritance Plan",
    GB: "Estate & Inheritance Plan",
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
    GB: "Cash & Bank Accounts",
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
    GB: "Insurance (Life)",
    CA: "Insurance (Life)",
    AU: "Insurance (Life)",
  },
  privatePension: {
    JP: "民間年金積立",
    US: "Private Pension / Annuity",
    GB: "Private Pension / Annuity",
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
  },
  en: {
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
  },
};

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
// ---------- 国別計算ルール（countryRules/ 相当）----------
// 目的：投資枠・税制上限などの「数値」を画面コード内に直書きし続けるのではなく、
// 国ごとの設定オブジェクトへ集約する。
// 将来的にファイルを分割する場合は、この COUNTRY_RULES オブジェクトの中身をそのまま
//   countryRules/JP.js, countryRules/US.js, countryRules/GB.js, countryRules/CA.js, countryRules/AU.js
// へ切り出し、ここで import してマージする形を想定（1ファイル運用の制約上、現時点ではこのファイル内にまとめている）。
// 今回のスコープでは日本（JP）の計算式・数値は一切変更していない。US/GB/CA/AU は
// 将来の実装のためのプレースホルダーのみで、実際の計算はまだ日本のルールを代用している。
// ============================================================================
const COUNTRY_RULES = {
  JP: {
    // 現行の新NISA制度（2024年〜）の枠。既存のNISA_LIMITSと完全に同じ値。
    annualInstallmentLimit: 1200000,  // つみたて投資枠 年間上限
    annualGrowthLimit: 2400000,       // 成長投資枠 年間上限
    growthLifetimeLimit: 12000000,    // 成長投資枠 生涯（簿価）上限
    taxFreeInvestmentLimit: 18000000, // 総枠 生涯（簿価）上限（つみたて＋成長）
  },
  // US / GB / CA / AU: 将来、401(k)拠出上限・ISA拠出上限・TFSA拠出上限等をここへ追加する。
  // 未実装の間は、下記 getCountryRules() が JP の値へフォールバックする。
};

function getCountryRules(country) {
  return COUNTRY_RULES[country] || COUNTRY_RULES.JP;
}

// ---------- NISA quota rules (2024- new NISA system) ----------
// 数値そのものは COUNTRY_RULES.JP に集約し、ここでは既存コード互換のための別名として参照するのみ。
// （NISA_LIMITS.xxx という参照は既存コード全体にそのまま残しているため、ここを書き換えても
//   計算結果・呼び出し側のコードには一切影響しない。）
const NISA_LIMITS = {
  tsumitateAnnual: COUNTRY_RULES.JP.annualInstallmentLimit,
  growthAnnual: COUNTRY_RULES.JP.annualGrowthLimit,
  growthLifetime: COUNTRY_RULES.JP.growthLifetimeLimit,
  totalLifetime: COUNTRY_RULES.JP.taxFreeInvestmentLimit,
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

// 既存の呼び出し箇所（初期状態の既定値）との後方互換のための別名。
const DEFAULT_WATCHLIST = DEFAULT_WATCHLIST_JP;

function defaultWatchlistFor(country) {
  return country === "US" ? DEFAULT_WATCHLIST_US : DEFAULT_WATCHLIST_JP;
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
  });
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);

  // ---------- 国際化（i18n）：国が"JP"のままなら、moneyはyenと完全に同じ結果を返す ----------
  // 重要：このブロックはファイル内で最初期（他のuseMemo/useCallbackより前）に置くこと。
  // useMemoのファクトリ関数はレンダー中に同期的に即時実行されるため、
  // t/money/label をこれより後方で定義すると初期化前アクセスのエラーになる。
  const country = inputs.country || "JP";
  const baseCurrency = inputs.baseCurrency || "JPY";
  const language = inputs.language || "ja";
  const money = useCallback((n) => formatMoneyFor(baseCurrency, n), [baseCurrency]);
  const label = useCallback((key) => getCategoryLabel(key, country), [country]);
  const t = useCallback((key, vars) => translateWith(language, key, vars), [language]);
  const localeValue = useMemo(
    () => ({ country, baseCurrency, language, money, label, t }),
    [country, baseCurrency, language, money, label, t]
  );
  // Field/表示用の単位文字列（通貨のみ切替、円建て表示のロジック自体は変更しない）
  const currencySymbol = (CURRENCY_BY_CODE[baseCurrency] || CURRENCY_BY_CODE.JPY).symbol;
  const uCurrency = baseCurrency === "JPY" ? "円" : currencySymbol;
  const uPerMonth = baseCurrency === "JPY" ? "円/月" : `${currencySymbol}/month`;
  const uPerYear = baseCurrency === "JPY" ? "円/年" : `${currencySymbol}/year`;
  const uPerGram = baseCurrency === "JPY" ? "円/g" : `${currencySymbol}/g`;
  const uYears = language === "en" ? "years" : "年";
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
      setSaveMessage(t("saveMessageLastSaved", { time: new Date().toLocaleTimeString(language === "en" ? "en-US" : "ja-JP", { hour: "2-digit", minute: "2-digit" }) }));
    } catch (e) {
      setSaveStatus("error");
      setSaveMessage(t("saveMessageFailed", { error: e?.message || t("unknownError") }));
    }
  }, []);

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
      const spendableNetWorth = row.total + goldValue + bankValue + stockValue + pensionValue - loanValue - insuranceValue;
      return {
        ...row, goldValue, bankValue, stockValue, loanValue, insuranceValue, pensionValue,
        idecoLockedValue,
        spendableNetWorth,
        netWorth: spendableNetWorth + idecoLockedValue,
      };
    });
  }, [sim, goldSim, bankSim, stockSim, loanSim, insuranceSim, pensionSim, idecoSim]);
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
            {t("todayLabel")}：{new Date().toLocaleDateString(language === "en" ? "en-US" : "ja-JP", { year: "numeric", month: "long", day: "numeric" })}
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
                  currentJson === JSON.stringify(DEFAULT_WATCHLIST_US);
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

          <div className="note">
            <Info size={13} />
            <span>
              {t("nisaCapSummaryNote")}
            </span>
          </div>

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

          </div>
          <div className="section-block" style={{ borderColor: "#B08FD6" }}>
          <SectionTitle index="03" title={label("retirementAccount")} icon={Landmark} />

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

          <div className="field-label" style={{ marginBottom: 6 }}>{t("taxSavingSimLabel")}</div>
          <Field label={t("annualIncomeLabel")} unit={uCurrency} step={100000} value={inputs.ideco.annualIncome} onChange={(v) => updateIdeco("annualIncome", v)} />
          <div className="stat-sub" style={{ marginBottom: 4 }}>{t("annualTaxSavingLabel")}：<span className="mono">{money(idecoAnnualTaxSaving)}</span></div>
          <div className="stat-sub" style={{ marginBottom: 8 }}>{t("cumulativeTaxSavingLabel")}：<span className="mono">{money(idecoCumulativeTaxSaving)}</span></div>
          <div className="note" style={{ marginTop: -4 }}>
            <Info size={13} />
            <span>{t("taxSavingCaveatNote")}</span>
          </div>
          <div className="note">
            <Info size={13} />
            <span>{t("payoutAccountingNote")}</span>
          </div>

          </div>
          <div className="section-block" style={{ borderColor: "#C2694F" }}>
          <SectionTitle index="04" title={label("pensionRetirement")} icon={Landmark} />
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

          </div>
          <div className="section-block" style={{ borderColor: "#7BC9E0" }}>
          <SectionTitle index="05" title={label("healthCost")} icon={HeartPulse} />
          <Field label={t("health60sLabel")} unit={uPerYear} step={10000} value={inputs.healthBrackets.b60} onChange={(v) => updateHealth("b60", v)} />
          <Field label={t("health70sLabel")} unit={uPerYear} step={10000} value={inputs.healthBrackets.b70} onChange={(v) => updateHealth("b70", v)} />
          <Field label={t("health80sLabel")} unit={uPerYear} step={10000} value={inputs.healthBrackets.b80} onChange={(v) => updateHealth("b80", v)} />
          <div className="note">
            <Info size={13} />
            <span>{t("healthCostNote")}</span>
          </div>

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
            <StatCard label={t("statNisaAssetsLabel")} value={money(effectiveCurrentAssets)} sub={t("statNisaAssetsSub")} />
            <StatCard label={t("statIdecoAssetsLabel")} value={money(inputs.ideco.currentValue)} sub={t("statIdecoAssetsSub")} />
          </div>
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
                <Area type="monotone" dataKey="total" name={t("legendNisaAssets")} stackId="net" stroke="#4FA8D8" fill="rgba(79,168,216,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="goldValue" name={t("legendGoldAssets")} stackId="net" stroke="#D9A54F" fill="rgba(217,165,79,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="bankValue" name={t("legendBankDeposits")} stackId="net" stroke="#8FBF7F" fill="rgba(143,191,127,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="stockValue" name={t("legendStocks")} stackId="net" stroke="#B08FD6" fill="rgba(176,143,214,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="pensionValue" name={t("legendPrivatePension")} stackId="net" stroke="#6FA88A" fill="rgba(111,168,138,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="idecoLockedValue" name={t("legendIdecoAssets")} stackId="net" stroke="#D68FB0" fill="rgba(214,143,176,0.35)" strokeWidth={1.5} />
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
              <div className="chart-label">{t("fundBreakdownChartTitle", { age: t("ageYears", { age: inputs.retireAge }) })}</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={fundBreakdownAtRetire} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#7C8A90" fontSize={11} tickFormatter={(v) => money(v)} />
                  <YAxis type="category" dataKey="name" stroke="#7C8A90" fontSize={11} width={90} />
                  <Tooltip contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }} formatter={(v) => money(v)} />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {fundBreakdownAtRetire.map((f, i) => (
                      <Cell key={i} fill={f.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
