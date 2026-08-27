import { describe, expect, it } from "vitest";
import {
  buildSelectorSet,
  generateSelectorCandidates,
  inferElementType,
  rankSelectors,
} from "../../src/selectors/index.js";
import type { ElementSnapshot } from "../../src/browser/types.js";

function snap(partial: Partial<ElementSnapshot>): ElementSnapshot {
  return {
    tag: "button",
    text: "Save",
    accessibleName: "Save",
    attributes: {},
    isVisible: true,
    isEnabled: true,
    handleId: "1",
    ...partial,
  };
}

describe("selector ranking", () => {
  it("prefers test ids over css paths", () => {
    const candidates = generateSelectorCandidates(
      snap({
        attributes: {
          "data-testid": "save-user",
          id: "btn-1",
        },
        cssPath: "div > div > div > button",
        role: "button",
        accessibleName: "Save User",
        text: "Save User",
      }),
    );
    expect(candidates[0]?.strategy).toBe("testId");
    expect(candidates[0]?.value).toBe("save-user");
  });

  it("treats input[type=submit] as button not fillable input", () => {
    expect(
      inferElementType(
        snap({
          tag: "input",
          inputType: "submit",
          type: "submit",
          attributes: { "data-test": "login-button", type: "submit" },
          accessibleName: "Login",
          text: "Login",
        }),
      ),
    ).toBe("button");
  });

  it("ranks role+name above brittle css", () => {
    const set = buildSelectorSet(
      snap({
        tag: "button",
        role: "button",
        accessibleName: "Create User",
        text: "Create User",
        attributes: {},
        cssPath: "div > div > div > div > button:nth-of-type(2)",
      }),
    );
    expect(set.preferred.strategy).toBe("role");
    expect(set.preferred.name).toBe("Create User");
  });

  it("deduplicates and sorts by rank", () => {
    const ranked = rankSelectors([
      { strategy: "css", value: "button", rank: 10 },
      { strategy: "testId", value: "x", rank: 100 },
      { strategy: "testId", value: "x", rank: 100 },
      { strategy: "role", role: "button", name: "Go", rank: 85 },
    ]);
    expect(ranked).toHaveLength(3);
    expect(ranked[0]?.strategy).toBe("testId");
  });
});
