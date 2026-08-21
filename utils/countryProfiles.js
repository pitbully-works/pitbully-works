export const PROFILE_COUNTRIES = Object.freeze(["JP", "US", "GB", "CA", "AU"]);
export const PROFILE_STORAGE_VERSION = 3;
export const MAX_SNAPSHOT_HISTORY = 1000;

export function normalizeProfileStorageVersion(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 1000000 ? n : null;
}

export function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
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

export function normalizeProfileCurrency(value, country = "JP") {
  const expected = profileMeta(country).baseCurrency;
  const code = String(value || "").trim().toUpperCase();
  // Each supported country has one canonical planning currency. A syntactically
  // supported but cross-country value (e.g. US + JPY) is still inconsistent and
  // must not reach money formatting or calculations.
  return code === expected ? code : expected;
}

export function normalizeCountryKeyedRecord(value) {
  const src = isPlainRecord(value) ? value : {};
  const out = {};
  // First accept noisy-but-valid keys (" us ", "gb", ...).
  // Then let an exact canonical key win if both forms exist, so corrupted/legacy
  // duplicates cannot unexpectedly overwrite the normal saved bucket.
  Object.entries(src).forEach(([rawKey, item]) => {
    const code = String(rawKey || "").trim().toUpperCase();
    if (!PROFILE_COUNTRIES.includes(code) || rawKey === code) return;
    out[code] = item;
  });
  PROFILE_COUNTRIES.forEach((code) => {
    if (Object.prototype.hasOwnProperty.call(src, code)) out[code] = src[code];
  });
  return out;
}
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
export function resolvePersistedActiveCountry(value, profiles, fallback = "JP") {
  const normalizedProfiles = normalizeCountryKeyedRecord(profiles);
  const raw = value === undefined || value === null ? "" : String(value).trim();
  if (!raw) return normalizeProfileCountry(fallback);
  const code = raw.toUpperCase();
  if (PROFILE_COUNTRIES.includes(code)) return code;
  // An explicit unsupported persisted code must not be silently reinterpreted as JP.
  // Recover by opening an actually existing valid bucket; if none exists, use the safe fallback.
  return PROFILE_COUNTRIES.find((candidate) =>
    Object.prototype.hasOwnProperty.call(normalizedProfiles, candidate) && isPlainRecord(normalizedProfiles[candidate])
  ) || normalizeProfileCountry(fallback);
}

export function migrateCountryProfiles(defaultInputs, parsed) {
  const p = isPlainRecord(parsed) ? parsed : {};
  const hasExplicitVersion = Object.prototype.hasOwnProperty.call(p, "profileStorageVersion");
  const storageVersion = normalizeProfileStorageVersion(p.profileStorageVersion);
  // Persisted data may have been written by a newer app version. Never reinterpret
  // an explicit unknown/future schema as the legacy JP-only format: doing so can
  // silently move foreign-currency data into the JP bucket. Let the caller fall
  // back to a fresh safe profile instead.
  if (hasExplicitVersion && storageVersion === null) {
    throw new Error(`Invalid profile storage version: ${String(p.profileStorageVersion)}`);
  }
  if (storageVersion !== null && storageVersion > PROFILE_STORAGE_VERSION) {
    throw new Error(`Unsupported profile storage version: ${storageVersion}`);
  }
  if (storageVersion === PROFILE_STORAGE_VERSION) {
    if (!isPlainRecord(p.profiles)) throw new Error("Invalid persisted country profiles");
    const profiles = normalizeCountryKeyedRecord(p.profiles);
    return { profiles, activeCountry: resolvePersistedActiveCountry(p.activeCountry ?? p.inputs?.country, profiles), migratedLegacy: false };
  }
  // v2 は名前・生年月日・現在年齢を国間で共有していた。v3 では完全分離する。
  // 移行時は現在開いていた国だけ本人情報を保持し、他国にコピーされていた本人情報を消す。
  if (storageVersion === 2 && isPlainRecord(p.profiles)) {
    const rawProfiles = normalizeCountryKeyedRecord(p.profiles);
    const activeCountry = resolvePersistedActiveCountry(p.activeCountry ?? p.inputs?.country, rawProfiles);
    const profiles = {};
    PROFILE_COUNTRIES.forEach((code) => {
      if (!isPlainRecord(rawProfiles[code])) return;
      const src = clone(rawProfiles[code]);
      if (code !== activeCountry) {
        src.userName = "";
        src.birthDate = "";
        src.currentAge = clone(defaultInputs.currentAge);
      }
      profiles[code] = forceCountryMeta(src, code);
    });
    return { profiles, activeCountry, migratedLegacy: true };
  }
  if (isPlainRecord(p.inputs)) {
    // v1 had one shared bucket. Existing users are Japanese-first, so preserve every value in JP.
    const jp = forceCountryMeta({ ...p.inputs }, "JP");
    return { profiles: { JP: jp }, activeCountry: "JP", migratedLegacy: true };
  }
  return { profiles: {}, activeCountry: "JP", migratedLegacy: false };
}
export function targetCountryFromBackup(value) {
  // 新形式バックアップで国コードが明示されている場合は、未知コードをJPへ黙って落とさない。
  // 国コードが無い古い/初期バックアップだけは、従来互換のためJPとして扱う。
  if (value === undefined || value === null || String(value).trim() === "") return "JP";
  const code = String(value).trim().toUpperCase();
  return PROFILE_COUNTRIES.includes(code) ? code : null;
}


export function normalizeSnapshotDate(value) {
  const text = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return text;
}

export function snapshotStorageKey(country, date) {
  const code = targetCountryFromBackup(country);
  const normalizedDate = normalizeSnapshotDate(date);
  if (!code || !normalizedDate) return null;
  return `snapshot:${code}:${normalizedDate}`;
}

export function legacyJpSnapshotStorageKey(date) {
  const normalizedDate = normalizeSnapshotDate(date);
  return normalizedDate ? `snapshot:${normalizedDate}` : null;
}


export function normalizeStockWatchlist(value, country = "JP") {
  if (!Array.isArray(value)) return [];
  const code = normalizeProfileCountry(country);
  const currency = profileMeta(code).baseCurrency;
  const finiteNonNegative = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const name = String(item.name ?? "").trim().slice(0, 200);
      if (!name) return null;
      const sector = String(item.sector ?? "").trim().slice(0, 200);
      return {
        name,
        sector,
        shares: finiteNonNegative(item.shares),
        value: finiteNonNegative(item.value),
        currency,
      };
    })
    .filter(Boolean)
    .slice(0, 500);
}

export function snapshotDateFromStorageKey(country, key) {
  if (typeof key !== "string") return null;
  const code = targetCountryFromBackup(country);
  if (!code) return null;
  const canonicalPrefix = `snapshot:${code}:`;
  if (key.startsWith(canonicalPrefix)) return normalizeSnapshotDate(key.slice(canonicalPrefix.length));
  if (code === "JP" && /^snapshot:\d{4}-\d{2}-\d{2}$/.test(key)) {
    return normalizeSnapshotDate(key.slice("snapshot:".length));
  }
  return null;
}

export function targetCountryFromKakeibo(payload) {
  const raw = payload && typeof payload === "object" ? payload.countryCode : undefined;
  // 旧家計簿データは countryCode を持たないためJPとして互換維持する。
  // ただし明示された未知コードをJPへ黙って落とすと、別国データを日本へ混入させるため拒否する。
  if (raw === undefined || raw === null || String(raw).trim() === "") return "JP";
  const code = String(raw).trim().toUpperCase();
  return PROFILE_COUNTRIES.includes(code) ? code : null;
}
