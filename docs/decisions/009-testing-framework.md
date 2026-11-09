# ADR-009: Test with Vitest on the server, Jest on mobile, real Postgres for database tests, and Maestro for end-to-end flows

## Status

Proposed (pending client approval)

## Date

2026-11-08

## Context

[ADR-001](./001-primary-database.md) chose PostgreSQL, [ADR-002](./002-cloud-provider.md) chose AWS, [ADR-003](./003-api-runtime-and-compute.md) chose a Fastify and TypeScript API on ECS Fargate with CircleCI, [ADR-004](./004-auth-service.md) chose Auth0, [ADR-005](./005-payment-service.md) chose RevenueCat with our own ledger, [ADR-006](./006-app-notifications.md) chose an inbox in Postgres with Expo Push, [ADR-007](./007-load-testing-framework.md) chose k6, and [ADR-008](./008-mobile-app-deployments.md) chose Expo Build, Submit, Update, and Workflows. This ADR picks the test tools for everything except load tests. It covers the tracking item "Testing framework."

What the [project scope](../../scope/project_scope.md) asks of the tests:

- **Money and ownership must never be wrong.** Pack purchases, pack opens, offer accepts, and settlements happen on the server in one transaction with an idempotency key. A bug here costs users credits or cards.
- **Rules with sharp edges.** Limited drops that sell out under concurrent buyers, evolution upgrades, lineup cutoffs, holds on listed cards, contest scoring with ties, and hidden lineups until the cutoff.
- **A reveal that survives a crash.** The breaker-style pack reveal must be resume-safe, with no loss, duplicates, or double charge.
- **Old apps stay in the wild.** ADR-003 says the API must stay backward compatible, and ADR-001 says migrations must be too.

What the earlier ADRs hand to this one:

- ADR-001 and ADR-003: the hard logic lives in SQL transactions, `SERIALIZABLE` retries, `SKIP LOCKED`, `ON CONFLICT`, and advisory locks. A mock of the database cannot test any of it.
- ADR-003: Fastify, Zod, and bigint credit math. `fastify.inject()` can call routes without a network.
- ADR-004: Auth0 issues the JWTs. Staging and production are separate tenants.
- ADR-005: webhook dedupe, a production handler that rejects sandbox events, a reconcile job, and a negative balance after a refund.
- ADR-006: an outbox with a dedupe key, and an Expo Push stub with its rate limit and receipts.
- ADR-007: stub services for the sports provider, RevenueCat, and Expo Push live in the monorepo, along with an invariant verifier. It says unit, integration, and end-to-end frameworks are out of its scope.
- ADR-008: CircleCI keeps running the checks. Expo Workflows can run Maestro as a job, which is in alpha. Staging and production are separate app variants.

Assumptions: TypeScript in a monorepo, GitHub, CircleCI, a small team, and the mobile app built with Expo and React Native (an assumption, as in ADR-006 and ADR-008, because the mobile framework has not been researched yet). If the mobile framework changes, Parts 2 and 3 are reopened. Parts 1 and 4 are not.

Out of scope: load tests (ADR-007), security testing, visual regression, accessibility audits, and the manual QA plan beyond what this ADR hands to it.

### How we scored the options

The client has not ranked criteria for this item. We used the team's order below and ask the client to confirm it.

1. **Hiring pool and familiarity.** Can we hire someone who has used it, or will we train them?
2. **Language ubiquity.** Does it use the TypeScript the team already writes, or does it add a language?
3. **Long-term support.** Who maintains it, how often does it ship, and how hard is it to leave?
4. **Ease of use.** Setup effort, speed, and how much work it takes to keep the suite green.
5. **Support.** What do we do when it breaks? Is there an official channel or a vendor?
6. Then fit with the scope, cost, and the failure we can least afford: a test that passes while the ledger is wrong.

### What we test where

