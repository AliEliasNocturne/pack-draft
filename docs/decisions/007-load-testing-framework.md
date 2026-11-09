# ADR-007: Use k6 for load testing, run from the staging AWS account against a production-sized test stack

## Status

Proposed (pending client approval)

## Date

2026-11-08

## Context

[ADR-001](./001-primary-database.md) chose PostgreSQL, [ADR-002](./002-cloud-provider.md) chose AWS, [ADR-003](./003-api-runtime-and-compute.md) chose a Fastify API and a worker on ECS Fargate with CircleCI deploys, [ADR-004](./004-auth-service.md) chose Auth0, [ADR-005](./005-payment-service.md) chose RevenueCat with our own ledger, and [ADR-006](./006-app-notifications.md) chose an inbox in Postgres with push through the Expo Push Service. Each of those ADRs ends with a "load test" item that it hands to this one. This ADR picks the tool, where it runs, and the rules every load test follows.

What the [project scope](../../scope/project_scope.md) asks of the system, and so of the tests:

- **Limited drops must be correct under high concurrent demand.** "Per-account purchase limits for limited editions; limits and stock must be correct under high concurrent demand."
- **Server-side validation and idempotent retries.** "No duplicate credits/assets/charges/awards."
- **Atomic transfers.** Offer accepts validate balances and availability, then transfer in one step. Holds lock assets until resolved.
- **Time-based bursts.** Contests lock 1 hour before the first game. Offers expire after 24 hours. Contest results, evolutions, and pack releases fan out to many users at once.
- **Live data fan-out.** Sports stats are fetched once and shown to many users. The scope says to assess "caching, cadence, rate limits, failure recovery, cost."

What the earlier ADRs hand to this one:

- ADR-001: limited-drop purchases and offer accepts under concurrency. Hot-row lock contention is the main risk.
- ADR-002: run those tests on the production database instance class before sizing it.
- ADR-003: run a limited-drop burst against the real stack, measure how long scale-out takes, and set minimum capacity and scheduled scaling from that number. Keep `max tasks × connections per task` under about half of the database's `max_connections`.
- ADR-004: check Auth0's rate limits before running a sign-in burst.
- ADR-005: ask RevenueCat about API rate limits before testing purchase bursts.
- ADR-006: fan out to 100,000 fake recipients through a stub that behaves like Expo's push API, kill the sender mid-run, and check for no loss and no duplicates. Never load test the real Expo service.

What the platform asks of it:

- **Small team, no constant monitoring.** The tests must run from a pipeline and fail it on a bad result. A person should not have to read graphs to know a release got slower.
- **TypeScript, Terraform, CircleCI, separate staging and production AWS accounts** (ADR-002, ADR-003).
- **Staging is small on purpose.** ADR-003 prices it at about $60 per month and ADR-002 gives it a `db.t4g.micro`. It cannot show how production behaves.

Out of scope: unit, integration, and end-to-end test frameworks (the "Testing framework" tracking item), performance of the mobile apps on a device, security and denial-of-service testing, and the admin dashboard.

### How we scored the options

The client has not ranked criteria for this item. We used the order below and ask the client to confirm it.

1. **Can it find the failures we care about.** Open-model load (requests arrive at a set rate even when the server slows down), correctness checks while under load, and pass or fail results a pipeline can act on.
2. **Time to build and ease of use for our team,** in TypeScript.
3. **Fit with our stack.** Runs inside our AWS account, runs from CircleCI, covers HTTP and whichever live standings transport we pick.
4. **Cost and license.**
5. Then reliability record and how hard it is to leave.

### Two facts that shape the choice

- **The system under test is the limit, not the load generator.** ADR-003 puts the default API ceiling at roughly 500 requests per second. A DraftKings engineer writes that k6 "can easily reach six-figure" requests per second on a machine with enough CPUs, and Locust about 10,000 per process. Any of the tools below can overload our API from one machine. Distributed load generation matters for connection-heavy tests (live standings) and for much larger scale. It is not the first thing to optimize.
- **A synthetic test is not a real stampede.** NBA Top Shot wrote in February 2021 that "it's extremely difficult to replicate the levels of load and organic traffic we're experiencing in a controlled test environment," and that spikes in drops were beyond what it expected. We plan to test hard and still keep a queue or waiting room as the fallback (ADR-003 lists it as later work).

## How comparable products do it

