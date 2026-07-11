// 最小限のサービスワーカー（PWAとして「ホーム画面に追加」できるようにするためのものです）
// 既存のシミュレーション機能やデータ保存の仕組みには一切関与しません。

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

// キャッシュは行わず、常にネットワークからそのまま取得します（既存の動作を変えないため）
self.addEventListener("fetch", () => {});
