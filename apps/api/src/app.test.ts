import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "./app.js";
import type { Db } from "./db/index.js";
import { DEFAULT_DATABASE_URL, loadEnv } from "./env.js";

function stubPool(): Pool {
  return {
    query: async () => ({ rows: [{ "?column?": 1 }] }),
    end: async () => undefined,
  } as unknown as Pool;
}

describe("GET /health", () => {
  let app: App;

  beforeAll(async () => {
    app = await buildApp(
      { LOG_LEVEL: "silent", DATABASE_URL: DEFAULT_DATABASE_URL },
      { db: {} as Db, pool: stubPool() },
    );
  });
  afterAll(async () => {
    await app.close();
  });

  it("returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });
});

describe("loadEnv", () => {
  it("applies defaults outside production", () => {
    expect(loadEnv({})).toMatchObject({
      PORT: 3000,
      NODE_ENV: "development",
      DATABASE_URL: DEFAULT_DATABASE_URL,
    });
  });

  it("rejects an invalid port", () => {
    expect(() => loadEnv({ PORT: "nope" })).toThrow(/Invalid environment/);
  });

  it("requires DATABASE_URL in production", () => {
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrow(/DATABASE_URL is required/);
  });

  it("accepts an explicit DATABASE_URL in production", () => {
    expect(
      loadEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://prod:prod@db:5432/pack",
      }),
    ).toMatchObject({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://prod:prod@db:5432/pack",
    });
  });
});
