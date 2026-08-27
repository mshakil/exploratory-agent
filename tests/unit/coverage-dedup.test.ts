import { describe, expect, it } from "vitest";

/**
 * Mirrors explorer alreadyExecutedSimilar scoping rules after coverage fix:
 * nav uniqueness is per-page, not global by label.
 */
function alreadyExecutedSimilar(
  actions: Array<{
    type: string;
    pageId: string;
    elementName: string;
    value?: string;
    status: string;
  }>,
  pageId: string,
  plan: { type: string; elementName: string; value?: string },
): boolean {
  return actions.some((a) => {
    if (a.type !== plan.type) return false;
    if ((a.value ?? "") !== (plan.value ?? "")) return false;
    if (!(a.status === "EXECUTED" || a.status === "SKIPPED" || a.status === "FAILED")) {
      return false;
    }
    return a.pageId === pageId && a.elementName === plan.elementName;
  });
}

describe("nav dedup scoping", () => {
  it("allows the same nav label on a different page", () => {
    const actions = [
      {
        type: "click",
        pageId: "page-a",
        elementName: "Settings",
        status: "EXECUTED",
      },
    ];
    expect(
      alreadyExecutedSimilar(actions, "page-b", {
        type: "click",
        elementName: "Settings",
      }),
    ).toBe(false);
  });

  it("blocks the same nav label on the same page", () => {
    const actions = [
      {
        type: "click",
        pageId: "page-a",
        elementName: "Settings",
        status: "EXECUTED",
      },
    ];
    expect(
      alreadyExecutedSimilar(actions, "page-a", {
        type: "click",
        elementName: "Settings",
      }),
    ).toBe(true);
  });
});
