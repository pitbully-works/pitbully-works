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
