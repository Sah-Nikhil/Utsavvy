/**
 * The two candidate looks from IMPLEMENTATION_PLAN.md section 7.3, plus the
 * recommended default. Only one survives the contract review; until then a
 * development-only switch (components/shell/LookSwitch.tsx) flips between them
 * by setting `data-look` on <html>.
 *
 * - "b": Ivory ledger.
 * - "d": Contemporary rangoli, with its Section corner pieces.
 * - "bd": Ivory ledger with D's per-Function colours (the default if no call is made).
 */
export const LOOKS = ["bd", "b", "d"] as const;
export type Look = (typeof LOOKS)[number];
export const DEFAULT_LOOK: Look = "bd";
export const LOOK_STORAGE_KEY = "utsavvy.dev.look";

export function isLook(value: unknown): value is Look {
  return (
    typeof value === "string" && (LOOKS as readonly string[]).includes(value)
  );
}
