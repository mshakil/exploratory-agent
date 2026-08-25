import { describe, expect, it } from "vitest";
import { fingerprintState, areEquivalentStates } from "../../src/state/index.js";
import type { PageState } from "../../src/browser/types.js";

function state(partial: Partial<PageState>): PageState {
  return {
    url: "http://localhost/users",
    title: "Users",
    interactiveElements: [],
    modalOpen: false,
    visibleTextSample: "Users",
    ...partial,
  };
}

describe("state fingerprinting", () => {
  it("produces equivalent fingerprints for equivalent states", () => {
    const a = state({
      interactiveElements: [
        {
          tag: "button",
          text: "Create",
          accessibleName: "Create User",
          attributes: { "data-testid": "create-user" },
          isVisible: true,
          isEnabled: true,
          handleId: "1",
          role: "button",
        },
      ],
    });
    const b = state({
      interactiveElements: [
        {
          tag: "button",
          text: "Create",
          accessibleName: "Create User",
          attributes: { "data-testid": "create-user" },
          isVisible: true,
          isEnabled: true,
          handleId: "99",
          role: "button",
        },
      ],
    });
    expect(areEquivalentStates(a, b)).toBe(true);
    expect(fingerprintState(a)).toBe(fingerprintState(b));
  });

  it("changes fingerprint when modal opens", () => {
    const closed = state({ modalOpen: false });
    const open = state({ modalOpen: true });
    expect(fingerprintState(closed)).not.toBe(fingerprintState(open));
  });

  it("changes fingerprint when tab changes", () => {
    const a = state({ activeTab: "Overview" });
    const b = state({ activeTab: "Activity" });
    expect(fingerprintState(a)).not.toBe(fingerprintState(b));
  });
});
