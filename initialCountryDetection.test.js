import { describe, expect, it } from "vitest";
import { detectInitialCountry } from "./App.jsx";

describe("初回アクセスの国自動判定", () => {
  it("5か国の代表タイムゾーンを正しく判定する", () => {
    expect(detectInitialCountry({ timeZone: "Asia/Tokyo", languages: ["en-US"] })).toBe("JP");
    expect(detectInitialCountry({ timeZone: "America/New_York", languages: ["ja-JP"] })).toBe("US");
    expect(detectInitialCountry({ timeZone: "Europe/London", languages: ["ja-JP"] })).toBe("GB");
    expect(detectInitialCountry({ timeZone: "America/Toronto", languages: ["ja-JP"] })).toBe("CA");
    expect(detectInitialCountry({ timeZone: "Australia/Sydney", languages: ["ja-JP"] })).toBe("AU");
  });

  it("タイムゾーンで判定できない場合はブラウザ言語の地域を使う", () => {
    expect(detectInitialCountry({ timeZone: "UTC", languages: ["en-US"] })).toBe("US");
    expect(detectInitialCountry({ timeZone: "UTC", languages: ["en-GB"] })).toBe("GB");
    expect(detectInitialCountry({ timeZone: "UTC", languages: ["en-CA"] })).toBe("CA");
    expect(detectInitialCountry({ timeZone: "UTC", languages: ["en-AU"] })).toBe("AU");
  });

  it("対応5か国を判定できない場合は従来どおりJPにする", () => {
    expect(detectInitialCountry({ timeZone: "Europe/Paris", languages: ["fr-FR"] })).toBe("JP");
  });
});
