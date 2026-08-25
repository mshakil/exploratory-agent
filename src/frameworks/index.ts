import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApplicationContext, SelectorCandidate } from "../models/index.js";
import type { Framework } from "../sessions/types.js";
import { FRAMEWORK_LABELS } from "../sessions/types.js";

/** Generate framework-specific documentation from the neutral application model. */
export async function generateFrameworkDoc(
  context: ApplicationContext,
  framework: Framework,
  outputDir: string,
): Promise<string | null> {
  if (framework === "independent") return null;

  const content = renderFrameworkMd(context, framework);
  if (!content) return null;

  const dir = path.join(outputDir, "framework");
  await mkdir(dir, { recursive: true });
  const filename = frameworkFileName(framework);
  const filePath = path.join(dir, filename);
  await writeFile(filePath, content, "utf8");
  return `framework/${filename}`;
}

export function frameworkFileName(framework: Framework): string {
  switch (framework) {
    case "playwright":
      return "playwright.md";
    case "selenium-java":
      return "selenium-java.md";
    case "selenium-javascript":
      return "selenium-javascript.md";
    case "cypress":
      return "cypress.md";
    case "webdriverio":
      return "webdriverio.md";
    default:
      return "framework.md";
  }
}

export function renderFrameworkMd(
  context: ApplicationContext,
  framework: Framework,
): string | null {
  const label = FRAMEWORK_LABELS[framework];
  const header = `# ${label} Selectors

Generated from the framework-neutral application model.

Do not treat these as ready-made tests — they illustrate how discovered selectors map to ${label} APIs.

`;

  if (framework === "playwright") {
    const lines = context.selectors.map((s) => {
      const preferred = toPlaywright(s.selectors.preferred);
      const fallbacks = s.selectors.fallbacks
        .map((f) => `  - \`${toPlaywright(f)}\``)
        .join("\n");
      return `## ${s.elementName}

- **Page:** \`${s.pageId}\`
- **Preferred:** \`${preferred}\`
- **Fallbacks:**
${fallbacks || "  - None"}
`;
    });
    return header + (lines.join("\n") || "No selectors captured.\n");
  }

  if (framework === "selenium-java") {
    const lines = context.selectors.map((s) => {
      const preferred = toSeleniumJava(s.selectors.preferred);
      const fallbacks = s.selectors.fallbacks
        .map((f) => `  - \`${toSeleniumJava(f)}\``)
        .join("\n");
      return `## ${s.elementName}

- **Page:** \`${s.pageId}\`
- **Preferred:** \`${preferred}\`
- **Fallbacks:**
${fallbacks || "  - None"}
`;
    });
    return header + (lines.join("\n") || "No selectors captured.\n");
  }

  // Generators for other frameworks are not implemented yet
  return null;
}

function toPlaywright(s: SelectorCandidate): string {
  switch (s.strategy) {
    case "testId":
      return `page.getByTestId(${quote(s.value ?? "")})`;
    case "role":
      return s.name
        ? `page.getByRole(${quote(s.role ?? "button")}, { name: ${quote(s.name)} })`
        : `page.getByRole(${quote(s.role ?? "button")})`;
    case "label":
      return `page.getByLabel(${quote(s.value ?? "")})`;
    case "placeholder":
      return `page.getByPlaceholder(${quote(s.value ?? "")})`;
    case "text":
      return `page.getByText(${quote(s.value ?? "")})`;
    case "css":
      return `page.locator(${quote(s.value ?? "")})`;
    case "xpath":
      return `page.locator(${quote(`xpath=${s.value ?? ""}`)})`;
    case "id":
      return `page.locator(${quote(`#${s.value ?? ""}`)})`;
    default:
      return `page.locator(${quote(s.value ?? s.strategy)})`;
  }
}

function toSeleniumJava(s: SelectorCandidate): string {
  switch (s.strategy) {
    case "testId":
      return `By.cssSelector("[data-testid='${escapeJava(s.value ?? "")}']")`;
    case "id":
      return `By.id("${escapeJava(s.value ?? "")}")`;
    case "css":
      return `By.cssSelector("${escapeJava(s.value ?? "")}")`;
    case "xpath":
      return `By.xpath("${escapeJava(s.value ?? "")}")`;
    case "role":
      return s.name
        ? `By.xpath("//*[@role='${escapeJava(s.role ?? "")}' and contains(., '${escapeJava(s.name)}')]")`
        : `By.cssSelector("[role='${escapeJava(s.role ?? "")}']")`;
    case "label":
      return `By.xpath("//label[contains(., '${escapeJava(s.value ?? "")}')]/following::*[@id=substring-after(//label[contains(., '${escapeJava(s.value ?? "")}')]/@for,'')][1]")`;
    case "placeholder":
      return `By.cssSelector("[placeholder='${escapeJava(s.value ?? "")}']")`;
    case "text":
      return `By.xpath("//*[contains(normalize-space(.), '${escapeJava(s.value ?? "")}')]")`;
    default:
      return `By.cssSelector("${escapeJava(s.value ?? "")}")`;
  }
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function escapeJava(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'");
}
