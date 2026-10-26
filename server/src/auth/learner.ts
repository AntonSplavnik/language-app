/**
 * The signed-in learner, read from the session for every API route but `/api/health` and
 * `/api/auth/*` (docs/design.md §17.3). Routes keep everything per `id`, so another learner's
 * rows answer like unknown ones (404).
 */
export type Learner = {
  id: number;
  /** The language the AI writes translations in (§11), passed to every AI call. */
  learnerLanguage: string;
  /** Whether the account may use the AI features (§17.5; enforced from M12.2). */
  aiEnabled: boolean;
};

/** Who an AI call is for: their usage rows and their language (§11, §17.3). */
export type LearnerRef = Pick<Learner, "id" | "learnerLanguage">;

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the session hook in front of every protected route (`auth/routes.ts`). */
    learner: Learner;
  }
}
