import { describe, expect, it } from "vitest";
import fs from "node:fs";

const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

describe("personal info iOS regression", () => {
  it("name uses Done and does not advance to the date picker", () => {
    expect(app).toContain('enterKeyHint="done"');
    expect(app).toContain('e.currentTarget.blur()');
  });

  it("date of birth is required and cannot be cleared by an empty native reset event", () => {
    expect(app).toContain('aria-required="true"');
    expect(app).toContain('required');
    expect(app).toContain('if (next) update({ birthDate: next });');
    expect(app).not.toContain('生年月日を消す');
    expect(app).not.toContain('Clear date');
  });
});
