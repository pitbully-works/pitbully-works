import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");

describe("rule update state concurrency", () => {
  it("persists updates from the latest React state rather than a stale render snapshot", () => {
    expect(app).toContain('const persistRuleUpdateState = useCallback((nextOrUpdater) => {');
    expect(app).toContain('setRuleUpdateState((current) => {');
    expect(app).toContain('typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater');
  });

  it("records approve/defer decisions with a functional state update", () => {
    expect(app).toContain('persistRuleUpdateState((current) => ({');
    expect(app).toContain('history: [...(current.history || []), historyEntry].slice(-100)');
  });

  it("acknowledges source hashes without overwriting a concurrent decision", () => {
    expect(app).toContain('...(current.sourceAcknowledgedHashes || {})');
    expect(app).toContain('[id]: hash');
  });

  it("history deletion also derives from the latest state", () => {
    expect(app).toContain('history: (current.history || []).filter((entry) => entry.id !== entryId)');
  });
});
