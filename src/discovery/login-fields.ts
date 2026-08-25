import type { ElementSnapshot } from "../browser/types.js";

/** Concatenate common identity signals for an interactive field. */
export function fieldIdentity(e: ElementSnapshot): string {
  return [
    e.accessibleName,
    e.placeholder,
    e.text,
    e.attributes.name,
    e.attributes.id,
    e.attributes["aria-label"],
    e.attributes.autocomplete,
    e.attributes["data-testid"],
    e.attributes["data-test"],
    e.inputType,
    e.attributes.type,
  ]
    .filter(Boolean)
    .join(" ");
}

export function isPasswordField(e: ElementSnapshot): boolean {
  if (e.tag !== "input" && e.tag !== "textarea") return false;
  return (
    e.inputType === "password" ||
    e.attributes.type === "password" ||
    /password|passwd|\bpwd\b/i.test(fieldIdentity(e))
  );
}

export function isUsernameField(e: ElementSnapshot): boolean {
  if (e.tag !== "input" && e.tag !== "textarea") return false;
  if (isPasswordField(e)) return false;
  const type = (e.inputType || e.attributes.type || "").toLowerCase();
  if (type === "email") return true;
  const autocomplete = (e.attributes.autocomplete || "").toLowerCase();
  if (autocomplete === "username" || autocomplete === "email") return true;
  return /user\s?name|e-?mail|login|\buser\b|account/i.test(fieldIdentity(e));
}

export function isLoginSubmit(e: ElementSnapshot): boolean {
  const isButton =
    e.tag === "button" ||
    e.attributes.type === "submit" ||
    e.role === "button" ||
    (e.tag === "input" && /button|submit/i.test(e.attributes.type || ""));
  if (!isButton) return false;
  const blob = `${e.accessibleName} ${e.text} ${e.attributes.value || ""}`;
  return /log\s?in|sign\s?in|submit|continue|sign\s?on|authenticate/i.test(blob);
}

/**
 * Resolve fill value for auth-like inputs.
 * Returns undefined when the field is not auth-related.
 */
export function resolveAuthTypedValue(
  elementName: string,
  attributes: Record<string, string>,
  options: {
    username?: string;
    password?: string;
    testData: Record<string, string>;
  },
): string | undefined {
  const blob = `${elementName} ${attributes.type || ""} ${attributes.name || ""}`;

  if (attributes.type === "password" || /password|passwd|\bpwd\b/i.test(blob)) {
    return options.password ?? options.testData.password;
  }
  if (/e-?mail/i.test(blob) || attributes.type === "email") {
    if (options.username?.includes("@")) return options.username;
    return options.testData.email;
  }
  if (/user\s?name|\buser\b|login|account/i.test(blob)) {
    return options.username ?? options.testData.text;
  }
  return undefined;
}
