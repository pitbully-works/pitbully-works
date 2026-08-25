const SUPPORTED = new Set(["JP", "US", "GB", "CA", "AU"]);

export function applyAgentScenarioToInputs(inputs, country, scenario) {
  const code = String(country || "").trim().toUpperCase();
  if (!SUPPORTED.has(code)) return { ok: false, reason: "unsupported-country", nextInputs: inputs };
  if (!scenario || typeof scenario !== "object") return { ok: false, reason: "missing-scenario", nextInputs: inputs };

  const multiplier = Number(scenario.contributionMultiplier);
  if (!Number.isFinite(multiplier) || Math.abs(multiplier - 1) > 1e-9) {
    return { ok: false, reason: "contribution-multiplier-not-persistable", nextInputs: inputs };
  }

  const retireAge = Number(scenario.retireAge);
  const livingCostMonthly = Number(scenario.livingCostMonthly);
  if (!Number.isFinite(retireAge) || !Number.isFinite(livingCostMonthly) || livingCostMonthly < 0) {
    return { ok: false, reason: "invalid-scenario", nextInputs: inputs };
  }

  const next = { ...inputs, retireAge };
  if (code === "JP") {
    next.livingCostMonthly = Math.round(livingCostMonthly);
  } else {
    const key = `${code.toLowerCase()}Investment`;
    next[key] = {
      ...(inputs?.[key] || {}),
      expensesMonthly: Math.round(livingCostMonthly),
    };
  }

  return { ok: true, reason: null, nextInputs: next };
}
