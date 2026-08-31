import { describe, expect, it } from "vitest";
import {
  addUsage,
  emptyUsage,
  estimateCostUsd,
  AI_PROVIDERS,
} from "../../src/ai/index.js";

describe("AI usage aggregation", () => {
  it("sums token counts and estimated cost", () => {
    const a = emptyUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      estimatedCostUsd: 0.01,
      provider: "openai",
      model: "gpt-4o-mini",
    });
    const b = emptyUsage({
      promptTokens: 20,
      completionTokens: 10,
      totalTokens: 30,
      estimatedCostUsd: 0.002,
      provider: "openai",
      model: "gpt-4o-mini",
    });
    const sum = addUsage(a, b);
    expect(sum.promptTokens).toBe(120);
    expect(sum.completionTokens).toBe(60);
    expect(sum.totalTokens).toBe(180);
    expect(sum.estimatedCostUsd).toBeCloseTo(0.012);
  });

  it("estimates cost for known models", () => {
    const cost = estimateCostUsd("gpt-4o-mini", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.15 + 0.6);
  });

  it("returns undefined estimate for unknown models", () => {
    expect(estimateCostUsd("unknown-model", 100, 100)).toBeUndefined();
  });

  it("exposes BYOK provider catalog", () => {
    expect(AI_PROVIDERS.map((p) => p.id)).toEqual([
      "openai",
      "anthropic",
      "azure-openai",
    ]);
  });
});
