import type { EnrichPendingResponse } from "@language-app/core";
import type { FastifyInstance } from "fastify";
import type { AiClient } from "../ai/types";
import type { Db } from "../db/client";
import { SINGLE_USER_ID } from "../user";
import { enrichPendingForUser } from "./enrich";

export function wordRoutes(app: FastifyInstance, { db, ai }: { db: Db; ai: AiClient }) {
  const userId = SINGLE_USER_ID;

  app.post(
    "/api/words/enrich-pending",
    async (request): Promise<EnrichPendingResponse> =>
      enrichPendingForUser({ db, ai, log: request.log }, userId),
  );
}
