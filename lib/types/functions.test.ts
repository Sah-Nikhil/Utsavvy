import { describe, expect, it } from "vitest";
import {
  aaravBirthday,
  jaipurWedding,
  puneGaneshUtsav,
} from "../pricing/workedExamples";
import { ALL_FUNCTION_KEYS, FUNCTION_KEYS, isFunctionKey } from "./functions";

describe("FUNCTION_KEYS", () => {
  it("has no key twice, within or across Event kinds", () => {
    expect(new Set(ALL_FUNCTION_KEYS).size).toBe(ALL_FUNCTION_KEYS.length);
    const listed = Object.values(FUNCTION_KEYS).flat();
    expect(listed.length).toBe(ALL_FUNCTION_KEYS.length);
  });

  it("uses lowercase slugs with underscores", () => {
    for (const key of ALL_FUNCTION_KEYS)
      expect(key, key).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });

  it("holds every Function key in the first-brief worked examples", () => {
    for (const example of [jaipurWedding, aaravBirthday, puneGaneshUtsav])
      for (const fn of example.plan.functions)
        expect(isFunctionKey(fn.key), fn.key).toBe(true);
  });

  it("refuses names and spellings that aren't keys", () => {
    expect(isFunctionKey("Haldi")).toBe(false);
    expect(isFunctionKey("anand karaj")).toBe(false);
    expect(isFunctionKey("daily-aarti")).toBe(false);
  });
});
