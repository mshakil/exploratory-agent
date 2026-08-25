import { mkdir, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ApplicationContext, Element, Flow, Page } from "../models/index.js";
import { SchemaVersion } from "../models/index.js";
import type { ChangeReport } from "../changes/index.js";
import { renderChangeReportMd } from "../changes/index.js";
import { generateFrameworkDoc, frameworkFileName } from "../frameworks/index.js";
import type { ExplorationRun, Framework, SessionStatistics } from "../sessions/types.js";
import { FRAMEWORK_LABELS } from "../sessions/types.js";

export interface DocumentationMeta {
  framework: Framework;
  applicationName: string;
  applicationUrl: string;
  status: string;
  statistics: SessionStatistics;
  runs: ExplorationRun[];
  changeReport?: ChangeReport;
  changeReportRelativePath?: string;
}

export async function generateDocumentation(
  context: ApplicationContext,
  outputDir: string,
  meta?: DocumentationMeta,
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });

  const framework = meta?.framework ?? "independent";
  const written: string[] = [];

  const files: Array<[string, string]> = [
    ["application.md", renderApplicationMd(context)],
    ["pages.md", renderPagesMd(context)],
    ["flows.md", renderFlowsMd(context)],
    ["selectors.md", renderSelectorsMd(context)],
    ["application.json", JSON.stringify(context, null, 2)],
    ["AGENTS.md", renderAgentsMd(framework)],
  ];

  for (const [name, content] of files) {
    await writeFile(path.join(outputDir, name), content, "utf8");
    written.push(path.join(outputDir, name));
  }

  const frameworkRel = await generateFrameworkDoc(context, framework, outputDir);
  if (frameworkRel) {
    written.push(path.join(outputDir, frameworkRel));
  }

  if (meta?.changeReport && meta.changeReportRelativePath) {
    const changeAbs = path.join(outputDir, meta.changeReportRelativePath);
    await mkdir(path.dirname(changeAbs), { recursive: true });
    const runLabel = path.basename(meta.changeReportRelativePath, ".md");
    await writeFile(changeAbs, renderChangeReportMd(meta.changeReport, runLabel), "utf8");
    written.push(changeAbs);
  }

  const changeHistory = await listChangeReports(outputDir);
  if (meta?.changeReportRelativePath && !changeHistory.includes(meta.changeReportRelativePath)) {
    changeHistory.push(meta.changeReportRelativePath);
  }

  const contextMd = renderContextMd({
    context,
    framework,
    applicationName: meta?.applicationName ?? context.application.name,
    applicationUrl: meta?.applicationUrl ?? context.application.baseUrl,
    status: meta?.status ?? context.exploration.status,
    statistics: meta?.statistics ?? {
      pages: context.exploration.pagesDiscovered,
      elements: context.exploration.elementsDiscovered,
      actions: 0,
      flows: context.exploration.flowsDiscovered,
    },
    runs: meta?.runs ?? [],
    frameworkRel,
    changeHistory,
    latestChangePath: meta?.changeReportRelativePath,
    latestChanges: meta?.changeReport,
  });
  await writeFile(path.join(outputDir, "CONTEXT.md"), contextMd, "utf8");
  written.push(path.join(outputDir, "CONTEXT.md"));

  return written;
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
      delete attributes.value;
    }
    return { ...el, attributes };
  });
}