| Layer | What it covers | Tool | Runs |
| ----- | -------------- | ---- | ---- |
| Unit, server and shared | Pure logic: odds and rarity draws with a fixed seed, lineup rules, Collection Score, tie splits, credit math | Vitest | Every PR |
| Integration, server | Routes through `fastify.inject()` against real Postgres: ledger writes, idempotent replays, sold-out races, holds, offers, evolution, settlement, outbox, webhooks | Vitest | Every PR |
| Unit and component, mobile | Reveal state machine, lineup validation messages, hooks, screens with mocked API | Jest, `jest-expo`, React Native Testing Library | Every PR |
| End to end | A built app on a simulator or emulator against the staging API | Maestro | Every PR that touches the app (Android), every release candidate (both) |
| Load | Drops, peaks, contest cutoffs | k6 (ADR-007) | As ADR-007 says |
| Manual | Store purchase sheets, real push delivery, Apple and Google sign-in, physical devices | A written checklist | Every release |

## How comparable products do it

| Company | What we found | Evidence |
| ------- | ------------- | -------- |
| **Kalshi, Sorare, Dapper Labs, DraftKings, Polymarket** | No source names their test tools. | No source found |
| **Lendable** (a lender, not a comparable product, same mobile stack) | React Native, Expo, EAS, Jest, React Testing Library, and Maestro. | Mobile Quality Engineer posting |
| **A trading exchange mobile app** (unnamed, a QA vendor's case study) | React Native app with no test automation yet. The vendor says the choice of tools was still open. | Vendor case study |
| **React Native job postings in general** | Jest and React Testing Library are the common baseline. Detox, Maestro, and Appium are listed for end to end. Three postings named Maestro, two of them next to Detox. | Postings from Lendable, Jobgether, DeviQA |

Pattern: nothing here is specific to sports cards or trading. The only same-stack example uses the combination this ADR recommends. Treat it as one data point.

Source quality note: job postings and a vendor case study. They show what is asked for, not what works best.

## Options Considered

### Part 1: Server and shared-package test runner

#### Option A: Vitest

TypeScript and ESM run without a transform step. The API is close to Jest's. Maintained by the Vitest team and Vite maintainers.

- **Pros**
  - Native TypeScript and ESM mean no Babel or ts-jest layer to keep working. It is widely reported as faster than Jest. We did not benchmark it on our code.
  - Anyone who knows Jest can read a Vitest test. The docs say it is compatible with most of the Jest API.
  - Built-in JUnit reporter for CircleCI.
  - Fastest-growing in the State of JS 2025 survey: 53.8% used it, 97% of users would use it again, the highest of the test tools.
  - 180 million npm downloads a week, ahead of Jest (61 million). Downloads include CI and dependencies, so they measure spread, not people.
  - 33 releases in the last 12 months. Version 5.0 shipped on 2026-09-03 and 4.x still gets patches.
  - Stays MIT and vendor neutral. VoidZero, the company behind Vite and Vitest, joined Cloudflare in June 2026, and Cloudflare funds Vitest through an open source fund.
- **Cons**
  - Younger than Jest, so fewer engineers have years of experience with it. Fewer hiring postings name it than name Jest. We did not count this.
  - A company acquisition is a long-term risk to watch even with an MIT licence. We think the risk is small and a move to Jest or `node:test` is cheap, because the test code is nearly the same.
  - It does not run React Native tests today (see Part 2).

#### Option B: Jest

The default for most JavaScript teams.

- **Pros**
  - The largest hiring pool. 74.4% of State of JS 2025 respondents used it.
  - Expo and React Native test with it. One runner for server and mobile is simpler.
  - Governed by the OpenJS Foundation since 2024. Jest 30 shipped in June 2025 and the latest 30.x came out in September 2026.
- **Cons**
  - Its own docs still call ESM support experimental, and it needs a flag. Jest 30 improved this, but our server code will be modern TypeScript and ESM, so we would pay in config.
  - Slower, and TypeScript needs a transform.
  - State of JS shows its satisfaction trending down, while Vitest's is at the top.
  - Slower release pace than Vitest. We found no public date for Jest 31.

#### Option C: Node's built-in test runner (`node:test`)

No dependency. Fastify's own docs use it in examples.

- **Pros**
  - Nothing to install or upgrade. It moves with Node LTS.
  - Fastify's own docs and many Node library maintainers use it.
- **Cons**
  - The smallest ecosystem for our needs. Coverage was still marked experimental in the Node docs we read, and the reporters and tooling around it are fewer than for Vitest.
  - Candidates who know Jest or Vitest need to learn a new API. The hiring pool is the smallest of the three.
  - It does not run mobile tests, so we would still need Jest for Part 2. That makes two runners with nothing gained.

### Part 2: Mobile unit and component tests

#### Option A: Jest with `jest-expo` and React Native Testing Library (RNTL)

- **Pros**
  - Expo's own preset. `jest-expo` is published by the Expo team (13 npm maintainers), its major versions track Expo SDK releases, and Expo's docs show only Jest. React Native's default template ships Jest too.
  - RNTL is the community and React Native docs' standard. Version 14 shipped in June 2026 for React 19. It has 6.2 million downloads a week.
  - The largest hiring pool for mobile testing. The React Native postings we read that name a unit test tool name Jest.
- **Cons**
  - A second runner next to Vitest. The API is close, so the cost is config and a second set of upgrade notes, not two skills.
  - RNTL 14 needs a recent Node and React Native, so an Expo SDK upgrade can pull a test upgrade with it. That is true for any option.

#### Option B: Vitest with `vitest-expo`

- **Pros**
  - One runner for everything.
- **Cons**
  - `vitest-expo` is a community package. It has one npm maintainer, its first release was in August 2026, and it gets about 2,600 downloads a week.
  - An Expo issue from September 2025 said Expo had no plan to support it. An open pull request (opened November 3, 2026) is needed for Expo Router's testing library to work without Jest globals.
  - We would carry the risk of a one-person project under the part of the app where users spend credits.

We rejected B for now. Part 2's review trigger below says when to look again.

### Part 3: Mobile end-to-end tests

#### Option A: Maestro

YAML flows that drive the app from the outside, like a user.

- **Pros**
  - Expo Workflows has a first-party `maestro` job (alpha) and a `maestro-cloud` job. Expo is betting on it, and it is the only end-to-end tool that runs as a step in the pipeline ADR-008 chose.
  - Flows are YAML, readable by people who do not write TypeScript. A QA hire can own them without learning the app code.
  - Apache 2.0. The CLI shipped a release about every month, the latest on 2026-11-02. 16,200 GitHub stars.
  - Setup is short: no native build changes and no test runner config. Flows target `testID`s and visible text.
  - Appears in postings next to Detox and Appium. The hiring pool is smaller than Appium's and growing.
- **Cons**
  - Black-box. It cannot wait for network or timers by itself, and it cannot read app state, so flows must wait on what the user sees.
  - It does not drive physical iOS devices. Purchases, push, and Apple and Google sign-in stay manual.
  - A small company is behind it (a PitchBook preview shows a 2021 seed round and about 9 employees, which may be stale). The licence and the first-party Expo job soften the risk.
  - The Expo Workflows job is alpha. The fallback in Consequences covers this.

#### Option B: Detox

TypeScript tests with gray-box synchronization, from Wix.

- **Pros**
  - It waits for the app to be idle on its own, which cuts flaky waits.
  - TypeScript, and a Jest runner. No new language.
- **Cons**
  - Setup touches native projects, and Expo support is community maintained.
  - It is not a job in Expo Workflows, so we would run it on our own CI machines.
  - Four npm maintainers. 577,000 downloads a week.

#### Option C: Appium

The widest tool: any language, real devices, web and native.

- **Pros**
  - The largest pool of QA candidates, because it has been used the longest. We did not measure this.
- **Cons**
  - The heaviest to set up and run. A second language or a server for a team that has no dedicated QA.
  - No Expo Workflows job.

### Part 4: How tests get a database

#### Option A: Real Postgres in CI and on laptops (recommended)

A Postgres container of the same major version as RDS, started by Docker Compose locally and as a CircleCI service container in CI.

- **Pros**
  - Tests what ADR-001 relies on: locks, isolation levels, `SKIP LOCKED`, constraints, and triggers behave as in production.
  - One `DATABASE_URL` for both places.
  - Concurrency tests need several real connections that commit. Only a real server gives that.
- **Cons**
  - The suite needs Docker running. Slower than an in-memory fake.
  - Needs a plan to keep tests isolated (below).

#### Option B: Testcontainers

Starts a container from the test code.

- **Pros**
  - No `docker compose up` step on a laptop.
- **Cons**
  - CircleCI needs the machine executor for it, which is slower to start than the Docker executor and uses more credits. We did not measure it.
  - Two ways to get a database (containers locally, service container in CI) is more to maintain than one.

#### Option C: PGlite (Postgres in WebAssembly)

- **Pros**
  - Fast, and needs no Docker.
- **Cons**
  - Single connection. It cannot test concurrent buyers, locks, or `SKIP LOCKED`, which are the tests we most need.

#### Option D: Mocks or an in-memory fake

- **Pros**
  - The fastest and simplest.
- **Cons**
  - Tests the mock. It cannot catch a wrong isolation level or a missing constraint. Rejected for any code that touches the ledger, inventory, or holds.

## Comparison

| Criterion | Vitest (server) | Jest (server) | `node:test` (server) | Jest + `jest-expo` (mobile) | Vitest + `vitest-expo` (mobile) | Maestro | Detox | Appium |
| --------- | --------------- | ------------- | -------------------- | --------------------------- | ------------------------------- | ------- | ----- | ------ |
| Hiring pool | Large, growing | Largest | Small | Largest | Small | Growing | Medium | Large (QA) |
| Language | TypeScript | TypeScript | TypeScript | TypeScript | TypeScript | YAML | TypeScript | Any |
| Long-term support | Strong, MIT, funded | Strong, OpenJS | Part of Node | Official Expo preset | One maintainer | Small company, Apache 2.0 | Wix, community Expo | Strong |
| Ease of use | Easiest on TypeScript and ESM | ESM is experimental | Minimal, thin ecosystem | Zero config with Expo | Needs patches | Shortest setup | Native setup | Heaviest |
| Support | Community, Discord | Community | Node docs | Expo docs and forums | One person | Community, Maestro Cloud (paid) | Community | Community |
| Fit with Expo Workflows | n/a | n/a | n/a | Yes | Not official | First-party job | None | None |

## Decision

We recommend these four choices:

1. **Vitest for the server and shared packages**, unit and integration.
2. **Jest with `jest-expo` and RNTL for mobile unit and component tests.** One rule for everyone: mobile code uses Jest, all other code uses Vitest. One root `test` script runs both.
3. **Maestro for end-to-end flows**, run as an Expo Workflows job.
4. **Real Postgres for every test that touches the database.** No mocks, no PGlite, for the ledger, inventory, offers, holds, and settlement.

Why:

- **The server's tests are the ones that protect money, and they need real concurrency.** Vitest runs TypeScript and ESM with no transform and has the strongest community momentum. Jest would work, at the price of ESM config on a server we expect to write as ESM. We rate this a close call that favors Vitest by a small margin. If the client wants one runner, Jest everywhere is the fallback.
- **Mobile uses what Expo supports.** The one-maintainer package is not a base for the app where credits are spent. Two runners with near-identical APIs cost less than the risk.
- **Maestro is the only end-to-end tool that fits the pipeline ADR-008 chose.** It reads like a spec, and a non-engineer can own it.
- **Database tests use the real thing.** This is the one choice that is not close.

### Rules for how we use them

**Server tests**

- **Time and randomness are inputs.** A `Clock` and an `Rng` are passed in. Pack draws are tested with fixed seeds, and cutoffs with a fixed `now`. Tests do not sleep.
- **Isolation by database, not by rollback.** A migrated template database is built once per run. Each test file or worker gets its own copy with `CREATE DATABASE ... TEMPLATE`. Rolling back a transaction after each test cannot work for concurrency tests, because they need several connections that commit. Copy speed is unmeasured. The spike checks it.
- **Concurrency tests are first-class.** For each rule below, one test fires many callers at once and checks the result:
  - Sold-out drop: N buyers, M stock. Exactly M succeed and none go negative.
  - Idempotency: the same key replayed in parallel changes the ledger once.
  - Offer accept versus listing cancel, and two accepts of one listing.
  - A card in two holds, or in a hold and a lineup.
  - Webhook delivered twice, out of order, and after a refund.
- **Invariants run after every database test file.** The same checks as ADR-007's verifier: ledger sums match balances, stock is never negative, each card has one owner and at most one hold, and each idempotency key has one result.
- **No automatic retries on server tests.** A retry hides a race, and races are what these tests are for. A flaky test is treated as a bug in the code or the test and is fixed or quarantined within days.
- **Auth, payments, push, and sports data are stubbed at the edge.**
  - Auth: a local key pair signs test JWTs and the API reads a test key set. The real Auth0 tenants are used only in end-to-end runs on staging.
  - RevenueCat: webhook fixtures recorded from the ADR-005 spike, including the sandbox-event rejection, and the stub from ADR-007.
  - Expo Push: the stub from ADR-007 with its rate limit and receipts.
  - Sports provider: recorded game replays through the ADR-007 stub, including a stat correction after settlement.
- **Shared support lives in one package.** `packages/test-support` holds the stubs, seed builders, fixtures, and the invariant checker. ADR-007 puts these under `load-tests/`. They move to the shared package when setup begins, and `load-tests/` imports them.
- **Migrations are tested.** Every migration applies to an empty database in CI. Before a production deploy, the previous release's integration suite runs against the new schema, to check the backward-compatibility rule from ADR-001. This costs CI time, so it runs on main, not on every PR.
- **No global coverage target.** Coverage numbers do not tell us whether the ledger is right. The rule is that every path that writes the ledger, inventory, holds, or settlement has a test, and the review checks it.

**Mobile tests**

- Test behavior through RNTL queries, not implementation. The reveal state machine gets tests for kill and resume at each step.
- The API is mocked at the client boundary with typed fixtures generated from the same Zod schemas the server uses, so they cannot drift.

**End-to-end tests**

- **Small and stable, about ten flows at launch.** Sign in with an email test user. Open the starter pack and reveal, including a kill and relaunch mid-reveal. Browse the collection. Build a lineup, see an invalid message, then fix it. List and cancel a card. Accept an offer made by a second test account through the API. Use the app with notifications denied (ADR-006). See the upgrade-required screen on an old API version (ADR-008). Maestro flows live next to the app, and screens expose `testID`s for them.
- **They run against the staging API.** Expo's workers cannot reach a laptop or a private network. Test accounts are fixed email users in the staging Auth0 tenant. Getting a known state each run needs a decision, which is the first open question for the spike (below).
- **When they run.** Android on each PR that touches the app, and both platforms on each release candidate. This is a cost trade-off; see below.
- **Purchases, push delivery, and Apple and Google sign-in are manual.** Maestro cannot drive physical iOS devices or the store purchase sheet. The release checklist lists them.

**CI on CircleCI**

- PR: lint, typecheck, Vitest unit, Vitest integration (a Docker executor with a Postgres service container), Jest mobile. Both runners write JUnit results so CircleCI can split by timing and track flaky tests. Vitest has a built-in JUnit reporter and Jest needs the `jest-junit` package.
- Main: the PR jobs, the migration check, the staging deploy (ADR-003), the Tier 1 k6 gate (ADR-007), then the end-to-end workflow (ADR-008).
- Nightly: the concurrency tests repeated many times with more callers, to find rare races.

## Consequences

### Positive

- The tests that guard money run on the same Postgres as production, with real concurrency, so they can find the bugs that matter.
- Two runners but one API shape. A new hire reads both in a day.
- The end-to-end flows are readable by QA and the client, and they run in the pipeline we already chose.
- Everything is open source. No new vendor contract.

### Negative

- **Two runners.** Config, upgrades, and a rule to remember. If the client prefers one tool, Jest everywhere costs us ESM config on the server.
- **Docker is a hard requirement** for the full suite.
- **End-to-end tests are slow and costly to keep green.** We keep them few on purpose.
- **Maestro in Expo Workflows is alpha.** The interface or pricing can change.
- **Staging data.** E2E on a shared staging environment leaves data behind and can collide with a person testing by hand.
- **Manual testing is still needed** for purchases, push, and store sign-in. This ADR reduces it. It does not remove it.

### Cost

All tools are free and open source. The extra costs are CI time and end-to-end builds. These are our estimates, not measured:

- **CircleCI.** Unit and integration jobs on Linux. The cost depends on your CircleCI plan and was not estimated.
- **End-to-end on Expo.** Each run needs a simulator or emulator build (about $1 for Android and $2 for iOS at ADR-008's rates) plus job minutes. About 40 app PRs a month on Android and 8 release candidates on both platforms is roughly $85 a month, on top of ADR-008's build costs.
- **Maestro Cloud** is $250 a month per device. We would use it only if the Expo job proves unreliable.

Effort to set up, also an estimate:

- Vitest and the Postgres harness and `test-support`: 4 to 6 days.
- Jest, `jest-expo`, and RNTL: 1 to 2 days.
- Maestro with the first flows and the workflow: 3 to 5 days.

### Review triggers

- **Mobile consolidates on Vitest** if Expo ships official Vitest support, or `vitest-expo` gets more than one maintainer and works with Expo Router without patches.
- **Server moves to Jest or `node:test`** if Vitest's governance changes after the Cloudflare deal in a way that hurts the project. Tests are nearly the same, so the move is small.
- **E2E moves off Expo Workflows** to Maestro on our own emulators (CircleCI machine executor) or Maestro Cloud if the alpha job is unreliable, changes price, or drops features. The flows do not change.
- **Add Detox** if flows keep failing on timing and Maestro's waits cannot fix them.

### Spike checklist (before approving)

1. Measure `CREATE DATABASE ... TEMPLATE` copy time and total integration run time on a CircleCI Docker executor with a Postgres service.
2. Write the sold-out race and the idempotent replay as tests. Confirm they fail when the lock or the key is removed.
3. Run one Jest suite with `jest-expo` and RNTL on the Expo SDK we will use.
4. Run one Maestro flow in an Expo Workflows `maestro` job on a simulator build, and note the real time and cost.
5. Decide how E2E gets a known account state on staging. Options: fixed accounts used in turn, or a test-only reset endpoint that exists only on staging and is covered by a test proving production does not have it.
6. Confirm `testID`s are visible to Maestro on both platforms.

## Open questions for the client

1. **Do you accept the ranking** (hiring, language, long-term support, ease, support) used above?
2. **Is one runner a requirement?** If yes, we use Jest everywhere and accept the ESM config cost.
3. **Which flows block a release?** We propose about ten. Are there flows you want added?
4. **Is Android on each PR, and both platforms on release candidates, an acceptable end-to-end schedule?** Running iOS on each PR costs more.
5. **Who runs the manual release checklist?** Purchases with store sandbox accounts, push on a real device, and Apple and Google sign-in.
6. **Which devices and OS versions must work?** Automated tests use one simulator and one emulator. Other devices are covered only by manual testing.
7. **Is a coverage number a contract requirement?** We recommend a rule on critical paths instead of a global number.

## Sources

- State of JS 2025, testing section: [State of JS 2025](https://2025.stateofjs.com/)
- Vitest: [docs](https://vitest.dev/), [releases](https://github.com/vitest-dev/vitest/releases), VoidZero joining Cloudflare (June 2026): [VoidZero](https://voidzero.dev/)
- Jest: [ESM docs](https://jestjs.io/docs/ecmascript-modules), [Jest 30](https://jestjs.io/blog/2025/06/04/jest-30), [releases](https://github.com/jestjs/jest/releases)
- Node test runner: [docs](https://nodejs.org/api/test.html)
- Fastify testing guide: [docs](https://fastify.dev/docs/latest/Guides/Testing/)
- Expo unit testing: [docs](https://docs.expo.dev/develop/unit-testing/), [`jest-expo`](https://www.npmjs.com/package/jest-expo), [`vitest-expo`](https://www.npmjs.com/package/vitest-expo)
- React Native Testing Library: [docs](https://callstack.github.io/react-native-testing-library/), [`@testing-library/react-native`](https://www.npmjs.com/package/@testing-library/react-native)
- Maestro: [docs](https://docs.maestro.dev/), [repository](https://github.com/mobile-dev-inc/Maestro), [Maestro Cloud pricing](https://maestro.dev/)
- Expo Workflows: [Maestro job](https://docs.expo.dev/eas/workflows/syntax/), [pricing](https://expo.dev/pricing)
- Detox: [docs](https://wix.github.io/Detox/), [`detox`](https://www.npmjs.com/package/detox)
- Appium: [docs](https://appium.io/docs/en/latest/)
- PGlite: [docs](https://pglite.dev/); Testcontainers: [Postgres module](https://testcontainers.com/modules/postgresql/)
- PostgreSQL template databases: [docs](https://www.postgresql.org/docs/current/manage-ag-templatedbs.html)
- npm download counts: npm downloads API, week of 2026-11-01 to 2026-11-07
- Lendable Mobile Quality Engineer posting and other job postings (see "How comparable products do it")
