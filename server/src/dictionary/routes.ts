import {
  LookupQuery,
  type LookupResponse,
  SuggestQuery,
  type SuggestResponse,
} from "@language-app/core";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client";
import { SINGLE_USER_ID } from "../user";
import { lookup, suggest } from "./search";

/** The dictionary search for typed words (§9.3). */
export function dictionaryRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const userId = SINGLE_USER_ID;

  app.get("/api/dictionary/suggest", async (request): Promise<SuggestResponse> => {
    const { q } = SuggestQuery.parse(request.query);
    return { suggestions: await suggest(db, userId, q) };
  });

  app.get("/api/dictionary/lookup", async (request): Promise<LookupResponse> => {
    const { q } = LookupQuery.parse(request.query);
    return lookup(db, userId, q);
  });
}