function renderContextMd(params: {
  context: ApplicationContext;
  framework: Framework;
  applicationName: string;
  applicationUrl: string;
  status: string;
  statistics: SessionStatistics;
  runs: ExplorationRun[];
  frameworkRel: string | null;
  changeHistory: string[];
  latestChangePath?: string;
  latestChanges?: ChangeReport;
}): string {
  const frameworkLabel = FRAMEWORK_LABELS[params.framework];
  const contextFiles = [
    "application.md",
    "pages.md",
    "flows.md",
    "selectors.md",
    "application.json",
    "AGENTS.md",
  ];
  if (params.frameworkRel) contextFiles.push(params.frameworkRel);

  const historyLines =
    params.runs.length > 0
      ? params.runs
          .map(
            (r) =>
              `- ${r.id} (${r.type}) — ${r.status}${r.completedAt ? ` @ ${r.completedAt}` : ""}`,
          )
          .join("\n")
      : "- Initial exploration";

  const changeLines =
    params.changeHistory.length > 0
      ? params.changeHistory.map((c) => `- ${c}`).join("\n")
      : "- None yet";

  let latestBlock = "";
  if (params.latestChanges) {
    const s = params.latestChanges.summary;
    latestBlock = `
## Latest Changes

- New pages: ${s.pagesAdded}
- Removed pages: ${s.pagesRemoved}
- New elements: ${s.elementsAdded}
- Removed elements: ${s.elementsRemoved}
- Changed selectors: ${s.selectorsChanged}
- New flows: ${s.flowsAdded}
- Changed flows: ${s.flowsChanged}
${params.latestChangePath ? `\nSee: ${params.latestChangePath}\n` : ""}`;
  }

  return `# Application Automation Context

## Application

Name: ${params.applicationName}

URL: ${params.applicationUrl}

Status: ${params.status}

## Framework

${frameworkLabel}

## Current Statistics

- Pages: ${params.statistics.pages}
- Elements: ${params.statistics.elements}
- Actions: ${params.statistics.actions}
- Flows: ${params.statistics.flows}

## Context Files

${contextFiles.map((f) => `- ${f}`).join("\n")}

## Exploration History

${historyLines}

## Change History

${changeLines}
${latestBlock}
## How to Use

Read this file first.

Then inspect the referenced files required for the requested automation task.

Use the framework-specific context when implementing automation.

\`application.json\` is the machine-readable source of truth.

Discovered flows are application behavior, not automatically test cases.

Consider removed and changed elements before implementing automation.
`;
}

function renderAgentsMd(framework: Framework): string {
  const frameworkNote =
    framework === "independent"
      ? "No framework-specific file was generated. Use selectors.md (framework-neutral strategies)."
      : `Framework-specific mappings live under framework/${frameworkFileName(framework)}.`;

  return `# Application Context — Coding Agent Guide

This directory contains automatically discovered application knowledge for UI automation.

## Entry point

Start with **CONTEXT.md**. It references every other file in this directory.

You should not need the user to attach every document — follow the references from CONTEXT.md.

## What each file contains

| File | Purpose |
|------|---------|
| CONTEXT.md | Parent entry point — application metadata, stats, history, references |
| application.md | Human-readable application overview |
| pages.md | Discovered pages and their elements |
| flows.md | Discovered user flows (behavior, not tests) |
| selectors.md | Framework-neutral selector strategies |
| application.json | Machine-readable source of truth |
| AGENTS.md | This guide |
| framework/*.md | Optional framework-specific selector mappings |
| changes/*.md | Historical change reports from re-explorations |

## Selectors

Selectors in \`selectors.md\` use framework-neutral strategies (\`testId\`, \`role\`, \`css\`, etc.).

${frameworkNote}

Do not invent selectors that are not present in the discovered context.

## Flows

Discovered flows describe observed application behavior.

They are **not** automatically test cases. The SDET decides what should become automation.

## Changes

When change reports exist under \`changes/\`, review them before implementing:

- New pages / elements may need coverage
- Removed pages / elements should not be automated
- Changed selectors may break existing automation

## Source of truth

Prefer \`application.json\` when you need structured data.

Prefer markdown files for human-readable explanations.

## Compatible tools

This context is designed for Cursor, Claude Code, Codex, Antigravity, and other agentic IDEs.
`;
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

async function listChangeReports(outputDir: string): Promise<string[]> {
  const changesDir = path.join(outputDir, "changes");
  try {
    const entries = await readdir(changesDir);
    return entries
      .filter((e) => e.endsWith(".md"))
      .sort()
      .map((e) => `changes/${e}`);
  } catch {
    return [];
  }
}
