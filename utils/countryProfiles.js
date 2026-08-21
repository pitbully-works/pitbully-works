export const PROFILE_COUNTRIES = Object.freeze(["JP", "US", "GB", "CA", "AU"]);
export const PROFILE_STORAGE_VERSION = 3;
// 名前・生年月日・現在年齢も国別プロファイルに完全分離する。
export const PROFILE_SHARED_KEYS = Object.freeze([]);
const META = Object.freeze({
  JP: { baseCurrency: "JPY", language: "ja" },
  US: { baseCurrency: "USD", language: "en" },
  GB: { baseCurrency: "GBP", language: "en-GB" },
  CA: { baseCurrency: "CAD", language: "en" },
  AU: { baseCurrency: "AUD", language: "en" },
});
const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

// ----------------------------------------------------------------------------
// 国ごとの参考初期値
// ----------------------------------------------------------------------------
// DEFAULT_INPUTS は「全部の国で共通の出発点」。
// そこへ、国ごとに違う出発点だけをここで上書きする。
//
// ★ 金額を勝手に作らないこと。
//   ここに書いてよいのは、アプリがもともと持っていた値か、
//   出典がはっきりしている値だけ。根拠のない額を推測で置くと、
//   利用者はそれを「アプリが調べた数字」と受け取ってしまう。
//
// JP.healthBrackets（医療・健康予備費）:
//   60代15万円 / 70代25万円 / 80代以降40万円。
//   これは以前からこのアプリが持っていた **資金計画のための参考初期値** で、
//   公的制度から算出した自己負担額ではない。
//   厚生労働省には年齢階級別の医療費統計があるが、この3つの額を
//   公的制度上の自己負担額として直接裏づける根拠は確認できていない。
//   だから画面でも、公的な金額であるかのようには書かない。
//
// US / GB / CA / AU:
//   医療・健康予備費の国別初期値は、もともとコードに存在しない。
//   根拠のない額を作らないので、空のままにしてある（＝共通の初期値0）。
//   これらの国は画面でも healthBrackets を使わず、各国専用の医療費欄を持つ。
export const COUNTRY_INPUT_DEFAULTS = Object.freeze({
  JP: Object.freeze({ healthBrackets: Object.freeze({ b60: 150000, b70: 250000, b80: 400000 }) }),
  US: Object.freeze({}),
  GB: Object.freeze({}),
  CA: Object.freeze({}),
  AU: Object.freeze({}),
});

/* 国ごとの参考初期値を、共通の初期値へ重ねる。
   入れ子（healthBrackets など）は中身ごと差し替える。 */
function applyCountryDefaults(base, country) {
  const extra = COUNTRY_INPUT_DEFAULTS[normalizeProfileCountry(country)];
  if (!extra) return base;
  const out = { ...base };
  Object.keys(extra).forEach((k) => { out[k] = clone(extra[k]); });
  return out;
}
export function normalizeProfileCountry(value, fallback = "JP") {
  const normalizedValue = String(value || "").trim().toUpperCase();
  const normalizedFallback = String(fallback || "").trim().toUpperCase();
  const safeFallback = PROFILE_COUNTRIES.includes(normalizedFallback) ? normalizedFallback : "JP";
  return PROFILE_COUNTRIES.includes(normalizedValue) ? normalizedValue : safeFallback;
}
export function profileMeta(country) { return META[normalizeProfileCountry(country)] || META.JP; }
export function sharedIdentity(inputs) {
  const src = inputs && typeof inputs === "object" ? inputs : {};
  const out = {};
  PROFILE_SHARED_KEYS.forEach((k) => { if (src[k] !== undefined) out[k] = clone(src[k]); });
  return out;
}
export function applySharedIdentity(inputs, source) {
  const out = { ...(inputs && typeof inputs === "object" ? inputs : {}) };
  const shared = sharedIdentity(source);
  PROFILE_SHARED_KEYS.forEach((k) => { if (shared[k] !== undefined) out[k] = shared[k]; });
  return out;
}
export function forceCountryMeta(inputs, country) {
  const c = normalizeProfileCountry(country);
  const meta = profileMeta(c);
  return { ...(inputs && typeof inputs === "object" ? inputs : {}), country: c, baseCurrency: meta.baseCurrency, language: meta.language };
}
export function makeCountryProfile(defaultInputs, country, sharedSource = {}) {
  const base = clone(defaultInputs && typeof defaultInputs === "object" ? defaultInputs : {});
  /* 共通の初期値 → その国の参考初期値 → 共有の身元 → 国の印、の順で重ねる。
     「初期値に戻す」もここを通るので、戻したときに
     その国の参考初期値がちゃんと戻る。 */
  const withCountry = applyCountryDefaults(base, country);
  return forceCountryMeta(applySharedIdentity(withCountry, sharedSource), country);
}
export function migrateCountryProfiles(defaultInputs, parsed) {
  const p = parsed && typeof parsed === "object" ? parsed : {};
  if (p.profileStorageVersion >= PROFILE_STORAGE_VERSION && p.profiles && typeof p.profiles === "object") {
    return { profiles: p.profiles, activeCountry: normalizeProfileCountry(p.activeCountry || p.inputs?.country || "JP"), migratedLegacy: false };
  }
  // v2 は名前・生年月日・現在年齢を国間で共有していた。v3 では完全分離する。
  // 移行時は現在開いていた国だけ本人情報を保持し、他国にコピーされていた本人情報を消す。
  if (p.profileStorageVersion === 2 && p.profiles && typeof p.profiles === "object") {
    const activeCountry = normalizeProfileCountry(p.activeCountry || p.inputs?.country || "JP");
    const profiles = {};
    PROFILE_COUNTRIES.forEach((code) => {
      if (!p.profiles[code]) return;
      const src = clone(p.profiles[code]);
      if (code !== activeCountry) {
        src.userName = "";
        src.birthDate = "";
        src.currentAge = clone(defaultInputs.currentAge);
      }
      profiles[code] = forceCountryMeta(src, code);
    });
    return { profiles, activeCountry, migratedLegacy: true };
  }
  if (p.inputs && typeof p.inputs === "object") {
    // v1 had one shared bucket. Existing users are Japanese-first, so preserve every value in JP.
    const jp = forceCountryMeta({ ...p.inputs }, "JP");
    return { profiles: { JP: jp }, activeCountry: "JP", migratedLegacy: true };
  }
  return { profiles: {}, activeCountry: "JP", migratedLegacy: false };
}
export function targetCountryFromKakeibo(payload) {
  const raw = payload && typeof payload === "object" ? payload.countryCode : undefined;
  // 旧家計簿データは countryCode を持たないためJPとして互換維持する。
  // ただし明示された未知コードをJPへ黙って落とすと、別国データを日本へ混入させるため拒否する。
  if (raw === undefined || raw === null || String(raw).trim() === "") return "JP";
  const code = String(raw).trim().toUpperCase();
  return PROFILE_COUNTRIES.includes(code) ? code : null;
}
