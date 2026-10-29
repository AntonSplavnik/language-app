import type {
  AiCallType,
  Article,
  Candidate,
  CardResult,
  CheckStatus,
  FormsSource,
  ImportSource,
  ImportStatus,
  LastResult,
  Pos,
  SessionSource,
  ThemeKey,
  VerbForms,
  WordStatus,
} from "@language-app/core";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Tables from docs/design.md §5. Column names are snake_case in the database (casing: "snake_case").
// Value sets are plain text columns typed from the Zod enums in core.

const id = () => integer().primaryKey().generatedAlwaysAsIdentity();
const timestampTz = () => timestamp({ withTimezone: true });
const createdAt = () => timestampTz().notNull().defaultNow();
const emptyArray = sql`'{}'`;

/**
 * A learner's account, and Better Auth's user model (§5, §4 Accounts): it reads and writes these
 * columns by their property names. `name` is the username as typed (for a Google sign-up, the one
 * made from the email).
 */
export const users = pgTable("users", {
  id: id(),
  name: text().notNull(),
  learnerLanguage: text().notNull(),
  targetLanguage: text().notNull(),
  createdAt: createdAt(),
  /** Stored lower-case; null only on user 1 until `user:claim` gives it one. */
  email: text().unique(),
  emailVerified: boolean().notNull().default(false),
  /** Google's picture address, from a Google sign-up; unused for now. */
  image: text(),
  updatedAt: timestampTz().notNull().defaultNow(),
  /** Stored lower-case, unique; `displayUsername` keeps it as typed. */
  username: text().unique(),
  displayUsername: text(),
  /** Whether the account may use the AI features (§4 Accounts, the AI switch). No client can set it. */
  aiEnabled: boolean().notNull().default(false),
});

// Better Auth's own tables (§5), prefixed so they aren't confused with practice `sessions`.
// It addresses them by these export names (session.modelName etc. in auth/auth.ts).

/** One row per sign-in, found through the session cookie. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: id(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: timestampTz().notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: createdAt(),
    updatedAt: timestampTz().notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user").on(t.userId)],
);

/** One row per way to sign in: `credential` with the password hash, `google` with Google's id. */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: id(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    accessTokenExpiresAt: timestampTz(),
    refreshTokenExpiresAt: timestampTz(),
    scope: text(),
    idToken: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: timestampTz().notNull().defaultNow(),
  },
  (t) => [index("auth_accounts_user").on(t.userId)],
);

/** Unused until the email service exists (verification, password reset). */
export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestampTz().notNull(),
    createdAt: createdAt(),
    updatedAt: timestampTz().notNull().defaultNow(),
  },
  (t) => [index("auth_verifications_identifier").on(t.identifier)],
);

/** Sign-in and sign-up attempts per IP and path, so every server instance sees them (§4 Accounts). */
export const authRateLimits = pgTable("auth_rate_limits", {
  id: id(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  /** Milliseconds since the epoch, as Better Auth writes it. */
  lastRequest: bigint({ mode: "number" }).notNull(),
});

/** The emails allowed to create an account while `SIGNUP_MODE=invite` (§4 Accounts). */
export const invites = pgTable("invites", {
  /** Trimmed and lower-case. */
  email: text().primaryKey(),
  createdAt: createdAt(),
  /** When an account was created for it, and which; the invite doesn't matter after that. */
  usedAt: timestampTz(),
  /** Deleting the account removes its invite too (§4 Accounts). */
  userId: integer().references(() => users.id, { onDelete: "cascade" }),
});

/** Shared dictionary of word facts; no personal data. */
export const words = pgTable(
  "words",
  {
    id: id(),
    language: text().notNull(),
    lemma: text().notNull(),
    pos: text().$type<Pos>().notNull(),
    article: text().$type<Article>(),
    plural: text(),
    forms: jsonb().$type<VerbForms>(),
    formsSource: text().$type<FormsSource>(),
    exampleDe: text(),
    /** Pronunciation from Wiktionary, copied by enrichment (§6.6); null when it has none. */
    ipa: text(),
    /** Wikimedia Commons file name of the recording; its Commons page carries the licence and author. */
    audioFile: text(),
    /** The recording as MP3 on upload.wikimedia.org, streamed by the browser when played. */
    audioUrl: text(),
    checkStatus: text().$type<CheckStatus>().notNull(),
    enrichedAt: timestampTz(),
    createdAt: createdAt(),
    /**
     * Theme keys, 0–2, the main one first (§5): from the dictionary's themes, else from
     * enrichment (Call 2). Null until decided; `{}` is decided, no theme.
     */
    themes: text().array().$type<ThemeKey[]>(),
  },
  // der See and die See are different words; non-nouns (article NULL) must still be unique.
  (t) => [unique("words_identity").on(t.language, t.lemma, t.pos, t.article).nullsNotDistinct()],
);

export const wordTranslations = pgTable(
  "word_translations",
  {
    wordId: integer()
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    language: text().notNull(),
    translation: text().notNull(),
    exampleTranslation: text(),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.language] })],
);

