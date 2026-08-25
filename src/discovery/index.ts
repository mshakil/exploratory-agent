import type { ElementSnapshot, PageState } from "../browser/types.js";
import type { Element, ElementType, Page } from "../models/index.js";
import {
  buildSelectorSet,
  confidenceFromSelectors,
  inferElementType,
} from "../selectors/index.js";
import { createHash } from "node:crypto";

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "unnamed"
  );
}

export function inventPageName(state: PageState): string {
  const sample = state.visibleTextSample.trim();
  // data-page markers are short tokens like "create-user"
  if (sample && !sample.includes("\n") && sample.length < 40 && /^[a-z0-9-]+$/i.test(sample)) {
    return sample
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
  }
  if (state.activeTab) return state.activeTab.trim();
  if (state.modalOpen && sample) {
    return sample.split("\n")[0]?.trim() || "Modal";
  }
  const heading = sample.split("\n")[0]?.trim();
  if (heading && heading.length > 0 && heading.length < 80) {
    return heading;
  }
  try {
    const u = new URL(state.url);
    const hash = u.hash.replace(/^#\/?/, "");
    if (hash) {
      return hash
        .split(/[-_/]/)
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
    }
  } catch {
    // ignore
  }
  if (state.title && state.title.trim()) return state.title.trim();
  return "Page";
}

export function inventElementName(snapshot: ElementSnapshot, type: ElementType): string {
  const name =
    snapshot.attributes["data-testid"] ||
    snapshot.attributes["data-test"] ||
    snapshot.attributes["aria-label"] ||
    snapshot.attributes["name"] ||
    snapshot.attributes["placeholder"] ||
    (snapshot.text && !snapshot.text.includes("\n") ? snapshot.text : "") ||
    snapshot.accessibleName.split("\n")[0] ||
    snapshot.attributes["id"] ||
    type;
  return name.trim().slice(0, 120) || type;
}

export function snapshotToElement(
  snapshot: ElementSnapshot,
  pageId: string,
  index: number,
): Element {
  const type = inferElementType(snapshot);
  const name = inventElementName(snapshot, type);
  const selectors = buildSelectorSet(snapshot);
  const confidence = confidenceFromSelectors(selectors);

  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(snapshot.attributes)) {
    if (/password|token|secret|cookie|authorization/i.test(key)) {
      attributes[key] = "***";
    } else if (/password/i.test(key) || snapshot.inputType === "password") {
      attributes[key] = key === "type" ? value : "***";
    } else {
      attributes[key] = value;
    }
  }
  if (snapshot.attributes["data-testid"]) {
    attributes.testId = snapshot.attributes["data-testid"];
  }

  return {
    id: `${pageId}__${slugify(name)}__${index}`,
    name,
    type,
    text: snapshot.text || undefined,
    accessibleName: snapshot.accessibleName || undefined,
    role: snapshot.role,
    attributes,
    selectors,
    pageId,
    confidence,
    options: snapshot.options,
    required:
      snapshot.attributes["required"] !== undefined ||
      snapshot.attributes["aria-required"] === "true",
  };
}

export function discoverElements(state: PageState, pageId: string): Element[] {
  const elements: Element[] = [];
  const seen = new Set<string>();

  state.interactiveElements.forEach((snapshot, index) => {
    if (!snapshot.isEnabled) return;
    const el = snapshotToElement(snapshot, pageId, index);
    const key = `${el.type}:${el.name}:${el.selectors.preferred.strategy}:${el.selectors.preferred.value ?? el.selectors.preferred.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    elements.push(el);
  });

  return elements;
}

export function createPageRecord(params: {
  state: PageState;
  fingerprint: string;
  parentId?: string;
  reachedBy?: { action: string; element?: string };
  status?: Page["status"];
}): Page {
  const name = inventPageName(params.state);
  let path = params.state.url;
  try {
    const u = new URL(params.state.url);
    path = u.pathname + u.search + u.hash;
  } catch {
    // keep raw
  }

  return {
    id: `${slugify(name)}-${createHash("sha1").update(params.fingerprint).digest("hex").slice(0, 8)}`,
    name,
    url: path,
    title: params.state.title,
    pageType: params.state.modalOpen ? "modal" : "page",
    parentId: params.parentId,
    reachedBy: params.reachedBy,
    status: params.status ?? "DISCOVERED",
    stateFingerprint: params.fingerprint,
    timestamp: new Date().toISOString(),
    elementIds: [],
  };
}
