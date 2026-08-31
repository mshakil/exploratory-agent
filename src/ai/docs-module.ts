import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApplicationContext } from "../models/index.js";
import type { DocumentationMeta } from "../documentation/index.js";
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

export interface AiDocManifest {
  provider: string;
  model: string;
  generatedAt: string;
  files: string[];
}

export interface GenerateAiDocumentationProgress {
  current: number;
  total: number;
  file: string;
  phase: "read" | "generate" | "write";
}

export interface GenerateAiDocumentationInput {
  context: ApplicationContext;
  /** System docs directory (application-context/). */
  systemDir: string;
  /** AI markdown output directory (application-context/ai/). */
  aiDir: string;
  meta?: DocumentationMeta;
  modules: AiModuleId[];
  chat: Omit<AiChatRequest, "messages">;
  onProgress?: (progress: GenerateAiDocumentationProgress) => void;
}

export interface GenerateAiDocumentationResult {
  files: string[];
  usage: AiTokenUsage;
  usedAi: boolean;
  manifest?: AiDocManifest;
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
 * Reads system-generated markdown from `systemDir`, polishes via LLM, and writes
 * results to `aiDir` without modifying system files. Re-running overwrites prior AI files.
 */
export async function generateAiDocumentation(
  input: GenerateAiDocumentationInput,
): Promise<GenerateAiDocumentationResult> {
  const wantsDocs = input.modules.includes("docs");
  if (!wantsDocs) {
    return { files: [], usage: emptyUsage(), usedAi: false };
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

  const total = DOC_FILES.length;
  const written: string[] = [];

  try {
    await mkdir(input.aiDir, { recursive: true });

    for (let i = 0; i < DOC_FILES.length; i++) {
      const name = DOC_FILES[i]!;
      const step = i + 1;
      input.onProgress?.({ current: step, total, file: name, phase: "read" });

      const systemPath = path.join(input.systemDir, name);
      let current = "";
      try {
        current = await readFile(systemPath, "utf8");
      } catch {
        continue;
      }
      if (!current.trim()) continue;

      input.onProgress?.({ current: step, total, file: name, phase: "generate" });
      const polished = await polishFile(input.chat, name, current, contextSummary);
      if (!polished.text.trim()) {
        throw new Error(`AI returned empty content for ${name}`);
      }

      input.onProgress?.({ current: step, total, file: name, phase: "write" });
      const aiPath = path.join(input.aiDir, name);
      await writeFile(
        aiPath,
        polished.text.endsWith("\n") ? polished.text : `${polished.text}\n`,
        "utf8",
      );
      written.push(aiPath);
      usage = addUsage(usage, polished.usage);
    }

    if (written.length === 0) {
      throw new Error("No system markdown files found to polish. Run exploration first.");
    }

    const manifest: AiDocManifest = {
      provider: input.chat.provider,
      model: input.chat.model,
      generatedAt: new Date().toISOString(),
      files: written.map((f) => path.basename(f)),
    };
    await writeFile(path.join(input.aiDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    return { files: written, usage, usedAi: true, manifest };
  } catch (err) {
    return {
      files: written,
      usage,
      usedAi: false,
      fallbackToSystem: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
