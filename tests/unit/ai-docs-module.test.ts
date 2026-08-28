import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAiDocumentation } from "../../src/ai/docs-module.js";

vi.mock("../../src/ai/chat.js", () => ({
  chatCompletion: vi.fn(async () => ({
    text: "# Polished\n\nContent.",
    usage: {
      promptTokens: 5,
      completionTokens: 10,
      totalTokens: 15,
      provider: "openai",
      model: "gpt-test",
    },
  })),
}));

describe("generateAiDocumentation", () => {
  let workDir = "";

  afterEach(async () => {
    if (workDir) {
      await import("node:fs/promises").then(({ rm }) =>
        rm(workDir, { recursive: true, force: true }),
      );
      workDir = "";
    }
  });

  it("writes polished markdown to ai/ without modifying system files", async () => {
    workDir = await mkdtemp(path.join(os.tmpdir(), "ae-ai-docs-"));
    const systemDir = path.join(workDir, "application-context");
    const aiDir = path.join(systemDir, "ai");
    await mkdir(systemDir, { recursive: true });
    await writeFile(path.join(systemDir, "CONTEXT.md"), "# System context\n", "utf8");
    await writeFile(path.join(systemDir, "pages.md"), "# Pages\n", "utf8");

    const context = {
      application: { name: "Demo", baseUrl: "https://demo.example" },
      pages: [{ id: "p1", name: "Home", url: "https://demo.example/", elements: [] }],
      elements: [],
      flows: [],
      transitions: [],
    };

    const result = await generateAiDocumentation({
      context: context as never,
      systemDir,
      aiDir,
      modules: ["docs"],
      chat: { provider: "openai", model: "gpt-test", apiKey: "sk-test" },
    });

    expect(result.usedAi).toBe(true);
    expect(result.manifest?.provider).toBe("openai");

    const systemContext = await readFile(path.join(systemDir, "CONTEXT.md"), "utf8");
    expect(systemContext).toBe("# System context\n");

    const aiContext = await readFile(path.join(aiDir, "CONTEXT.md"), "utf8");
    expect(aiContext).toContain("Polished");

    const manifest = JSON.parse(await readFile(path.join(aiDir, "manifest.json"), "utf8"));
    expect(manifest.model).toBe("gpt-test");
  });
});
