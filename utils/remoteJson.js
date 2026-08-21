export const MAX_RULE_MANIFEST_RESPONSE_CHARS = 1_000_000;
export const MAX_RULE_SOURCE_STATUS_RESPONSE_CHARS = 300_000;
export const RULE_FEED_FETCH_TIMEOUT_MS = 15_000;

function parseContentLength(response) {
  try {
    const raw = response?.headers?.get?.("content-length");
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

async function readBoundedResponseText(response, maxChars) {
  const declaredLength = parseContentLength(response);
  if (declaredLength !== null && declaredLength > maxChars) return null;

  // Prefer streaming so a dishonest/missing Content-Length cannot make the browser
  // materialize an arbitrarily large response before the size limit is checked.
  if (response?.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) return null;
        totalBytes += value.byteLength;
        // maxChars is intentionally also used as a conservative byte cap. UTF-8
        // JSON can require multiple bytes per character, so this fails closed.
        if (totalBytes > maxChars) {
          try { await reader.cancel(); } catch {}
          return null;
        }
        text += decoder.decode(value, { stream: true });
        if (text.length > maxChars) {
          try { await reader.cancel(); } catch {}
          return null;
        }
      }
      text += decoder.decode();
      return text.length > 0 && text.length <= maxChars ? text : null;
    } catch {
      try { await reader.cancel(); } catch {}
      return null;
    }
  }

  // Compatibility fallback for test doubles/older runtimes. The production path
  // above remains streaming-bounded in modern browsers.
  let text;
  try {
    text = await response.text();
  } catch {
    return null;
  }
  return typeof text === "string" && text.length > 0 && text.length <= maxChars ? text : null;
}

/**
 * Read JSON from a fetch Response without allowing an unbounded streamed body to
 * be materialized or parsed. Returns null for non-OK, oversized, malformed, or
 * non-object payloads so callers can fail closed without breaking the app.
 */
export async function readBoundedJsonResponse(response, maxChars) {
  if (!response?.ok) return null;
  if (!Number.isInteger(maxChars) || maxChars <= 0) return null;

  const text = await readBoundedResponseText(response, maxChars);
  if (text === null) return null;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed;
}

/**
 * Fetch one same-origin rule feed with a hard timeout and bounded JSON reader.
 * A timeout/network failure is returned as null so the caller keeps last-known-good
 * state rather than marking a partial rule check as successful.
 */
export async function fetchBoundedJson(url, maxChars, timeoutMs = RULE_FEED_FETCH_TIMEOUT_MS) {
  if (typeof url !== "string" || !url || !Number.isInteger(timeoutMs) || timeoutMs <= 0) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return await readBoundedJsonResponse(response, maxChars);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
