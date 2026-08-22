import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");

describe("country/history async boundary", () => {
  it("invalidates stale history reads before they can repaint another country", () => {
    expect(app).toContain("const historyRequestGenerationRef = useRef(0);");
    expect(app).toContain("const requestGeneration = ++historyRequestGenerationRef.current;");
    expect((app.match(/requestGeneration !== historyRequestGenerationRef\.current/g) || []).length)
      .toBeGreaterThanOrEqual(2);
  });

  it("does not let an older failed history read overwrite current debug state", () => {
    expect(app).toContain("if (requestGeneration === historyRequestGenerationRef.current)");
    expect(app).toContain('setHistoryDebug(t("historyFetchErrorDebug"');
  });

  it("normalizes the current and target watchlists at the country selector boundary", () => {
    expect(app).toContain("[currentCountry]: normalizeStockWatchlist(watchlist, currentCountry)");
    expect(app).toContain("normalizeStockWatchlist(countryWatchlistsRef.current[nextCountry], nextCountry)");
  });

  it("normalizes both sides of a cross-country Kakeibo import", () => {
    expect(app).toContain("[currentCode]: normalizeStockWatchlist(watchlist, currentCode)");
    expect(app).toContain("normalizeStockWatchlist(countryWatchlistsRef.current[target], target)");
  });
});
