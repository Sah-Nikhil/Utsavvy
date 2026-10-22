import { describe, expect, it } from "vitest";
import {
  ORNAMENTS_STORAGE_KEY,
  applyOrnaments,
  ornamentsMenuLabel,
  ornamentsScript,
  readOrnaments,
  writeOrnaments,
} from "./ornaments";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

const failingStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

function fakeRoot() {
  const dataset: Record<string, string | undefined> = {};
  return { dataset };
}

describe("readOrnaments", () => {
  it("is on when nothing is stored", () => {
    expect(readOrnaments(memoryStorage())).toBe(true);
  });

  it("is off only when the device stored off", () => {
    expect(
      readOrnaments(memoryStorage({ [ORNAMENTS_STORAGE_KEY]: "off" })),
    ).toBe(false);
    expect(
      readOrnaments(memoryStorage({ [ORNAMENTS_STORAGE_KEY]: "on" })),
    ).toBe(true);
    expect(
      readOrnaments(memoryStorage({ [ORNAMENTS_STORAGE_KEY]: "nonsense" })),
    ).toBe(true);
  });

  it("is on when storage is unavailable", () => {
    expect(readOrnaments(failingStorage)).toBe(true);
    expect(readOrnaments(undefined)).toBe(true);
  });
});

describe("writeOrnaments", () => {
  it("stores off, and clears the key when turned back on", () => {
    const storage = memoryStorage();
    writeOrnaments(storage, false);
    expect(storage.values.get(ORNAMENTS_STORAGE_KEY)).toBe("off");
    writeOrnaments(storage, true);
    expect(storage.values.has(ORNAMENTS_STORAGE_KEY)).toBe(false);
  });

  it("does not throw when storage is unavailable", () => {
    expect(() => writeOrnaments(failingStorage, false)).not.toThrow();
  });
});

describe("applyOrnaments", () => {
  it("marks <html> only when ornaments are off", () => {
    const root = fakeRoot();
    applyOrnaments(root, false);
    expect(root.dataset.ornaments).toBe("off");
    applyOrnaments(root, true);
    expect(root.dataset.ornaments).toBeUndefined();
  });
});

describe("ornamentsMenuLabel", () => {
  it("names the action the click takes", () => {
    expect(ornamentsMenuLabel(true)).toBe("Turn ornaments off");
    expect(ornamentsMenuLabel(false)).toBe("Turn ornaments on");
  });
});

describe("ornamentsScript", () => {
  function run(storage: unknown) {
    const root = fakeRoot();
    new Function("localStorage", "document", ornamentsScript)(storage, {
      documentElement: root,
    });
    return root.dataset.ornaments;
  }

  it("marks <html> before first paint when the device stored off", () => {
    expect(run(memoryStorage({ [ORNAMENTS_STORAGE_KEY]: "off" }))).toBe("off");
  });

  it("leaves <html> alone otherwise, even when storage throws", () => {
    expect(run(memoryStorage())).toBeUndefined();
    expect(run(failingStorage)).toBeUndefined();
  });
});
