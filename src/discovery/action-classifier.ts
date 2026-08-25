const DESTRUCTIVE_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bpublish\b/i,
  /\bsend\b/i,
  /\bpurchase\b/i,
  /\bbuy\b/i,
  /\btransfer\b/i,
  /\blog\s?out\b/i,
  /\bsign\s?out\b/i,
  /\bcancel\s+(order|subscription|account)\b/i,
  /\bdestroy\b/i,
  /\bdrop\b/i,
  /\bwipe\b/i,
  /\bpermanently\b/i,
  /\birreversible\b/i,
  /\bconfirm\s+delete\b/i,
  /\bdeactivate\b/i,
  /\bunsubscribe\b/i,
];

const SAFE_PATTERNS = [
  /\bnavigate\b/i,
  /\bopen\b/i,
  /\bexpand\b/i,
  /\bcollapse\b/i,
  /\bfilter\b/i,
  /\bsort\b/i,
  /\bnext\b/i,
  /\bprev(ious)?\b/i,
  /\bpage\b/i,
  /\btab\b/i,
  /\bview\b/i,
  /\bsearch\b/i,
  /\bcreate\b/i,
  /\badd\b/i,
  /\bedit\b/i,
  /\bsettings\b/i,
  /\breports?\b/i,
  /\busers?\b/i,
  /\bdashboard\b/i,
  /\blogin\b/i,
  /\bsign\s?in\b/i,
  /\bsave\b/i,
  /\bapply\b/i,
  /\bshow\b/i,
  /\bhide\b/i,
  /\bclose\b/i,
  /\bcancel\b/i,
];

export type SafetyClass = "safe" | "destructive" | "unknown";

export interface ClassifiableAction {
  name: string;
  type?: string;
  text?: string;
  attributes?: Record<string, string>;
  elementType?: string;
}

export function classifyAction(action: ClassifiableAction): SafetyClass {
  const haystack = [
    action.name,
    action.text,
    action.type,
    action.elementType,
    action.attributes?.["data-testid"],
    action.attributes?.["aria-label"],
    action.attributes?.["id"],
    action.attributes?.["class"],
    action.attributes?.["href"],
  ]
    .filter(Boolean)
    .join(" ");

  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(haystack)) {
      return "destructive";
    }
  }

  // Submit buttons that look transactional
  if (/\b(submit|confirm)\b/i.test(haystack) && /\b(payment|order|purchase|delete)\b/i.test(haystack)) {
    return "destructive";
  }

  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(haystack)) {
      return "safe";
    }
  }

  // Default form fills and generic clicks are treated as safe for exploration
  if (
    action.elementType === "input" ||
    action.elementType === "textarea" ||
    action.elementType === "select" ||
    action.elementType === "checkbox" ||
    action.elementType === "radio" ||
    action.elementType === "tab" ||
    action.elementType === "link" ||
    action.elementType === "pagination"
  ) {
    return "safe";
  }

  if (action.elementType === "button" || action.type === "click") {
    return "safe";
  }

  return "unknown";
}

export function isSafeAction(action: ClassifiableAction): boolean {
  return classifyAction(action) === "safe";
}
