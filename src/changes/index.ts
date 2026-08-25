import type { ApplicationContext, Element, Flow, Page, SelectorCandidate } from "../models/index.js";
import type { RunStatistics } from "../sessions/types.js";

export interface ChangeReport {
  summary: RunStatistics;
  newPages: Array<{ name: string; url: string }>;
  removedPages: Array<{ name: string; url: string }>;
  newElements: Array<{ name: string; pageUrl: string }>;
  removedElements: Array<{ name: string; pageUrl: string }>;
  changedSelectors: Array<{ name: string; before: string; after: string }>;
  newFlows: Array<{ name: string }>;
  changedFlows: Array<{ name: string; reason: string }>;
  unresolved: Array<{ kind: string; detail: string }>;
}

/**
 * Diff previous vs current application context.
 * Matching priority: URL → testId → stable id → a11y name+role → semantic name+type+page.
 */
export function detectChanges(
  previous: ApplicationContext,
  current: ApplicationContext,
): ChangeReport {
  const prevPagesByUrl = indexBy(previous.pages, pageKey);
  const currPagesByUrl = indexBy(current.pages, pageKey);

  const newPages: ChangeReport["newPages"] = [];
  const removedPages: ChangeReport["removedPages"] = [];

  for (const [key, page] of currPagesByUrl) {
    if (!prevPagesByUrl.has(key)) {
      newPages.push({ name: page.name, url: page.url });
    }
  }
  for (const [key, page] of prevPagesByUrl) {
    if (!currPagesByUrl.has(key)) {
      removedPages.push({ name: page.name, url: page.url });
    }
  }

  const pageUrlById = new Map<string, string>();
  for (const p of [...previous.pages, ...current.pages]) {
    pageUrlById.set(p.id, normalizeUrl(p.url));
  }

  const prevElements = indexElements(previous.elements, pageUrlById);
  const currElements = indexElements(current.elements, pageUrlById);

  const newElements: ChangeReport["newElements"] = [];
  const removedElements: ChangeReport["removedElements"] = [];
  const changedSelectors: ChangeReport["changedSelectors"] = [];
  const unresolved: ChangeReport["unresolved"] = [];

  for (const [key, el] of currElements) {
    const prev = prevElements.get(key);
    if (!prev) {
      newElements.push({
        name: el.name,
        pageUrl: pageUrlById.get(el.pageId) ?? el.pageId,
      });
      continue;
    }
    const before = formatSelector(prev.selectors.preferred);
    const after = formatSelector(el.selectors.preferred);
    if (before !== after) {
      changedSelectors.push({ name: el.name, before, after });
    }
  }

  for (const [key, el] of prevElements) {
    if (!currElements.has(key)) {
      // Prefer matching by weaker keys before declaring removed
      const softMatch = findSoftMatch(el, currElements);
      if (softMatch) {
        unresolved.push({
          kind: "element",
          detail: `Unresolved Change: "${el.name}" may have moved or been renamed`,
        });
      } else {
        removedElements.push({
          name: el.name,
          pageUrl: pageUrlById.get(el.pageId) ?? el.pageId,
        });
      }
    }
  }

  const prevFlows = indexBy(previous.flows, (f) => f.name.toLowerCase().trim());
  const currFlows = indexBy(current.flows, (f) => f.name.toLowerCase().trim());

  const newFlows: ChangeReport["newFlows"] = [];
  const changedFlows: ChangeReport["changedFlows"] = [];

  for (const [key, flow] of currFlows) {
    const prev = prevFlows.get(key);
    if (!prev) {
      newFlows.push({ name: flow.name });
      continue;
    }
    if (flowSignature(prev) !== flowSignature(flow)) {
      changedFlows.push({ name: flow.name, reason: "steps or outcome changed" });
    }
  }

  const summary: RunStatistics = {
    pagesDiscovered: current.pages.length,
    pagesAdded: newPages.length,
    pagesRemoved: removedPages.length,
    elementsDiscovered: current.elements.length,
    elementsAdded: newElements.length,
    elementsRemoved: removedElements.length,
    selectorsChanged: changedSelectors.length,
    flowsAdded: newFlows.length,
    flowsChanged: changedFlows.length,
  };

  return {
    summary,
    newPages,
    removedPages,
    newElements,
    removedElements,
    changedSelectors,
    newFlows,
    changedFlows,
    unresolved,
  };
}

