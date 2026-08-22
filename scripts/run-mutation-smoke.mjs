import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitestBin = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "vitest.cmd" : "vitest");

const mutants = [
  ["JP NISA tsumitate annual limit", "countryRules/JP.js", "annualInstallmentLimit: 1200000", "annualInstallmentLimit: 1200001", "jpRulesCritical.test.js"],
  ["JP NISA growth annual limit", "countryRules/JP.js", "annualGrowthLimit: 2400000", "annualGrowthLimit: 2400001", "jpRulesCritical.test.js"],
  ["JP NISA growth lifetime limit", "countryRules/JP.js", "growthLifetimeLimit: 12000000", "growthLifetimeLimit: 11999999", "jpRulesCritical.test.js"],
  ["JP NISA lifetime limit", "countryRules/JP.js", "taxFreeInvestmentLimit: 18000000", "taxFreeInvestmentLimit: 17999999", "jpRulesCritical.test.js"],
  ["US 401k employee limit", "countryRules/US.js", "employeeDeferral: 24500", "employeeDeferral: 24501", "usBoundaries.test.js"],
  ["US IRA limit", "countryRules/US.js", "contribution: 7500", "contribution: 7501", "usBoundaries.test.js"],
  ["US single standard deduction", "countryRules/US.js", "single: 16100", "single: 16101", "usBoundaries.test.js"],
  ["GB ISA annual allowance", "countryRules/GB.js", "isaAnnualAllowance: 20000", "isaAnnualAllowance: 20001", "gbBoundaries.test.js"],
  ["GB pension annual allowance", "countryRules/GB.js", "pensionAnnualAllowance: 60000", "pensionAnnualAllowance: 60001", "gbBoundaries.test.js"],
  ["GB pension threshold income", "countryRules/GB.js", "pensionTaperThresholdIncome: 200000", "pensionTaperThresholdIncome: 200001", "gbBoundaries.test.js"],
  ["GB pension adjusted income", "countryRules/GB.js", "pensionTaperAdjustedIncome: 260000", "pensionTaperAdjustedIncome: 260001", "gbBoundaries.test.js"],
  ["CA TFSA annual limit", "countryRules/CA.js", "tfsaAnnualLimit: 7000", "tfsaAnnualLimit: 7001", "caBoundaries.test.js"],
  ["CA RRSP dollar limit", "countryRules/CA.js", "rrspAnnualDollarLimit: 33810", "rrspAnnualDollarLimit: 33811", "caBoundaries.test.js"],
  ["CA current OAS clawback threshold", "countryRules/CA.js", "recoveryTaxThreshold2025: 93454", "recoveryTaxThreshold2025: 93455", "caBoundaries.test.js"],
  ["CA next OAS clawback threshold", "countryRules/CA.js", "recoveryTaxThreshold2026: 95323", "recoveryTaxThreshold2026: 95324", "caBoundaries.test.js"],
  ["AU concessional cap", "countryRules/AU.js", "concessionalCap: 32500", "concessionalCap: 32501", "auBoundaries.test.js"],
  ["AU non-concessional cap", "countryRules/AU.js", "nonConcessionalCap: 130000", "nonConcessionalCap: 130001", "auBoundaries.test.js"],
  ["i18n English fallback", "translations/index.js", "const fallbackLanguage = lang === \"ja\" || lang.startsWith(\"ja-\") ? \"ja\" : \"en\";", "const fallbackLanguage = \"ja\";", "i18nStrict.test.js"],
  ["Rule source alert survives fetch error", "scripts/check-rule-sources.mjs", "checkedAt: now, changed: !!old?.changed, previousHash", "checkedAt: now, changed: false, previousHash", "ruleSourceAutomation.test.js"],
  ["Rule source acknowledgement is version-specific", "App.jsx", "return !item.hash || acknowledgedHash !== item.hash;", "return !item.hash || !!acknowledgedHash;", "ruleSourceAcknowledgement.test.js"],
  ["Rule update persistence uses latest state", "App.jsx", 'typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater', 'typeof nextOrUpdater === "function" ? nextOrUpdater : nextOrUpdater', "ruleUpdateStateConcurrency.test.js"],
  ["Rule check timestamp requires both feeds", "App.jsx", "if (manifestChecked && sourceStatusChecked) {", "if (manifestChecked || sourceStatusChecked) {", "ruleUpdateCheckIntegrity.test.js"],
  ["Rule manifest requires documented schema", "utils/ruleUpdates.js", "if (payload.schemaVersion !== 1 || !Array.isArray(payload.updates) || payload.updates.length > MAX_REMOTE_RULE_UPDATES) return null;", "if (!Array.isArray(payload.updates) || payload.updates.length > MAX_REMOTE_RULE_UPDATES) return null;", "ruleUpdateManifestAtomicValidation.test.js"],
  ["Rule source status URL is registry-bound", "utils/ruleUpdates.js", "url: safeRuleSourceUrl(registered.url)", "url: safeRuleSourceUrl(item.url)", "ruleSourceFeedAtomicValidation.test.js"],
  ["Rule source watcher caps streamed bodies", "scripts/check-rule-sources.mjs", "if (total > MAX_SOURCE_RESPONSE_BYTES) {", "if (total > Number.MAX_SAFE_INTEGER) {", "ruleSourceWatcherHardening.test.js"],
  ["Rule source watcher rejects tiny bodies", "scripts/check-rule-sources.mjs", "if (normalized.length < MIN_NORMALIZED_SOURCE_CHARS) {", "if (normalized.length < 0) {", "ruleSourceWatcherHardening.test.js"],
  ["Rule source feed requires one pass timestamp", "utils/ruleUpdates.js", "if (!itemCheckedAt || itemCheckedAt !== feedCheckedAt) return null;", "if (!itemCheckedAt) return null;", "ruleSourceStatusCompleteness.test.js"],
  ["Rule source feed rejects watcher errors", "utils/ruleUpdates.js", "if (typeof item.error === \"string\" && item.error.trim()) return null;", "if (typeof item.error === \"string\" && false) return null;", "ruleSourceStatusCompleteness.test.js"],
  ["Rule check timestamp comes from watcher feed", "App.jsx", "const checkedAt = sourceCheckedAt;", "const checkedAt = new Date().toISOString();", "ruleUpdateCheckIntegrity.test.js"],
  ["Remote JSON streaming cap is enforced", "utils/remoteJson.js", "if (totalBytes > maxChars) {", "if (totalBytes > Number.MAX_SAFE_INTEGER) {", "remoteJsonBoundary.test.js"],
  ["Remote rule feed fetch has a finite timeout", "utils/remoteJson.js", "export const RULE_FEED_FETCH_TIMEOUT_MS = 15_000;", "export const RULE_FEED_FETCH_TIMEOUT_MS = 0;", "remoteJsonBoundary.test.js"],
  ["Remote rule manifest rejects duplicate approval IDs", "utils/ruleUpdates.js", "if (!id || !country || seen.has(id)) return null;", "if (!id || !country) return null;", "ruleUpdateManifestAtomicValidation.test.js"],
  ["Autosave writes are serialized", "App.jsx", "saveQueueRef.current = saveQueueRef.current.then(run, run);", "saveQueueRef.current = run();", "persistenceSaveOrdering.test.js"],
  ["Stale autosave completion cannot claim saved", "App.jsx", "if (generation !== saveGenerationRef.current) return;\n        setHistory((prev) => {", "if (false) return;\n        setHistory((prev) => {", "persistenceSaveOrdering.test.js"],
  ["Semantic persisted data is recovered before fallback", "App.jsx", "if (rawPersistedValue !== null) {", "if (false) {", "backupRestoreAtomicity.test.js"],
  ["Current backup country maps reject unknown buckets", "utils/countryProfiles.js", "if (!PROFILE_COUNTRIES.includes(code) || seen.has(code)) return false;", "if (seen.has(code)) return false;", "backupRestoreAtomicity.test.js"],
  ["Stale history reads cannot repaint another country", "App.jsx", "      if (requestGeneration !== historyRequestGenerationRef.current) return;\n      const clean = entries.map", "      if (false) return;\n      const clean = entries.map", "countryHistoryAsyncBoundary.test.js"],
  ["Country switch normalizes stored watchlists", "App.jsx", "[currentCountry]: normalizeStockWatchlist(watchlist, currentCountry)", "[currentCountry]: watchlist", "countryHistoryAsyncBoundary.test.js"],
  ["Engine always splits at retirement boundary", "lifePlanEngine.js", "const steps = buildAgeSteps(currentAge, deathAge, [...(p.boundaries || []), retireAge]);", "const steps = buildAgeSteps(currentAge, deathAge, p.boundaries);", "fiveCountryCalculationBoundaryFinal.test.js"],
  ["Scenario uses exact retirement-boundary net worth", "utils/scenarioComparison.js", "Number.isFinite(result.netWorthAtRetire)", "false", "fiveCountryCalculationBoundaryFinal.test.js"],
  ["Negative retirement living cost cannot enter the plan", "utils/buildPlanInput.js", "Math.max(0, Number(overrides.livingCostMonthly))", "Number(overrides.livingCostMonthly)", "fiveCountryCalculationBoundaryFinal.test.js"],
  ["Current persisted profiles reject unknown country buckets", "utils/countryProfiles.js", "!isPlainRecord(p.profiles) || !hasOnlySupportedCountryKeys(p.profiles)", "!isPlainRecord(p.profiles)", "finalPersistenceSchemaBoundary.test.js"],
  ["Current persisted watchlists validate before load", "App.jsx", "const parsedStorageVersion = normalizeProfileStorageVersion(parsed.profileStorageVersion);\n          if (parsedStorageVersion === PROFILE_STORAGE_VERSION && parsed.watchlists !== undefined && (", "const parsedStorageVersion = normalizeProfileStorageVersion(parsed.profileStorageVersion);\n          if (false && parsed.watchlists !== undefined && (", "finalPersistenceSchemaBoundary.test.js"],
  ["Bank retirement value is captured before the next birthday", "utils/simulations.js", "if (totalAtRetire === null && age >= retireAge) {", "if (false) {", "bankRetirementBoundaryFinal.test.js"],
  ["Regression workflow verifies production build", ".github/workflows/test.yml", "run: npm run build", "run: echo skip-build", "finalWorkflowIntegrity.test.js"],
  ["Engine preserves full retirement snapshot", "lifePlanEngine.js", "retireSnapshot = snapshot(age);", "retireSnapshot = null;", "retirementSnapshotUiBoundary.test.js"],
  ["UI retirement breakdown uses exact retirement snapshot", "App.jsx", "return integrated.retireSnapshot;", "return rows[rows.length - 1];", "retirementSnapshotUiBoundary.test.js"],
  ["US 2026 Roth catch-up threshold is enforced", "countryRules/US.js", "wages > this.limits2026.k401.rothCatchUpPriorYearWageThreshold", "wages >= 999999999", "overseas100Phase1.test.js"],
  ["GB pension carry forward expands effective allowance", "countryRules/GB.js", "+ this.getPensionCarryForwardAvailable(availableFromPrior3Years);", "+ 0;", "overseas100Phase1.test.js"],
  ["CA RRIF spouse-age election changes minimum factor", "countryRules/CA.js", "useSpouseAge && spouse > 0 ? spouse : owner", "false ? spouse : owner", "overseas100Phase1.test.js"],
  ["AU transfer balance cap detects excess", "countryRules/AU.js", "excess: Math.max(0, balance - cap)", "excess: 0", "overseas100Phase1.test.js"],
  ["US 2026 estate exclusion is protected", "countryRules/US.js", "basicExclusionAmount: 15000000", "basicExclusionAmount: 14000000", "overseasHundredPhase2.test.js"],
  ["GB Lifetime ISA bonus rate is protected", "countryRules/GB.js", "governmentBonusRate: 0.25", "governmentBonusRate: 0.20", "overseasHundredPhase2.test.js"],
  ["CA RRSP withdrawal top withholding rate is protected", "countryRules/CA.js", "{ upTo: Infinity, rate: 0.30, quebecFederalRate: 0.15 }", "{ upTo: Infinity, rate: 0.20, quebecFederalRate: 0.15 }", "overseasHundredPhase2.test.js"],
  ["AU younger-partner super exclusion is protected", "countryRules/AU.js", "return age >= this.agePension.qualifyingAge || !!isReceivingSuperPension;", "return true;", "overseasHundredPhase2.test.js"],
  ["GB LISA is included in the total ISA allowance", "countryRules/GB.js", "+ this._num((accounts.lifetimeIsa || {}).annualContribution);", "+ 0;", "overseasHundredPhase3.test.js"],
  ["GB LISA projection includes the 25 percent bonus", "countryRules/GB.js", "return eligible + (eligible * this.lifetimeIsa.governmentBonusRate);", "return eligible;", "overseasHundredPhase3.test.js"],
  ["GB LISA retirement access remains age 60", "utils/buildPlanInput.js", ": (isLifetimeIsa ? rules.investment.lifetimeIsa.retirementWithdrawalAge : 0),", ": 0,", "overseasHundredPhase3.test.js"],
  ["CA QPP late-claim increase is 0.7 percent monthly", "countryRules/CA.js", "earlyReductionPerMonthDefault: 0.006,\n      lateIncreasePerMonth: 0.007,", "earlyReductionPerMonthDefault: 0.006,\n      lateIncreasePerMonth: 0.006,", "overseasHundredPhase4.test.js"],
  ["CA QPP age-72 access is protected", "countryRules/CA.js", "latestAge: 72,", "latestAge: 70,", "overseasHundredPhase4.test.js"],
  ["CA QPP early reduction lower bound is protected", "countryRules/CA.js", "earlyReductionPerMonthMin: 0.005,", "earlyReductionPerMonthMin: 0.004,", "overseasHundredPhase4.test.js"],
  ["AU partner age advances with claimant age", "countryRules/AU.js", "return Math.max(0, (Number(currentPartnerAge) || 0) + ((Number(claimantTargetAge) || 0) - (Number(claimantCurrentAge) || 0)));", "return Math.max(0, Number(currentPartnerAge) || 0);", "overseasHundredPhase5.test.js"],
  ["AU younger partner Super becomes assessable at 67", "countryRules/AU.js", "return age >= this.agePension.qualifyingAge || !!isReceivingSuperPension;", "return !!isReceivingSuperPension;", "overseasHundredPhase5.test.js"],
  ["AU partner Super projection respects contribution end age", "countryRules/AU.js", "if (age < endAge) balance += annual;", "if (age <= endAge) balance += annual;", "overseasHundredPhase5.test.js"],
  ["US 2026 New York estate exemption is protected", "countryRules/US.js", "NY: { estate: true, inheritance: false, exemption: 7350000", "NY: { estate: true, inheritance: false, exemption: 7000000", "overseasHundredPhase6.test.js"],
  ["US Maryland keeps both death-tax types", "countryRules/US.js", "MD: { estate: true, inheritance: true, exemption: 5000000", "MD: { estate: true, inheritance: false, exemption: 5000000", "overseasHundredPhase6.test.js"],
  ["US Pennsylvania remains inheritance-tax only", "countryRules/US.js", "PA: { estate: false, inheritance: true, exemption: null, rateMin: 0, rateMax: 0.15 }", "PA: { estate: false, inheritance: false, exemption: null, rateMin: 0, rateMax: 0.15 }", "overseasHundredPhase6.test.js"],
  ["GB employee NI main rate is protected", "countryRules/GB.js", "mainRate: 0.08,", "mainRate: 0.07,", "overseasHundredPhase7.test.js"],
  ["GB employee NI upper rate is protected", "countryRules/GB.js", "additionalRate: 0.02,", "additionalRate: 0.03,", "overseasHundredPhase7.test.js"],
  ["GB employee NI upper earnings limit is protected", "countryRules/GB.js", "upperEarningsLimitAnnual: 50270,", "upperEarningsLimitAnnual: 49270,", "overseasHundredPhase7.test.js"],
  ["CA 2026 CPP employee rate is protected", "countryRules/CA.js", "cppRate: 0.0595,", "cppRate: 0.0585,", "overseasHundredPhase8.test.js"],
  ["CA 2026 EI maximum insurable earnings is protected", "countryRules/CA.js", "eiMaxInsurableEarnings: 68900,", "eiMaxInsurableEarnings: 67900,", "overseasHundredPhase8.test.js"],
  ["CA 2026 Quebec EI rate is protected", "countryRules/CA.js", "eiQuebecRate: 0.0130,", "eiQuebecRate: 0.0140,", "overseasHundredPhase8.test.js"],

  ["CA 2026 QPIP maximum insurable earnings is protected", "countryRules/CA.js", "qpipMaxInsurableEarnings: 103000,", "qpipMaxInsurableEarnings: 102000,", "overseasHundredPhase9.test.js"],
  ["CA 2026 QPIP employee rate is protected", "countryRules/CA.js", "qpipEmployeeRate: 0.00430,", "qpipEmployeeRate: 0.00420,", "overseasHundredPhase9.test.js"],
  ["CA QPIP applies only in Quebec", "countryRules/CA.js", "if (!isQuebec) return 0;", "if (isQuebec) return 0;", "overseasHundredPhase9.test.js"],

  ["CA Quebec 2026 first tax threshold is protected", "countryRules/CA.js", "{ upTo: 54345, rate: 0.14 },", "{ upTo: 53345, rate: 0.14 },", "overseasHundredPhase10.test.js"],
  ["CA Quebec 2026 basic personal amount is protected", "countryRules/CA.js", "basicPersonalAmount: 18952,", "basicPersonalAmount: 17952,", "overseasHundredPhase10.test.js"],
  ["CA Quebec federal abatement 16.5 percent is protected", "countryRules/CA.js", "federalAbatementRate: 0.165,", "federalAbatementRate: 0.155,", "overseasHundredPhase10.test.js"],

  ["CA death deemed-disposition inclusion rate is protected", "countryRules/CA.js", "capitalGainsInclusionRate: 0.50,", "capitalGainsInclusionRate: 0.40,", "overseasHundredPhase11.test.js"],
  ["CA death spouse rollover is protected", "countryRules/CA.js", "const rollover = !!transferToSpouseOrCommonLaw && !!spouseResidentInCanada;", "const rollover = !!transferToSpouseOrCommonLaw;", "overseasHundredPhase11.test.js"],
  ["CA principal-residence death exclusion is protected", "countryRules/CA.js", "if (rollover || principalResidence) {", "if (rollover) {", "overseasHundredPhase11.test.js"],

  ["CA BC 2026 first bracket rate is protected", "countryRules/CA.js", "{ upTo: 50363, rate: 0.056 },", "{ upTo: 50363, rate: 0.0506 },", "overseasHundredPhase12.test.js"],
  ["CA BC 2026 basic personal amount is protected", "countryRules/CA.js", "basicPersonalAmount: 13216,", "basicPersonalAmount: 12216,", "overseasHundredPhase12.test.js"],
  ["CA BC 2026 tax reduction max is protected", "countryRules/CA.js", "taxReductionMax: 690,", "taxReductionMax: 575,", "overseasHundredPhase12.test.js"],

  ["CA Alberta 2026 first bracket rate is protected", "countryRules/CA.js", "{ upTo: 61200, rate: 0.08 },", "{ upTo: 61200, rate: 0.07 },", "overseasHundredPhase13.test.js"],
  ["CA Alberta 2026 basic personal amount is protected", "countryRules/CA.js", "basicPersonalAmount: 22769,", "basicPersonalAmount: 21769,", "overseasHundredPhase13.test.js"],
  ["CA Alberta 2026 top bracket is protected", "countryRules/CA.js", "{ upTo: Infinity, rate: 0.15 },", "{ upTo: Infinity, rate: 0.14 },", "overseasHundredPhase13.test.js"],

  ["CA Manitoba first bracket rate is protected", "countryRules/CA.js", "{ upTo: 47564, rate: 0.108 },", "{ upTo: 47564, rate: 0.10 },", "overseasHundredPhase14.test.js"],
  ["CA Manitoba basic personal amount is protected", "countryRules/CA.js", "basicPersonalAmount: 15780,", "basicPersonalAmount: 14780,", "overseasHundredPhase14.test.js"],
  ["CA Manitoba top bracket rate is protected", "countryRules/CA.js", "{ upTo: Infinity, rate: 0.174 },", "{ upTo: Infinity, rate: 0.16 },", "overseasHundredPhase14.test.js"],

  ["CA Saskatchewan first bracket rate is protected", "countryRules/CA.js", "{ upTo: 54532, rate: 0.105 },", "{ upTo: 54532, rate: 0.10 },", "overseasHundredPhase15.test.js"],
  ["CA Saskatchewan basic personal amount is protected", "countryRules/CA.js", "basicPersonalAmount: 20381,", "basicPersonalAmount: 19381,", "overseasHundredPhase15.test.js"],
  ["CA Saskatchewan top bracket rate is protected", "countryRules/CA.js", "{ upTo: Infinity, rate: 0.145 },", "{ upTo: Infinity, rate: 0.14 },", "overseasHundredPhase15.test.js"],

];

if (!fs.existsSync(vitestBin)) {
  console.error(`vitest binary not found: ${vitestBin}`);
  process.exit(2);
}

let killed = 0;
const survivors = [];
for (const [name, rel, from, to, testFile] of mutants) {
  const file = path.join(ROOT, rel);
  const original = fs.readFileSync(file, "utf8");
  const occurrences = original.split(from).length - 1;
  if (occurrences !== 1) {
    console.error(`INVALID MUTANT: ${name} (expected one source match, got ${occurrences})`);
    survivors.push(`${name} [invalid definition]`);
    continue;
  }
  try {
    fs.writeFileSync(file, original.replace(from, to));
    const r = spawnSync(vitestBin, ["run", testFile, "--reporter=dot"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, CI: "1" },
    });
    if (r.status !== 0) {
      killed += 1;
      console.log(`✓ killed: ${name}`);
    } else {
      survivors.push(name);
      console.error(`✗ SURVIVED: ${name}`);
    }
  } finally {
    fs.writeFileSync(file, original);
  }
}

console.log(`mutation smoke: ${killed}/${mutants.length} killed`);
if (survivors.length) {
  console.error(`survivors: ${survivors.join(", ")}`);
  process.exit(1);
}
