import { z } from "zod";

export const FrameworkSchema = z.enum([
  "independent",
  "playwright",
  "selenium-java",
  "selenium-javascript",
  "cypress",
  "webdriverio",
]);
export type Framework = z.infer<typeof FrameworkSchema>;

/** Frameworks with an implemented documentation generator. */
export const IMPLEMENTED_FRAMEWORKS: Framework[] = [
  "independent",
  "playwright",
  "selenium-java",
];

export const FRAMEWORK_LABELS: Record<Framework, string> = {
  independent: "Framework Independent",
  playwright: "Playwright",
  "selenium-java": "Selenium Java",
  "selenium-javascript": "Selenium JavaScript",
  cypress: "Cypress",
  webdriverio: "WebdriverIO",
};

export const SessionStatusSchema = z.enum([
  "created",
  "initializing",
  "exploring",
  "re-exploring",
  "completed",
  "failed",
  "paused",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionStatisticsSchema = z.object({
  pages: z.number().default(0),
  elements: z.number().default(0),
  actions: z.number().default(0),
  flows: z.number().default(0),
});
export type SessionStatistics = z.infer<typeof SessionStatisticsSchema>;

export const RunStatisticsSchema = z.object({
  pagesDiscovered: z.number().default(0),
  pagesAdded: z.number().default(0),
  pagesRemoved: z.number().default(0),
  elementsDiscovered: z.number().default(0),
  elementsAdded: z.number().default(0),
  elementsRemoved: z.number().default(0),
  selectorsChanged: z.number().default(0),
  flowsAdded: z.number().default(0),
  flowsChanged: z.number().default(0),
});
export type RunStatistics = z.infer<typeof RunStatisticsSchema>;

export const ExplorationRunSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: z.enum(["initial", "resume"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(["running", "completed", "failed"]),
  statistics: RunStatisticsSchema,
  changeReportPath: z.string().optional(),
});
export type ExplorationRun = z.infer<typeof ExplorationRunSchema>;

export const ExplorationSessionSchema = z.object({
  id: z.string(),
  applicationName: z.string(),
  applicationUrl: z.string(),
  username: z.string().optional(),
  framework: FrameworkSchema.default("independent"),
  status: SessionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  currentExplorationId: z.string().optional(),
  statistics: SessionStatisticsSchema,
  contextPath: z.string(),
  memoryPath: z.string(),
  /** Latest change summary from the most recent resume run. */
  latestChanges: RunStatisticsSchema.optional(),
});
export type ExplorationSession = z.infer<typeof ExplorationSessionSchema>;

export const ExplorationEventTypeSchema = z.enum([
  "browser_initialized",
  "navigation_started",
  "navigation_completed",
  "page_discovered",
  "elements_discovered",
  "action_started",
  "action_completed",
  "action_failed",
  "action_skipped",
  "change_detected",
  "flow_discovered",
  "exploration_completed",
  "exploration_failed",
  "knowledge_loaded",
]);
export type ExplorationEventType = z.infer<typeof ExplorationEventTypeSchema>;

export const ExplorationEventStatusSchema = z.enum([
  "running",
  "success",
  "failed",
  "skipped",
  "new",
  "removed",
  "changed",
  "existing",
]);
export type ExplorationEventStatus = z.infer<typeof ExplorationEventStatusSchema>;

export const ExplorationEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  timestamp: z.string(),
  type: ExplorationEventTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  status: ExplorationEventStatusSchema,
});
export type ExplorationEvent = z.infer<typeof ExplorationEventSchema>;

/** Payload emitted by the exploration engine (session layer fills id/sessionId/timestamp). */
export interface ExplorationEventPayload {
  type: ExplorationEventType;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  status: ExplorationEventStatus;
  /** Optional live stats snapshot from the engine. */
  statistics?: Partial<SessionStatistics>;
  /** Optional application display name (e.g. from page title). */
  applicationName?: string;
}

export interface CreateSessionInput {
  applicationUrl: string;
  username?: string;
  password?: string;
  framework?: Framework;
  headless?: boolean;
  maxPages?: number;
  maxDepth?: number;
  maxDurationMs?: number;
}

export interface ResumeSessionInput {
  password?: string;
  headless?: boolean;
  maxPages?: number;
  maxDepth?: number;
  maxDurationMs?: number;
}

export const CONTEXT_DOCUMENTS = [
  { name: "CONTEXT.md", label: "Context Entry Point", kind: "markdown" as const, description: "Parent document for coding agents" },
  { name: "application.md", label: "Application Overview", kind: "markdown" as const, description: "Application summary and areas" },
  { name: "pages.md", label: "Discovered Pages", kind: "markdown" as const, description: "Pages and page elements" },
  { name: "flows.md", label: "Application Flows", kind: "markdown" as const, description: "Discovered user flows" },
  { name: "selectors.md", label: "Element Selectors", kind: "markdown" as const, description: "Framework-neutral selectors" },
  { name: "application.json", label: "Machine Readable Data", kind: "json" as const, description: "Structured source of truth" },
  { name: "AGENTS.md", label: "Coding Agent Guide", kind: "markdown" as const, description: "How agents should use this context" },
];
