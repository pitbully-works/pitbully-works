import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const watcher = fs.readFileSync(path.resolve(process.cwd(), "scripts/check-rule-sources.mjs"), "utf8");

describe("official source watcher resource bounds", () => {
  it("sets a per-source timeout instead of relying only on the job timeout", () => {
    expect(watcher).toContain("const SOURCE_FETCH_TIMEOUT_MS = 20_000;");
    expect(watcher).toContain("controller.abort(new Error('source fetch timeout'))");
    expect(watcher).toContain("signal: controller.signal");
  });

  it("bounds declared and streamed response sizes", () => {
    expect(watcher).toContain("const MAX_SOURCE_RESPONSE_BYTES = 5 * 1024 * 1024;");
    expect(watcher).toContain("declaredLength > MAX_SOURCE_RESPONSE_BYTES");
    expect(watcher).toContain("if (total > MAX_SOURCE_RESPONSE_BYTES)");
  });

  it("does not treat a tiny 200 response or block page as a new official baseline", () => {
    expect(watcher).toContain("const MIN_NORMALIZED_SOURCE_CHARS = 200;");
    expect(watcher).toContain("if (normalized.length < MIN_NORMALIZED_SOURCE_CHARS)");
  });
});
