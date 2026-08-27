export type AiProviderId = "openai" | "anthropic" | "azure-openai";

export type AiModuleId = "docs" | "enrich" | "explore-hints";

export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
  provider?: AiProviderId;
  model?: string;
}

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  provider: AiProviderId;
  model: string;
  apiKey: string;
  messages: AiChatMessage[];
  azureEndpoint?: string;
  azureDeployment?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiChatResult {
  text: string;
  usage: AiTokenUsage;
}

export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  models: string[];
  needsAzureEndpoint?: boolean;
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-sonnet-4-0"],
  },
  {
    id: "azure-openai",
    label: "Azure OpenAI",
    models: ["gpt-4o-mini", "gpt-4o"],
    needsAzureEndpoint: true,
  },
];

export const AI_RATE_TABLE: Record<
  string,
  { promptPerMillion: number; completionPerMillion: number }
> = {
  "gpt-4o-mini": { promptPerMillion: 0.15, completionPerMillion: 0.6 },
  "gpt-4o": { promptPerMillion: 2.5, completionPerMillion: 10 },
  "gpt-4.1-mini": { promptPerMillion: 0.4, completionPerMillion: 1.6 },
  "gpt-4.1": { promptPerMillion: 2, completionPerMillion: 8 },
  "claude-3-5-haiku-latest": { promptPerMillion: 0.8, completionPerMillion: 4 },
  "claude-3-5-sonnet-latest": { promptPerMillion: 3, completionPerMillion: 15 },
  "claude-sonnet-4-0": { promptPerMillion: 3, completionPerMillion: 15 },
};

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | undefined {
  const rates = AI_RATE_TABLE[model];
  if (!rates) return undefined;
  return (
    (promptTokens / 1_000_000) * rates.promptPerMillion +
    (completionTokens / 1_000_000) * rates.completionPerMillion
  );
}

export function emptyUsage(partial?: Partial<AiTokenUsage>): AiTokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    ...partial,
  };
}

export function addUsage(a: AiTokenUsage, b: AiTokenUsage): AiTokenUsage {
  const promptTokens = a.promptTokens + b.promptTokens;
  const completionTokens = a.completionTokens + b.completionTokens;
  const totalTokens = promptTokens + completionTokens;
  const estimatedCostUsd =
    a.estimatedCostUsd != null || b.estimatedCostUsd != null
      ? (a.estimatedCostUsd ?? 0) + (b.estimatedCostUsd ?? 0)
      : undefined;
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
    provider: b.provider ?? a.provider,
    model: b.model ?? a.model,
  };
}
