# ADR-016: Use expo-sqlite with Drizzle ORM as the mobile app's local database

## Status

Proposed

## Date

2026-11-19

## Context

[ADR-013](./013-mobile-framework.md) chose Expo and React Native. [ADR-012](./012-orm-and-migrations.md) chose Drizzle ORM for the Postgres API. The mobile app has no local storage yet. This ADR picks the local database, the ORM, and how screens update when data changes.

What we want:

- **SQLite is what screens read.** No screen reads from a fetch result or an in-memory store. Everything the user sees comes from a SQLite query.
- **Live updates, like Android's LiveData with Room.** When rows change, every screen showing them re-renders without a manual refresh.
- **Same language and tools as the API.** TypeScript, Drizzle, SQL migrations we can review in git ([ADR-012](./012-orm-and-migrations.md)).

What limits the choice:

- **Postgres on the server is the authority** for credits, ownership, offers, and contest results ([ADR-001](./001-primary-database.md), [ADR-005](./005-payment-service.md)). The phone's SQLite is a copy of data the user is allowed to see. When the two disagree, the server wins.
- **No offline support.** The app needs a connection to work. Pack opens, offers, and contest entries are server-validated and idempotent. The app sends them to the API and shows the result after the server confirms. The local database only receives data. It is a fast, live view of server data, not a way to work without a connection.
- **No encryption of the local database.** The app sandbox is enough. We do not use SQLCipher.
- **Hidden data must not reach the phone.** Other users' lineups are hidden until a contest starts. The API must not send them early. A local database cannot hide them.
- **Live scoring is open.** The [scope](../../scope/project_scope.md) lists "live update cadence" as undecided. [ADR-003](./003-api-runtime-and-compute.md) says the Fastify API can serve live standings over SSE or WebSockets, and the sports provider is polled ([ADR-010](./010-sports-data-provider.md)).
- **Small team.** The same limit as [ADR-003](./003-api-runtime-and-compute.md) and [ADR-013](./013-mobile-framework.md).

Out of scope: the sync transport (SSE, WebSockets, or polling) and the API shape for it. Those need their own decision once the live update cadence is known. This ADR only requires that whatever receives data writes it into SQLite.

### How live queries work in each option

Android's LiveData with Room re-runs a query when a table it reads changes. The options below work the same way. We checked the Drizzle one in its source:

- `expo-sqlite` can call SQLite's update hook on every row change. We turn it on with `enableChangeListener: true`. The listener gets the table name and row ID ([Expo SQLite docs, SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/)).
- Drizzle's `useLiveQuery` listens for those events and re-runs the query when the event names the query's root table ([source](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/expo-sqlite/query.ts)).

## Options Considered

Prices are US list prices on 2026-11-19. Effort figures are our estimates, not measurements.

### Option A: expo-sqlite + Drizzle ORM, with our own sync code

`expo-sqlite` is Expo's SQLite module. Drizzle has a native driver for it, `drizzle-kit` can generate migrations for it (`driver: 'expo'`), and `useLiveQuery` makes any query reactive.

- Pros:
  - **Same ORM as the API.** The API pins `drizzle-orm` `^0.45.4`, and that release lists `expo-sqlite >=14` as a peer dependency. One query style across the repo.
  - **Works in Expo Go and dev builds.** `expo-sqlite` is part of the Expo SDK, so no extra native module.
  - **Live queries are built in.** `useLiveQuery` has existed in stable Drizzle since v0.31.1.
  - **No extra service and no extra cost.**
  - **Plain SQL migrations** that ship inside the app bundle and run at startup with `useMigrations`.
