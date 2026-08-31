import type { AiProviderId } from "./types.js";

export interface ListModelsInput {
  provider: AiProviderId;
  apiKey: string;
  azureEndpoint?: string;
}

const OPENAI_EXCLUDE =
  /embed|whisper|tts|dall-e|realtime|audio|transcribe|moderation|davinci|babbage|codex|legacy|instruct|similarity|search|text-embedding|omni-moderation/i;

function isOpenAiChatModel(id: string): boolean {
  if (OPENAI_EXCLUDE.test(id)) return false;
  return /^(gpt-|o\d|chatgpt)/i.test(id);
}

function isAnthropicChatModel(id: string): boolean {
  return /^claude/i.test(id);
}

async function listOpenAiModels(apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    data?: Array<{ id: string }>;
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `OpenAI models error (${res.status})`);
  }
  const ids = (data.data ?? []).map((m) => m.id).filter(isOpenAiChatModel);
  return [...new Set(ids)].sort();
}

async function listAnthropicModels(apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    data?: Array<{ id: string; type?: string }>;
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Anthropic models error (${res.status})`);
  }
  const ids = (data.data ?? [])
    .map((m) => m.id)
    .filter((id) => isAnthropicChatModel(id));
  return [...new Set(ids)].sort();
}

async function listAzureOpenAiDeployments(
  apiKey: string,
  azureEndpoint: string,
): Promise<string[]> {
  const endpoint = azureEndpoint.replace(/\/$/, "");
  const url = `${endpoint}/openai/deployments?api-version=2024-10-01-preview`;
  const res = await fetch(url, {
    headers: { "api-key": apiKey },
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    data?: Array<{ id: string; model?: string; status?: string }>;
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Azure OpenAI deployments error (${res.status})`);
  }
  const names = (data.data ?? [])
    .filter((d) => !d.status || d.status === "succeeded")
    .map((d) => d.id);
  if (names.length) return [...new Set(names)].sort();

  // Fallback: model catalog when deployments list is empty/unavailable.
  const modelsUrl = `${endpoint}/openai/models?api-version=2024-10-01-preview`;
  const modelsRes = await fetch(modelsUrl, { headers: { "api-key": apiKey } });
  const modelsData = (await modelsRes.json().catch(() => ({}))) as {
    error?: { message?: string };
    data?: Array<{ id: string }>;
  };
  if (!modelsRes.ok) {
    throw new Error(
      modelsData.error?.message || `Azure OpenAI models error (${modelsRes.status})`,
    );
  }
  return [...new Set((modelsData.data ?? []).map((m) => m.id))].sort();
}

export async function listProviderModels(input: ListModelsInput): Promise<string[]> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) throw new Error("API key is required to list models");

  switch (input.provider) {
    case "openai":
      return listOpenAiModels(apiKey);
    case "anthropic":
      return listAnthropicModels(apiKey);
    case "azure-openai": {
      const endpoint = input.azureEndpoint?.trim();
      if (!endpoint) throw new Error("Azure endpoint is required");
      return listAzureOpenAiDeployments(apiKey, endpoint);
    }
    default:
      throw new Error(`Unsupported provider: ${input.provider}`);
  }
}
