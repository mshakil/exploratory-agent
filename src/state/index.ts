import { createHash } from "node:crypto";
import type { PageState } from "../browser/types.js";
import { inferElementType } from "../selectors/index.js";

/**
 * Practical fingerprint to avoid obvious duplicate exploration.
 * Prefers URL/hash + structural UI cues over volatile data-driven element ids.
 */
export function fingerprintState(state: PageState): string {
  let path = state.url;
  try {
    const u = new URL(state.url);
    path = u.origin + u.pathname + normalizeSearch(u.search) + u.hash;
  } catch {
    // keep raw
  }

  const elementSig = state.interactiveElements
    .map((el) => {
      const type = inferElementType(el);
      const stable =
        stabilizeId(
          el.attributes["data-testid"] ||
            el.attributes["name"] ||
            el.attributes["id"] ||
            el.accessibleName ||
            el.text,
        ) || type;
      return `${type}:${stable}`;
    })
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .sort()
    .slice(0, 40)
    .join("|");

  const payload = [
    path,
    (state.title || "").trim().toLowerCase(),
    state.modalOpen ? "modal:1" : "modal:0",
    state.activeTab ? `tab:${state.activeTab.trim().toLowerCase()}` : "tab:",
    // Coarse element structure hash — ignores row-level volatility somewhat via stabilizeId
    createHash("sha1").update(elementSig).digest("hex").slice(0, 12),
  ].join("::");

  return createHash("sha1").update(payload).digest("hex");
}

function stabilizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

function normalizeSearch(search: string): string {
  if (!search) return "";
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()]) {
    if (/^(utm_|fbclid|gclid|session|sid|_)/i.test(key)) {
      params.delete(key);
    }
  }
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries).toString();
}

export function areEquivalentStates(a: PageState, b: PageState): boolean {
  return fingerprintState(a) === fingerprintState(b);
}