export function renderChangeReportMd(report: ChangeReport, runLabel: string): string {
  const s = report.summary;
  const lines = [
    `# Exploration Changes`,
    ``,
    `Run: ${runLabel}`,
    ``,
    `## Summary`,
    ``,
    `- New pages: ${s.pagesAdded}`,
    `- Removed pages: ${s.pagesRemoved}`,
    `- New elements: ${s.elementsAdded}`,
    `- Removed elements: ${s.elementsRemoved}`,
    `- Changed selectors: ${s.selectorsChanged}`,
    `- New flows: ${s.flowsAdded}`,
    `- Changed flows: ${s.flowsChanged}`,
    ``,
  ];

  lines.push(`## New Pages`, ``);
  if (report.newPages.length === 0) lines.push(`- None`, ``);
  else for (const p of report.newPages) lines.push(`- ${p.name} (\`${p.url}\`)`);

  lines.push(``, `## Removed Pages`, ``);
  if (report.removedPages.length === 0) lines.push(`- None`, ``);
  else for (const p of report.removedPages) lines.push(`- ${p.name} (\`${p.url}\`)`);

  lines.push(``, `## New Elements`, ``);
  if (report.newElements.length === 0) lines.push(`- None`, ``);
  else for (const e of report.newElements.slice(0, 50)) lines.push(`- ${e.name}`);

  lines.push(``, `## Removed Elements`, ``);
  if (report.removedElements.length === 0) lines.push(`- None`, ``);
  else for (const e of report.removedElements.slice(0, 50)) lines.push(`- ${e.name}`);

  lines.push(``, `## Selector Changes`, ``);
  if (report.changedSelectors.length === 0) lines.push(`- None`, ``);
  else {
    for (const c of report.changedSelectors) {
      lines.push(`- **${c.name}**: \`${c.before}\` → \`${c.after}\``);
    }
  }

  lines.push(``, `## New Flows`, ``);
  if (report.newFlows.length === 0) lines.push(`- None`, ``);
  else for (const f of report.newFlows) lines.push(`- ${f.name}`);

  lines.push(``, `## Changed Flows`, ``);
  if (report.changedFlows.length === 0) lines.push(`- None`, ``);
  else for (const f of report.changedFlows) lines.push(`- ${f.name} (${f.reason})`);

  if (report.unresolved.length > 0) {
    lines.push(``, `## Unresolved Changes`, ``);
    for (const u of report.unresolved) lines.push(`- ${u.detail}`);
  }

  lines.push(``);
  return lines.join("\n");
}

function pageKey(page: Page): string {
  return normalizeUrl(page.url);
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Drop trailing slash for comparison
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    u.pathname = path;
    return u.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

function indexBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(keyFn(item), item);
  return map;
}

function indexElements(
  elements: Element[],
  pageUrlById: Map<string, string>,
): Map<string, Element> {
  const map = new Map<string, Element>();
  for (const el of elements) {
    map.set(elementKey(el, pageUrlById), el);
  }
  return map;
}

function elementKey(el: Element, pageUrlById: Map<string, string>): string {
  const pageUrl = pageUrlById.get(el.pageId) ?? el.pageId;
  const testId =
    el.attributes["data-testid"] ||
    el.attributes["data-test-id"] ||
    el.attributes["data-test"] ||
    "";
  if (testId) return `testid:${pageUrl}:${testId}`;

  const preferred = el.selectors.preferred;
  if (preferred.strategy === "testId" && preferred.value) {
    return `testid:${pageUrl}:${preferred.value}`;
  }
  if (preferred.strategy === "id" && preferred.value) {
    return `id:${pageUrl}:${preferred.value}`;
  }

  const a11y = (el.accessibleName || el.role || "").toLowerCase().trim();
  if (a11y) return `a11y:${pageUrl}:${el.type}:${a11y}`;

  return `name:${pageUrl}:${el.type}:${el.name.toLowerCase().trim()}`;
}

function findSoftMatch(el: Element, curr: Map<string, Element>): Element | undefined {
  const name = el.name.toLowerCase().trim();
  for (const candidate of curr.values()) {
    if (candidate.type === el.type && candidate.name.toLowerCase().trim() === name) {
      return candidate;
    }
  }
  return undefined;
}

function flowSignature(flow: Flow): string {
  return JSON.stringify({
    steps: flow.steps.map((s) => ({
      action: s.action,
      element: s.element,
      value: s.value,
    })),
    outcome: flow.outcome,
    resultingState: flow.resultingState,
  });
}

function formatSelector(s: SelectorCandidate): string {
  if (s.strategy === "role") {
    return `role=${s.role}${s.name ? ` name="${s.name}"` : ""}`;
  }
  return `${s.strategy}:${s.value ?? ""}`;
}
