import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const file = new URL('../public/rules-source-status.json', import.meta.url);
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

for (const source of SOURCES) {
  try {
    const res = await fetch(source.url, { headers: { 'user-agent': 'lifeplan-rules-watch/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // script/styleと空白を除いて本文変化を比較。変更は「要確認」扱いで、計算へ直接反映しない。
    const normalized = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
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
    next.push({ ...source, hash: old.hash || '', checkedAt: now, changed: false, previousHash: old.previousHash || '', error: String(error?.message || error) });
  }
}

await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, checkedAt: now, sources: next }, null, 2) + '\n');
