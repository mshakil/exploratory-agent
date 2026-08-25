import { describe, expect, it } from "vitest";
import { classifyAction, isSafeAction } from "../../src/discovery/action-classifier.js";

describe("action classification", () => {
  it("classifies destructive actions", () => {
    expect(classifyAction({ name: "Delete User" })).toBe("destructive");
    expect(classifyAction({ name: "Logout" })).toBe("destructive");
    expect(classifyAction({ name: "Publish Report" })).toBe("destructive");
    expect(classifyAction({ name: "Transfer" })).toBe("destructive");
    expect(classifyAction({ name: "Remove", attributes: { "data-testid": "remove-user" } })).toBe(
      "destructive",
    );
  });

  it("classifies safe actions", () => {
    expect(isSafeAction({ name: "Create User", elementType: "button" })).toBe(true);
    expect(isSafeAction({ name: "Next", elementType: "pagination" })).toBe(true);
    expect(isSafeAction({ name: "Users", elementType: "link" })).toBe(true);
    expect(isSafeAction({ name: "Apply Filter" })).toBe(true);
  });

  it("is deterministic", () => {
    for (let i = 0; i < 20; i++) {
      expect(classifyAction({ name: "Delete User" })).toBe("destructive");
      expect(classifyAction({ name: "Dashboard", elementType: "link" })).toBe("safe");
    }
  });
});