| Company | What we found | Evidence |
| ------- | ------------- | -------- |
| **DraftKings** | k6 for high-scale load and Locust for stateful scenarios such as breakpoint tests with recovery. Soak tests hold 80 to 90 percent of expected peak for a long time. "Cleanroom" runs an automated load test for every release candidate in a scaled-down environment and compares it with a baseline. Large shared-environment tests run before events such as the first week of the NFL season. | DraftKings engineering blog posts (written by an engineer there) |
| **Fanatics (betting and gaming)** | Load and performance engineer role built around k6, Testkube, and GitHub Actions on Kubernetes, with 100,000 or more WebSocket connections and Datadog. Tests run in production and pre-production with guardrails. | Job posting, now closed |
| **NBA Top Shot (Dapper Labs)** | Ran live "stress tests" by releasing 5,000 to 25,000 packs at a time, then moved to a randomized waiting-room queue, later with priority queues. | NBA Top Shot blog posts |
| **Kalshi** | Postings ask for stress testing of critical systems. They name no tool. | Job postings |
| **Sorare** | No source found. | None |

Pattern: the two confirmed tooling choices are k6 (DraftKings, Fanatics) and Locust (DraftKings). We found no confirmed use of Gatling, Artillery, or JMeter. DraftKings gives the useful rule: k6 first, Locust only when a test needs state that k6's stages cannot express. Top Shot is the warning: drop-day load defeated a system that tested well on average, and the fix was a queue, not more servers.

Source quality note: these are engineering blog posts, a job posting, and company blog posts. None is an architecture document, and none says how often the tests run.

## Options Considered

Prices are list prices on 2026-11-08. Effort figures are our estimates, not measurements.

Every option needs the same **shared core,** because no tool provides it:

- **Seed data:** many test accounts, collectibles, and limited drops.
- **Test tokens** (see Consequences, because Auth0 does not allow load tests on our plan).
- **Stubs** for RevenueCat, Expo, and the sports data provider.
- **A result checker** that reads Postgres after a run and verifies the invariants (no oversold stock, no duplicate ledger rows).
- **A test stack in Terraform** and **CircleCI jobs.**

Estimate for the shared core: **6 to 9 engineer-days.** Options differ in what runs the traffic.

### Option A: k6 (open source), run by us

A single Go binary that runs JavaScript or TypeScript scripts. Current release is v2.3.0 (Sept 21, 2026), and the 1.8 line still gets patches.

Pros:

- **Open-model load.** `constant-arrival-rate` and `ramping-arrival-rate` start iterations at a set rate regardless of response time, and drop an iteration (counted as `dropped_iterations`) when no virtual user is free. That is the pack drop stampede. The other four executors are closed-model and slow down when the server slows down, which hides the failure.
- **Pass or fail built in.** Thresholds on any metric (`p(95)<500`, `rate<0.01`) set a non-zero exit code, and `abortOnFail` stops a test that is already failing.
- **TypeScript runs directly** (since v0.57). It strips types and does not type-check, so we run `tsc --noEmit` in CI.
- **CircleCI orb** from Grafana (`grafana/k6`).
- **Evidence.** DraftKings and Fanatics use it at far larger scale than ours.
- **Protocols.** HTTP, WebSocket, and gRPC are built in.
- **Efficient generator.** One process can outrun our API (see above).

Cons:

- **k6 is not Node.js.** The script runs in an embedded JavaScript engine with no `fs`, `os`, or `process`. We cannot import API packages that use Node APIs. Shared types and plain functions work after bundling.
- **Server-Sent Events need a community extension** (`xk6-sse`, Apache-2.0). Its latest release builds on k6 v2. We did not confirm that k6 v2.3 resolves it without a custom build.
- **Distributed runs are not first class.** One k6 process runs on one machine. Execution segments can split a test across machines, but there is no merged threshold check or summary. A maintainer wrote that distributed tests work "unfortunately, without thresholds and a centralized summary." The Kubernetes operator solves this only on Kubernetes, which we do not run. The issue has been open since 2017.
- **License is AGPL-3.0.** Running k6 unmodified against our own systems is unaffected. The copyleft terms matter if someone modifies k6 and offers it to others over a network. We do not ship k6 in the product.

Cost: free. A load generator on Fargate is cents per run (see Cost).

### Option B: Grafana Cloud k6 (hosted)

The same k6 scripts, run from Grafana's generators, with a hosted dashboard.

Pros:

- **No runner to build.** Distributed runs, merged thresholds, dashboards, and run history come with it.
- Free tier of 500 virtual user hours (VUh) a month. Pro is $19 per month including 500 VUh, then from $0.15 per VUh, with volume discounts.

Cons:

