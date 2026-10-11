import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  return drizzle({ client: pool, schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;

/** The database or an open transaction: anything that can run queries. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
