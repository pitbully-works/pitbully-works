import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const file = new URL('../public/rules-source-status.json', import.meta.url);
const SOURCE_FETCH_TIMEOUT_MS = 20_000;
const MAX_SOURCE_RESPONSE_BYTES = 5 * 1024 * 1024;
const MIN_NORMALIZED_SOURCE_CHARS = 200;
import { RULE_SOURCE_REGISTRY } from '../utils/ruleSourceRegistry.js';

const SOURCES = RULE_SOURCE_REGISTRY.map((source) => ({
  id: source.id,
  country: source.country,
  category: source.category,
  label: source.sourceLabel,
  url: source.url,
}));

let previous = { schemaVersion: 1, checkedAt: '', sources: [] };
try { previous = JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
const oldById = new Map((previous.sources || []).map((s) => [s.id, s]));
const now = new Date().toISOString();
const next = [];

async function fetchBoundedSourceText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('source fetch timeout')), SOURCE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'lifeplan-rules-watch/1.0' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declaredLength = Number(res.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_RESPONSE_BYTES) {
      throw new Error(`response too large: ${declaredLength} bytes`);
    }
    if (!res.body) return '';

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SOURCE_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch {}
        throw new Error(`response exceeded ${MAX_SOURCE_RESPONSE_BYTES} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

for (const source of SOURCES) {
  try {
    const html = await fetchBoundedSourceText(source.url);
    // script/styleと空白を除いて本文変化を比較。変更は「要確認」扱いで、計算へ直接反映しない。
    const normalized = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalized.length < MIN_NORMALIZED_SOURCE_CHARS) {
      throw new Error(`source body too short after normalization: ${normalized.length} chars`);
    }
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    const old = oldById.get(source.id);
    next.push({
      ...source,
      hash,
      checkedAt: now,
      // 一度検知した変更は、基準ハッシュを明示的に更新するまで保持する。
      // 次回の定期監視で changed=false に戻って見逃すことを防ぐ。
      changed: !!old?.changed || (!!old?.hash && old.hash !== hash),
      previousHash: old?.hash || '',
      error: '',
    });
  } catch (error) {
    const old = oldById.get(source.id) || {};
    next.push({ ...source, hash: old.hash || '', checkedAt: now, changed: !!old?.changed, previousHash: old.previousHash || '', error: String(error?.message || error) });
  }
}

await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, checkedAt: now, sources: next }, null, 2) + '\n');
