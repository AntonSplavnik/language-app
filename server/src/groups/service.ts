import type {
  AddToGroupResponse,
  CreateGroupRequest,
  CreateGroupResponse,
  GroupListResponse,
  GroupSummary,
  RemoveFromGroupResponse,
} from "@language-app/core";
import { and, count, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { Db, Executor } from "../db/client";
import { isUniqueViolation } from "../db/errors";
import { groups, groupWords, userWords } from "../db/schema";
import { HttpError } from "../http/errors";

// The learner's own groups of words (docs/design.md §9.5): made from a selection in My words,
// filled and emptied from it, renamed and deleted in Settings → Groups.

/**
 * The learner's groups with their counts, newest first (`created_at`, then id): `words` in every
 * status, `practisable` only `learning` + `learned`. Empty groups are listed too. `where` narrows
 * it to one group.
 */
async function groupRows(db: Executor, userId: number, where?: SQL): Promise<GroupSummary[]> {
  const practisable = inArray(userWords.status, ["learning", "learned"]);
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      createdAt: groups.createdAt,
      words: count(userWords.id),
      practisable: sql<number>`(count(${userWords.id}) filter (where ${practisable}))::int`,
    })
    .from(groups)
    .leftJoin(groupWords, eq(groupWords.groupId, groups.id))
    .leftJoin(userWords, eq(userWords.id, groupWords.userWordId))
    .where(and(eq(groups.userId, userId), where))
    .groupBy(groups.id)
    .orderBy(desc(groups.createdAt), desc(groups.id));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function listGroups(db: Db, userId: number): Promise<GroupListResponse> {
  return { groups: await groupRows(db, userId) };
}

/** The learner's groups with their counts, newest first (Practice setup's Group option, §8.1). */
export const groupCounts = (db: Executor, userId: number) => groupRows(db, userId);

/** One of the learner's groups with its counts; another learner's or an unknown one is 404. */
async function groupSummary(db: Executor, userId: number, id: number): Promise<GroupSummary> {
  const [group] = await groupRows(db, userId, eq(groups.id, id));
  if (!group) throw groupNotFound();
  return group;
}

/**
 * Locks the learner's group for the rest of the transaction, so its words change one request at a
 * time; another learner's or an unknown one is 404.
 */
async function lockGroup(db: Executor, userId: number, id: number): Promise<void> {
  const [found] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .for("update");
  if (!found) throw groupNotFound();
}

/** Every id must be one of the learner's words; otherwise 404 and nothing changes. */
async function checkWords(db: Executor, userId: number, userWordIds: number[]): Promise<void> {
  const [mine] = await db
    .select({ n: count() })
    .from(userWords)
    .where(and(eq(userWords.userId, userId), inArray(userWords.id, userWordIds)));
  // The ids are distinct (UserWordIds), so a count short of them means one isn't the learner's.
  if ((mine?.n ?? 0) !== userWordIds.length) {
    throw new HttpError(404, "word_not_found", "Word not found");
  }
}

/** Puts the words into the group, skipping those already in it; how many went in. */
async function insertWords(db: Executor, groupId: number, userWordIds: number[]): Promise<number> {
  const added = await db
    .insert(groupWords)
    .values(userWordIds.map((userWordId) => ({ groupId, userWordId })))
    .onConflictDoNothing()
    .returning({ id: groupWords.userWordId });
  return added.length;
}

/** A name another of the learner's groups has, ignoring case, is a conflict (the unique index). */
async function withNameCheck<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "group_exists", `You already have a group called “${name}”`);
    }
    throw error;
  }
}

/** A new group with the words in it (when there are some), in one transaction. */
export async function createGroup(
  db: Db,
  userId: number,
  { name, userWordIds = [] }: CreateGroupRequest,
): Promise<CreateGroupResponse> {
  return withNameCheck(name, () =>
    db.transaction(async (tx) => {
      if (userWordIds.length > 0) await checkWords(tx, userId, userWordIds);
      const [group] = await tx.insert(groups).values({ userId, name }).returning({ id: groups.id });
      if (!group) throw new Error("insert returned no row");
      const added = userWordIds.length > 0 ? await insertWords(tx, group.id, userWordIds) : 0;
      return { group: await groupSummary(tx, userId, group.id), added };
    }),
  );
}

/** A new name; the group's own in another case is allowed (the index compares it with itself). */
export async function renameGroup(
  db: Db,
  userId: number,
  id: number,
  name: string,
): Promise<GroupSummary> {
  const renamed = await withNameCheck(name, () =>
    db
      .update(groups)
      .set({ name })
      .where(and(eq(groups.id, id), eq(groups.userId, userId)))
      .returning({ id: groups.id }),
  );
  if (renamed.length === 0) throw groupNotFound();
  return groupSummary(db, userId, id);
}

/**
 * Deletes the group: its rows in `group_words` go with it, its words stay in the list, and the
 * sessions that practised it keep their answers without it (`group_id` set null).
 */
export async function deleteGroup(db: Db, userId: number, id: number): Promise<void> {
  const deleted = await db
    .delete(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .returning({ id: groups.id });
  if (deleted.length === 0) throw groupNotFound();
}

/** Puts the learner's words into their group; those already in it are skipped, not counted. */
export async function addToGroup(
  db: Db,
  userId: number,
  id: number,
  userWordIds: number[],
): Promise<AddToGroupResponse> {
  return db.transaction(async (tx) => {
    await lockGroup(tx, userId, id);
    await checkWords(tx, userId, userWordIds);
    return { added: await insertWords(tx, id, userWordIds) };
  });
}

/**
 * Takes the learner's words out of their group (they stay in the list); those not in it are
 * skipped, not counted.
 */
export async function removeFromGroup(
  db: Db,
  userId: number,
  id: number,
  userWordIds: number[],
): Promise<RemoveFromGroupResponse> {
  return db.transaction(async (tx) => {
    await lockGroup(tx, userId, id);
    await checkWords(tx, userId, userWordIds);
    const removed = await tx
      .delete(groupWords)
      .where(and(eq(groupWords.groupId, id), inArray(groupWords.userWordId, userWordIds)))
      .returning({ id: groupWords.userWordId });
    return { removed: removed.length };
  });
}

/**
 * The learner's words in the group (§9.1, §8.1); an id that isn't one of the learner's groups
 * matches nothing.
 */
export const inGroup = (userId: number, groupId: number): SQL =>
  inArray(
    userWords.id,
    sql`(select ${groupWords.userWordId} from ${groupWords} inner join ${groups} on ${groups.id} = ${groupWords.groupId} where ${groups.id} = ${groupId} and ${groups.userId} = ${userId})`,
  );

/** The learner's group, or 404 (a group session, §9). */
export async function requireGroup(db: Executor, userId: number, id: number): Promise<void> {
  const [found] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)));
  if (!found) throw groupNotFound();
}

const groupNotFound = () => new HttpError(404, "group_not_found", "Group not found");
