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

  it("treats a non-string list prefix as empty instead of coercing it", async () => {
    window.localStorage.setItem("nisa-lifeplan:a", "1");
    const result = await installShim().list({ bad: true });
    expect(result.prefix).toBe("");
    expect(result.keys).toEqual(["a"]);
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
});
