import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "storageShim.js"), "utf8");

function installShim() {
  delete window.storage;
  // eslint-disable-next-line no-eval
  window.eval(source);
  return window.storage;
}

describe("browser storage compatibility shim", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.storage;
  });

  it("stores and reads values only inside the app namespace", async () => {
    const storage = installShim();
    await storage.set("alpha", "123");
    expect(window.localStorage.getItem("nisa-lifeplan:alpha")).toBe("123");
    expect(await storage.get("alpha")).toEqual({ key: "alpha", value: "123", shared: false });
  });

  it("returns null for a missing key", async () => {
    expect(await installShim().get("missing")).toBeNull();
  });

  it("deletes only the namespaced key", async () => {
    window.localStorage.setItem("outside", "keep");
    const storage = installShim();
    await storage.set("alpha", "drop");
    await storage.delete("alpha");
    expect(window.localStorage.getItem("nisa-lifeplan:alpha")).toBeNull();
    expect(window.localStorage.getItem("outside")).toBe("keep");
  });

  it("lists only matching namespaced keys in deterministic order", async () => {
    window.localStorage.setItem("nisa-lifeplan:snapshot:z", "1");
    window.localStorage.setItem("outside:snapshot:a", "2");
    window.localStorage.setItem("nisa-lifeplan:snapshot:a", "3");
    const result = await installShim().list("snapshot:");
    expect(result.keys).toEqual(["snapshot:a", "snapshot:z"]);
  });

  it("rejects malformed list prefixes instead of coercing them", async () => {
    const storage = installShim();
    await expect(storage.list({ bad: true })).rejects.toThrow("Invalid storage prefix");
    await expect(storage.list("bad\0prefix")).rejects.toThrow("Invalid storage prefix");
  });

  it("does not replace a storage implementation already supplied by the host", () => {
    const existing = { get: vi.fn() };
    window.storage = existing;
    window.eval(source);
    expect(window.storage).toBe(existing);
  });

  it("propagates quota/storage failures as rejected async operations", async () => {
    const storage = installShim();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await expect(storage.set("alpha", "1")).rejects.toThrow("quota");
    spy.mockRestore();
  });

  it("rejects invalid storage keys instead of coercing them into the app namespace", async () => {
    const storage = installShim();
    await expect(storage.get(undefined)).rejects.toThrow("Invalid storage key");
    await expect(storage.set("", "x")).rejects.toThrow("Invalid storage key");
    await expect(storage.delete("bad\0key")).rejects.toThrow("Invalid storage key");
  });

  it("rejects non-string values instead of relying on localStorage coercion", async () => {
    const storage = installShim();
    await expect(storage.set("alpha", { bad: true })).rejects.toThrow("Storage value must be a string");
    expect(window.localStorage.getItem("nisa-lifeplan:alpha")).toBeNull();
  });

  it("rejects oversized values before they reach localStorage", async () => {
    const storage = installShim();
    await expect(storage.set("alpha", "x".repeat(8_000_001))).rejects.toThrow("Storage value is too large");
    expect(window.localStorage.getItem("nisa-lifeplan:alpha")).toBeNull();
  });

  it("caps namespaced list results to bound caller memory", () => {
    expect(source).toContain("const MAX_LIST_KEYS = 5000");
    expect(source).toContain("if (keys.length >= MAX_LIST_KEYS) break");
  });

});
