import {
  CardResultRequest,
  CreateSessionRequest,
  type SessionOptionsResponse,
} from "@language-app/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client";
import { countSources, SOURCES } from "./select";
import { finishSession, recordResult, startSession } from "./service";

const Params = z.object({ id: z.coerce.number().int().positive() });

export function practiceRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get("/api/sessions/options", async (request): Promise<SessionOptionsResponse> => {
    const counts = await countSources(db, request.learner.id);
    return { options: SOURCES.map((source) => ({ source, count: counts[source] })) };
  });

  app.post("/api/sessions", async (request) =>
    startSession(db, request.learner.id, CreateSessionRequest.parse(request.body)),
  );

  app.post("/api/sessions/:id/results", async (request) => {
    const { id } = Params.parse(request.params);
    return recordResult(db, request.learner.id, id, CardResultRequest.parse(request.body));
  });

  app.post("/api/sessions/:id/finish", async (request) => {
    const { id } = Params.parse(request.params);
    return finishSession(db, request.learner.id, id);
  });
}
