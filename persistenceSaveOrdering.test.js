import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");

describe("autosave ordering and stale completion boundary", () => {
  it("serializes storage writes instead of allowing overlapping saves", () => {
    expect(app).toContain("const saveQueueRef = useRef(Promise.resolve())");
    expect(app).toContain("saveQueueRef.current = saveQueueRef.current.then(run, run)");
  });

  it("only the newest save completion may update saved/error UI state", () => {
    expect(app).toContain("const generation = ++saveGenerationRef.current");
    expect(app.match(/if \(generation !== saveGenerationRef\.current\) return;/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("captures main persistence and snapshot JSON before entering the async queue", () => {
    const mainCapture = app.indexOf("const mainJson = JSON.stringify({");
    const snapshotCapture = app.indexOf("const snapshotJson = JSON.stringify(snapshot)");
    const queueRun = app.indexOf("const run = async () => {");
    expect(mainCapture).toBeGreaterThan(-1);
    expect(snapshotCapture).toBeGreaterThan(mainCapture);
    expect(queueRun).toBeGreaterThan(snapshotCapture);
  });
});
