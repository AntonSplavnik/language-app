import type { HealthResponse } from "@language-app/core";
import Fastify, { type FastifyServerOptions } from "fastify";

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get("/api/health", async (): Promise<HealthResponse> => ({ status: "ok" }));

  return app;
}
