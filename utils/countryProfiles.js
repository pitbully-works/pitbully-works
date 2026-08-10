export const PROFILE_COUNTRIES = Object.freeze(["JP", "US", "GB", "CA", "AU"]);
export const PROFILE_STORAGE_VERSION = 2;
export const PROFILE_SHARED_KEYS = Object.freeze(["userName", "birthDate", "currentAge"]);
const META = Object.freeze({
  JP: { baseCurrency: "JPY", language: "ja" },
  US: { baseCurrency: "USD", language: "en" },
  GB: { baseCurrency: "GBP", language: "en-GB" },
  CA: { baseCurrency: "CAD", language: "en" },
  AU: { baseCurrency: "AUD", language: "en" },
});
const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
export function normalizeProfileCountry(value, fallback = "JP") {
  const safeFallback = PROFILE_COUNTRIES.includes(fallback) ? fallback : "JP";
  return PROFILE_COUNTRIES.includes(value) ? value : safeFallback;
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
  return forceCountryMeta(applySharedIdentity(base, sharedSource), country);
}
export function migrateCountryProfiles(defaultInputs, parsed) {
  const p = parsed && typeof parsed === "object" ? parsed : {};
  if (p.profileStorageVersion >= PROFILE_STORAGE_VERSION && p.profiles && typeof p.profiles === "object") {
    return { profiles: p.profiles, activeCountry: normalizeProfileCountry(p.activeCountry || p.inputs?.country || "JP"), migratedLegacy: false };
  }
  if (p.inputs && typeof p.inputs === "object") {
    // v1 had one shared bucket. Existing users are Japanese-first, so preserve every value in JP.
    const jp = forceCountryMeta({ ...p.inputs }, "JP");
    return { profiles: { JP: jp }, activeCountry: "JP", migratedLegacy: true };
  }
  return { profiles: {}, activeCountry: "JP", migratedLegacy: false };
}
export function targetCountryFromKakeibo(payload) {
  return normalizeProfileCountry(payload && typeof payload === "object" ? payload.countryCode : "JP", "JP");
}
