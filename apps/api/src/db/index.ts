import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Env } from "../env.js";
import * as schema from "./schema/index.js";

export function createDb(env: Pick<Env, "DATABASE_URL">) {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle({ client: pool, schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>["db"];