export const imports = pgTable(
  "imports",
  {
    id: id(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text(),
    status: text().$type<ImportStatus>().notNull().default("collecting"),
    photoCount: integer().notNull().default(0),
    /** Photographed pages, or a list of words typed by hand (§6.7). */
    source: text().$type<ImportSource>().notNull().default("photos"),
    candidates: jsonb().$type<Candidate[]>().notNull().default([]),
    createdAt: createdAt(),
    completedAt: timestampTz(),
  },
  (t) => [index("imports_user_status").on(t.userId, t.status)],
);

/** The learner's relationship to a word. */
export const userWords = pgTable(
  "user_words",
  {
    id: id(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wordId: integer()
      .notNull()
      .references(() => words.id),
    status: text().$type<WordStatus>().notNull(),
    importId: integer().references(() => imports.id, { onDelete: "set null" }),
    addedAt: timestampTz().notNull().defaultNow(),
    customTranslation: text(),
    note: text(),
    timesSeen: integer().notNull().default(0),
    timesCorrect: integer().notNull().default(0),
    correctStreak: integer().notNull().default(0),
    lastResult: text().$type<LastResult>(),
    lastPracticedAt: timestampTz(),
    /** The learner's own themes, 0–2, replacing the word's for them; null = the word's (§5). */
    themes: text().array().$type<ThemeKey[]>(),
  },
  (t) => [
    unique("user_words_user_word").on(t.userId, t.wordId),
    index("user_words_user_status").on(t.userId, t.status),
  ],
);

/**
 * The learner's own groups of words (§5, M13.2), such as "Hard ones": made from a selection in My
 * words, renamed and deleted in Settings → Groups.
 */
export const groups = pgTable(
  "groups",
  {
    id: id(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Trimmed, 1–40 characters (GROUP_NAME_MAX in core). */
    name: text().notNull(),
    createdAt: createdAt(),
  },
  // One name per account, ignoring case: "Hard ones" and "hard ones" are the same group.
  (t) => [uniqueIndex("groups_user_name").on(t.userId, sql`lower(${t.name})`)],
);

/**
 * The words of the learner's list in each group; a word can be in any number of groups. Deleting
 * the group, or the word from the list, removes its rows.
 */
export const groupWords = pgTable(
  "group_words",
  {
    groupId: integer()
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userWordId: integer()
      .notNull()
      .references(() => userWords.id, { onDelete: "cascade" }),
    addedAt: timestampTz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userWordId] }),
    // Deleting a word from the list finds its rows.
    index("group_words_user_word").on(t.userWordId),
  ],
);

