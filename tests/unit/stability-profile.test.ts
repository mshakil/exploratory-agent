import { describe, expect, it } from "vitest";
import {
  applyStabilityProfile,
  stabilityTimingFor,
  SkipReasonCodeSchema,
  DEFAULT_BOUNDARIES,
} from "../../src/models/index.js";

describe("stability profiles", () => {
  it("defaults Balanced with consent on and shadow/frames off", () => {
    const b = applyStabilityProfile("balanced");
    expect(b.stabilityProfile).toBe("balanced");
    expect(b.dismissConsent).toBe(true);
    expect(b.exploreOpenShadow).toBe(false);
    expect(b.exploreSameOriginFrames).toBe(false);
  });

  it("Deep enables shadow and frames when not overridden", () => {
    const b = applyStabilityProfile("deep");
    expect(b.exploreOpenShadow).toBe(true);
    expect(b.exploreSameOriginFrames).toBe(true);
  });

  it("respects explicit overrides over profile defaults", () => {
    const b = applyStabilityProfile("deep", {
      exploreOpenShadow: false,
      dismissConsent: false,
    });
    expect(b.exploreOpenShadow).toBe(false);
    expect(b.dismissConsent).toBe(false);
  });

  it("Fast settle is shorter than Balanced and Deep", () => {
    const fast = stabilityTimingFor("fast");
    const balanced = stabilityTimingFor("balanced");
    const deep = stabilityTimingFor("deep");
    expect(fast.settleMs).toBeLessThan(balanced.settleMs);
    expect(balanced.mutationQuietMs).toBeGreaterThan(0);
    expect(deep.networkIdle).toBe(true);
  });

  it("preserves base page limits from DEFAULT_BOUNDARIES", () => {
    const b = applyStabilityProfile("fast");
    expect(b.maxPages).toBe(DEFAULT_BOUNDARIES.maxPages);
  });
});

describe("skip reason taxonomy", () => {
  it("includes H-A codes used by the stream", () => {
    expect(SkipReasonCodeSchema.parse("destructive")).toBe("destructive");
    expect(SkipReasonCodeSchema.parse("outside-allowlist")).toBe("outside-allowlist");
    expect(() => SkipReasonCodeSchema.parse("not-a-reason")).toThrow();
  });
});
