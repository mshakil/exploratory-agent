import {
  boolean,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    usernameLower: text("username_lower").notNull(),
    passwordHash: text("password_hash").notNull(),
    salt: text("salt").notNull(),
    role: text("role").notNull(),
    email: text("email"),
    azureOid: text("azure_oid"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    usernameLowerUq: uniqueIndex("users_username_lower_uq").on(t.usernameLower),
    azureOidUq: uniqueIndex("users_azure_oid_uq").on(t.azureOid),
  }),
);

export const explorationSessions = pgTable(
  "exploration_sessions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    applicationName: text("application_name").notNull(),
    applicationUrl: text("application_url").notNull(),
    targetUsername: text("target_username"),
    framework: text("framework").notNull().default("independent"),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    error: text("error"),
    currentExplorationId: text("current_exploration_id"),
    statsPages: integer("stats_pages").notNull().default(0),
    statsElements: integer("stats_elements").notNull().default(0),
    statsActions: integer("stats_actions").notNull().default(0),
    statsFlows: integer("stats_flows").notNull().default(0),
    statsSkipped: integer("stats_skipped").notNull().default(0),
    contextRelpath: text("context_relpath").notNull(),
    memoryRelpath: text("memory_relpath").notNull(),
    stabilityProfile: text("stability_profile"),
    authMode: text("auth_mode"),
    domainAllowlist: jsonb("domain_allowlist").$type<string[]>().notNull().default([]),
    exploreOpenShadow: boolean("explore_open_shadow"),
    exploreSameOriginFrames: boolean("explore_same_origin_frames"),
    dismissConsent: boolean("dismiss_consent"),
    latestChanges: jsonb("latest_changes").$type<Record<string, number> | null>(),
    docGenerationMode: text("doc_generation_mode"),
    aiModules: jsonb("ai_modules").$type<string[]>().notNull().default([]),
    aiUsage: jsonb("ai_usage").$type<Record<string, unknown> | null>(),
    aiUsageHistory: jsonb("ai_usage_history").$type<unknown[]>().notNull().default([]),
  },
  (t) => ({
    ownerUpdatedIdx: index("exploration_sessions_owner_updated_idx").on(
      t.ownerUserId,
      t.updatedAt,
    ),
    statusIdx: index("exploration_sessions_status_idx").on(t.status),
  }),
);

export const explorationRuns = pgTable(
  "exploration_runs",
  {
    id: text("id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => explorationSessions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    status: text("status").notNull(),
    statistics: jsonb("statistics").$type<Record<string, number>>().notNull().default({}),
    changeReportRelpath: text("change_report_relpath"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sessionId, t.id] }),
  }),
);

export const explorationEvents = pgTable(
  "exploration_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => explorationSessions.id, { onDelete: "cascade" }),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    ts: timestamp("ts", { withTimezone: true, mode: "string" }).notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    status: text("status").notNull(),
  },
  (t) => ({
    sessionSeqIdx: index("exploration_events_session_seq_idx").on(t.sessionId, t.seq),
    sessionSeqUq: uniqueIndex("exploration_events_session_seq_uq").on(t.sessionId, t.seq),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof explorationSessions.$inferSelect;
export type RunRow = typeof explorationRuns.$inferSelect;
export type EventRow = typeof explorationEvents.$inferSelect;
