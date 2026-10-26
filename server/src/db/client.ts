import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/** The pool's settings besides the address: node-postgres's defaults unless given. */
export type PoolOptions = Omit<pg.PoolConfig, "connectionString">;

export function createDb(url: string, pool: PoolOptions = {}) {
  const client = new pg.Pool({ ...pool, connectionString: url });
  return drizzle({ client, schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;

/** The database or an open transaction: anything that can run queries. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
