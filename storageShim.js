// Claude.aiのアーティファクト内でのみ使える window.storage の代わりに、
// 実際のブラウザの localStorage を使う互換シムです。
// これにより、Vercel等にデプロイした状態でも「保存」機能がそのまま動作します。
(function () {
  if (window.storage) return; // 既にある場合は上書きしない（Claude環境内で読み込まれた場合の保険）
  const NS = "nisa-lifeplan:";
  const MAX_KEY_LENGTH = 2048;
  const MAX_VALUE_LENGTH = 8_000_000;
  const MAX_LIST_KEYS = 5000;
  const normalizeKey = (key) => {
    if (typeof key !== "string" || key.length === 0 || key.length > MAX_KEY_LENGTH || key.includes("\0")) {
      throw new TypeError("Invalid storage key");
    }
    return key;
  };
  const normalizePrefix = (prefix) => {
    if (prefix === undefined || prefix === null) return "";
    if (typeof prefix !== "string" || prefix.length > MAX_KEY_LENGTH || prefix.includes("\0")) {
      throw new TypeError("Invalid storage prefix");
    }
    return prefix;
  };

  window.storage = {
    async get(key) {
      const safeKey = normalizeKey(key);
      const raw = window.localStorage.getItem(NS + safeKey);
      if (raw === null) return null;
      if (raw.length > MAX_VALUE_LENGTH) throw new RangeError("Stored value is too large");
      return { key: safeKey, value: raw, shared: false };
    },
    async set(key, value) {
      const safeKey = normalizeKey(key);
      if (typeof value !== "string") throw new TypeError("Storage value must be a string");
      if (value.length > MAX_VALUE_LENGTH) throw new RangeError("Storage value is too large");
      window.localStorage.setItem(NS + safeKey, value);
      return { key: safeKey, value, shared: false };
    },
    async delete(key) {
      const safeKey = normalizeKey(key);
      window.localStorage.removeItem(NS + safeKey);
      return { key: safeKey, deleted: true, shared: false };
    },
    async list(prefix) {
      const keys = [];
      const safePrefix = normalizePrefix(prefix);
      // Snapshot the matching names and sort them so callers do not depend on
      // browser-specific localStorage enumeration order. Namespace stripping is
      // performed only after the prefix check, preventing unrelated app keys from leaking.
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(NS + safePrefix)) {
          keys.push(k.slice(NS.length));
          if (keys.length >= MAX_LIST_KEYS) break;
        }
      }
      keys.sort();
      return { keys, prefix: safePrefix, shared: false };
    },
  };
})();
