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

export const userRoleEnum = pgEnum("user_role", ["admin", "analyst", "viewer"]);
export const severityEnum = pgEnum("severity", [
  "none",
  "low",
  "medium",
  "high",
  "critical",
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
export const allowlistPatternEnum = pgEnum("allowlist_pattern_type", [
  "cidr",
  "url",
]);
export const syncSourceEnum = pgEnum("sync_source", ["nvd", "bdu"]);

/** Better Auth user + app role */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    hostname: text("hostname"),
    ip: text("ip"),
    environment: text("environment"),
    criticality: integer("criticality").notNull().default(3),
    notes: text("notes"),
    createdById: text("created_by_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assets_ip_idx").on(t.ip),
    index("assets_hostname_idx").on(t.hostname),
  ],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    port: integer("port").notNull(),
    protocol: text("protocol").notNull().default("tcp"),
    name: text("name"),
    product: text("product"),
    version: text("version"),
    banner: text("banner"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("services_asset_port_proto_uidx").on(t.assetId, t.port, t.protocol),
  ],
);

export const vulnerabilities = pgTable(
  "vulnerabilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cveId: text("cve_id"),
    bduId: text("bdu_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Top-level severity = more critical of sources; computed from max CVSS */
    severity: severityEnum("severity"),
    cvssScore: numeric("cvss_score", { precision: 3, scale: 1 }),
    cvssVector: text("cvss_vector"),
    cvssV2Score: numeric("cvss_v2_score", { precision: 3, scale: 1 }),
    cvssV2Vector: text("cvss_v2_vector"),
    cvssV4Score: numeric("cvss_v4_score", { precision: 3, scale: 1 }),
    cvssV4Vector: text("cvss_v4_vector"),
    epssScore: numeric("epss_score", { precision: 6, scale: 5 }),
    kev: boolean("kev").notNull().default(false),
    vendors: jsonb("vendors").$type<string[]>().notNull().default([]),
    products: jsonb("products").$type<string[]>().notNull().default([]),
    cwes: jsonb("cwes").$type<string[]>().notNull().default([]),
    cpes: jsonb("cpes").$type<string[]>().notNull().default([]),
    references: jsonb("references")
      .$type<{ url: string; source?: string; tags?: string[] }[]>()
      .notNull()
      .default([]),
    affected:
      jsonb("affected").$type<
        {
          vendor: string;
          product: string;
          status?: string;
          versions?: string;
          cpe?: string;
        }[]
      >().notNull().default([]),
    /** Upstream published (NVD/BDU) */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Upstream updated/lastModified */
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    /** Local upsert timestamp — use for list sort / recent updates */
    localSyncedAt: timestamp("local_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    analystNotes: text("analyst_notes"),
  },
  (t) => [
    uniqueIndex("vulnerabilities_cve_uidx").on(t.cveId),
    uniqueIndex("vulnerabilities_bdu_uidx").on(t.bduId),
    index("vulnerabilities_severity_idx").on(t.severity),
    index("vulnerabilities_cvss_idx").on(t.cvssScore),
    index("vulnerabilities_kev_idx").on(t.kev),
    index("vulnerabilities_epss_idx").on(t.epssScore),
    index("vulnerabilities_local_synced_idx").on(t.localSyncedAt),
  ],
);

export const vulnerabilitySources = pgTable(
  "vulnerability_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vulnerabilityId: uuid("vulnerability_id")
      .notNull()
      .references(() => vulnerabilities.id, { onDelete: "cascade" }),
    source: vulnSourceEnum("source").notNull(),
    rawPayload: jsonb("raw_payload"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    sourceSeverity: text("source_severity"),
    sourceCvssScore: numeric("source_cvss_score", { precision: 3, scale: 1 }),
  },
  (t) => [
    uniqueIndex("vuln_sources_vuln_source_uidx").on(t.vulnerabilityId, t.source),
  ],
);

export const vulnerabilityTags = pgTable(
  "vulnerability_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    color: text("color"),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vulnerability_tags_owner_name_uidx").on(t.ownerUserId, t.name)],
);

export const vulnerabilityTagLinks = pgTable(
  "vulnerability_tag_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vulnerabilityId: uuid("vulnerability_id")
      .notNull()
      .references(() => vulnerabilities.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => vulnerabilityTags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vuln_tag_links_uidx").on(t.vulnerabilityId, t.tagId),
  ],
);

export const savedViews = pgTable("saved_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  query: text("query").notNull(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  isShared: boolean("is_shared").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vulnerabilityHistory = pgTable(
  "vulnerability_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vulnerabilityId: uuid("vulnerability_id")
      .notNull()
      .references(() => vulnerabilities.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    source: vulnSourceEnum("source"),
  },
  (t) => [index("vuln_history_vuln_at_idx").on(t.vulnerabilityId, t.at)],
);

export const allowlistTargets = pgTable("allowlist_targets", {
  id: uuid("id").defaultRandom().primaryKey(),
  pattern: text("pattern").notNull(),
  patternType: allowlistPatternEnum("pattern_type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scanJobs = pgTable("scan_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: scanTypeEnum("type").notNull(),
  status: scanStatusEnum("status").notNull().default("queued"),
  targets: jsonb("targets").$type<string[]>().notNull().default([]),
  options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
  errorMessage: text("error_message"),
  reportPath: text("report_path"),
  createdById: text("created_by_id").references(() => user.id),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    status: findingStatusEnum("status").notNull().default("open"),
    severity: severityEnum("severity"),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, {
      onDelete: "set null",
    }),
    vulnerabilityId: uuid("vulnerability_id").references(() => vulnerabilities.id, {
      onDelete: "set null",
    }),
    cveId: text("cve_id"),
    bduId: text("bdu_id"),
    scanJobId: uuid("scan_job_id").references(() => scanJobs.id, {
      onDelete: "set null",
    }),
    rawEvidence: jsonb("raw_evidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("findings_status_idx").on(t.status),
    index("findings_vuln_idx").on(t.vulnerabilityId),
    index("findings_cve_idx").on(t.cveId),
  ],
);

export const syncState = pgTable("sync_state", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: syncSourceEnum("source").notNull().unique(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),
  cursor: text("cursor"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof user.$inferSelect;
export type Vulnerability = typeof vulnerabilities.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type ScanJob = typeof scanJobs.$inferSelect;
export type AllowlistTarget = typeof allowlistTargets.$inferSelect;
export type SavedView = typeof savedViews.$inferSelect;
