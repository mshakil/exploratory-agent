import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApplicationContext } from "../models/index.js";
import {
  generateDocumentation,
  type DocumentationMeta,
} from "../documentation/index.js";
import { chatCompletion } from "./chat.js";
import {
  addUsage,
  emptyUsage,
  type AiChatRequest,
  type AiModuleId,
  type AiTokenUsage,
} from "./types.js";

const DOC_FILES = [
  "CONTEXT.md",
  "application.md",
  "pages.md",
  "flows.md",
  "selectors.md",
  "AGENTS.md",
] as const;

export interface GenerateAiDocumentationInput {
  context: ApplicationContext;
  outputDir: string;
  meta?: DocumentationMeta;
  modules: AiModuleId[];
  chat: Omit<AiChatRequest, "messages">;
}

export interface GenerateAiDocumentationResult {
  files: string[];
  usage: AiTokenUsage;
  usedAi: boolean;
  fallbackToSystem?: boolean;
  error?: string;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i);
  return (match?.[1] ?? trimmed).trim();
}

async function polishFile(
  chat: Omit<AiChatRequest, "messages">,
  fileName: string,
  content: string,
  contextSummary: string,
): Promise<{ text: string; usage: AiTokenUsage }> {
  const result = await chatCompletion({
    ...chat,
    messages: [
      {
        role: "system",
        content:
          "You rewrite application exploration documentation for SDETs and coding agents. " +
          "Keep all factual content (URLs, selectors, page names, element names, flows). " +
          "Improve clarity and structure. Output ONLY the markdown document body — no preamble.",
      },
      {
        role: "user",
        content:
          `Rewrite the file "${fileName}" for this application:\n${contextSummary}\n\n` +
          `Current content:\n\n${content.slice(0, 48_000)}`,
      },
    ],
  });
  return { text: stripFences(result.text), usage: result.usage };
}

/**
 * Always writes system docs first (including application.json), then optionally
 * polishes markdown files via the LLM when the docs module is enabled.
 */
export async function generateAiDocumentation(
  input: GenerateAiDocumentationInput,
): Promise<GenerateAiDocumentationResult> {
  const systemFiles = await generateDocumentation(input.context, input.outputDir, input.meta);
  const wantsDocs = input.modules.includes("docs");
  if (!wantsDocs) {
    return { files: systemFiles, usage: emptyUsage(), usedAi: false };
  }

  let usage = emptyUsage({
    provider: input.chat.provider,
    model: input.chat.model,
  });
  const contextSummary = [
    `Name: ${input.context.application.name}`,
    `URL: ${input.context.application.baseUrl}`,
    `Pages: ${input.context.pages.length}`,
    `Elements: ${input.context.elements.length}`,
    `Flows: ${input.context.flows.length}`,
  ].join("\n");

  try {
    await mkdir(input.outputDir, { recursive: true });
    for (const name of DOC_FILES) {
      const abs = path.join(input.outputDir, name);
      let current = "";
      try {
        current = await readFile(abs, "utf8");
      } catch {
        continue;
      }
      if (!current.trim()) continue;
      const polished = await polishFile(input.chat, name, current, contextSummary);
      if (!polished.text.trim()) {
        throw new Error(`AI returned empty content for ${name}`);
      }
      await writeFile(abs, polished.text.endsWith("\n") ? polished.text : `${polished.text}\n`, "utf8");
      usage = addUsage(usage, polished.usage);
    }
    return { files: systemFiles, usage, usedAi: true };
  } catch (err) {
    // Keep system docs; surface error to caller
    return {
      files: systemFiles,
      usage,
      usedAi: false,
      fallbackToSystem: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
