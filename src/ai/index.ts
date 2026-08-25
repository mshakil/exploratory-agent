/**
 * Optional LLM hooks. Core exploration remains fully deterministic without an LLM.
 * Implementations may later plug in providers for naming/summarization.
 */

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
