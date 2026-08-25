const SUPPORTED = new Set(["JP", "US", "GB", "CA", "AU"]);
const MAX_LIVING_COST_MONTHLY = 100_000_000;
const MAX_RETIRE_AGE = 130;

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

  const current = agentSnapshotSettings(currentSnapshot);
  if (!current || !SUPPORTED.has(current.country)) {
    return { ok: false, reason: "invalid-current", key };
  }
  if (!baselineFingerprint) {
    return { ok: false, reason: "missing-baseline", key };
  }

  const multiplier = finite(scenario.contributionMultiplier);
  if (multiplier === null || Math.abs(multiplier - 1) > 1e-9) {
    return { ok: false, reason: "contribution-multiplier-not-persistable", key };
  }

  const retireAge = finite(scenario.retireAge);
  const livingCostMonthly = rounded(scenario.livingCostMonthly);
  if (retireAge === null || livingCostMonthly === null
      || retireAge < 0 || retireAge > MAX_RETIRE_AGE
      || livingCostMonthly < 0 || livingCostMonthly > MAX_LIVING_COST_MONTHLY) {
    return { ok: false, reason: "invalid-scenario", key };
  }
  const currentAge = finite(currentSnapshot?.currentAge);
  const deathAge = finite(currentSnapshot?.deathAge);
  if ((currentAge !== null && retireAge < currentAge) || (deathAge !== null && retireAge > deathAge)) {
    return { ok: false, reason: "retire-age-out-of-range", key };
  }

  const currentFingerprint = agentSettingsFingerprint(currentSnapshot);
  if (baselineFingerprint !== currentFingerprint) {
    return { ok: false, reason: "stale-baseline", key, currentFingerprint };
  }
  if (scenarioMatchesSnapshot(currentSnapshot, scenario)) {
    return { ok: false, reason: "no-op-scenario", key, currentFingerprint };
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
  if (!Number.isFinite(retireAge) || !Number.isFinite(livingCostMonthly)
      || retireAge < 0 || retireAge > MAX_RETIRE_AGE
      || livingCostMonthly < 0 || livingCostMonthly > MAX_LIVING_COST_MONTHLY) {
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


export function buildAgentChangeRecord({ currentSnapshot, scenario, appliedAt = Date.now() } = {}) {
  const before = agentSnapshotSettings(currentSnapshot);
  const key = agentScenarioKey(scenario);
  if (!before || !key || !scenario) return null;
  const after = {
    country: before.country,
    retireAge: Math.round(Number(scenario.retireAge) * 12) / 12,
    livingCostMonthly: rounded(scenario.livingCostMonthly),
  };
  if (!Number.isFinite(after.retireAge) || after.livingCostMonthly === null) return null;
  return {
    version: 1,
    key,
    appliedAt: Number(appliedAt) || 0,
    country: before.country,
    before,
    after,
  };
}

export function validateAgentChangeUndo({ record, currentSnapshot } = {}) {
  if (!record || typeof record !== "object" || record.version !== 1 || !record.before || !record.after) {
    return { ok: false, reason: "missing-record" };
  }
  const recordCountry = String(record.country || record.after.country || "").trim().toUpperCase();
  if (!SUPPORTED.has(recordCountry)) return { ok: false, reason: "invalid-record" };

  const beforeRetire = finite(record.before.retireAge);
  const beforeLiving = rounded(record.before.livingCostMonthly);
  const afterRetire = finite(record.after.retireAge);
  const afterLiving = rounded(record.after.livingCostMonthly);
  if (beforeRetire === null || afterRetire === null || beforeLiving === null || afterLiving === null
      || beforeRetire < 0 || beforeRetire > MAX_RETIRE_AGE
      || afterRetire < 0 || afterRetire > MAX_RETIRE_AGE
      || beforeLiving < 0 || beforeLiving > MAX_LIVING_COST_MONTHLY
      || afterLiving < 0 || afterLiving > MAX_LIVING_COST_MONTHLY) {
    return { ok: false, reason: "invalid-record" };
  }

  const current = agentSnapshotSettings(currentSnapshot);
  if (!current) return { ok: false, reason: "invalid-current" };
  if (current.country !== recordCountry) {
    return { ok: false, reason: "country-changed" };
  }
  const matchesAfter = Math.abs(current.retireAge - afterRetire) < 1e-9
    && current.livingCostMonthly === afterLiving;
  if (!matchesAfter) return { ok: false, reason: "settings-changed" };
  return { ok: true, reason: null };
}

export function undoAgentChangeToInputs(inputs, country, record) {
  if (!record?.before) return { ok: false, reason: "missing-record", nextInputs: inputs };
  return applyAgentScenarioToInputs(inputs, country, {
    retireAge: record.before.retireAge,
    livingCostMonthly: record.before.livingCostMonthly,
    contributionMultiplier: 1,
  });
}
