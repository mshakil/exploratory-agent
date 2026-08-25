import type { ElementSnapshot } from "../browser/types.js";
import type { Confidence, ElementType, SelectorCandidate, SelectorSet } from "../models/index.js";

const TEST_ID_ATTRS = ["data-testid", "data-test", "data-cy", "data-qa"];

function isBrittleCss(css: string): boolean {
  return (
    /:nth-child\(/.test(css) ||
    /:nth-of-type\(/.test(css) ||
    (css.match(/>/g) || []).length >= 4 ||
    /ember\d+|ng-|react-|css-|\b_\w{5,}\b/.test(css)
  );
}

function isStableId(id: string): boolean {
  if (!id) return false;
  if (/^(ember|react|ng|mui|radix)/i.test(id)) return false;
  if (/^\d+$/.test(id)) return false;
  if (/^[a-f0-9-]{20,}$/i.test(id)) return false;
  return true;
}

export function inferElementType(snapshot: ElementSnapshot): ElementType {
  const role = snapshot.role?.toLowerCase();
  const tag = snapshot.tag.toLowerCase();
  const type = (snapshot.inputType || snapshot.type || "").toLowerCase();
  const attrs = snapshot.attributes;

  if (role === "tab" || attrs["role"] === "tab") return "tab";
  if (role === "menuitem" || attrs["role"] === "menuitem") return "menu";
  if (role === "dialog" || attrs["role"] === "dialog") return "modal";
  if (tag === "table" || attrs["role"] === "table") return "table";
  if (
    /pagination|pager|next|prev|page-/i.test(snapshot.accessibleName) ||
    /pagination|pager/i.test(attrs["class"] || "") ||
    /pagination|pager/i.test(attrs["data-testid"] || "")
  ) {
    return "pagination";
  }
  if (tag === "select" || role === "combobox" || role === "listbox") return "select";
  if (type === "checkbox" || role === "checkbox") return "checkbox";
  if (type === "radio" || role === "radio") return "radio";
  if (tag === "textarea") return "textarea";
  if (tag === "input") return "input";
  if (tag === "a" || role === "link") return "link";
  if (tag === "button" || role === "button" || type === "submit" || type === "button") return "button";
  if (attrs["role"] === "button") return "button";
  return "other";
}

export function generateSelectorCandidates(snapshot: ElementSnapshot): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];
  const attrs = snapshot.attributes;

  for (const attr of TEST_ID_ATTRS) {
    if (attrs[attr]) {
      candidates.push({
        strategy: "testId",
        value: attrs[attr],
        rank: 100,
      });
      break;
    }
  }

  if (attrs["aria-label"]) {
    candidates.push({
      strategy: "ariaLabel",
      value: attrs["aria-label"],
      rank: 90,
    });
  }

  if (snapshot.role && snapshot.accessibleName) {
    // Playwright: input[type=password] has no textbox role — prefer name/placeholder
    const inputType = (snapshot.inputType || snapshot.type || attrs["type"] || "").toLowerCase();
    if (inputType !== "password") {
      candidates.push({
        strategy: "role",
        role: snapshot.role,
        name: snapshot.accessibleName,
        rank: 85,
      });
    }
  }

  if (attrs["name"] && !/csrf|token|auth/i.test(attrs["name"])) {
    candidates.push({
      strategy: "name",
      value: attrs["name"],
      rank: (snapshot.inputType || attrs["type"] || "") === "password" ? 88 : 80,
    });
  }

  if (attrs["id"] && isStableId(attrs["id"])) {
    candidates.push({
      strategy: "css",
      value: `#${CSS.escape ? CSS.escape(attrs["id"]) : attrs["id"]}`,
      rank: 75,
    });
  }

  if (attrs["placeholder"]) {
    candidates.push({
      strategy: "placeholder",
      value: attrs["placeholder"],
      rank: 70,
    });
  }

  if (snapshot.text && snapshot.text.length > 0 && snapshot.text.length < 80) {
    candidates.push({
      strategy: "text",
      value: snapshot.text,
      rank: 55,
    });
  }

  if (snapshot.cssPath && !isBrittleCss(snapshot.cssPath)) {
    candidates.push({
      strategy: "css",
      value: snapshot.cssPath,
      rank: 40,
    });
  } else if (snapshot.cssPath) {
    candidates.push({
      strategy: "css",
      value: snapshot.cssPath,
      rank: 15,
    });
  }

  if (attrs["href"] && snapshot.tag === "a") {
    candidates.push({
      strategy: "css",
      value: `a[href="${attrs["href"]}"]`,
      rank: 65,
    });
  }

  return rankSelectors(candidates);
}

export function rankSelectors(candidates: SelectorCandidate[]): SelectorCandidate[] {
  const seen = new Set<string>();
  const unique: SelectorCandidate[] = [];

  for (const c of [...candidates].sort((a, b) => b.rank - a.rank)) {
    const key = `${c.strategy}:${c.value ?? ""}:${c.role ?? ""}:${c.name ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  return unique;
}

export function buildSelectorSet(snapshot: ElementSnapshot): SelectorSet {
  const ranked = generateSelectorCandidates(snapshot);
  const preferred =
    ranked[0] ??
    ({
      strategy: "css",
      value: snapshot.cssPath || snapshot.tag,
      rank: 1,
    } satisfies SelectorCandidate);

  return {
    preferred,
    fallbacks: ranked.slice(1, 5),
  };
}

export function confidenceFromSelectors(set: SelectorSet): Confidence {
  const rank = set.preferred.rank;
  if (rank >= 85) return "high";
  if (rank >= 55) return "medium";
  return "low";
}

export function toElementReference(preferred: SelectorCandidate) {
  return {
    strategy: preferred.strategy,
    value: preferred.value,
    role: preferred.role,
    name: preferred.name,
    css: preferred.strategy === "css" ? preferred.value : undefined,
  };
}

// Node may not have CSS.escape in older runtimes
const CSS = globalThis.CSS ?? {
  escape(value: string): string {
    return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
  },
};
