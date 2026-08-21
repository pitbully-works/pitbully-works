import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { normalizeRuleUpdateState } from "./utils/ruleUpdates.js";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");

describe("rule source acknowledgement", () => {
  it("keeps only bounded SHA-256 acknowledgements in persisted state", () => {
    const valid = "A".repeat(64);
    const state = normalizeRuleUpdateState({
      sourceAcknowledgedHashes: {
        "JP-FSA-NISA": valid,
        bad: "not-a-hash",
      },
    });
    expect(Object.getPrototypeOf(state.sourceAcknowledgedHashes)).toBeNull();
    expect(state.sourceAcknowledgedHashes["JP-FSA-NISA"]).toBe("a".repeat(64));
    expect(state.sourceAcknowledgedHashes.bad).toBeUndefined();
  });

  it("hides only the exact reviewed source hash so a later page change alerts again", () => {
    expect(app).toContain('acknowledgedHash !== item.hash');
    expect(app).toContain('sourceAcknowledgedHashes: {');
    expect(app).toContain('[id]: hash');
    expect(app).toContain('"確認済みにする"');
    expect(app).toContain('"Mark reviewed"');
  });

  it("fails closed when the monitor reports changed without a valid hash", () => {
    expect(app).toContain('return !item.hash || acknowledgedHash !== item.hash;');
  });
});