- **Our test stack would need a public address.** The generators sit outside our VPC. Static IPs for allow-listing are a billed item.
- **Two places hold our test data and results.**
- Cost grows with VUs and minutes. 1,000 virtual users for 30 minutes is 500 VUh. Browser users cost 10 times as much, and every test costs at least 1 VUh.
- Enterprise starts at a $25,000 annual commit.

Build effort: about 1 to 2 days less than A, because there is no runner. Plus the networking work above.

### Option C: Locust

Python. Users are classes. Current release is 2.47.0 (Oct 21, 2026), MIT license, Python 3.11 or later.

Pros:

- **Free-form scenarios.** A `LoadTestShape` class can change load based on live state. DraftKings uses it for breakpoint tests that wait for the system to recover and then ramp up again.
- **Distributed runs are built in.** One `--master` and many `--worker` processes, and the master shows merged statistics.
- MIT license.

Cons:

- **A second language** for a team that is on TypeScript. We would not share types with the API or the apps.
- **Lower throughput per process.** DraftKings puts it near 10,000 requests per second, and each worker needs a core because of Python's GIL. Fine for our API ceiling.
- The default model is users with wait times. Arrival-rate shaping is code we write.
- We did not check WebSocket or SSE support.

Build effort: about 2 to 4 days more than A.

### Option D: Gatling Community Edition (JavaScript and TypeScript SDK)

Apache-2.0. Simulations written in TypeScript run on Gatling's JVM engine through GraalVM. SDK version 3.16.4 (Nov 4, 2026).

Pros:

- **Open injection and assertions** for pass or fail. HTTP/1.1, HTTP/2, WebSocket, and SSE are in the Apache-2.0 core with no limits.
- **No AGPL.** No account and no cap on users or duration for those protocols.

Cons:

- **Distributed runs are paid.** Community Edition generates load from one machine. Managed or private-location generators and dashboards are Enterprise, from EUR 89 per month billed annually, plus usage credits.
- gRPC, MQTT, and GraphQL are capped at 5 users and 5 minutes on Community Edition. We do not plan to need them.
- **A JVM toolchain beside Node.** Its scripting model is also new to the team.
- We found no comparable company using it.

Build effort: about 2 to 3 days more than A.

### Option E: Artillery (open source)

MPL-2.0 (some Azure modules are BSL). Node.js. Version 2.0.34 (Aug 14, 2026).

Pros:

- **Runs on Node.** Test code can import `jose` to mint tokens and our own Zod schemas.
- **Distributed runs on our own AWS account, free.** `artillery run-fargate` creates an S3 bucket, an SQS queue, and Fargate tasks, and merges results. Fargate compute is the only cost. AWS tags can be applied to the resources.
- HTTP, GraphQL, WebSocket, and Socket.io.

Cons:

- **SSE is an experimental separate engine** whose repository was last pushed in 2023.
- The paid Artillery Cloud ($199 per month Team) limits distributed tests to 5 workers per test and 30 minutes. The free CLI does not have that limit as far as the docs show.
- **No confirmed comparable user.** Smaller community than k6.

Build effort: about 1 day less than A, if the shared core also uses Node. We did not check Artillery's CircleCI integration.

### Option F: Apache JMeter

Apache-2.0. Java. The latest stable line is 5.6, and 6.0 (requires Java 17) is not released yet (milestone due Dec 1, 2026), per a third-party docs site.

Pros:

- Longest track record. Has an Open Model Thread Group.
- A large library of plugins and examples.

Cons:

- **Test plans are XML,** edited in a GUI. Reviews of changes are hard to read.
- Java beside Node. As we understand it, load is thread per virtual user, which costs memory. We did not check this.
- A major version is in flux.

Build effort: about 4 to 6 days more than A.

### Option G: AWS Distributed Load Testing on AWS (a runner, not a tool)

An AWS solution that runs JMeter, k6, or Locust scripts on Fargate in our account. Version 4.3.x (Oct 2026). It runs the test through Taurus.

Pros:

- **Distributed runs in our account** across many Fargate tasks, with scheduling, a web console, baselines, and a CLI for CI gates (added in 4.3.0).
- AWS estimates about $30.90 per month at its default assumptions (10 tasks of 2 vCPU and 4 GB for 30 hours a month). Fargate is $29.62 of that.
- k6 TypeScript scripts are supported (4.0.10).

Cons:

- **Another stack to deploy and keep updated,** with its own Step Functions, DynamoDB, and console. The web console options add an ALB and VPC endpoints on top.
- In its default "Standard" mode, DLT's ramp-up and hold-for settings control the load shape. Running the script's own executors needs "Native" mode, which was added in 4.3.0 as a preview.
- One more thing to learn for a load that one machine can already generate.

