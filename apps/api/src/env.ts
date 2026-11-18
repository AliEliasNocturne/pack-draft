import { z } from "zod";

export const DEFAULT_DATABASE_URL = "postgresql://pack:pack@localhost:5432/pack_draft";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema> & { DATABASE_URL: string };

/** Parse and validate environment variables. Throws with a readable message if invalid. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }

  const { NODE_ENV, DATABASE_URL, ...rest } = result.data;
  const databaseUrl =
    DATABASE_URL ?? (NODE_ENV === "production" ? undefined : DEFAULT_DATABASE_URL);

  if (!databaseUrl) {
    throw new Error("Invalid environment:\nDATABASE_URL is required when NODE_ENV is production");
  }

  return { NODE_ENV, DATABASE_URL: databaseUrl, ...rest };
}
