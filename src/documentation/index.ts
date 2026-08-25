import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApplicationContext, Element, Flow, Page } from "../models/index.js";
import { SchemaVersion } from "../models/index.js";

export async function generateDocumentation(
  context: ApplicationContext,
  outputDir: string,
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });

  const files = [
    ["application.md", renderApplicationMd(context)],
    ["pages.md", renderPagesMd(context)],
    ["flows.md", renderFlowsMd(context)],
    ["selectors.md", renderSelectorsMd(context)],
    ["application.json", JSON.stringify(context, null, 2)],
    ["AGENTS.md", renderAgentsMd()],
  ] as const;

  for (const [name, content] of files) {
    await writeFile(path.join(outputDir, name), content, "utf8");
  }

  return files.map(([name]) => path.join(outputDir, name));
}

export function buildApplicationContext(params: {
  application: ApplicationContext["application"];
  pages: Page[];
  elements: Element[];
  flows: Flow[];
  transitions: ApplicationContext["transitions"];
  actions: ApplicationContext["actions"];
  exploration: ApplicationContext["exploration"];
}): ApplicationContext {
  return {
    schemaVersion: SchemaVersion,
    application: params.application,
    pages: params.pages,
    elements: sanitizeElements(params.elements),
    flows: params.flows,
    selectors: params.elements.map((e) => ({
      elementId: e.id,
      elementName: e.name,
      pageId: e.pageId,
      selectors: e.selectors,
      confidence: e.confidence,
    })),
    transitions: params.transitions,
    actions: params.actions.map((a) => ({
      ...a,
      value: a.value && /pass|secret|token/i.test(a.elementName + (a.value || "")) ? "***" : a.value,
    })),
    exploration: params.exploration,
  };
}

function sanitizeElements(elements: Element[]): Element[] {
  return elements.map((el) => {
    const attributes = { ...el.attributes };
    for (const key of Object.keys(attributes)) {
      if (/password|token|secret|cookie|authorization|api[_-]?key/i.test(key)) {
        attributes[key] = "***";
      }
    }
    if (el.type === "input" && /password/i.test(el.name + (el.attributes.type || ""))) {
      // keep type, strip any value-like attrs
      delete attributes.value;
    }
    return { ...el, attributes };
  });
}

function renderApplicationMd(ctx: ApplicationContext): string {
  const areas = inferAreas(ctx.pages);
  return `# Application

**Name:** ${ctx.application.name}  
**Base URL:** ${ctx.application.baseUrl}  
**Schema version:** ${ctx.schemaVersion}

## Pages

${ctx.pages.map((p) => `- ${p.name} (\`${p.url}\`)`).join("\n") || "- None discovered"}

## Discovered Areas

${areas.map((a) => `- ${a}`).join("\n") || "- General"}

## Exploration Summary

- Status: ${ctx.exploration.status}
- Started: ${ctx.exploration.startedAt}
- Completed: ${ctx.exploration.completedAt ?? "n/a"}
- Pages: ${ctx.exploration.pagesDiscovered}
- Elements: ${ctx.exploration.elementsDiscovered}
- Flows: ${ctx.exploration.flowsDiscovered}
- Selectors: ${ctx.exploration.selectorsCaptured}
- Skipped actions: ${ctx.exploration.skippedActions}
- Failed actions: ${ctx.exploration.failedActions}
`;
}

function renderPagesMd(ctx: ApplicationContext): string {
  const elementsByPage = new Map<string, Element[]>();
  for (const el of ctx.elements) {
    if (!elementsByPage.has(el.pageId)) elementsByPage.set(el.pageId, []);
    elementsByPage.get(el.pageId)!.push(el);
  }

  const sections = ctx.pages.map((page) => {
    const els = elementsByPage.get(page.id) ?? [];
    const lines = [
      `## ${page.name}`,
      "",
      `- **ID:** \`${page.id}\``,
      `- **URL:** \`${page.url}\``,
      `- **Title:** ${page.title ?? ""}`,
      `- **Status:** ${page.status}`,
      `- **Type:** ${page.pageType ?? "page"}`,
      page.reachedBy
        ? `- **Reached by:** ${page.reachedBy.action}${page.reachedBy.element ? ` → ${page.reachedBy.element}` : ""}`
        : null,
      "",
      "### Elements",
      "",
      ...(els.length
        ? els.map(
            (e) =>
              `- **${e.name}** (${e.type}) — preferred: \`${formatSelector(e.selectors.preferred)}\` [${e.confidence}]`,
          )
        : ["- None"]),
      "",
    ];
    return lines.filter((l) => l !== null).join("\n");
  });

  return `# Pages\n\n${sections.join("\n") || "No pages discovered."}\n`;
}

function renderFlowsMd(ctx: ApplicationContext): string {
  if (ctx.flows.length === 0) {
    return `# Flows\n\nNo flows discovered.\n`;
  }

  const sections = ctx.flows.map((flow) => {
    const steps = flow.steps
      .map((s) => {
        const bits = [`${s.order}. ${capitalize(s.action)}`];
        if (s.element) bits.push(s.element);
        if (s.value) bits.push(`= ${s.value}`);
        if (s.selector) bits.push(`(\`${formatSelector(s.selector)}\`)`);
        return bits.join(" ");
      })
      .join("\n");

    return `## ${flow.name}

${flow.preconditions.length ? `**Preconditions:** ${flow.preconditions.join(", ")}\n` : ""}
${steps}

**Result:** ${flow.resultingState ?? flow.outcome ?? "n/a"}
`;
  });

  return `# Flows\n\n${sections.join("\n")}`;
}

function renderSelectorsMd(ctx: ApplicationContext): string {
  const lines = ctx.selectors.map((s) => {
    const fallbacks = s.selectors.fallbacks
      .map((f) => `  - \`${formatSelector(f)}\``)
      .join("\n");
    return `## ${s.elementName}

- **Element ID:** \`${s.elementId}\`
- **Page:** \`${s.pageId}\`
- **Confidence:** ${s.confidence}
- **Preferred:** \`${formatSelector(s.selectors.preferred)}\`
- **Fallbacks:**
${fallbacks || "  - None"}
`;
  });

  return `# Selectors\n\nFramework-neutral selector strategies discovered during exploration.\n\n${lines.join("\n") || "No selectors captured."}\n`;
}

function renderAgentsMd(): string {
  return `# Application Context

This directory contains automatically discovered application knowledge.

Before implementing automation:

1. Read application.md.
2. Read pages.md.
3. Read flows.md.
4. Read selectors.md.
5. Use application.json when structured information is required.

Selectors in selectors.md represent discovered selector strategies.

Do not assume that every discovered flow is a test case.

Use the discovered application context as the source of truth for UI structure.
`;
}

function formatSelector(s: {
  strategy: string;
  value?: string;
  role?: string;
  name?: string;
}): string {
  if (s.strategy === "role") {
    return `role=${s.role}${s.name ? ` name="${s.name}"` : ""}`;
  }
  return `${s.strategy}:${s.value ?? ""}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function inferAreas(pages: Page[]): string[] {
  const areas = new Set<string>();
  for (const page of pages) {
    const n = page.name.toLowerCase();
    if (/user/.test(n)) areas.add("User Management");
    else if (/report/.test(n)) areas.add("Reporting");
    else if (/setting|config/.test(n)) areas.add("Configuration");
    else if (/dash/.test(n)) areas.add("Dashboard");
    else if (/login|auth|sign/.test(n)) areas.add("Authentication");
    else if (/edit|create|form/.test(n)) areas.add("Forms");
  }
  return [...areas];
}
