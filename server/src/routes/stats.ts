import type { StatsResponse } from "@language-app/core";
import { and, count, desc, eq, gt, inArray, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client";
import { imports, userWords } from "../db/schema";
import { SINGLE_USER_ID } from "../user";

export function statsRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get("/api/stats", async (): Promise<StatsResponse> => {
    const userId = SINGLE_USER_ID;

    const counts = await db
      .select({ status: userWords.status, count: count() })
      .from(userWords)
      .where(and(eq(userWords.userId, userId), inArray(userWords.status, ["learning", "learned"])))
      .groupBy(userWords.status);
    const countOf = (status: string) => counts.find((c) => c.status === status)?.count ?? 0;

    // An import with no photos yet has nothing to finish, so it gets no banner.
    const unfinished = await db
      .select({
        id: imports.id,
        name: imports.name,
        status: imports.status,
        photoCount: imports.photoCount,
        createdAt: imports.createdAt,
      })
      .from(imports)
      .where(and(eq(imports.userId, userId), ne(imports.status, "done"), gt(imports.photoCount, 0)))
      .orderBy(desc(imports.createdAt));

    return {
      learning: countOf("learning"),
      learned: countOf("learned"),
      unfinishedImports: unfinished.map((i) => ({
        ...i,
        status: i.status as "collecting" | "reviewing",
        createdAt: i.createdAt.toISOString(),
      })),
    };
  });
}
