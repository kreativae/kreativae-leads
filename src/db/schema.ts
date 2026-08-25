import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const searches = pgTable("searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  segment: text("segment").notNull(),
  city: text("city").notNull(),
  state: text("state"),
  country: text("country").notNull().default("BR"),
  source: text("source").notNull().default("osm"), // osm | places
  mode: text("mode").notNull().default("city"), // city | radius
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  radiusKm: doublePrecision("radius_km"),
  status: text("status").notNull().default("running"), // running | done | failed
  resultsCount: integer("results_count").notNull().default(0),
  newCount: integer("new_count").notNull().default(0),
  withPhoneCount: integer("with_phone_count").notNull().default(0),
  withWhatsappCount: integer("with_whatsapp_count").notNull().default(0),
  noWebsiteCount: integer("no_website_count").notNull().default(0),
  durationMs: integer("duration_ms"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    searchId: uuid("search_id").references(() => searches.id, {
      onDelete: "set null",
    }),
    osmId: text("osm_id").notNull(),
    companyName: text("company_name").notNull(),
    ownerName: text("owner_name"),
    segment: text("segment").notNull(),
    city: text("city"),
    state: text("state"),
    country: text("country").notNull().default("BR"),
    address: text("address"),
    neighborhood: text("neighborhood"),
    postcode: text("postcode"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    phone: text("phone"),
    phoneAlt: text("phone_alt"),
    whatsapp: text("whatsapp"), // digits only, country code included
    email: text("email"),
    website: text("website"),
    instagram: text("instagram"),
    facebook: text("facebook"),
    linkedin: text("linkedin"),
    openingHours: text("opening_hours"),
    rating: doublePrecision("rating"),
    reviewsCount: integer("reviews_count"),
    priceLevel: text("price_level"),
    googleMapsUri: text("google_maps_uri"),
    categoryRaw: text("category_raw"),
    extra: jsonb("extra"),
    contactScore: integer("contact_score").notNull().default(0),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    websiteScore: integer("website_score"),
    websiteGrade: text("website_grade"), // modern | outdated | critical
    websiteChecks: jsonb("website_checks"),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    opportunity: text("opportunity").notNull().default("unreviewed"), // no_website | outdated | modern | unreviewed
    status: text("status").notNull().default("new"), // new | contacted | negotiating | won | lost
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("leads_osm_id_key").on(t.osmId)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactPhone: text("contact_phone").notNull(), // digits with country code
    contactName: text("contact_name"),
    leadId: uuid("lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("conversations_contact_phone_key").on(t.contactPhone)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // in | out
    body: text("body").notNull(),
    waMessageId: text("wa_message_id"),
    status: text("status").notNull().default("sent"), // sent | delivered | read | received
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("messages_wa_message_id_key").on(t.waMessageId)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("member"), // owner | member
    totpSecret: text("totp_secret"),
    totpEnabled: text("totp_enabled").notNull().default("no"),
    mustChangePassword: text("must_change_password").notNull().default("no"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("sessions_token_hash_key").on(t.tokenHash)],
);

export const totpChallenges = pgTable("totp_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const recoveryCodes = pgTable("recovery_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  event: text("event").notNull(),
  ip: text("ip"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Search = typeof searches.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
