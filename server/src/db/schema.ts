import type {
  Article,
  Candidate,
  CardResult,
  CheckStatus,
  FormsSource,
  ImportStatus,
  LastResult,
  Pos,
  SessionSource,
  VerbForms,
  WordStatus,
} from "@language-app/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Tables from docs/design.md §5. Column names are snake_case in the database (casing: "snake_case").
// Value sets are plain text columns typed from the Zod enums in core.

const id = () => integer().primaryKey().generatedAlwaysAsIdentity();
const timestampTz = () => timestamp({ withTimezone: true });
const createdAt = () => timestampTz().notNull().defaultNow();
const emptyArray = sql`'{}'`;

export const users = pgTable("users", {
  id: id(),
  name: text().notNull(),
  learnerLanguage: text().notNull(),
  targetLanguage: text().notNull(),
  createdAt: createdAt(),
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
    checkStatus: text().$type<CheckStatus>().notNull(),
    enrichedAt: timestampTz(),
    createdAt: createdAt(),
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
      .references(() => users.id),
    name: text(),
    status: text().$type<ImportStatus>().notNull().default("collecting"),
    photoCount: integer().notNull().default(0),
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
      .references(() => users.id),
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
  },
  (t) => [
    unique("user_words_user_word").on(t.userId, t.wordId),
    index("user_words_user_status").on(t.userId, t.status),
  ],
);

export const sessions = pgTable("sessions", {
  id: id(),
  userId: integer()
    .notNull()
    .references(() => users.id),
  source: text().$type<SessionSource>().notNull(),
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
  },
  (t) => [
    index("dictionary_entries_lemma_pos").on(t.lemma, t.pos),
    index("dictionary_entries_lower_lemma_pos").on(sql`lower(${t.lemma})`, t.pos),
  ],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: integer()
      .notNull()
      .references(() => users.id),
    importId: integer().references(() => imports.id, { onDelete: "set null" }),
    callType: text().$type<"extract" | "enrich">().notNull(),
    model: text().notNull(),
    inputTokens: integer(),
    outputTokens: integer(),
    stopReason: text(),
    ok: boolean().notNull(),
    /** Wall-clock time of the call, including SDK retries; tracks the "under a minute" goal (§1). */
    durationMs: integer(),
    createdAt: createdAt(),
  },
  // Daily photo limit counts today's extract calls per user.
  (t) => [index("ai_usage_user_type_created").on(t.userId, t.callType, t.createdAt)],
);
