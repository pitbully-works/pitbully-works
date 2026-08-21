// Long-run inflation planning assumptions. These are reference targets, not forecasts.
// Users can override or disable inflation in the UI.
const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

export const INFLATION_REFERENCE_PCT = Object.freeze({
  JP: 2.0,
  US: 2.0,
  GB: 2.0,
  CA: 2.0,
  AU: 2.5, // midpoint of the RBA's 2–3% target range
});

export const INFLATION_REFERENCE_BASIS = Object.freeze({
  JP: 'BOJ 2% price-stability target',
  US: 'Federal Reserve 2% longer-run goal',
  GB: 'Bank of England 2% target',
  CA: 'Bank of Canada 2% midpoint target',
  AU: 'RBA 2–3% target midpoint',
});

export function resolveInflationPct(country, setting) {
  if (setting?.mode === 'off') return 0;
  if (setting?.mode === 'manual') return Math.max(0, Math.min(20, n(setting.manualPct)));
  const code = String(country || '').trim().toUpperCase();
  return INFLATION_REFERENCE_PCT[code] ?? 2.0;
}