- Cons:
  - **We write the sync code.** Fetching, upserting, deleting rows the server removed, and reconnecting after a dropped connection are ours.
  - **`useLiveQuery` only watches the root table.** A query that joins another table does not refresh when only the joined table changes ([open Drizzle issue](https://github.com/drizzle-team/drizzle-orm/issues/2660), last updated 2026-05-27). Subqueries and raw SQL are not supported. We need a small wrapper that also listens to the joined tables.
  - **Events are per row.** From the source, the listener re-runs the query for every matching row event. A bulk upsert of hundreds of rows could re-run a query hundreds of times. We need to debounce. We have not measured this.
  - **Drizzle's Expo migrations need Babel and Metro config** (`babel-plugin-inline-import` and a `.sql` source extension). It is a one-time setup.

Effort: about 3 to 5 days for the database, schema, migrations, live-query wrapper, and tests. Sync code is extra, and depends on the transport we pick later.

### Option B: expo-sqlite + Kysely or raw SQL, with our own live-query hook

The same SQLite module, with a different query layer. We write a `useLiveQuery`-style hook on top of `addDatabaseChangeListener` ourselves.

- Pros:
  - We control exactly which tables each query watches, so the join problem goes away.
  - Kysely has strong types.
- Cons:
  - Kysely is a second query style next to Drizzle in the API, and the schema is not defined in TypeScript the way ADR-012 wants.
  - We own the hook, its debouncing, and its bugs. Option A gives us a working one and a known limit.
  - We did not check Kysely's Expo support or its migration tooling for this.

Effort: about 5 to 7 days.

### Option C: PowerSync (op-sqlite) + Drizzle driver

PowerSync is a sync engine. A hosted or self-hosted service reads the Postgres change stream and streams the rows each user is allowed to see into SQLite on the device. The SDK gives `watch` queries that re-run when tables change, and a Drizzle driver.

- Pros:
  - **Closest match to "SQLite as source of truth with live pushing."** Server changes stream into the local database, and watched queries update the UI. We would not write the sync code or the push transport.
  - **Postgres is a supported source**, so it fits ADR-001.
  - **Real use.** MongoDB lists it as a migration target for its deprecated Atlas Device Sync.
- Cons:
  - **Another service in the path of every live update.** It needs its own deployment, secrets, monitoring, and an on-call story. The cloud version has no uptime guarantee below the Team plan ($599 a month).
  - **Cost is per concurrent client.** Pro starts at $49 a month with 1,000 peak concurrent clients, then $30 per 1,000, with a default cap of 3,000. Team starts at $599 and defaults to a cap of 10,000. During a live contest many users are online at once. Our arithmetic: 5,000 concurrent clients would be on Team, about $599 plus $120 a month before data charges. The self-hosted open edition has no per-client fee, and we would run it ourselves.
  - **Needs a dev build.** The SDK needs `@op-engineering/op-sqlite`, a native module. The JavaScript adapter that runs in Expo Go is a separate package.
  - **The Drizzle driver is limited.** Its docs say most constraint features (unique, foreign keys, cascading deletes) are not supported. The schema must use only `text`, `integer`, and `real`. The driver is at version 0.8.0.
  - **Visibility rules move into sync config.** What each user may receive, including hidden lineups, would live in PowerSync's Sync Streams. That is a second place to get an access rule wrong, next to the API.
  - **More layers to learn.** PowerSync's schema and the views and triggers it adds, with Drizzle on top.

Effort: not estimated. We did not run a spike. Setup includes the service, replication from Postgres, Sync Streams, the connector, and the client schema.

### Option D: WatermelonDB

WatermelonDB is a React Native database built on SQLite, with observable queries and its own sync protocol.

- Pros:
  - Built for large local datasets, with lazy loading and observables.
  - Components re-render when observed records change.
- Cons:
  - **Not Drizzle and not SQL-first.** It has its own model classes, decorators, and schema. We would keep two data layers across the repo.
  - **Slow release pace.** The last stable release is 0.28.0 on 2025-04-07, and the last prerelease is from 2025-07-24.
  - **Native setup.** Its install guide edits the iOS Podfile and Android Gradle files. Under Expo's generated native projects that needs a config plugin, which we did not check.
  - **We still write the server side of sync.** Its sync protocol needs pull and push endpoints.

Effort: not estimated.

### Option E: Realm

Realm is an object database, not SQLite. MongoDB ended Atlas Device Sync on 2025-09-30 and now ships the local database as a community package with no sync. A maintainer wrote in April 2026 that nobody is paid to work on it ([issue #7094](https://github.com/realm/realm-js/issues/7094)). It does not meet the SQLite requirement and has no maintainer. We rule it out.

### Not evaluated

- **`@op-engineering/op-sqlite` directly with Drizzle.** Drizzle supports it and its README calls it the fastest SQLite library for React Native. It is a native module that needs a dev build. We do not have a performance problem to justify it yet. Revisit if we measure one.
- **TinyBase, RxDB, and TanStack DB.** We did not research them.
- **Local storage with MMKV or AsyncStorage.** Not relational and not queryable. It does not meet the SQLite requirement.

## Comparison

| | A. expo-sqlite + Drizzle | B. expo-sqlite + Kysely | C. PowerSync | D. WatermelonDB | E. Realm |
| --- | --- | --- | --- | --- | --- |
| SQLite | Yes | Yes | Yes (op-sqlite) | Yes | No |
| Live queries | `useLiveQuery`, root table only | Ours | `watch` queries | Observables | Yes |
| Same ORM as the API | Yes | No | Drizzle driver with limits | No | No |
| Server-to-device sync | We write it | We write it | Included | Protocol, our endpoints | Gone |
| New service to run | No | No | Yes | No | No |
| Works in Expo Go | Yes | Yes | JS adapter only | Not checked | Not checked |
| Cost | $0 | $0 | $49 to $599+ a month, or self-host | $0 | $0 |
| Maintenance risk | Low | Ours | Active (package updated 2026-11-12) | Slow | No maintainer |

## Decision

We choose **expo-sqlite with Drizzle ORM** (Option A). Screens read from SQLite only, and `useLiveQuery` re-renders them when rows change. The server stays the authority, and sync code writes into the local database.

Why:

1. **It meets the requirement with no new service.** SQLite is what screens read, and live queries are a hook we can use today.
2. **It matches the API.** Drizzle, TypeScript, and reviewable SQL migrations ([ADR-012](./012-orm-and-migrations.md)). One mental model for both apps.
3. **Our writes do not need a sync engine.** Every write is a server-validated API call, and we do not support offline use. What the phone needs is a reliable way to receive data, which is a smaller problem than two-way sync.
4. **The sync transport is still undecided, and this choice does not block it.** Whatever we pick (SSE from the API, polling, or a sync engine) only needs to write rows into SQLite. The screens do not change.

Why not the others:

- **PowerSync (Option C).** The strongest alternative. It is the only option that gives us server-to-device streaming without writing it. We do not pick it first because it adds a service and a per-client cost during the exact moments (live contests) when many clients connect, it limits Drizzle, and it moves visibility rules into a second system. It is the first thing to switch to (see review triggers).
- **Kysely (Option B).** Costs more and gives us a second query style.
- **WatermelonDB (Option D).** A second data layer, slow releases, and we still write the server side.
- **Realm (Option E).** Not SQLite and not maintained.

We accept these risks:

- **We build and maintain sync code.** Mitigation: keep it behind one small interface, and set a review trigger.
- **`useLiveQuery` has gaps** (root table only, per-row events). Mitigation: a wrapper, and a spike to measure it.
- **A phone's SQLite file is readable on a rooted or jailbroken device.** Mitigation: the API sends only what that user may see.

## Consequences

- **Files.** Local schema in `apps/mobile/src/db/schema.ts`, generated migrations in `apps/mobile/drizzle/`, database setup in `apps/mobile/src/db/`. Keep non-route code outside `src/app/`, as [ADR-013](./013-mobile-framework.md) says.
- **Install with `npx expo install expo-sqlite`.** Add `drizzle-orm` at the same version range as `apps/api`, and `drizzle-kit` plus `babel-plugin-inline-import` as dev dependencies. Check the versioned Expo docs before writing code, as `apps/mobile/AGENTS.md` says.
- **Open the database once** with `enableChangeListener: true`. Without it, `useLiveQuery` does not update.
- **The local schema is not a copy of the Postgres schema.** Postgres has `uuid`, `timestamptz`, and `jsonb`. SQLite has `text`, `integer`, `real`, and `blob`. Define a smaller schema shaped for screens, and map server values in the sync code. Do not try to share table definitions with `apps/api`.
- **Migrations.** Run `drizzle-kit generate --name=<slug>` and commit the SQL, as in ADR-012. Always pass `--name`. Run them at startup with `useMigrations` and keep the app on a loading screen until they finish. Because the server is the authority and the app has no offline writes, **a failed migration can fall back to deleting the database file and syncing again.** Add that fallback.
- **One write path.** Only the sync layer writes to server-owned tables. Screens never insert or update them. A user action calls the API, and the confirmed result goes through the sync layer into SQLite. Local-only tables (for example UI preferences) are fine.
- **Live-query wrapper.** Build `useLiveTablesQuery(query, tables)` that uses Drizzle's `useLiveQuery` for the root table and also listens for changes to every joined table. Debounce re-runs, for example to one run per frame. Document in the wrapper that Drizzle's `useLiveQuery` alone is not enough for joins.
- **Batch writes in transactions** and keep sync writes small so one screen does not re-run a query hundreds of times.
- **Hidden data stays on the server.** The API does not return other users' lineups before a contest starts, or anyone else's balance or private transactions. The phone never holds them. Local filtering is not a safeguard.
- **Sign-out and account deletion** ([ADR-004](./004-auth-service.md)) delete the local database file.
- **No encryption.** Use plain SQLite. Do not set `useSQLCipher`.
- **Testing** ([ADR-009](./009-testing-framework.md)). Jest with `jest-expo` does not run the native SQLite module. Unit test the sync mapping and the wrapper with a fake database. Run real queries in a development build on a device or simulator. We did not check whether a Node SQLite driver can stand in for Jest tests.
- **Foreground and background.** The app refetches current data when it returns to the foreground. Push notifications ([ADR-006](./006-app-notifications.md)) tell the user something happened. They do not carry data into the database. The inbox and anything with a deadline are read from the database after a fetch.
- **Run a spike first.** Before this is final, check on one iOS and one Android device (development build):
  1. Migrations run on first launch and on upgrade, and the reset fallback works.
  2. A `useLiveQuery` screen updates when the sync layer writes a row.
  3. A joined query refreshes when only the joined table changes, using the wrapper.
  4. Upserting 1,000 rows in one transaction with three live screens open does not drop frames. Measure the number of query re-runs with and without debouncing.
  5. Sign-out deletes the file, and signing in as another user shows none of the first user's data.
- **Review triggers.** Reopen this ADR and look at PowerSync (Option C) if any of these happen:
  - The client asks for offline use or for an encrypted local database.
  - The sync code for the live standings and the collection passes about two weeks of work, or has caused a data-correctness bug.
  - We need to push changes to many tables to each user with per-user rules, and writing those endpoints is the bottleneck.
  - Live update cadence is set under one minute for most screens, and our own transport struggles.

  Before switching, run a PowerSync spike with the self-hosted edition against staging Postgres, and price it at our real concurrent-client numbers. Moving to PowerSync changes the driver and the sync layer. Screens that read through the wrapper should change little.

### Decided as we build features

- **Live update cadence.** How fresh live standings must be, and on which screens. This decides the sync transport.
- **How much to keep on the phone.** The whole collection and history, or only recent data. This sizes the local database and the first sync.

## Sources

- Expo, [SQLite (SDK 58)](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/)
- Drizzle, [Expo SQLite](https://orm.drizzle.team/docs/connect-expo-sqlite), [v0.31.1 release (live queries)](https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v0311), [`useLiveQuery` source](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/expo-sqlite/query.ts), [issue #2660: live query and joined tables](https://github.com/drizzle-team/drizzle-orm/issues/2660)
- PowerSync, [React Native and Expo SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo), [Drizzle driver](https://docs.powersync.com/client-sdks/orms/js/drizzle), [Pricing](https://www.powersync.com/pricing)
- WatermelonDB, [Installation](https://watermelondb.dev/docs/Installation)
- MongoDB, [Device SDKs deprecation](https://www.mongodb.com/docs/device-sdks-deprecation/), [Device Sync deprecation](https://www.mongodb.com/docs/device-sync-deprecation/), realm-js [issue #7094](https://github.com/realm/realm-js/issues/7094)
- OP Engineering, [op-sqlite](https://github.com/OP-Engineering/op-sqlite)
- Project: [ADR-001](./001-primary-database.md), [ADR-003](./003-api-runtime-and-compute.md), [ADR-006](./006-app-notifications.md), [ADR-009](./009-testing-framework.md), [ADR-010](./010-sports-data-provider.md), [ADR-012](./012-orm-and-migrations.md), [ADR-013](./013-mobile-framework.md), [Pack Draft development feature scope](../../scope/project_scope.md)
