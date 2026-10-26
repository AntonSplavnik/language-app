import { HttpError } from "../http/errors";

/**
 * The signed-in learner, read from the session for every API route but `/api/health` and
 * `/api/auth/*` (docs/design.md §4 Accounts). Routes keep everything per `id`, so another
 * learner's rows answer like unknown ones (404).
 */
export type Learner = {
  id: number;
  /** The language the AI writes translations in (§11), passed to every AI call. */
  learnerLanguage: string;
  /**
   * Whether the account may use the AI features (§4 Accounts, the AI switch): read from the
   * `users` row with the session on every request, so `user:ai` counts from the next one.
   */
  aiEnabled: boolean;
};

/** Who an AI call is for: their usage rows and their language (§11, §4 Accounts). */
export type LearnerRef = Pick<Learner, "id" | "learnerLanguage">;

/**
 * The AI routes' gate (photo and PDF imports, Ask AI, Add details): an account without AI gets
 * 403 `ai_not_enabled` before anything else happens.
 */
export function requireAi(learner: Learner): void {
  if (!learner.aiEnabled) {
    throw new HttpError(403, "ai_not_enabled", "AI isn't included in your account");
  }
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the session hook in front of every protected route (`auth/routes.ts`). */
    learner: Learner;
  }
}
