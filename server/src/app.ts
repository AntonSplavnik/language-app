import type { HealthResponse } from "@language-app/core";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { Db } from "./db/client";
import { statsRoutes } from "./routes/stats";

export type AppDeps = {
  db: Db;
};

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get("/api/health", async (): Promise<HealthResponse> => ({ status: "ok" }));
  statsRoutes(app, deps);

  return app;
}
