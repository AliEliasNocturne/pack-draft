import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Pool } from "pg";
import { createDb, type Db } from "./db/index.js";
import type { Env } from "./env.js";
import { healthRoutes } from "./routes/health.js";

export type AppDeps = {
  db?: Db;
  pool?: Pool;
};

export async function buildApp(env: Pick<Env, "LOG_LEVEL" | "DATABASE_URL">, deps: AppDeps = {}) {
  const { db, pool } = deps.db && deps.pool ? { db: deps.db, pool: deps.pool } : createDb(env);

  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
  }).withTypeProvider<ZodTypeProvider>();

  // Zod validates requests and serializes responses for every route.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("db", db);
  app.decorate("pool", pool);
  app.addHook("onClose", async () => {
    await pool.end();
  });

  await app.register(healthRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    pool: Pool;
  }
}
