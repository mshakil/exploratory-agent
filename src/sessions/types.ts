import { z } from "zod";

export const SessionStatusSchema = z.enum([
  "created",
  "initializing",
  "exploring",
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

export const ExplorationSessionSchema = z.object({
  id: z.string(),
  applicationName: z.string(),
  applicationUrl: z.string(),
  username: z.string().optional(),
  status: SessionStatusSchema,
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  statistics: SessionStatisticsSchema,
  contextPath: z.string(),
  memoryPath: z.string(),
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
  "flow_discovered",
  "exploration_completed",
  "exploration_failed",
]);
export type ExplorationEventType = z.infer<typeof ExplorationEventTypeSchema>;

export const ExplorationEventStatusSchema = z.enum([
  "running",
  "success",
  "failed",
  "skipped",
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
  headless?: boolean;
  maxPages?: number;
  maxDepth?: number;
  maxDurationMs?: number;
}

export const CONTEXT_DOCUMENTS = [
  { name: "application.md", label: "Application Overview", kind: "markdown" as const },
  { name: "pages.md", label: "Discovered Pages", kind: "markdown" as const },
  { name: "flows.md", label: "Application Flows", kind: "markdown" as const },
  { name: "selectors.md", label: "Element Selectors", kind: "markdown" as const },
  { name: "application.json", label: "Machine Readable Data", kind: "json" as const },
  { name: "AGENTS.md", label: "Coding Agent Guide", kind: "markdown" as const },
];
