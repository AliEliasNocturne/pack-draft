import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Env } from "./env.js";
import { healthRoutes } from "./routes/health.js";

export async function buildApp(env: Pick<Env, "LOG_LEVEL">) {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
  }).withTypeProvider<ZodTypeProvider>();

  // Zod validates requests and serializes responses for every route.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(healthRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
