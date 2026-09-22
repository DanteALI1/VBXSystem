import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---- Enums ----

export const userRoleEnum = pgEnum("user_role", ["admin", "analyst", "viewer"]);

export const severityEnum = pgEnum("severity", [
  "critical",
  "high",
  "medium",
  "low",
  "info",
  "unknown",
]);

export const vulnSourceEnum = pgEnum("vuln_source", ["nvd", "bdu"]);

export const findingStatusEnum = pgEnum("finding_status", [
  "open",
  "fixed",
  "accepted",
  "false_positive",
]);

export const scanTypeEnum = pgEnum("scan_type", [
  "nmap",
  "nuclei",
  "zap",
  "openvas",
]);

export const scanStatusEnum = pgEnum("scan_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const allowlistTypeEnum = pgEnum("allowlist_type", ["cidr", "url"]);

export const syncStatusEnum = pgEnum("sync_status", [
  "idle",
  "running",
  "succeeded",
  "failed",
]);

// ---- Better Auth + app users ----

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// ---- Domain ----

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hostname: text("hostname").notNull(),
    ip: text("ip").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("assets_ip_idx").on(table.ip),
    index("assets_hostname_idx").on(table.hostname),
  ],
);

export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  port: integer("port").notNull(),
  protocol: text("protocol").notNull(),
  name: text("name"),
  product: text("product"),
  version: text("version"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const vulnerabilities = pgTable(
  "vulnerabilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cveId: text("cve_id"),
    bduId: text("bdu_id"),
    title: text("title").notNull(),
    description: text("description"),
    severity: severityEnum("severity").notNull().default("unknown"),
    cvssScore: numeric("cvss_score", { precision: 3, scale: 1 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    modifiedAt: timestamp("modified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("vulnerabilities_cve_id_uidx").on(table.cveId),
    uniqueIndex("vulnerabilities_bdu_id_uidx").on(table.bduId),
    index("vulnerabilities_cve_id_idx").on(table.cveId),
    index("vulnerabilities_bdu_id_idx").on(table.bduId),
    index("vulnerabilities_severity_idx").on(table.severity),
  ],
);

export const vulnerabilitySources = pgTable("vulnerability_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  vulnerabilityId: uuid("vulnerability_id")
    .notNull()
    .references(() => vulnerabilities.id, { onDelete: "cascade" }),
  source: vulnSourceEnum("source").notNull(),
  rawJson: text("raw_json"),
  rawXml: text("raw_xml"),
  externalUrl: text("external_url"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scanJobs = pgTable("scan_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: scanTypeEnum("type").notNull(),
  status: scanStatusEnum("status").notNull().default("queued"),
  target: text("target").notNull(),
  optionsJson: jsonb("options_json"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vulnerabilityId: uuid("vulnerability_id").references(
      () => vulnerabilities.id,
      { onDelete: "set null" },
    ),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => services.id, {
      onDelete: "set null",
    }),
    scanJobId: uuid("scan_job_id").references(() => scanJobs.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    severity: severityEnum("severity").notNull().default("unknown"),
    status: findingStatusEnum("status").notNull().default("open"),
    cveId: text("cve_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("findings_status_idx").on(table.status)],
);

export const syncStates = pgTable(
  "sync_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: vulnSourceEnum("source").notNull(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    cursor: text("cursor"),
    token: text("token"),
    fileHash: text("file_hash"),
    metaJson: jsonb("meta_json"),
    status: syncStatusEnum("status").notNull().default("idle"),
  },
  (table) => [uniqueIndex("sync_states_source_uidx").on(table.source)],
);

export const allowlistTargets = pgTable("allowlist_targets", {
  id: uuid("id").defaultRandom().primaryKey(),
  pattern: text("pattern").notNull(),
  type: allowlistTypeEnum("type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---- Relations ----

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  scanJobs: many(scanJobs),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(users, { fields: [session.userId], references: [users.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(users, { fields: [account.userId], references: [users.id] }),
}));

export const assetsRelations = relations(assets, ({ many }) => ({
  services: many(services),
  findings: many(findings),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  asset: one(assets, { fields: [services.assetId], references: [assets.id] }),
  findings: many(findings),
}));

export const vulnerabilitiesRelations = relations(
  vulnerabilities,
  ({ many }) => ({
    sources: many(vulnerabilitySources),
    findings: many(findings),
  }),
);

export const vulnerabilitySourcesRelations = relations(
  vulnerabilitySources,
  ({ one }) => ({
    vulnerability: one(vulnerabilities, {
      fields: [vulnerabilitySources.vulnerabilityId],
      references: [vulnerabilities.id],
    }),
  }),
);

export const findingsRelations = relations(findings, ({ one }) => ({
  vulnerability: one(vulnerabilities, {
    fields: [findings.vulnerabilityId],
    references: [vulnerabilities.id],
  }),
  asset: one(assets, { fields: [findings.assetId], references: [assets.id] }),
  service: one(services, {
    fields: [findings.serviceId],
    references: [services.id],
  }),
  scanJob: one(scanJobs, {
    fields: [findings.scanJobId],
    references: [scanJobs.id],
  }),
}));

export const scanJobsRelations = relations(scanJobs, ({ one, many }) => ({
  creator: one(users, {
    fields: [scanJobs.createdBy],
    references: [users.id],
  }),
  findings: many(findings),
}));

// ---- Types ----

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type Service = typeof services.$inferSelect;
export type Vulnerability = typeof vulnerabilities.$inferSelect;
export type NewVulnerability = typeof vulnerabilities.$inferInsert;
export type VulnerabilitySource = typeof vulnerabilitySources.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
export type ScanJob = typeof scanJobs.$inferSelect;
export type SyncState = typeof syncStates.$inferSelect;
export type AllowlistTarget = typeof allowlistTargets.$inferSelect;
export type NewAllowlistTarget = typeof allowlistTargets.$inferInsert;

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];
export type VulnSource = (typeof vulnSourceEnum.enumValues)[number];
export type FindingStatus = (typeof findingStatusEnum.enumValues)[number];
export type ScanType = (typeof scanTypeEnum.enumValues)[number];
export type ScanStatus = (typeof scanStatusEnum.enumValues)[number];
export type AllowlistType = (typeof allowlistTypeEnum.enumValues)[number];
