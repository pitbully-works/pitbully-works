import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');

describe('lifeplan -> kakeibo bridge', () => {
  it('家計簿リンクはNISA橋渡しURLを使う', () => {
    expect(app).toContain('function buildKakeiboBridgeUrl(inputs)');
    expect(app).toContain('href={buildKakeiboBridgeUrl(inputs)}');
    expect(app).toContain('tsumitateSchedule: cleanSchedule(inputs?.tsumitateSchedule)');
    expect(app).toContain('growthSchedule: cleanSchedule(inputs?.growthSchedule)');
    expect(app).toContain('birth: String(inputs?.birthDate || "")');
  });
});
