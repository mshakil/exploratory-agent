import { describe, expect, it } from "vitest";
import { detectChanges, renderChangeReportMd } from "../../src/changes/index.js";
import type { ApplicationContext } from "../../src/models/index.js";
import { SchemaVersion } from "../../src/models/index.js";

function baseContext(overrides: Partial<ApplicationContext> = {}): ApplicationContext {
  return {
    schemaVersion: SchemaVersion,
    application: { name: "Demo", baseUrl: "https://shop.example.com" },
    pages: [
      {
        id: "page-home",
        name: "Home",
        url: "https://shop.example.com/",
        status: "COMPLETED",
        stateFingerprint: "fp1",
        timestamp: new Date().toISOString(),
        elementIds: ["el-1"],
      },
      {
        id: "page-orders",
        name: "Orders",
        url: "https://shop.example.com/orders",
        status: "COMPLETED",
        stateFingerprint: "fp2",
        timestamp: new Date().toISOString(),
        elementIds: ["el-2"],
      },
    ],
    elements: [
      {
        id: "el-1",
        name: "Login",
        type: "button",
        attributes: { "data-testid": "login-btn" },
        selectors: {
          preferred: { strategy: "testId", value: "login-btn", rank: 1 },
          fallbacks: [],
        },
        pageId: "page-home",
        confidence: "high",
      },
      {
        id: "el-2",
        name: "Create Order",
        type: "button",
        attributes: { "data-testid": "create-order" },
        selectors: {
          preferred: { strategy: "testId", value: "create-order", rank: 1 },
          fallbacks: [],
        },
        pageId: "page-orders",
        confidence: "high",
      },
    ],
    flows: [
      {
        id: "flow-1",
        name: "Create Order",
        preconditions: [],
        steps: [{ order: 1, action: "click", element: "Create Order" }],
        outcome: "order created",
      },
    ],
    selectors: [],
    transitions: [],
    actions: [],
    exploration: {
      startedAt: new Date().toISOString(),
      status: "completed",
      pagesDiscovered: 2,
      elementsDiscovered: 2,
      flowsDiscovered: 1,
      selectorsCaptured: 2,
      skippedActions: 0,
      blockedStates: 0,
      failedActions: 0,
    },
    ...overrides,
  };
}

describe("detectChanges", () => {
  it("detects new and removed pages", () => {
    const previous = baseContext();
    const current = baseContext({
      pages: [
        previous.pages[0]!,
        {
          id: "page-promo",
          name: "Promotions",
          url: "https://shop.example.com/promotions",
          status: "COMPLETED",
          stateFingerprint: "fp3",
          timestamp: new Date().toISOString(),
          elementIds: [],
        },
      ],
    });

    const report = detectChanges(previous, current);
    expect(report.summary.pagesAdded).toBe(1);
    expect(report.summary.pagesRemoved).toBe(1);
    expect(report.newPages[0]?.name).toBe("Promotions");
    expect(report.removedPages[0]?.name).toBe("Orders");
  });

  it("detects selector changes for matched elements", () => {
    const previous = baseContext();
    const current = baseContext({
      elements: previous.elements.map((el) =>
        el.name === "Create Order"
          ? {
              ...el,
              selectors: {
                preferred: { strategy: "css", value: "#create-order-v2", rank: 1 },
                fallbacks: [],
              },
            }
          : el,
      ),
    });

    const report = detectChanges(previous, current);
    expect(report.summary.selectorsChanged).toBe(1);
    expect(report.changedSelectors[0]?.name).toBe("Create Order");
  });

  it("detects new and changed flows", () => {
    const previous = baseContext();
    const current = baseContext({
      flows: [
        {
          id: "flow-1",
          name: "Create Order",
          preconditions: [],
          steps: [
            { order: 1, action: "click", element: "Create Order" },
            { order: 2, action: "type", element: "Qty", value: "1" },
          ],
          outcome: "order created",
        },
        {
          id: "flow-2",
          name: "Checkout",
          preconditions: [],
          steps: [{ order: 1, action: "click", element: "Checkout" }],
        },
      ],
    });

    const report = detectChanges(previous, current);
    expect(report.summary.flowsAdded).toBe(1);
    expect(report.summary.flowsChanged).toBe(1);
  });

  it("renders a change report markdown", () => {
    const report = detectChanges(baseContext(), baseContext({ pages: [baseContext().pages[0]!] }));
    const md = renderChangeReportMd(report, "exploration-002");
    expect(md).toContain("# Exploration Changes");
    expect(md).toContain("Removed pages:");
  });
});
