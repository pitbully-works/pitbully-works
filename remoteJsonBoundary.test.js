import { describe, expect, it, vi } from "vitest";
import {
  readBoundedJsonResponse,
  MAX_RULE_MANIFEST_RESPONSE_CHARS,
  MAX_RULE_SOURCE_STATUS_RESPONSE_CHARS,
} from "./utils/remoteJson.js";

function response(body, { ok = true, contentLength } = {}) {
  return {
    ok,
    headers: { get: vi.fn((name) => name.toLowerCase() === "content-length" ? contentLength ?? null : null) },
    text: vi.fn(async () => body),
  };
}

describe("bounded remote JSON boundary", () => {
  it("accepts a small plain-object JSON payload", async () => {
    const res = response('{"updates":[]}');
    await expect(readBoundedJsonResponse(res, 1000)).resolves.toEqual({ updates: [] });
  });

  it("rejects a body when Content-Length already exceeds the limit without reading it", async () => {
    const res = response('{"updates":[]}', { contentLength: "1001" });
    await expect(readBoundedJsonResponse(res, 1000)).resolves.toBeNull();
    expect(res.text).not.toHaveBeenCalled();
  });

  it("rejects oversized text even when Content-Length is absent or dishonest", async () => {
    const res = response(`{"x":"${"a".repeat(100)}"}`, { contentLength: "10" });
    await expect(readBoundedJsonResponse(res, 50)).resolves.toBeNull();
  });

  it("rejects malformed JSON and top-level arrays", async () => {
    await expect(readBoundedJsonResponse(response("{"), 100)).resolves.toBeNull();
    await expect(readBoundedJsonResponse(response("[]"), 100)).resolves.toBeNull();
  });

  it("rejects non-OK responses and invalid limits", async () => {
    await expect(readBoundedJsonResponse(response("{}", { ok: false }), 100)).resolves.toBeNull();
    await expect(readBoundedJsonResponse(response("{}"), 0)).resolves.toBeNull();
  });

  it("keeps separate conservative limits for manifests and source-status payloads", () => {
    expect(MAX_RULE_MANIFEST_RESPONSE_CHARS).toBe(1_000_000);
    expect(MAX_RULE_SOURCE_STATUS_RESPONSE_CHARS).toBeLessThan(MAX_RULE_MANIFEST_RESPONSE_CHARS);
  });
});
