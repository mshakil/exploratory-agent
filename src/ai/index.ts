/**
 * Optional LLM hooks and BYOK providers.
 * Core exploration remains fully deterministic without an LLM.
 */

export type {
  AiProviderId,
  AiModuleId,
  AiTokenUsage,
  AiChatMessage,
  AiChatRequest,
  AiChatResult,
  AiProviderInfo,
} from "./types.js";

export {
  AI_PROVIDERS,
  AI_RATE_TABLE,
  estimateCostUsd,
  emptyUsage,
  addUsage,
} from "./types.js";

export { chatCompletion } from "./chat.js";
export {
  generateAiDocumentation,
  type GenerateAiDocumentationInput,
  type GenerateAiDocumentationResult,
} from "./docs-module.js";

export interface AiAssistant {
  nameFlow?(steps: string[]): Promise<string | null>;
  summarizePage?(title: string, elementNames: string[]): Promise<string | null>;
}

export class NoopAiAssistant implements AiAssistant {
  async nameFlow(): Promise<string | null> {
    return null;
  }
  async summarizePage(): Promise<string | null> {
    return null;
  }
}

/** Scaffold — enrich module (page/flow naming). Not wired in V1. */
export class EnrichAiModule {
  readonly id = "enrich" as const;
  async run(): Promise<{ usage: import("./types.js").AiTokenUsage }> {
    const { emptyUsage } = await import("./types.js");
    return { usage: emptyUsage() };
  }
}

/** Scaffold — explore-hints module. Not wired in V1. */
export class ExploreHintsAiModule {
  readonly id = "explore-hints" as const;
  async run(): Promise<{ usage: import("./types.js").AiTokenUsage }> {
    const { emptyUsage } = await import("./types.js");
    return { usage: emptyUsage() };
  }
}
