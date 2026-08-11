import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(process.cwd(), 'App.jsx'), 'utf8');

describe('lifeplan -> kakeibo bridge', () => {
  it('家計簿リンクはNISA橋渡しURLを使う', () => {
    expect(app).toContain('function buildKakeiboBridgeUrl(inputs)');
    expect(app).toContain('href={buildKakeiboBridgeUrl(inputs)}');
    expect(app).toContain('tsumitateSchedule: cleanSchedule(inputs?.tsumitateSchedule)');
    expect(app).toContain('growthSchedule: cleanSchedule(inputs?.growthSchedule)');
    expect(app).toContain('funds,');
    expect(app).toContain('monthlyYen: funds.length ? fundsTotal');
    expect(app).toContain('birth: String(inputs?.birthDate || "")');
  });
});