Use it later if we outgrow one generator (see review triggers).

### Not evaluated in depth

- **wrk, Vegeta, oha, Bombardier, Apache Bench.** Fast single-endpoint tools. They do not model flows, so they cannot check stock or ledger correctness.
- **BlazeMeter, Loader.io, Azure Load Testing, Flood.** Hosted services with the same drawbacks as Option B.
- **Playwright or device-based tests for the mobile apps.** App rendering speed is not server load. It belongs to the mobile and testing items.

## Comparison

### Fit against the scope

| Capability | A. k6 | B. Grafana Cloud k6 | C. Locust | D. Gatling CE | E. Artillery | F. JMeter |
| --- | --- | --- | --- | --- | --- | --- |
| Script language | JS / TS (not Node) | JS / TS (not Node) | Python | JS / TS on GraalVM | YAML, JS / TS on Node | XML, GUI |
| Open-model arrival rate | Yes, built-in executors | Yes | Custom `LoadTestShape` | Yes (open injection) | Yes (arrival phases) | Yes (Open Model Thread Group) |
| Pass or fail exit code | Thresholds | Thresholds | In code (not checked) | Assertions | Not checked | Not checked |
| WebSocket | Built in | Built in | Not checked | Built in | Built in | Not checked |
| SSE | Community extension | Not checked | Not checked | Built in | Experimental, unmaintained | Not checked |
| Merged distributed run | No (segments, no merged thresholds) | Yes | Yes (master and workers) | Paid (Enterprise) | Yes (`run-fargate`, free CLI) | Not checked |
| Runs inside our VPC | Yes | No (public) | Yes | Yes (single machine) | Yes | Yes |
| CircleCI | Orb | Orb (cloud mode) | CLI | CLI | Not checked | CLI |
| Comparable user found | DraftKings, Fanatics | Not checked | DraftKings | No | No | No |
| License | AGPL-3.0 | Hosted | MIT | Apache-2.0 | MPL-2.0 | Apache-2.0 |

### Effort and cost

| Option | Effort vs. A | Tool cost | Runner cost |
| --- | --- | --- | --- |
| A. k6 | Baseline | $0 | Fargate, cents per run |
| B. Grafana Cloud k6 | 1 to 2 days less, plus networking | Free for 500 VUh, then $19 plus $0.15 per VUh | Included |
| C. Locust | 2 to 4 days more | $0 | Fargate, cents per run |
| D. Gatling CE | 2 to 3 days more | $0 (Enterprise from EUR 89 per month) | Fargate, cents per run |
| E. Artillery | About 1 day less (Node) | $0 (Cloud from $199 per month) | Fargate, free `run-fargate` |
| F. JMeter | 4 to 6 days more | $0 | Fargate, cents per run |
| G. AWS DLT (runner) | About 2 to 3 days to deploy | $0 | About $30 per month at AWS's defaults |

