# @pack-draft/api

HTTP API on **Fastify 5**, **Zod 4**, **Drizzle ORM**, and **TypeScript** (ESM). Request and response validation uses [`fastify-type-provider-zod`](https://github.com/turkerdev/fastify-type-provider-zod).

Designed to match [ADR-003](../../docs/decisions/003-api-runtime-and-compute.md) (Node/TypeScript on ECS Fargate) and [ADR-012](../../docs/decisions/012-orm-and-migrations.md) (Drizzle + Drizzle Kit). Tests use **Vitest** per [ADR-009](../../docs/decisions/009-testing-framework.md).

## Prerequisites

Install dependencies from the **monorepo root** once (`pnpm install`). Node 22+ (see root `.nvmrc`). Docker is required for the local Postgres container.

## Local Postgres

From the **repo root**:

```sh
pnpm db:up
```

That starts Postgres 17 via [docker-compose.yml](../../docker-compose.yml):

| Setting | Value |
| --- | --- |
| Host / port | `localhost:5432` |
| User / password | `pack` / `pack` |
| Database | `pack_draft` |
| URL | `postgresql://pack:pack@localhost:5432/pack_draft` |

Stop it with `pnpm db:down` (data persists in the `pack_draft_pg` volume unless you also remove the volume).

## Development

From the repo root:

```sh
cp apps/api/.env.example apps/api/.env   # optional — defaults match docker compose
pnpm db:up
pnpm db:migrate
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
| `DATABASE_URL` | `postgresql://pack:pack@localhost:5432/pack_draft` | Postgres connection string |

Invalid values fail at startup. See `src/env.ts`. Copy `.env.example` to `.env` for local overrides; `dotenv` loads it in the server and in Drizzle Kit.

## Database schema and migrations

Schema lives under `src/db/schema/`. Shared audit fields (`created_at`, `updated_at`, `created_by`, `updated_by`) are defined once in `metadata.ts` and spread into tables. `created_at` / initial `updated_at` default on insert; on row updates, set `updated_at` and `updated_by` in code (no ORM or trigger auto-update).

Workflow:

1. Edit TypeScript schema files.
2. Generate SQL with a descriptive name (avoids Drizzle’s random adjective default):

   ```sh
   pnpm db:generate -- --name=create_users
   ```

   From the repo root: `pnpm db:generate -- --name=create_users`.
3. Review and commit the new files under `drizzle/`.
4. Apply: `pnpm db:migrate`.

| Script | Purpose |
| --- | --- |
| `db:generate -- --name=<slug>` | Diff schema → named SQL migration in `drizzle/` |
| `db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `db:studio` | Open Drizzle Studio against the local DB |

Do not use `drizzle-kit push` for shared or deployed databases; keep migrations as the source of applied schema.

## Scripts

Run from `apps/api` or with `pnpm --filter @pack-draft/api <script>` from the root.

| Script | Purpose |
| --- | --- |
| `dev` | `tsx watch src/server.ts` |
| `build` | Emit JS to `dist/` |
| `start` | `node dist/server.js` (run `build` first) |
| `typecheck` | `tsc --noEmit` |
| `test` | Vitest (`fastify.inject()` in tests — no network bind) |
| `db:generate` | Generate Drizzle migrations (pass `-- --name=<slug>`) |
| `db:migrate` | Apply Drizzle migrations |
| `db:studio` | Drizzle Studio |

## Project layout

```
src/
  server.ts       Entry: load env, listen, graceful shutdown
  app.ts          Fastify instance, Zod compiler, route registration
  env.ts          Zod-validated environment
  db/
    index.ts      Drizzle client + pg Pool factory
    schema/       Table definitions (source of truth for migrations)
  routes/         Route plugins (one file per area)
drizzle/          Generated SQL migrations (commit these)
drizzle.config.ts Drizzle Kit config
```

Add routes by registering a `FastifyPluginAsyncZod` in `app.ts`, with `schema.response` / body / query defined in Zod.

## Production build

```sh
pnpm build
PORT=3000 pnpm start
```

## Related docs

- [Root README](../../README.md) — monorepo commands
- [ADR-001](../../docs/decisions/001-primary-database.md) — PostgreSQL
- [ADR-003](../../docs/decisions/003-api-runtime-and-compute.md) — runtime and hosting
- [ADR-012](../../docs/decisions/012-orm-and-migrations.md) — Drizzle ORM and migrations
