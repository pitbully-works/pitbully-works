export const MAX_RULE_MANIFEST_RESPONSE_CHARS = 1_000_000;
export const MAX_RULE_SOURCE_STATUS_RESPONSE_CHARS = 300_000;

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

/**
 * Read JSON from a fetch Response without allowing an unbounded body to be
 * materialized or parsed. Returns null for non-OK, oversized, malformed, or
 * non-object payloads so callers can fail closed without breaking the app.
 */
export async function readBoundedJsonResponse(response, maxChars) {
  if (!response?.ok) return null;
  if (!Number.isInteger(maxChars) || maxChars <= 0) return null;

  const declaredLength = parseContentLength(response);
  if (declaredLength !== null && declaredLength > maxChars) return null;

  let text;
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (typeof text !== "string" || text.length === 0 || text.length > maxChars) return null;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed;
}