export const sessions = pgTable("sessions", {
  id: id(),
  userId: integer()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  source: text().$type<SessionSource>().notNull(),
  /** The import practised, for source `import`; null otherwise (§5). */
  importId: integer().references(() => imports.id, { onDelete: "set null" }),
  /** The theme practised, for source `theme`; null otherwise (§5). */
  theme: text().$type<ThemeKey>(),
  /** The group practised, for source `group`; null otherwise, and once the group is deleted (§5). */
  groupId: integer().references(() => groups.id, { onDelete: "set null" }),
  startedAt: timestampTz().notNull().defaultNow(),
  finishedAt: timestampTz(),
});

export const cardResults = pgTable(
  "card_results",
  {
    id: id(),
    sessionId: integer()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userWordId: integer()
      .notNull()
      .references(() => userWords.id, { onDelete: "cascade" }),
    result: text().$type<CardResult>().notNull(),
    flipped: boolean().notNull(),
    flipMs: integer(),
    answerMs: integer().notNull(),
    createdAt: createdAt(),
  },
  // One answer per card per session, so a retried request is never counted twice.
  (t) => [unique("card_results_session_word").on(t.sessionId, t.userWordId)],
);

/** Read-only reference loaded from Wiktionary (§7). */
export const dictionaryEntries = pgTable(
  "dictionary_entries",
  {
    id: id(),
    lemma: text().notNull(),
    pos: text().$type<Pos>().notNull(),
    genders: text().array().$type<Article[]>().notNull().default(emptyArray),
    plurals: text().array().notNull().default(emptyArray),
    forms: jsonb().$type<VerbForms>(),
    glossesEn: text().array().notNull().default(emptyArray),
    ipa: text(),
    audioFile: text(),
    audioUrl: text(),
  },
  (t) => [
    index("dictionary_entries_lemma_pos").on(t.lemma, t.pos),
    index("dictionary_entries_lower_lemma_pos").on(sql`lower(${t.lemma})`, t.pos),
    // Suggestions by prefix and similar words for typed words (§7, search); needs pg_trgm.
    index("dictionary_entries_lower_lemma_trgm").using("gin", sql`lower(${t.lemma}) gin_trgm_ops`),
  ],
);

/**
 * Inflected forms from Wiktionary's form-of entries, form → base word (§5, §7): ging → gehen,
 * Tische → Tisch. Only typed words use it (§6.7). Replaced with dictionary_entries.
 */
export const dictionaryForms = pgTable(
  "dictionary_forms",
  {
    form: text().notNull(),
    lemma: text().notNull(),
    pos: text().$type<Pos>().notNull(),
  },
  (t) => [
    unique("dictionary_forms_form_lemma_pos").on(t.form, t.lemma, t.pos),
    index("dictionary_forms_lower_form").on(sql`lower(${t.form})`),
  ],
);

/**
 * The themes of every dictionary word, from the one-off dictionary run (`themes:classify`, §7 Themes),
 * keyed as `words` is, so der See and die See can differ. Loaded by `import:wiktionary` from
 * `server/data/dictionary-themes.tsv` and replaced with the dictionary.
 */
export const dictionaryThemes = pgTable(
  "dictionary_themes",
  {
    lemma: text().notNull(),
    pos: text().$type<Pos>().notNull(),
    article: text().$type<Article>(),
    themes: text().array().$type<ThemeKey[]>().notNull(),
  },
  (t) => [unique("dictionary_themes_identity").on(t.lemma, t.pos, t.article).nullsNotDistinct()],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    importId: integer().references(() => imports.id, { onDelete: "set null" }),
    callType: text().$type<AiCallType>().notNull(),
    model: text().notNull(),
    inputTokens: integer(),
    outputTokens: integer(),
    stopReason: text(),
    ok: boolean().notNull(),
    /** Wall-clock time of the call, including SDK retries; tracks the "under a minute" goal (§1). */
    durationMs: integer(),
    createdAt: createdAt(),
  },
  // The daily limits count today's extract (photo) and describe (Ask AI) calls per user.
  (t) => [index("ai_usage_user_type_created").on(t.userId, t.callType, t.createdAt)],
);
