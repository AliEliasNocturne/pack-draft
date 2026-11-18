# ADR-012: Use Drizzle ORM with Drizzle Kit migrations

## Status

Accepted

## Date

2026-11-16

## Context

[ADR-001](./001-primary-database.md) chose PostgreSQL and left the ORM and migration tool open. [ADR-003](./003-api-runtime-and-compute.md) chose Node.js + TypeScript for the API. We need typed queries, SQL-first migrations that stay reviewable in git, and a local workflow that matches staging RDS.

## Options Considered

### Option A: Drizzle ORM + Drizzle Kit

- Pros: Schema in TypeScript next to the API; generated SQL migrations are readable diffs; thin layer over SQL (`FOR UPDATE`, `ON CONFLICT`); works with `pg` and connection pooling; no separate query engine to operate.
- Cons: Younger than Prisma; fewer batteries (no Prisma-style migrate deploy service); team must write SQL-shaped schema.

### Option B: Prisma

- Pros: Mature migration UX; broad docs and hiring familiarity; Prisma Migrate is well known.
- Cons: Heavier client and abstraction; custom SQL and advanced Postgres features are more awkward; schema lives in a separate DSL.

### Option C: Kysely (or raw `pg`) + hand-written SQL migrations

- Pros: Maximum control; Kysely types are strong.
- Cons: No schema-as-code source of truth; migration authoring and drift detection are DIY.

## Decision

We choose **Drizzle ORM** with **Drizzle Kit** (`generate` + `migrate`) because:

1. It matches the TypeScript API and keeps schema in the same language as the rest of `apps/api`.
2. Migrations are plain SQL files we can review in PRs.
3. It stays close to Postgres features we need for the ledger and concurrency patterns in ADR-001.

## Consequences

- Schema lives under `apps/api/src/db/schema/`. Shared audit fields use a reusable `metadataColumns` helper. Timestamp defaults apply on insert only; `updated_at` / `updated_by` are set explicitly in application code (no Drizzle `$onUpdate`, no DB triggers).
- Change the schema in TypeScript, run `pnpm db:generate -- --name=<slug>`, commit the SQL under `apps/api/drizzle/`, then apply with `db:migrate`. Always pass `--name` so files stay descriptive (`0001_add_packs.sql`) instead of Drizzle’s random defaults.
- Prefer `generate`/`migrate` over `push` for anything shared or deployed. `push` is local experiment only.
- Local Postgres runs via Docker Compose at the repo root. Staging/production remain managed Postgres (ADR-002).

## Sources

- [Drizzle ORM — PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new)
- [Drizzle Kit — migrations](https://orm.drizzle.team/docs/migrations)
- [ADR-001 — primary database](./001-primary-database.md)
