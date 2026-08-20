// 制度更新センターが監視する公式情報源。
// 「公式ページが変わった」ことと「計算ルールを変更する」ことは分離する。
// ページ変更は要確認通知だけを出し、承認可能な制度差分は rules-updates.json / BUILTIN_RULE_UPDATES で別管理する。
export const RULE_SOURCE_REGISTRY = [
  {
    id: "JP-FSA-NISA",
    country: "JP",
    category: "nisa",
    labelJa: "NISA",
    labelEn: "NISA",
    sourceLabel: "金融庁 NISA特設ウェブサイト「NISAを知る」",
    url: "https://www.fsa.go.jp/policy/nisa2/know/index.html",
  },
  {
    id: "JP-MHLW-IDECO-REFORM",
    country: "JP",
    category: "ideco",
    labelJa: "iDeCo",
    labelEn: "iDeCo",
    sourceLabel: "厚生労働省「2025年の制度改正」",
    url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/kyoshutsu/2025kaisei.html",
  },
  {
    id: "JP-JPS-PUBLIC-PENSION",
    country: "JP",
    category: "publicPension",
    labelJa: "公的年金",
    labelEn: "Public pension",
    sourceLabel: "日本年金機構「年金額等の改定」",
    url: "https://www.nenkin.go.jp/tokusetsu/nenkingakutou_kaitei.html",
  },
];

export function getRuleSourcesForCountry(country) {
  return RULE_SOURCE_REGISTRY.filter((source) => source.country === country);
}