The cost of the load generator is small in every option. Fargate on ARM costs about $0.04 per hour for 1 vCPU and 2 GB (from ADR-003's $28.84 per month), so a 4 vCPU and 8 GB generator for two hours is about $0.32. The cost that matters is the stack under test, covered below.

## Decision

We choose **k6 (open source)** with TypeScript scripts as the load testing tool. We run it from **CircleCI** for small gate tests and from **a Fargate task in the staging AWS account** for full tests, against a **production-sized test stack** created from the same Terraform modules and destroyed after the run. Every run is followed by a **Postgres invariant check.** We do not load test production, and we do not call real Auth0, RevenueCat, Expo, or sports provider services.

Why:

1. **It models the failure we are most afraid of.** Arrival-rate executors reproduce a drop stampede that does not slow down when the server does. Thresholds turn the result into an exit code, so CircleCI can block a deploy.
2. **It is what comparable products use.** DraftKings and Fanatics run k6. DraftKings gives a clear rule for when to add Locust.
3. **One generator is enough.** The API ceiling is hundreds of requests per second, and one k6 process can generate far more. We do not need merged distributed results at launch, which is k6's weak spot.
4. **It fits our stack at no cost.** A CircleCI orb, TypeScript scripts, and a container that runs on Fargate in our own account. No hosted service holds our data, and no stack to keep updated.
5. **Cheap to leave.** The seed data, stubs, token minting, and invariant check do not depend on the tool. Only the scenario scripts are k6-specific.

Why not the others:

- **Artillery** is the strongest alternative. It shares our language, and its free `run-fargate` gives merged distributed results. It loses on evidence (no comparable user), community size, and unmaintained SSE support. It is the first thing to switch to if k6's lack of Node APIs hurts.
- **Grafana Cloud k6** is the right answer if non-engineers need dashboards, or if we need more load than one generator. It needs a public test stack and costs per VU hour. We keep it as an upgrade.
- **Locust** is added only for tests that k6's stages cannot express (for example, ramp up, break, wait for recovery, ramp up again). That is DraftKings's own rule.
- **Gatling** is good and has native SSE. It costs a JVM toolchain, and distributed runs are paid. It is the answer if the client objects to AGPL.
- **JMeter** is the heaviest to maintain. The XML plans make reviews hard.
- **AWS DLT** adds a stack we do not need yet.

We accept the following risks:

- **No merged distributed results.** Fine below about one generator's capacity. Above it, we move to Option G, B, or the Kubernetes operator.
- **SSE depends on a community extension.** The live standings transport is still open (ADR-003). If we pick SSE, confirm the extension works in the spike. Polling and WebSocket tests need nothing extra.
- **AGPL.** We do not modify k6 or ship it. The client should confirm they accept AGPL tools.
- **Synthetic traffic is not real traffic.** We keep the waiting room as the fallback for drops, and we watch the first real drops closely.
- **k6 does not type-check.** CI runs `tsc --noEmit`.

## Consequences

### What we test

Scenarios come from the scope. Numbers in braces are for the client to set.

| Scenario | Source | Load shape | Pass criteria |
| --- | --- | --- | --- |
| **Limited drop** | Scope, ADR-001, ADR-003 | Arrival rate. Stock N, buyers {M}, per-account limit L. Every buyer retries once with the same idempotency key. | Sold equals N exactly. No account holds more than L. Every purchase has one ledger debit and one ownership grant. Replayed keys return the original result. |
| **Offer accepts and holds** | Scope, ADR-001 | Many offers on one hot listing, accepted and cancelled at once. | One winner per listing. Holds released. Balances never negative. Total credits conserved. |
| **Contest cutoff** | Scope | Lineup edits and submits in the last minutes before lock. | No lineup saved after cutoff. One lineup per user. Copies in two lineups rejected. |
| **Pack open** | Scope | Opens with the app killed and retried. | No double charge. No duplicate collectibles. |
| **Live standings reads** | Scope, ADR-003 | Many viewers on one contest. Polling now, SSE or WebSocket later. | p95 within target. Provider calls stay at the central fetch rate, not one per user. |
| **Settlement and evolution fan-out** | Scope, ADR-006 | One achievement upgrades many owners. One contest settles for {K} entrants. | Each reward and notification exactly once. Queue and dead-letter queue drain. |
| **Credit purchase webhooks** | ADR-005 | Webhook bursts including duplicates, against a RevenueCat stub. | Credits granted once per event ID. Sandbox events rejected in the production configuration. |
| **Notification send** | ADR-006 | 100,000 recipients through an Expo stub with its 600 per second limit. Kill the sender mid-run. | No loss, no duplicates, urgent send delayed by less than {X} during a bulk run. |
| **Soak** | DraftKings | 80 to 90 percent of expected peak for {hours}. | No growth in memory, connections, or queue depth. p99 stays flat. |
| **Breakpoint and recovery** | DraftKings | Ramp until failure, then drop to idle, then ramp again. | Recovers without a manual restart. Same throughput afterward. |

Run each scenario at four levels: smoke, expected peak, stress (2 to 3 times peak), and spike. Start low and raise gradually, so each level gives data.

### Tiers and cadence

- **Tier 1: gate, every staging deploy.** A CircleCI job runs smoke-level versions of the first four scenarios against staging for a few minutes. It fails the deploy on an error-rate threshold, a loose p95 threshold, or any invariant failure. CircleCI runners are outside AWS and noisy, so do not tighten the latency threshold here.
- **Tier 2: full run, before releases that touch the hot paths and before each scheduled drop or big event.** Manual CircleCI job (with approval) starts the test stack and a Fargate generator task. Results go to S3.
- **Tier 3: launch rehearsal.** Soak, breakpoint, and spike runs on the final configuration, with the client invited.

### Test environment

- **A test stack per Tier 2 or 3 run,** created in the staging AWS account from the same Terraform modules as production, then destroyed. It includes the API at the production minimum task count and scaling limits, the worker, an RDS instance of the **production class with Multi-AZ on** (ADR-002), and a seeded database restored from a snapshot. Keep regular staging small for QA.
- **Cost, our arithmetic from ADR-002 and ADR-003 prices:** about $0.37 per hour for a `db.m7g.large` Multi-AZ, about $0.32 per hour for 8 API tasks, about $0.03 per hour for the load balancer, and about $0.16 per hour for a 4 vCPU generator. A four-hour window costs about $3.50 before data transfer, seeding, and engineering time.
- **Generator in the same Region, inside the account.** AWS's EC2 testing policy needs no approval for a network stress test to an intended application with legitimate traffic, with endpoints in the local Region. It treats request flooding as denial of service. We stay far below AWS's traffic-shaping thresholds. Anything past the policy's limits needs a Simulated Events request two weeks ahead.
- **Latency is measured from inside AWS.** It shows server behavior, not what a phone sees on a mobile network.
- **Watch the generator.** Keep its CPU under about 80 percent. A run with `dropped_iterations` above zero that we did not plan for, or a saturated generator, is invalid and is repeated.
- **Metrics to read during a run:** ADR-003's paging list (ALB 5xx rate, p95, task count at maximum, database CPU and connections, dead-letter queue depth) plus RDS Performance Insights for lock waits.

### Third parties are stubbed

- **Auth0.** Auth0's load testing policy allows tests only on an Enterprise subscription, with prior written approval at least 2 weeks before, 2 hours maximum, and at most one production-tenant test (plus up to 2 repeats) a year. ADR-004 puts us on Essentials, and the staging tenant tag has lower limits. So load tests **do not call Auth0.** The test stack's API verifies tokens against a test issuer's JWKS, set by a Terraform variable. A script mints one token per test user before the run, and k6 reads them from a shared array. The production configuration must reject the test issuer, and a CI check proves it. Separately, estimate sign-in rate at a drop against Auth0's published limits (ADR-004 asked for that) and rehearse at low rate with real devices. If the client wants Auth0 load tested, that needs an Enterprise plan. We did not get a price.
- **RevenueCat.** A stub answers the "confirm the transaction" call from ADR-005. Webhooks are sent to our route with a test secret. RevenueCat's v2 API is limited per key (480 requests per minute for customer information, 60 for project configuration), so the real service is never a load target.
- **Expo Push Service.** A stub that returns tickets and receipts and answers `TOO_MANY_REQUESTS` above 600 per second (ADR-006).
- **Sports data provider.** A stub that replays recorded games at the planned cadence. The provider is not chosen yet (tracking item).
- The stubs are one small service in the test stack, in TypeScript, in the monorepo.

### Test data

- Use synthetic data only. No production data is copied.
- Use many distinct users. A few users let caches hide the real load (Auth0 gives the same advice).
- The seeding script is idempotent and versioned with the migrations, so a restored snapshot can be rebuilt.

### Correctness check after each run

A read-only script (TypeScript, in the repo) runs after k6 and fails the job if any invariant breaks: sold stock equals issued stock, per-account limits hold, every ledger debit has a matching grant, credits are conserved, no `notifications` duplicates by `dedupe_key`, and no active offer hold points at a closed offer. k6's response checks cannot see these.

### Thresholds

Starting values are ours and not measured. Set real ones after the first baseline and agree them with the client.

- Error rate under 1 percent, not counting expected business rejections (sold out, limit reached, which are `409` or `422`).
- p95 under 500 ms and p99 under 1,500 ms for purchase and open paths at expected peak.
- Zero invariant failures. This one is never relaxed.

### Repo and tooling

- Put tests in a `load-tests/` package in the monorepo: `scenarios/`, `lib/`, `stubs/`, `seed/`, `verify/`. Keep tool-neutral code (seed, stubs, token minting, verifier) out of `scenarios/`.
- Pin the k6 version through the `grafana/k6` image tag. Review k6 releases before upgrading, because v2 removed commands and executors.
- Do not add `sleep()` at the end of an arrival-rate iteration. The executor already paces it.
- Save each run's `summary.json`, k6 version, git SHA, stack configuration, and Terraform plan to S3. Compare against the previous run by hand until the observability ADR chooses dashboards.
- Count load test jobs in the CircleCI plan credits (ADR-003).

### What this feeds

- **ADR-003:** measure scale-out time under a limited-drop burst. Set minimum capacity and scheduled scaling actions from that number. Confirm the `max tasks × connections per task` rule.
- **ADR-002 and ADR-001:** size the database from the Tier 2 runs. Check hot-row contention on a drop. Mitigate with short transactions and per-drop stock rows or counters.
- **ADR-006:** the notification fan-out and urgent-during-bulk tests above.
- **Waiting room:** if the drop scenario cannot reach the client's target at correct results, add a queue or waiting room for the purchase path (Top Shot's fix) before launch.

