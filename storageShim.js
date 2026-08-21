// Claude.aiのアーティファクト内でのみ使える window.storage の代わりに、
// 実際のブラウザの localStorage を使う互換シムです。
// これにより、Vercel等にデプロイした状態でも「保存」機能がそのまま動作します。
(function () {
  if (window.storage) return; // 既にある場合は上書きしない（Claude環境内で読み込まれた場合の保険）
  const NS = "nisa-lifeplan:";

  window.storage = {
    async get(key) {
      const raw = window.localStorage.getItem(NS + key);
      if (raw === null) return null;
      return { key, value: raw, shared: false };
    },
    async set(key, value) {
      window.localStorage.setItem(NS + key, value);
      return { key, value, shared: false };
    },
    async delete(key) {
      window.localStorage.removeItem(NS + key);
      return { key, deleted: true, shared: false };
    },
    async list(prefix) {
      const keys = [];
      const safePrefix = typeof prefix === "string" ? prefix : "";
      // Snapshot the matching names and sort them so callers do not depend on
      // browser-specific localStorage enumeration order. Namespace stripping is
      // performed only after the prefix check, preventing unrelated app keys from leaking.
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(NS + safePrefix)) keys.push(k.slice(NS.length));
      }
      keys.sort();
      return { keys, prefix: safePrefix, shared: false };
    },
  };
})();
