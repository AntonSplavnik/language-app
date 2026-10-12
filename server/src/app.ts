import multipart from "@fastify/multipart";
import type { HealthResponse } from "@language-app/core";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { AiClient } from "./ai/types";
import type { Db } from "./db/client";
import { registerErrorHandling } from "./http/errors";
import { importRoutes } from "./imports/routes";
import { practiceRoutes } from "./practice/routes";
import { statsRoutes } from "./routes/stats";
import { wordRoutes } from "./words/routes";

export type AppDeps = {
  db: Db;
  ai: AiClient;
  /** Extract calls allowed per user per day (§11.5). */
  dailyPhotoLimit: number;
};

/** Photos arrive already shrunk to ≈0.5 MB (§6.2); this only stops accidents. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  registerErrorHandling(app);
  app.register(multipart, { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });

  app.get("/api/health", async (): Promise<HealthResponse> => ({ status: "ok" }));
  statsRoutes(app, deps);
  importRoutes(app, deps);
  wordRoutes(app, deps);
  practiceRoutes(app, deps);

  return app;
}
