import { afterEach, describe, expect, it, vi } from "vitest";
import { listProviderModels } from "../../src/ai/list-models.js";

describe("listProviderModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists OpenAI chat models from the provider API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: "gpt-4o-mini" },
            { id: "text-embedding-3-small" },
            { id: "gpt-4o" },
            { id: "whisper-1" },
          ],
        }),
      }),
    );

    const models = await listProviderModels({ provider: "openai", apiKey: "sk-test" });
    expect(models).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("lists Anthropic models from the provider API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: "claude-3-5-haiku-latest", type: "model" },
            { id: "claude-3-5-sonnet-latest", type: "model" },
          ],
        }),
      }),
    );

    const models = await listProviderModels({ provider: "anthropic", apiKey: "ant-test" });
    expect(models).toEqual(["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest"]);
  });

  it("requires Azure endpoint", async () => {
    await expect(
      listProviderModels({ provider: "azure-openai", apiKey: "key" }),
    ).rejects.toThrow(/endpoint/i);
  });
});
