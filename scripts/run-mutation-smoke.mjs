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
  ["CA Alberta 2026 top bracket is protected", "countryRules/CA.js", "{ upTo: 370220, rate: 0.14 },\n          { upTo: Infinity, rate: 0.15 },", "{ upTo: 370220, rate: 0.14 },\n          { upTo: Infinity, rate: 0.14 },", "overseasHundredPhase13.test.js"],

  ["CA Manitoba first bracket rate is protected", "countryRules/CA.js", "{ upTo: 47564, rate: 0.108 },", "{ upTo: 47564, rate: 0.10 },", "overseasHundredPhase14.test.js"],
  ["CA Manitoba basic personal amount is protected", "countryRules/CA.js", "basicPersonalAmount: 15780,", "basicPersonalAmount: 14780,", "overseasHundredPhase14.test.js"],
  ["CA Manitoba top bracket rate is protected", "countryRules/CA.js", "{ upTo: Infinity, rate: 0.174 },", "{ upTo: Infinity, rate: 0.16 },", "overseasHundredPhase14.test.js"],

  ["CA Saskatchewan first bracket rate is protected", "countryRules/CA.js", "{ upTo: 54532, rate: 0.105 },", "{ upTo: 54532, rate: 0.10 },", "overseasHundredPhase15.test.js"],
  ["CA Saskatchewan basic personal amount is protected", "countryRules/CA.js", "basicPersonalAmount: 20381,", "basicPersonalAmount: 19381,", "overseasHundredPhase15.test.js"],
  ["CA Saskatchewan top bracket rate is protected", "countryRules/CA.js", "{ upTo: Infinity, rate: 0.145 },", "{ upTo: Infinity, rate: 0.14 },", "overseasHundredPhase15.test.js"],

  ["CA Nova Scotia first bracket rate is protected", "countryRules/CA.js", "{ upTo: 30995, rate: 0.0879 },", "{ upTo: 30995, rate: 0.08 },", "overseasHundredPhase16.test.js"],
  ["CA Nova Scotia basic personal amount is protected", "countryRules/CA.js", "basicPersonalAmount: 11932,", "basicPersonalAmount: 10932,", "overseasHundredPhase17.test.js"],
  ["CA Nova Scotia top bracket rate is protected", "countryRules/CA.js", "{ upTo: Infinity, rate: 0.21 },", "{ upTo: Infinity, rate: 0.20 },", "overseasHundredPhase16.test.js"],

  ["CA New Brunswick first bracket rate is protected", "countryRules/CA.js", "{ upTo: 52333, rate: 0.094 },", "{ upTo: 52333, rate: 0.084 },", "overseasHundredPhase18.test.js"],
  ["CA New Brunswick basic personal amount is protected", "countryRules/CA.js", "basicPersonalAmount: 13664,", "basicPersonalAmount: 12664,", "overseasHundredPhase18.test.js"],
  ["CA New Brunswick top bracket rate is protected", "countryRules/CA.js", "{ upTo: Infinity, rate: 0.195 },", "{ upTo: Infinity, rate: 0.185 },", "overseasHundredPhase18.test.js"],

  ["CA PEI first bracket rate is protected", "countryRules/CA.js", "{ upTo: 33928, rate: 0.095 },", "{ upTo: 33928, rate: 0.085 },", "overseasHundredPhase19.test.js"],
  ["CA PEI basic personal amount is protected", "countryRules/CA.js", "basicPersonalAmount: 15000,", "basicPersonalAmount: 14000,", "overseasHundredPhase19.test.js"],
  ["CA PEI new top bracket is protected", "countryRules/CA.js", "{ upTo: Infinity, rate: 0.20 },", "{ upTo: Infinity, rate: 0.19 },", "overseasHundredPhase19.test.js"],

  ["CA RESP lifetime contribution limit is protected", "countryRules/CA.js", "lifetimeContributionLimit: 50000,\n      cesgBasicRate: 0.20,", "lifetimeContributionLimit: 49000,\n      cesgBasicRate: 0.20,", "overseasHundredPhase21.test.js"],
  ["CA RESP CESG lifetime max is protected", "countryRules/CA.js", "cesgLifetimeMax: 7200,", "cesgLifetimeMax: 7000,", "overseasHundredPhase21.test.js"],
  ["CA RDSP lifetime contribution limit is protected", "countryRules/CA.js", "lifetimeContributionLimit: 200000,\n      contributionLastAge: 59,", "lifetimeContributionLimit: 190000,\n      contributionLastAge: 59,", "overseasHundredPhase21.test.js"],
  ["CA RDSP grant annual max is protected", "countryRules/CA.js", "grantAnnualMax: 3500,", "grantAnnualMax: 3000,", "overseasHundredPhase21.test.js"],

  ["GB Junior ISA annual limit is protected", "countryRules/GB.js", "annualContributionLimit: 9000,", "annualContributionLimit: 8000,", "overseasHundredPhase22.test.js"],
  ["GB Junior ISA access age is protected", "countryRules/GB.js", "accessAge: 18,\n      unusedAllowanceCarryForward: false,", "accessAge: 17,\n      unusedAllowanceCarryForward: false,", "overseasHundredPhase22.test.js"],
  ["GB child pension gross no-earnings floor is protected", "countryRules/GB.js", "grossReliefFloorWithoutEarnings: 3600,", "grossReliefFloorWithoutEarnings: 3500,", "overseasHundredPhase22.test.js"],
  ["GB child pension net no-earnings floor is protected", "countryRules/GB.js", "netReliefFloorWithoutEarnings: 2880,", "netReliefFloorWithoutEarnings: 2800,", "overseasHundredPhase22.test.js"],
  ["GB child pension relief-at-source rate is protected", "countryRules/GB.js", "reliefAtSourceRate: 0.20,", "reliefAtSourceRate: 0.19,", "overseasHundredPhase22.test.js"],
  ["GB child pension future access age is protected", "countryRules/GB.js", "normalMinimumPensionAge: 57,", "normalMinimumPensionAge: 56,", "overseasHundredPhase22.test.js"],

  ["GB child pension death exception is protected", "countryRules/GB.js", "deathBeforeAccessAge: true,", "deathBeforeAccessAge: false,", "overseasHundredPhase23.test.js"],
  ["GB child pension serious-ill-health exception is protected", "countryRules/GB.js", "seriousIllHealthBeforeAccessAge: true,", "seriousIllHealthBeforeAccessAge: false,", "overseasHundredPhase23.test.js"],
  ["GB child pension ordinary early withdrawal lock is protected", "countryRules/GB.js", "ordinaryEarlyWithdrawal: false,", "ordinaryEarlyWithdrawal: true,", "overseasHundredPhase23.test.js"],
  ["GB child pension provider boundary is protected", "countryRules/GB.js", "providerSpecificTermsModelled: false,", "providerSpecificTermsModelled: true,", "overseasHundredPhase23.test.js"],

  ["GB 2027 under-65 Cash ISA limit is protected", "countryRules/GB.js", "cashIsaLimitUnder65From2027: 12000,", "cashIsaLimitUnder65From2027: 13000,", "overseasHundredPhase24.test.js"],
  ["GB 2027 age-65-plus Cash ISA limit is protected", "countryRules/GB.js", "cashIsaLimitAge65PlusFrom2027: 20000,", "cashIsaLimitAge65PlusFrom2027: 19000,", "overseasHundredPhase24.test.js"],
  ["GB 2027 non-Cash ISA cash-interest charge is protected", "countryRules/GB.js", "nonCashIsaCashInterestChargeRateFrom2027: 0.22,", "nonCashIsaCashInterestChargeRateFrom2027: 0.20,", "overseasHundredPhase24.test.js"],
  ["GB carry-forward oldest-first allocation is protected", "countryRules/GB.js", "for (const row of history) {", "for (const row of history.slice().reverse()) {", "overseasHundredPhase24.test.js"],

  ["GB State Pension minimum qualifying years is protected", "countryRules/GB.js", "minimumQualifyingYears: 10,\n      fullRateQualifyingYears: 35,", "minimumQualifyingYears: 9,\n      fullRateQualifyingYears: 35,", "overseasHundredPhase25.test.js"],
  ["GB State Pension full-rate qualifying years is protected", "countryRules/GB.js", "minimumQualifyingYears: 10,\n      fullRateQualifyingYears: 35,", "minimumQualifyingYears: 10,\n      fullRateQualifyingYears: 34,", "overseasHundredPhase25.test.js"],
  ["GB Pension Credit single guarantee is protected", "countryRules/GB.js", "single: 238.00,\n        couple: 363.25,", "single: 237.00,\n        couple: 363.25,", "overseasHundredPhase25.test.js"],
  ["GB Pension Credit couple guarantee is protected", "countryRules/GB.js", "single: 238.00,\n        couple: 363.25,", "single: 238.00,\n        couple: 362.25,", "overseasHundredPhase25.test.js"],
  ["GB Pension Credit severe-disability addition is protected", "countryRules/GB.js", "single: 86.05,\n        coupleOneQualifies: 86.05,", "single: 85.05,\n        coupleOneQualifies: 86.05,", "overseasHundredPhase25.test.js"],
  ["GB Pension Credit carer addition is protected", "countryRules/GB.js", "carerAdditionalWeekly: 48.15,", "carerAdditionalWeekly: 47.15,", "overseasHundredPhase25.test.js"],

  ["GB Pension Credit capital disregard is protected", "countryRules/GB.js", "disregard: 10000,\n        tariffUnit: 500,", "disregard: 9999,\n        tariffUnit: 500,", "overseasHundredPhase26.test.js"],
  ["GB Pension Credit capital tariff unit is protected", "countryRules/GB.js", "disregard: 10000,\n        tariffUnit: 500,", "disregard: 10000,\n        tariffUnit: 499,", "overseasHundredPhase26.test.js"],
  ["GB Pension Credit tariff income rate is protected", "countryRules/GB.js", "tariffIncomePerUnitWeekly: 1,\n        upperLimit: null,", "tariffIncomePerUnitWeekly: 2,\n        upperLimit: null,", "overseasHundredPhase26.test.js"],
  ["GB Pension Credit partial tariff unit is protected", "countryRules/GB.js", "Math.ceil(excess / rules.tariffUnit)", "Math.floor(excess / rules.tariffUnit)", "overseasHundredPhase26.test.js"],

  ["GB Savings Credit single threshold is protected", "countryRules/GB.js", "singleThresholdWeekly: 208.07,\n        coupleThresholdWeekly: 329.75,", "singleThresholdWeekly: 207.07,\n        coupleThresholdWeekly: 329.75,", "overseasHundredPhase27.test.js"],
  ["GB Savings Credit couple threshold is protected", "countryRules/GB.js", "singleThresholdWeekly: 208.07,\n        coupleThresholdWeekly: 329.75,", "singleThresholdWeekly: 208.07,\n        coupleThresholdWeekly: 328.75,", "overseasHundredPhase27.test.js"],
  ["GB Savings Credit single maximum is protected", "countryRules/GB.js", "singleMaximumWeekly: 17.96,\n        coupleMaximumWeekly: 20.10,", "singleMaximumWeekly: 16.96,\n        coupleMaximumWeekly: 20.10,", "overseasHundredPhase27.test.js"],
  ["GB Savings Credit couple maximum is protected", "countryRules/GB.js", "singleMaximumWeekly: 17.96,\n        coupleMaximumWeekly: 20.10,", "singleMaximumWeekly: 17.96,\n        coupleMaximumWeekly: 19.10,", "overseasHundredPhase27.test.js"],
  ["GB Savings Credit Amount A 60 percent rate is protected", "countryRules/GB.js", "amountARate: 0.60,\n        amountBRate: 0.40,", "amountARate: 0.50,\n        amountBRate: 0.40,", "overseasHundredPhase27.test.js"],
  ["GB Savings Credit Amount B 40 percent rate is protected", "countryRules/GB.js", "amountARate: 0.60,\n        amountBRate: 0.40,", "amountARate: 0.60,\n        amountBRate: 0.30,", "overseasHundredPhase27.test.js"],

  ["GB Pension Credit mixed-age rule date is protected", "countryRules/GB.js", "newClaimRuleFrom: \"2019-05-15\",\n        bothPartnersNormallyMustReachQualifyingAge: true,", "newClaimRuleFrom: \"2019-05-16\",\n        bothPartnersNormallyMustReachQualifyingAge: true,", "overseasHundredPhase28.test.js"],
  ["GB Pension Credit mixed-age continuity cutoff is protected", "countryRules/GB.js", "protectedContinuityCutoff: \"2019-05-14\",\n        pensionAgeHousingBenefitCanPreserveEligibility: true,", "protectedContinuityCutoff: \"2019-05-13\",\n        pensionAgeHousingBenefitCanPreserveEligibility: true,", "overseasHundredPhase28.test.js"],
  ["GB Pension Credit normally requires both partners at age", "countryRules/GB.js", "claimantAtAge && partnerAtAge", "claimantAtAge || partnerAtAge", "overseasHundredPhase28.test.js"],
  ["GB Pension Credit protected mixed-age continuity is protected", "countryRules/GB.js", "protectedMixedAgeContinuity === true ||\n        pensionAgeHousingBenefitContinuity === true", "protectedMixedAgeContinuity === false ||\n        pensionAgeHousingBenefitContinuity === true", "overseasHundredPhase28.test.js"],

  ["GB Pension Credit single earnings disregard is protected", "countryRules/GB.js", "status === \"couple\" ? 10 : 5", "status === \"couple\" ? 10 : 6", "overseasHundredPhase29.test.js"],
  ["GB Pension Credit higher earnings disregard is protected", "countryRules/GB.js", "higherEarningsDisregard ? 20 : normalEarningsDisregard", "higherEarningsDisregard ? 21 : normalEarningsDisregard", "overseasHundredPhase29.test.js"],
  ["GB Pension Credit assessable income includes tariff income", "countryRules/GB.js", "nonNegative(otherCountedIncomeWeekly) +\n        tariffIncome;", "nonNegative(otherCountedIncomeWeekly) +\n        tariffIncome + 1;", "overseasHundredPhase29.test.js"],

  ["GB Pension Credit 2026 severe disability extra is protected", "countryRules/GB.js", "severeDisabilityWeekly: 86.05,", "severeDisabilityWeekly: 86.06,", "overseasHundredPhase30.test.js"],
  ["GB Pension Credit 2026 carer extra is protected", "countryRules/GB.js", "carerWeeklyPerQualifyingPartner: 48.15,", "carerWeeklyPerQualifyingPartner: 48.16,", "overseasHundredPhase30.test.js"],
  ["GB Pension Credit 2026 first-child addition is protected", "countryRules/GB.js", "childFirstBornBefore2017Weekly: 81.07,", "childFirstBornBefore2017Weekly: 81.08,", "overseasHundredPhase30.test.js"],
  ["GB Pension Credit both severe disability qualifiers are protected", "countryRules/GB.js", "status === \"couple\" && severeCount >= 2", "status === \"couple\" && severeCount >= 3", "overseasHundredPhase30.test.js"],

  ["GB Guarantee Credit final award floors at zero", "countryRules/GB.js", "age.eligible ? Math.max(0, Math.ceil((rawWeekly - Number.EPSILON) * 100) / 100) : 0", "age.eligible ? Math.max(-1, Math.round(rawWeekly * 100) / 100) : 0", "overseasHundredPhase31.test.js"],
  ["GB Guarantee Credit mixed-age gate is protected", "countryRules/GB.js", "age.eligible ? Math.max(0, Math.ceil((rawWeekly - Number.EPSILON) * 100) / 100) : 0", "true ? Math.max(0, Math.round(rawWeekly * 100) / 100) : 0", "overseasHundredPhase31.test.js"],
  ["GB Guarantee Credit annualises at 52 weeks", "countryRules/GB.js", "guaranteeCreditWeekly * 52 * 100", "guaranteeCreditWeekly * 51 * 100", "overseasHundredPhase31.test.js"],


  ["GB child first-born boundary is mutation-protected", "countryRules/GB.js", "(firstChildren > 0 ? extras.childFirstBornBefore2017Weekly : 0)", "(firstChildren >= 0 ? extras.childFirstBornBefore2017Weekly : 0)", "overseasHundredPhase32.test.js"],
  ["GB carer qualifier cap is mutation-protected", "countryRules/GB.js", "Math.min(status === \"couple\" ? 2 : 1, whole(carerQualifiers))", "Math.min(status === \"couple\" ? 3 : 2, whole(carerQualifiers))", "overseasHundredPhase33.test.js"],
  ["GB disabled-child total cap is mutation-protected", "countryRules/GB.js", "const disabledHigherCount = Math.min(totalChildren, whole(disabledChildrenHigher));", "const disabledHigherCount = whole(disabledChildrenHigher);", "overseasHundredPhase34.test.js"],
  ["GB severe-disability couple cap is mutation-protected", "countryRules/GB.js", "status === \"couple\" && severeCount >= 2", "status === \"couple\" && severeCount >= 3", "overseasHundredPhase35.test.js"],
  ["GB Savings Credit Amount A claimant rounding is mutation-protected", "countryRules/GB.js", "const ceilPence = (value) => Math.ceil((value - Number.EPSILON) * 100) / 100;", "const ceilPence = (value) => Math.floor((value + Number.EPSILON) * 100) / 100;", "overseasHundredPhase36.test.js"],
  ["GB Savings Credit Amount B claimant rounding is mutation-protected", "countryRules/GB.js", "const ceilPence = (value) => Math.ceil((value - Number.EPSILON) * 100) / 100;\n      const floorPence = (value) => Math.floor((value + Number.EPSILON) * 100) / 100;", "const ceilPence = (value) => Math.ceil((value - Number.EPSILON) * 100) / 100;\n      const floorPence = (value) => Math.ceil((value - Number.EPSILON) * 100) / 100;", "overseasHundredPhase36.test.js"],
  ["GB mixed-age Savings Credit continuity is mutation-protected", "countryRules/GB.js", "(mixedPre2016Couple && transitionalCoupleContinuousEntitlement === true)", "(mixedPre2016Couple && transitionalCoupleContinuousEntitlement === false)", "overseasHundredPhase37.test.js"],
  ["GB Savings Credit total-income consistency is mutation-protected", "countryRules/GB.js", "const totalIncome = Math.max(qualifyingIncome, suppliedTotalIncome);", "const totalIncome = suppliedTotalIncome;", "overseasHundredPhase38.test.js"],
  ["GB legacy Guarantee penny rounding is mutation-protected", "countryRules/GB.js", "Math.ceil(((guarantee - assessedIncomeWeekly) - Number.EPSILON) * 100) / 100", "Math.floor(((guarantee - assessedIncomeWeekly) + Number.EPSILON) * 100) / 100", "overseasHundredPhase39.test.js"],
  ["GB assessable-income claimant rounding is mutation-protected", "countryRules/GB.js", "const floorPence = (value) => Math.floor((value + Number.EPSILON) * 100) / 100;\n      return {\n        countedIncomeWeekly: floorPence(countedIncome),", "const floorPence = (value) => Math.ceil((value - Number.EPSILON) * 100) / 100;\n      return {\n        countedIncomeWeekly: floorPence(countedIncome),", "overseasHundredPhase41.test.js"],

  ["GB legacy/modern Guarantee base parity is mutation-protected", "countryRules/GB.js", "let guarantee = couple\n        ? pc.standardMinimumGuaranteeWeekly.couple\n        : pc.standardMinimumGuaranteeWeekly.single;", "let guarantee = couple\n        ? pc.standardMinimumGuaranteeWeekly.single\n        : pc.standardMinimumGuaranteeWeekly.couple;", "overseasHundredPhase40.test.js"],
  ["GB legacy/modern weekly-income parity is mutation-protected", "countryRules/GB.js", "const income = Math.max(0, Number(weeklyIncome) || 0);", "const income = Math.max(0, Number(weeklyIncome) || 0) + 1;", "overseasHundredPhase40.test.js"],
  ["GB legacy/modern tariff-income parity is mutation-protected", "countryRules/GB.js", "const assessedIncomeWeekly = income + tariffIncomeWeekly;", "const assessedIncomeWeekly = income;", "overseasHundredPhase40.test.js"],

  ["GB 2026/27 higher-rate upper boundary is mutation-protected", "countryRules/GB.js", "{ upTo: 125140, rate: 0.40 },   // Higher rate（Personal Allowance逓減後も£125,140まで）", "{ upTo: 125141, rate: 0.40 },   // Higher rate（Personal Allowance逓減後も£125,140まで）", "overseasHundredPhase42to45.test.js"],
  ["GB savings starting-rate limit is mutation-protected", "countryRules/GB.js", "startingRateLimit: 5000,", "startingRateLimit: 4999,", "overseasHundredPhase42to45.test.js"],
  ["GB basic-rate Personal Savings Allowance is mutation-protected", "countryRules/GB.js", "personalSavingsAllowanceBasic: 1000,", "personalSavingsAllowanceBasic: 999,", "overseasHundredPhase42to45.test.js"],
  ["GB Marriage Allowance maximum reduction is mutation-protected", "countryRules/GB.js", "maximumTaxReduction: 252,", "maximumTaxReduction: 251,", "overseasHundredPhase42to45.test.js"],
  ["GB Married Couple's Allowance maximum is mutation-protected", "countryRules/GB.js", "maximumAmount: 11700,", "maximumAmount: 11699,", "overseasHundredPhase42to45.test.js"],
  ["GB Married Couple's Allowance minimum is mutation-protected", "countryRules/GB.js", "minimumAmount: 4530,", "minimumAmount: 4529,", "overseasHundredPhase42to45.test.js"],
  ["GB Married Couple's Allowance birth cutoff is mutation-protected", "countryRules/GB.js", "birthCutoffExclusive: \"1935-04-06\",", "birthCutoffExclusive: \"1935-04-07\",", "overseasHundredPhase42to45.test.js"],

  ["GB Scotland dental patient share is mutation-protected", "countryRules/GB.js", "patientShareRate: 0.80,", "patientShareRate: 0.79,", "overseasHundredPhase46to49.test.js"],
  ["GB Scotland dental course cap is mutation-protected", "countryRules/GB.js", "maximumPerCourse: 384,", "maximumPerCourse: 383,", "overseasHundredPhase46to49.test.js"],
  ["GB Scotland dental under-26 boundary is mutation-protected", "countryRules/GB.js", "freeTreatmentUnderAge: 26,", "freeTreatmentUnderAge: 27,", "overseasHundredPhase46to49.test.js"],
  ["GB Wales urgent dental charge is mutation-protected", "countryRules/GB.js", "urgent: 37.50,", "urgent: 37.49,", "overseasHundredPhase46to49.test.js"],
  ["GB Wales posterior root canal charge is mutation-protected", "countryRules/GB.js", "posteriorRootCanal: 182.72,", "posteriorRootCanal: 182.71,", "overseasHundredPhase46to49.test.js"],
  ["GB Wales crown-or-bridge charge is mutation-protected", "countryRules/GB.js", "crownOrBridge: 140.44,", "crownOrBridge: 140.43,", "overseasHundredPhase46to49.test.js"],
  ["GB annual healthcare routes Scotland dental auto mode", "countryRules/GB.js", "} else if (region === \"scotland\") {", "} else if (region === \"scotland-disabled\") {", "overseasHundredPhase46to49.test.js"],
  ["GB annual healthcare routes Wales dental auto mode", "countryRules/GB.js", "} else if (region === \"wales\") {", "} else if (region === \"wales-disabled\") {", "overseasHundredPhase46to49.test.js"],
  ["GB Northern Ireland prescriptions remain free", "countryRules/GB.js", "freeRegions: [\"scotland\", \"wales\", \"northernIreland\"],", "freeRegions: [\"scotland\", \"wales\"],", "overseasHundredPhase50to53.test.js"],
  ["GB Northern Ireland dental auto mode preserves user-entered cost", "countryRules/GB.js", "let dentalAnnual = n(h.dentalAnnual);", "let dentalAnnual = 0;", "overseasHundredPhase50to53.test.js"],
  ["GB Northern Ireland dental source remains nidirect", "countryRules/GB.js", "dentalNorthernIreland: \"https://www.nidirect.gov.uk/articles/seeing-dentist\",", "dentalNorthernIreland: \"https://www.gov.uk/articles/seeing-dentist\",", "overseasHundredPhase50to53.test.js"],
  ["GB final-audit verified date is protected", "countryRules/GB.js", "verifiedAsOf: \"2026-08-22\",", "verifiedAsOf: \"2026-08-21\",", "overseasHundredPhase50to53.test.js"],
  ["GB healthcare coverage remains partial", "countryRules/GB.js", "{ key: \"healthcare\", labelJa: \"医療\", labelEn: \"Healthcare\", status: \"partial\",", "{ key: \"healthcare\", labelJa: \"医療\", labelEn: \"Healthcare\", status: \"implemented\",", "overseasHundredPhase50to53.test.js"],
  ["GB Northern Ireland dental stays explicitly item-of-service", "countryRules/GB.js", "Northern Ireland のHealth Service歯科料金はitem-of-service fee scheduleが必要なため自動計算未実装。", "Northern Ireland のHealth Service歯科料金はflat feeで自動計算実装済み。", "overseasHundredPhase50to53.test.js"],

  ["5-country supported-country list is protected", "utils/countryProfiles.js", "export const PROFILE_COUNTRIES = Object.freeze([\"JP\", \"US\", \"GB\", \"CA\", \"AU\"]);", "export const PROFILE_COUNTRIES = Object.freeze([\"JP\", \"US\", \"GB\", \"CA\"]);", "fiveCountryUiLocaleAudit2026.test.js"],
  ["GB profile keeps British-English locale", "utils/countryProfiles.js", "GB: { baseCurrency: \"GBP\", language: \"en-GB\" },", "GB: { baseCurrency: \"GBP\", language: \"en\" },", "fiveCountryUiLocaleAudit2026.test.js"],
  ["CA profile keeps CAD planning currency", "utils/countryProfiles.js", "CA: { baseCurrency: \"CAD\", language: \"en\" },", "CA: { baseCurrency: \"USD\", language: \"en\" },", "fiveCountryUiLocaleAudit2026.test.js"],
  ["CAD symbol stays distinct from USD", "ui/locale.js", "CAD: { symbol: \"C$\", locale: \"en-CA\" },", "CAD: { symbol: \"$\", locale: \"en-CA\" },", "fiveCountryUiLocaleAudit2026.test.js"],
  ["AUD locale stays Australian English", "ui/locale.js", "AUD: { symbol: \"A$\", locale: \"en-AU\" },", "AUD: { symbol: \"A$\", locale: \"en-US\" },", "fiveCountryUiLocaleAudit2026.test.js"],
  ["GB tax-advantaged label remains ISA-specific", "ui/locale.js", "GB: \"ISA (Stocks & Shares)\",", "GB: \"Investment Account (Stocks & Shares)\",", "fiveCountryUiLocaleAudit2026.test.js"],
  ["AU retirement label remains Superannuation-specific", "ui/locale.js", "AU: \"Superannuation Contributions\",", "AU: \"Retirement Account Contributions\",", "fiveCountryUiLocaleAudit2026.test.js"],
  ["British-English dictionary keeps GB overrides", "translations/index.js", "TRANSLATIONS[\"en-GB\"] = { ...TRANSLATIONS.en, ...EN_GB_OVERRIDES };", "TRANSLATIONS[\"en-GB\"] = { ...TRANSLATIONS.en };", "fiveCountryUiLocaleAudit2026.test.js"],
  ["5-country snapshot keys retain the country namespace", "utils/countryProfiles.js", "return `snapshot:${code}:${normalizedDate}`;", "return `snapshot:${normalizedDate}`;", "fiveCountryPersistenceBoundaryAudit2026.test.js"],
  ["5-country watchlists keep each country's canonical currency", "utils/countryProfiles.js", "const currency = profileMeta(code).baseCurrency;", "const currency = \"JPY\";", "fiveCountryPersistenceBoundaryAudit2026.test.js"],
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
