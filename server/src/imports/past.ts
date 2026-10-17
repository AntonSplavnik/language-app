import type { ImportSummary, RenameImportResponse } from "@language-app/core";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { Executor } from "../db/client";
import { imports, userWords } from "../db/schema";
import { HttpError } from "../http/errors";

// Past imports: listed in Practice, My words and Settings, renamed in Settings and on Done
// (docs/design.md §9.2).

/**
 * The learner's past imports, newest first: `done` imports with at least one `learning` or
 * `learned` word, each with the number of those words. An import that added nothing to learn (no
 * new words, all skipped, or its words later deleted or set to Ignored) is left out; its row stays.
 */
export async function listPastImports(db: Executor, userId: number): Promise<ImportSummary[]> {
  const rows = await db
    .select({
      id: imports.id,
      name: imports.name,
      completedAt: imports.completedAt,
      wordCount: count(userWords.id),
    })
    .from(imports)
    .innerJoin(
      userWords,
      and(
        eq(userWords.importId, imports.id),
        eq(userWords.userId, userId),
        inArray(userWords.status, ["learning", "learned"]),
      ),
    )
    .where(and(eq(imports.userId, userId), eq(imports.status, "done")))
    .groupBy(imports.id)
    .orderBy(desc(imports.completedAt), desc(imports.id));

  return rows.map((row) => {
    // A done import always has its completion time (§6.5).
    if (!row.completedAt) throw new Error(`done import ${row.id} has no completed_at`);
    return { ...row, completedAt: row.completedAt.toISOString() };
  });
}

/** Names or renames an import in any status; null (or a blank name, trimmed by the schema) clears it. */
export async function renameImport(
  db: Executor,
  userId: number,
  id: number,
  name: string | null,
): Promise<RenameImportResponse> {
  const [row] = await db
    .update(imports)
    .set({ name: name || null })
    .where(and(eq(imports.id, id), eq(imports.userId, userId)))
    .returning({ id: imports.id, name: imports.name });
  if (!row) throw new HttpError(404, "import_not_found", "Import not found");
  return row;
}
