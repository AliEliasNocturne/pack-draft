# @pack-draft/api

HTTP API on **Fastify 5**, **Zod 4**, and **TypeScript** (ESM). Request and response validation uses [`fastify-type-provider-zod`](https://github.com/turkerdev/fastify-type-provider-zod).

Designed to match [ADR-003](../../docs/decisions/003-api-runtime-and-compute.md) (Node/TypeScript on ECS Fargate). Tests use **Vitest** per [ADR-009](../../docs/decisions/009-testing-framework.md).

## Prerequisites

Install dependencies from the **monorepo root** once (`pnpm install`). Node 22+ (see root `.nvmrc`).

## Development

From the repo root:

```sh
cp apps/api/.env.example apps/api/.env   # optional — defaults work locally
pnpm dev:api
```

Or from this directory:

```sh
pnpm dev
```

Dev server: [http://localhost:3000/health](http://localhost:3000/health) (port overridable via `PORT`).

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `3000` | Listen port |
| `LOG_LEVEL` | `info` | Fastify logger level |

Invalid values fail at startup. See `src/env.ts`.

## Scripts

Run from `apps/api` or with `pnpm --filter @pack-draft/api <script>` from the root.

| Script | Purpose |
| --- | --- |
| `dev` | `tsx watch src/server.ts` |
| `build` | Emit JS to `dist/` |
| `start` | `node dist/server.js` (run `build` first) |
| `typecheck` | `tsc --noEmit` |
| `test` | Vitest (`fastify.inject()` in tests — no network bind) |

## Project layout

```
src/
  server.ts       Entry: load env, listen, graceful shutdown
  app.ts          Fastify instance, Zod compiler, route registration
  env.ts          Zod-validated environment
  routes/         Route plugins (one file per area)
```

Add routes by registering a `FastifyPluginAsyncZod` in `app.ts`, with `schema.response` / body / query defined in Zod.

## Production build

```sh
pnpm build
PORT=3000 pnpm start
```

## Related docs

- [Root README](../../README.md) — monorepo commands
- [ADR-003](../../docs/decisions/003-api-runtime-and-compute.md) — runtime and hosting