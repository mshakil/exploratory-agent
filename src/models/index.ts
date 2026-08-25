import { z } from "zod";

export const SchemaVersion = "1.0" as const;

export const ActionStatusSchema = z.enum([
  "DISCOVERED",
  "PENDING",
  "EXECUTED",
  "SKIPPED",
  "FAILED",
  "BLOCKED",
]);
export type ActionStatus = z.infer<typeof ActionStatusSchema>;

export const PageStatusSchema = z.enum([
  "DISCOVERED",
  "EXPLORING",
  "COMPLETED",
  "BLOCKED",
  "FAILED",
]);
export type PageStatus = z.infer<typeof PageStatusSchema>;

export const ElementTypeSchema = z.enum([
  "button",
  "link",
  "input",
  "textarea",
  "select",
  "dropdown",
  "checkbox",
  "radio",
  "tab",
  "menu",
  "modal",
  "table",
  "pagination",
  "other",
]);
export type ElementType = z.infer<typeof ElementTypeSchema>;

export const ActionTypeSchema = z.enum([
  "click",
  "type",
  "select",
  "check",
  "uncheck",
  "navigate",
  "open",
  "expand",
  "other",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionSafetySchema = z.enum(["safe", "destructive", "unknown"]);
export type ActionSafety = z.infer<typeof ActionSafetySchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const SelectorCandidateSchema = z.object({
  strategy: z.string(),
  value: z.string().optional(),
  role: z.string().optional(),
  name: z.string().optional(),
  rank: z.number(),
});
export type SelectorCandidate = z.infer<typeof SelectorCandidateSchema>;

export const SelectorSetSchema = z.object({
  preferred: SelectorCandidateSchema,
  fallbacks: z.array(SelectorCandidateSchema),
});
export type SelectorSet = z.infer<typeof SelectorSetSchema>;

export const ElementSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ElementTypeSchema,
  text: z.string().optional(),
  accessibleName: z.string().optional(),
  role: z.string().optional(),
  attributes: z.record(z.string()).default({}),
  selectors: SelectorSetSchema,
  pageId: z.string(),
  confidence: ConfidenceSchema,
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});
export type Element = z.infer<typeof ElementSchema>;

export const ReachedBySchema = z.object({
  action: z.string(),
  element: z.string().optional(),
});
export type ReachedBy = z.infer<typeof ReachedBySchema>;

export const PageSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  title: z.string().optional(),
  pageType: z.string().optional(),
  parentId: z.string().optional(),
  reachedBy: ReachedBySchema.optional(),
  status: PageStatusSchema,
  stateFingerprint: z.string(),
  timestamp: z.string(),
  elementIds: z.array(z.string()).default([]),
});
export type Page = z.infer<typeof PageSchema>;

export const ActionSchema = z.object({
  id: z.string(),
  type: ActionTypeSchema,
  elementId: z.string(),
  elementName: z.string(),
  pageId: z.string(),
  safety: ActionSafetySchema,
  status: ActionStatusSchema,
  value: z.string().optional(),
  reason: z.string().optional(),
  resultingStateId: z.string().optional(),
  timestamp: z.string().optional(),
});
export type Action = z.infer<typeof ActionSchema>;

export const TransitionSchema = z.object({
  from: z.string(),
  action: z.object({
    type: z.string(),
    element: z.string(),
  }),
  to: z.string(),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const FlowStepSchema = z.object({
  order: z.number(),
  action: z.string(),
  element: z.string().optional(),
  value: z.string().optional(),
  selector: SelectorCandidateSchema.optional(),
  resultingState: z.string().optional(),
});
export type FlowStep = z.infer<typeof FlowStepSchema>;

export const FlowSchema = z.object({
  id: z.string(),
  name: z.string(),
  preconditions: z.array(z.string()).default([]),
  steps: z.array(FlowStepSchema),
  resultingState: z.string().optional(),
  outcome: z.string().optional(),
});
export type Flow = z.infer<typeof FlowSchema>;

export const ApplicationSchema = z.object({
  name: z.string(),
  baseUrl: z.string(),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const ExplorationMetaSchema = z.object({
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(["running", "completed", "interrupted", "failed"]),
  pagesDiscovered: z.number().default(0),
  elementsDiscovered: z.number().default(0),
  flowsDiscovered: z.number().default(0),
  selectorsCaptured: z.number().default(0),
  skippedActions: z.number().default(0),
  blockedStates: z.number().default(0),
  failedActions: z.number().default(0),
});
export type ExplorationMeta = z.infer<typeof ExplorationMetaSchema>;

export const ApplicationContextSchema = z.object({
  schemaVersion: z.literal(SchemaVersion),
  application: ApplicationSchema,
  pages: z.array(PageSchema),
  elements: z.array(ElementSchema),
  flows: z.array(FlowSchema),
  selectors: z.array(
    z.object({
      elementId: z.string(),
      elementName: z.string(),
      pageId: z.string(),
      selectors: SelectorSetSchema,
      confidence: ConfidenceSchema,
    }),
  ),
  transitions: z.array(TransitionSchema).default([]),
  actions: z.array(ActionSchema).default([]),
  exploration: ExplorationMetaSchema,
});
export type ApplicationContext = z.infer<typeof ApplicationContextSchema>;

export interface ExplorationBoundaries {
  maxPages: number;
  maxActionsPerPage: number;
  maxDepth: number;
  timeoutMs: number;
  maxDurationMs: number;
  excludedUrls: string[];
  excludedActions: string[];
}

export const DEFAULT_BOUNDARIES: ExplorationBoundaries = {
  maxPages: 50,
  maxActionsPerPage: 30,
  maxDepth: 8,
  timeoutMs: 10_000,
  maxDurationMs: 5 * 60_000,
  excludedUrls: [],
  excludedActions: [],
};

export interface ExploreOptions {
  url: string;
  start?: string;
  output: string;
  memoryDir: string;
  storageState?: string;
  username?: string;
  password?: string;
  headless: boolean;
  json: boolean;
  verbose: boolean;
  boundaries: ExplorationBoundaries;
  testData: Record<string, string>;
}

export const DEFAULT_TEST_DATA: Record<string, string> = {
  text: "ExploreTest",
  email: "explorer@example.test",
  password: "TestPass123!",
  search: "test",
  number: "42",
  phone: "5550100",
  name: "Test User",
};
