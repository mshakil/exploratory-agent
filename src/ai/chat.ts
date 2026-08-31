import { estimateCostUsd, type AiChatRequest, type AiChatResult, type AiTokenUsage } from "./types.js";

function usageFromOpenAi(
  data: {
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  },
  model: string,
  provider: AiChatRequest["provider"],
): AiTokenUsage {
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;
  const totalTokens = data.usage?.total_tokens ?? promptTokens + completionTokens;
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: estimateCostUsd(model, promptTokens, completionTokens),
    provider,
    model,
  };
}

async function chatOpenAiCompatible(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  model: string,
  provider: AiChatRequest["provider"],
): Promise<AiChatResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `AI provider error (${res.status})`);
  }
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("AI provider returned empty content");
  return { text, usage: usageFromOpenAi(data, model, provider) };
}

async function chatAnthropic(req: AiChatRequest): Promise<AiChatResult> {
  const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const messages = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": req.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.2,
      system: system || undefined,
      messages,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Anthropic error (${res.status})`);
  }
  const text =
    data.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("\n")
      .trim() ?? "";
  if (!text) throw new Error("Anthropic returned empty content");
  const promptTokens = data.usage?.input_tokens ?? 0;
  const completionTokens = data.usage?.output_tokens ?? 0;
  return {
    text,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCostUsd: estimateCostUsd(req.model, promptTokens, completionTokens),
      provider: "anthropic",
      model: req.model,
    },
  };
}

export async function chatCompletion(req: AiChatRequest): Promise<AiChatResult> {
  if (!req.apiKey?.trim()) throw new Error("API key is required");
  if (!req.model?.trim()) throw new Error("Model is required");

  if (req.provider === "anthropic") {
    return chatAnthropic(req);
  }

  if (req.provider === "azure-openai") {
    const endpoint = (req.azureEndpoint || "").replace(/\/$/, "");
    const deployment = req.azureDeployment || req.model;
    if (!endpoint) throw new Error("Azure endpoint is required");
    const url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-08-01-preview`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": req.apiKey,
      },
      body: JSON.stringify({
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 4096,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    if (!res.ok) {
      throw new Error(data.error?.message || `Azure OpenAI error (${res.status})`);
    }
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("Azure OpenAI returned empty content");
    return { text, usage: usageFromOpenAi(data, req.model, "azure-openai") };
  }

  return chatOpenAiCompatible(
    "https://api.openai.com/v1/chat/completions",
    req.apiKey,
    {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 4096,
    },
    req.model,
    "openai",
  );
}
