import { describe, expect, it } from "vitest";
import {
  isLoginSubmit,
  isPasswordField,
  isUsernameField,
  resolveAuthTypedValue,
} from "../../src/discovery/login-fields.js";
import type { ElementSnapshot } from "../../src/browser/types.js";
import { buildSelectorSet } from "../../src/selectors/index.js";
import { DEFAULT_TEST_DATA } from "../../src/models/index.js";

function snap(partial: Partial<ElementSnapshot>): ElementSnapshot {
  return {
    tag: "input",
    text: "",
    accessibleName: "",
    attributes: {},
    isVisible: true,
    isEnabled: true,
    handleId: "1",
    ...partial,
  };
}

describe("login field detection", () => {
  it("detects OrangeHRM-style username/password", () => {
    const user = snap({
      accessibleName: "Username",
      placeholder: "Username",
      attributes: { name: "username", placeholder: "Username" },
    });
    const pass = snap({
      accessibleName: "Password",
      placeholder: "Password",
      inputType: "password",
      attributes: { name: "password", type: "password", placeholder: "Password" },
    });
    expect(isUsernameField(user)).toBe(true);
    expect(isPasswordField(pass)).toBe(true);
  });

  it("detects email login fields", () => {
    const email = snap({
      accessibleName: "firstname.lastname@10pearls.com",
      attributes: { name: "email", placeholder: "firstname.lastname@10pearls.com" },
    });
    expect(isUsernameField(email)).toBe(true);
  });

  it("detects Continue / Login submit buttons", () => {
    expect(
      isLoginSubmit(
        snap({
          tag: "button",
          role: "button",
          accessibleName: "Continue",
          text: "Continue",
        }),
      ),
    ).toBe(true);
    expect(
      isLoginSubmit(
        snap({
          tag: "button",
          role: "button",
          accessibleName: "Login",
          text: "Login",
        }),
      ),
    ).toBe(true);
  });
});

describe("auth typed values", () => {
  it("uses provided credentials for username/password fields", () => {
    expect(
      resolveAuthTypedValue("username", {}, {
        username: "Admin",
        password: "admin123",
        testData: DEFAULT_TEST_DATA,
      }),
    ).toBe("Admin");

    expect(
      resolveAuthTypedValue("password", { type: "password" }, {
        username: "Admin",
        password: "admin123",
        testData: DEFAULT_TEST_DATA,
      }),
    ).toBe("admin123");
  });

  it("does not treat username as a person name field", () => {
    expect(
      resolveAuthTypedValue("username", {}, {
        testData: DEFAULT_TEST_DATA,
      }),
    ).toBe(DEFAULT_TEST_DATA.text);
  });

  it("uses username for email when it looks like an email", () => {
    expect(
      resolveAuthTypedValue("email", { type: "email" }, {
        username: "mubbashir@example.com",
        password: "x",
        testData: DEFAULT_TEST_DATA,
      }),
    ).toBe("mubbashir@example.com");
  });
});

describe("password selectors", () => {
  it("prefers name over textbox role for password inputs", () => {
    const set = buildSelectorSet(
      snap({
        tag: "input",
        inputType: "password",
        type: "password",
        accessibleName: "Password",
        placeholder: "Password",
        attributes: { name: "password", type: "password", placeholder: "Password" },
        role: undefined,
      }),
    );
    expect(set.preferred.strategy).toBe("name");
    expect(set.preferred.value).toBe("password");
  });
});
