import { describe, expect, it, vi } from "vitest";
import {
  readBoundedJsonResponse,
  fetchBoundedJson,
  RULE_FEED_FETCH_TIMEOUT_MS,
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

  it("stops a streamed body as soon as the byte cap is exceeded", async () => {
    let cancelled = false;
    // 20 Japanese characters are 60 UTF-8 bytes but only 20 JS characters.
    // This isolates the byte cap from the later decoded-character cap.
    const chunks = [new TextEncoder().encode('{"x":"'), new TextEncoder().encode("あ".repeat(20))];
    let index = 0;
    const res = {
      ok: true,
      headers: { get: vi.fn(() => null) },
      body: {
        getReader: () => ({
          read: vi.fn(async () => index < chunks.length ? { done: false, value: chunks[index++] } : { done: true }),
          cancel: vi.fn(async () => { cancelled = true; }),
        }),
      },
    };
    await expect(readBoundedJsonResponse(res, 50)).resolves.toBeNull();
    expect(cancelled).toBe(true);
  });

  it("aborts feed fetches that exceed the hard timeout", async () => {
    vi.useFakeTimers();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    try {
      const pending = fetchBoundedJson("/rules-updates.json", 1000, 10);
      await vi.advanceTimersByTimeAsync(11);
      await expect(pending).resolves.toBeNull();
      expect(globalThis.fetch).toHaveBeenCalledWith("/rules-updates.json", expect.objectContaining({ cache: "no-store", signal: expect.anything() }));
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });

  it("keeps a finite default timeout for rule feeds", () => {
    expect(RULE_FEED_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RULE_FEED_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it("keeps separate conservative limits for manifests and source-status payloads", () => {
    expect(MAX_RULE_MANIFEST_RESPONSE_CHARS).toBe(1_000_000);
    expect(MAX_RULE_SOURCE_STATUS_RESPONSE_CHARS).toBeLessThan(MAX_RULE_MANIFEST_RESPONSE_CHARS);
  });
});