### Review triggers

- A test needs more than one generator (roughly more than 20,000 requests per second, or more connections than one process holds): move to Option G, B, or the k6 operator. If we are on Kubernetes by then, the operator.
- The live standings transport becomes SSE and `xk6-sse` does not work in our k6 version: use a custom k6 build, or move that scenario to Gatling.
- A scenario needs live state that stages cannot express: add Locust for that scenario only.
- Non-engineers need dashboards or trends: add Grafana Cloud k6.
- The client objects to AGPL: switch to Gatling Community Edition.
- The test code needs Node packages we cannot bundle: switch to Artillery.

### Exit plan

Scenario scripts are about 100 to 200 lines each in plain JavaScript. Moving to Artillery or Gatling rewrites those scripts (our estimate: 3 to 5 days for all scenarios). Seed data, stubs, tokens, the verifier, and the Terraform test stack stay.

### Run the spike first

Before approval is final, check in staging:

1. A k6 TypeScript script runs in CircleCI through the orb on k6 v2, and a failing threshold fails the job.
2. A 4 vCPU Fargate generator runs a 5-minute arrival-rate test at a rate above our API ceiling without `dropped_iterations` and under 80 percent CPU.
3. The test issuer path works in the test stack, and the production configuration rejects test tokens.
4. A limited-drop burst (for example, stock 1,000 and 20,000 buyers in 60 seconds) completes, the verifier passes, and we record how long scale-out takes.
5. If SSE is the likely transport: `xk6-sse` works on our k6 version. Otherwise run a 10,000-connection WebSocket or polling test.
6. The test stack comes up from a snapshot and is destroyed by Terraform. Record the time and cost.

