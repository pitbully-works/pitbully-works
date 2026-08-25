const SUPPORTED = new Set(["JP", "US", "GB", "CA", "AU"]);

const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
const rounded = (v) => {
  const n = finite(v);
  return n === null ? null : Math.round(n);
};

export function agentScenarioKey(scenario) {
  if (!scenario || typeof scenario !== "object") return "";
  const retireAge = finite(scenario.retireAge);
  const livingCostMonthly = rounded(scenario.livingCostMonthly);
  const contributionMultiplier = finite(scenario.contributionMultiplier);
  if (retireAge === null || livingCostMonthly === null || contributionMultiplier === null) return "";
  return `${Math.round(retireAge * 12) / 12}|${livingCostMonthly}|${contributionMultiplier}`;
}

export function agentSnapshotSettings(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const retireAge = finite(snapshot.retireAge);
  const livingCostMonthly = rounded(snapshot.livingCostMonthly);
  if (retireAge === null || livingCostMonthly === null) return null;
  return {
    country: String(snapshot.country || "").trim().toUpperCase(),
    retireAge: Math.round(retireAge * 12) / 12,
    livingCostMonthly,
  };
}

export function agentSettingsFingerprint(snapshot) {
  const settings = agentSnapshotSettings(snapshot);
  if (!settings) return "";
  return `${settings.country}|${settings.retireAge}|${settings.livingCostMonthly}`;
}

export function validateAgentScenarioApplication({ scenario, currentSnapshot, baselineFingerprint, appliedKeys = [] } = {}) {
  const key = agentScenarioKey(scenario);
  if (!key) return { ok: false, reason: "invalid-scenario", key };
  if (Array.isArray(appliedKeys) && appliedKeys.includes(key)) {
    return { ok: false, reason: "already-applied", key };
  }
  const multiplier = finite(scenario.contributionMultiplier);
  if (multiplier === null || Math.abs(multiplier - 1) > 1e-9) {
    return { ok: false, reason: "contribution-multiplier-not-persistable", key };
  }
  const currentFingerprint = agentSettingsFingerprint(currentSnapshot);
  if (baselineFingerprint && currentFingerprint && baselineFingerprint !== currentFingerprint) {
    return { ok: false, reason: "stale-baseline", key, currentFingerprint };
  }
  return { ok: true, reason: null, key, currentFingerprint };
}

export function scenarioMatchesSnapshot(snapshot, scenario) {
  const current = agentSnapshotSettings(snapshot);
  if (!current || !scenario) return false;
  const retireAge = finite(scenario.retireAge);
  const livingCostMonthly = rounded(scenario.livingCostMonthly);
  if (retireAge === null || livingCostMonthly === null) return false;
  return Math.abs(current.retireAge - (Math.round(retireAge * 12) / 12)) < 1e-9
    && current.livingCostMonthly === livingCostMonthly;
}

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
