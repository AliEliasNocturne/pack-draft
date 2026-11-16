import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "./app.js";
import { loadEnv } from "./env.js";

describe("GET /health", () => {
  let app: App;

  beforeAll(async () => {
    app = await buildApp({ LOG_LEVEL: "silent" });
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
  it("applies defaults", () => {
    expect(loadEnv({})).toMatchObject({ PORT: 3000, NODE_ENV: "development" });
  });

  it("rejects an invalid port", () => {
    expect(() => loadEnv({ PORT: "nope" })).toThrow(/Invalid environment/);
  });
});