### Open questions for the client

- **Peak numbers.** Expected users, buyers per minute at the biggest drop, stock sizes, per-account limits, and concurrent viewers of a live contest, now and in a year. The thresholds and every scenario depend on these.
- **Latency targets.** What is acceptable for purchase, open, and live standings? We proposed starting values above.
- **AGPL.** Is an AGPL-licensed test tool acceptable? If not, Gatling Community Edition.
- **Auth0 load testing.** Is the client willing to move to Enterprise for a tested sign-in burst, or is a rate-limit estimate and a low-rate rehearsal enough?
- **Budget and cadence.** About $3.50 per four-hour test window plus engineering time. Is a test before every hot-path release and every drop acceptable?
- **Production safety tests.** We plan only a post-deploy smoke test in production. Does the client want a controlled live drop rehearsal like Top Shot's?
- **Waiting room.** If the drop scenario fails, is the client open to a queue in the purchase flow?
- **Who reads the results** and signs off before a drop.

## Sources

Comparable products:

- DraftKings Engineering, [Soak Testing as part of SDLC](https://medium.com/draftkings-engineering/soak-testing-as-part-of-sdlc-a07b2dbc3fd7), [Implementing breakpoint tests that include system recovery](https://medium.com/draftkings-engineering/implementing-breakpoint-tests-that-include-system-recovery-209b584712fa), [Enhancing quality and resiliency: isolated testing solution, Part 1](https://medium.com/draftkings-engineering/enhancing-quality-and-resiliency-draftkings-isolated-testing-solution-part-1-7f08bb8dd4a7)
- Fanatics, [SDET III, Load & Performance posting](https://jobs.insightpartners.com/companies/fanatics/jobs/67537514-senior-software-engineer) (closed)
- NBA Top Shot, [State of NBA Top Shot, Feb 4 2021](https://blog.nbatopshot.com/posts/state-of-nba-topshot), [Explaining the Queue](https://blog.nbatopshot.com/posts/the-queue), [The History of Packs](https://blog.nbatopshot.com/posts/history-of-packs), [Dev Diary #13](https://blog.nbatopshot.com/posts/dev-diary-13)
- Kalshi, [Software Engineer, Trading Platform posting](https://jobs.ashbyhq.com/kalshi/13c4b111-5dab-4560-9843-70c06c1acf6e), [Infrastructure Engineer posting](https://jobs.ashbyhq.com/kalshi/3d255a5d-7b0c-4a92-bae1-1ddb040f733e/application)

k6 and Grafana:

- [grafana/k6](https://github.com/grafana/k6) (AGPL-3.0), [k6 releases](https://github.com/grafana/k6/releases/), [Executors](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/), [Constant arrival rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/), [Thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/), [Running distributed tests](https://grafana.com/docs/k6/latest/testing-guides/running-distributed-tests/)
- QAble, [What is k6? Review, pricing, setup](https://www.qable.io/knowledge-hub/tools/k6) (third-party summary of v2 changes, TypeScript, and executors)
- k6, [Clustering and distributed execution (issue 140)](https://github.com/k6io/k6/issues/140), [k6-operator: native distributed execution](https://github.com/grafana/k6-operator/blob/main/docs/on-native-distributed-execution.md)
- [xk6-sse](https://github.com/phymbert/xk6-sse), [xk6-sse on pkg.go.dev](https://pkg.go.dev/github.com/phymbert/xk6-sse)
- Grafana, [k6 CircleCI orb](https://github.com/grafana/k6-circleci-orb), [Load testing with CircleCI](https://grafana.com/blog/load-testing-with-circleci/), [Handle the k6 exit code](https://grafana.com/docs/learning-paths/automate-k6-cicd/handle-exit-code/)
- Grafana, [Pricing](https://grafana.com/pricing/?pg=pricing), [Performance Testing pricing and VUh](https://grafana.com/docs/grafana-cloud/platform/pricing-and-usage/performance-testing/)

Other tools:

- Locust, [PyPI](https://pypi.org/project/locust/), [Releases](https://github.com/locustio/locust/releases/), [Distributed load generation](https://docs.locust.io/en/latest/running-distributed.html)
- Gatling, [Community Edition repository](https://github.com/gatling/gatling/), [`@gatling.io/core`](https://www.npmjs.com/package/@gatling.io/core), [Pricing](https://gatling.io/pricing), [JavaScript load testing guide](https://gatling.io/blog/javascript-load-testing)
- Artillery, [Repository and license](https://www.github.com/artilleryio/artillery), [Releases](https://github.com/artilleryio/artillery/releases), [Pricing](https://www.artillery.io/pricing), [Distributed tests on AWS Fargate](https://www.artillery.io/docs/load-testing-at-scale/aws-fargate), [SSE engine](https://github.com/artilleryio/artillery-engine-sse)
- Apache JMeter, [6.0.0 release notes](https://docs.jmeter.ai/releases/6-0-0/), [6.0.0 milestone](https://github.com/apache/jmeter/milestone/12) (third-party docs site and GitHub)
- AWS, [Distributed Load Testing on AWS: overview](https://docs.aws.amazon.com/solutions/distributed-load-testing-on-aws/), [cost](https://docs.aws.amazon.com/solutions/latest/distributed-load-testing-on-aws/cost.html), [changelog](https://github.com/aws-solutions/distributed-load-testing-on-aws/blob/main/CHANGELOG.md)

AWS and third-party limits:

- AWS, [Amazon EC2 Testing Policy](https://aws.amazon.com/ec2/testing/), [Penetration testing policy](https://aws.amazon.com/security/penetration-testing/), [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [Well-Architected PERF05-BP04](https://docs.aws.amazon.com/wellarchitected/latest/framework/perf_process_culture_load_test.html)
- Auth0, [Load Testing Policy](https://auth0.com/docs/troubleshoot/customer-support/operational-policies/load-testing-policy), [Rate Limit Policy](https://auth0.com/docs/troubleshoot/customer-support/operational-policies/rate-limit-policy), [Testing Complete (B2B)](https://auth0.com/docs/get-started/architecture-scenarios/business-to-business/launch/testing), [Rate limits with staging vs production tag (community answer)](https://community.auth0.com/t/rate-limits-with-staging-vs-production-environment-tag/80337)
- RevenueCat, [Developer API v2 rate limits](https://www.revenuecat.com/docs/api-v2), [Sandbox testing](https://production-docs.revenuecat.com/test-and-launch/sandbox)

Project:

- [Pack Draft development feature scope](../../scope/project_scope.md)
- [ADR-001: Use PostgreSQL as the primary database](./001-primary-database.md)
- [ADR-002: Use AWS as the cloud provider](./002-cloud-provider.md)
- [ADR-003: Use Node.js with TypeScript on ECS Fargate for the API](./003-api-runtime-and-compute.md)
- [ADR-004: Use Auth0 with browser sign-in for authentication](./004-auth-service.md)
- [ADR-005: Use Apple and Google in-app purchases through RevenueCat to sell credits](./005-payment-service.md)
- [ADR-006: Keep the notification inbox in Postgres and send push through the Expo Push Service](./006-app-notifications.md)
