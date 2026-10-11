import { z } from "zod";

/** `GET /api/stats`: Home counters and unfinished imports (§9, §10). */
export const StatsResponse = z.object({
  learning: z.number().int().nonnegative(),
  learned: z.number().int().nonnegative(),
  /** The learner's words (not ignored) still waiting for enrichment (§6.6). */
  detailsPending: z.number().int().nonnegative(),
  unfinishedImports: z.array(
    z.object({
      id: z.number().int(),
      name: z.string().nullable(),
      status: z.enum(["collecting", "reviewing"]),
      photoCount: z.number().int().nonnegative(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type StatsResponse = z.infer<typeof StatsResponse>;
