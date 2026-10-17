import {
  CardResultRequest,
  CreateSessionRequest,
  type SessionOptionsResponse,
} from "@language-app/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client";
import { SINGLE_USER_ID } from "../user";
import { countSources, SOURCES } from "./select";
import { finishSession, recordResult, startSession } from "./service";

const Params = z.object({ id: z.coerce.number().int().positive() });

export function practiceRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const userId = SINGLE_USER_ID;

  app.get("/api/sessions/options", async (): Promise<SessionOptionsResponse> => {
    const counts = await countSources(db, userId);
    return { options: SOURCES.map((source) => ({ source, count: counts[source] })) };
  });

  app.post("/api/sessions", async (request) =>
    startSession(db, userId, CreateSessionRequest.parse(request.body)),
  );

  app.post("/api/sessions/:id/results", async (request) => {
    const { id } = Params.parse(request.params);
    return recordResult(db, userId, id, CardResultRequest.parse(request.body));
  });

  app.post("/api/sessions/:id/finish", async (request) => {
    const { id } = Params.parse(request.params);
    return finishSession(db, userId, id);
  });
}
