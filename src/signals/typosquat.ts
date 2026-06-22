import leven from "leven";
import type { Finding } from "../types.js";
import { POPULAR_NAMES } from "./popular-names.js";

// Collapse the common impersonation tricks (separators + digit homoglyphs) so
// that `is0dd` and `is-odd` normalize to the same string. Catches the cases a
// raw edit distance misses (e.g. distance("is0dd","is-odd") === 2).
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_.]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/3/g, "e")
    .replace(/5/g, "s");
}

export function typosquatSignal(name: string): Finding[] {
  if (POPULAR_NAMES.includes(name)) return [];
  const a = normalize(name);
  for (const popular of POPULAR_NAMES) {
    const b = normalize(popular);
    if (a === b || leven(a, b) === 1) {
      return [
        {
          id: "typosquat",
          weight: 30,
          reason: `name looks like a typo of "${popular}" (a popular package)`,
        },
      ];
    }
  }
  return [];
}
