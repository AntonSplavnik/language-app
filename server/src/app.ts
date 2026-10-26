import multipart from "@fastify/multipart";
import type { HealthResponse, SignInOptions } from "@language-app/core";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { AiClient } from "./ai/types";
import { type Auth, offersGoogle } from "./auth/auth";
import type { Learner } from "./auth/learner";
import { authRoutes, requireLearner } from "./auth/routes";
import type { Db } from "./db/client";
import { dictionaryRoutes } from "./dictionary/routes";
import { registerErrorHandling } from "./http/errors";
import { importRoutes } from "./imports/routes";
import { practiceRoutes } from "./practice/routes";
import { statsRoutes } from "./routes/stats";
import { wordRoutes } from "./words/routes";

export type AppDeps = {
  db: Db;
  ai: AiClient;
  auth: Auth;
  /** Extract calls allowed per user per day (§11.5). */
  dailyPhotoLimit: number;
  /** Ask AI (describe) calls allowed per user per day (§11.5). */
  dailyDescribeLimit: number;
  /** The zone whose midnight starts the daily limits' day (APP_TIME_ZONE, §11.5). */
  timeZone: string;
  /** The clock the daily limits read; the real one unless a test sets another. */
  now?: () => Date;
};

/** Photos arrive already shrunk to ≈0.5 MB (§6.2); this only stops accidents. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  registerErrorHandling(app);
  app.register(multipart, { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });
  app.decorateRequest("learner", null as unknown as Learner);

  // Open to everyone: the health check, whether Google is offered (Sign in asks before anyone is
  // signed in), and signing up, in and out.
  app.get("/api/health", async (): Promise<HealthResponse> => ({ status: "ok" }));
  app.get(
    "/api/sign-in-options",
    async (): Promise<SignInOptions> => ({ google: offersGoogle(deps.auth) }),
  );
  authRoutes(app, deps.auth);

  // Every other route needs a session and acts for its learner (§4 Accounts).
  app.register(async (learnerApp) => {
    learnerApp.addHook("onRequest", requireLearner(deps.auth));
    statsRoutes(learnerApp, deps);
    importRoutes(learnerApp, deps);
    wordRoutes(learnerApp, deps);
    dictionaryRoutes(learnerApp, deps);
    practiceRoutes(learnerApp, deps);
  });

  return app;
}
