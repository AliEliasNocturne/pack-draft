# ADR-001: Use PostgreSQL as the primary database

## Status

Proposed (pending client approval)

## Date

2026-11-04

## Context

Pack Draft stores money-like and ownership data. The [project scope](../../scope/project_scope.md) requires:

- **Atomic multi-asset transfers.** An accepted offer moves packs, collectibles, and credits between two accounts in one step, or not at all.
- **Holds and reservations.** Assets in offers, listings, or submitted lineups are locked. No double-spend or double-offer.
- **Correct limits under concurrency.** Limited pack drops enforce stock and per-account purchase limits while many users buy at once.
- **Idempotent retries.** Purchases, pack opens, rewards, and settlements must not duplicate credits, assets, or charges.
- **A credit ledger.** Every purchase, entry fee, sale, refund, and hold is recorded and auditable.
- **Per-copy history.** Each unique collectible copy keeps its ownership history, earned rarity, and milestones.
- **Hidden pack contents.** Contents are fixed at issue and revealed only on open.
- **Relational data.** Users, sets, players, copies, contests, lineups, offers, and leagues reference each other heavily.
- **Read-heavy sports data.** Live stats are fetched centrally and fanned out to users, so most reads should come from cache or precomputed rows, not per-user provider calls.

The team is small. The database should be boring to operate and have good ORM and migration tooling.

## How comparable products do it

Prediction markets and sportsbooks have the same core problem: a ledger, concurrent writes, and settlement.

| Company                                      | Transactional store                                                                      | Other stores                                            | Evidence                                                                                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kalshi**                                   | PostgreSQL on AWS (RDS, ECS)                                                             | Kafka, Snowflake/Redshift for analytics                 | Engineering job postings list "very comfortable with relational databases (e.g. Postgres)" and "solid understanding of relational databases and transactions" for the exchange and clearing teams. |
| **Polymarket**                               | PostgreSQL                                                                               | ClickHouse for analytics, Goldsky for on-chain indexing | ClickHouse case study: Postgres held trading data, metadata, and user-facing APIs. They added ClickHouse for analytics instead of replacing Postgres.                                              |
| **DraftKings**                               | Amazon Aurora MySQL for the financial ledger; also PostgreSQL, MSSQL, MongoDB, Aerospike | Kafka, Snowflake                                        | AWS case study and DraftKings engineering blog. The ledger runs on a relational engine. They have 200+ databases, which fits their size, not ours.                                                 |
| **NBA Top Shot / NFL All Day (Dapper Labs)** | PostgreSQL (plus Cloud Spanner in some services)                                         | Redis, Kafka, Flow blockchain                           | Engineer profiles. Closest product match: packs, marketplace, offers, challenges.                                                                                                                  |
| **Sorare**                                   | PostgreSQL / Aurora                                                                      | Redis, Algolia                                          | Sorare job posting. Fantasy sports plus collectible cards.                                                                                                                                         |

Pattern: every one of these keeps ownership and money data in a relational database with transactions. Kafka, Redis, and a warehouse sit beside it for streaming, caching, and analytics. None of them put the ledger in a document store.

Source quality note: the DraftKings and Polymarket sources are first-party. The Kalshi, Dapper Labs, and Sorare evidence comes from job postings and engineer profiles. It shows what they hire for, not an architecture document.

## Options Considered

### Option A: PostgreSQL

Pros:

- Full ACID transactions with `SERIALIZABLE` isolation, so multi-asset transfers are all-or-nothing.
- Row locks (`SELECT ... FOR UPDATE`, `SKIP LOCKED`) fit holds, reservations, and limited-drop stock.
- Unique constraints and `INSERT ... ON CONFLICT` map directly to idempotency keys.
- Foreign keys and `CHECK` constraints protect ownership integrity and block negative balances at the database level.
- Partial indexes and exclusion constraints help enforce rules such as "one active hold per asset".
- `JSONB` with indexing covers flexible milestone and stat payloads without a second database.
- Transactional DDL: a failed migration rolls back cleanly.
- Strong relational querying (joins, window functions, CTEs) for collection filters, marketplace search, and contest standings.
- Built-in partitioning for large append-only history tables.
- Same engine used by Kalshi, Polymarket, Sorare, and Dapper Labs for similar problems.
- Runs on every major host (RDS, Aurora PostgreSQL, Neon, Supabase, Cloud SQL), so little cloud lock-in.
- Largest open-source ecosystem. Works with Prisma, Drizzle, and most ORMs. Large hiring pool.

Cons:

- Scales writes vertically first. Horizontal write scaling needs sharding or a different system.
- One process per connection, so a pooler (PgBouncer or the host's pooler) is needed, especially with serverless servers.
- Frequently updated hot rows (stock counters) create dead tuples and rely on vacuum tuning.
- Heavy analytics on the production database compete with app traffic until a read replica is added.
- Contention on a single hot row (a popular drop) must be designed around.
- Major version upgrades need planning, though managed hosts reduce the effort.

### Option B: MySQL / Aurora MySQL

Pros:

- Mature and proven for financial ledgers (DraftKings runs its ledger on Aurora MySQL).
- InnoDB gives ACID transactions and row-level locking. `SELECT ... FOR UPDATE` and `SKIP LOCKED` are available in MySQL 8.0+.
- Aurora offers fast read replicas, quick failover, and managed storage scaling.
- Lighter per-connection cost than Postgres, so less pooling pressure.
- Very large talent pool and long operating history.
- Good ORM and migration tool support.

Cons:

- No partial indexes, and `JSON` support is less capable than `JSONB`. JSON fields are indexed through generated columns.
- DDL is not transactional. A failed migration can leave the schema half-changed.
- `CHECK` constraints are only enforced from 8.0.16. Older managed versions may not enforce them.
- `ON DUPLICATE KEY UPDATE` is less flexible than `ON CONFLICT` for idempotency patterns.
- Default `REPEATABLE READ` behaves differently from Postgres. Lock and gap-lock behavior needs care for stock and limit checks.
- Aurora is AWS-only and costs more than standard RDS.
- Less common among the comparable startups with our product shape.

### Option C: MongoDB

Pros:

- Flexible schema suits rules that are still TBD and evolving stat payloads.
- Documents map naturally to a pack with embedded contents or a lineup with embedded slots.
- Multi-document ACID transactions are supported on replica sets and sharded clusters.
- Built-in horizontal scaling through sharding.
- Change streams are useful for pushing live updates.
- Managed option (Atlas) with good tooling.

Cons:

- Our data is highly relational (users, copies, offers, contests, lineups, leagues). Joins (`$lookup`) are weaker and slower.
- No foreign keys. Referential integrity and ownership rules would live in application code.
- Transactions are slower than single-document writes and have limits (time limit, write conflicts that abort and retry).
- Higher risk of subtle double-spend or double-offer bugs in the marketplace and ledger.
- Schema flexibility becomes schema drift without strict validation and discipline.
- None of the comparable products use it for the ledger.
- Atlas ties the managed experience to one vendor. The server license (SSPL) limits some self-hosting options.

### Option D: DynamoDB

Pros:

- Very high scale with consistent low latency.
- Serverless and pay-per-use, with almost no operations work.
- `TransactWriteItems` gives atomic multi-item writes with condition checks.
- Conditional writes work well for idempotency keys and stock decrements.
- Built-in TTL and streams, useful for expiring holds and event fan-out.
- Strong AWS integration.

Cons:

- Access patterns must be designed up front. A changing product means reworking table and index design.
- No joins. Ad hoc queries (collection filters, marketplace search, contest standings) need extra indexes, denormalized copies, or a search service.
- Transactions are capped (100 items and 4 MB per transaction) and cost double the capacity.
- A single hot item (a popular drop) can hit per-partition throughput limits.
- No foreign keys. Integrity is enforced in application code.
- AWS-only, which is strong lock-in.
- Weaker local development and testing, and thinner ORM support.
- Reporting and analytics need exports to another system.

### Option E: Distributed SQL (CockroachDB, Google Cloud Spanner)

Pros:

- Horizontal write scaling with strong consistency.
- Serializable isolation by default (CockroachDB). Spanner offers external consistency.
- Automatic replication and failover, with multi-region options.
- Relational model with SQL, so the schema looks like the Postgres design.
- Postgres-compatible wire protocol (CockroachDB) eases a later move from Postgres.
- Removes the single-primary ceiling.

Cons:

- Higher cost and operational complexity than we need at launch.
- Commits cross nodes, so per-transaction latency is higher than a single Postgres primary.
- Serializable retry errors (for example `40001`) must be handled in application code.
- Postgres compatibility is partial. Some features, extensions, and behaviors differ.
- Hot-row contention (a popular drop) is still a problem and can be worse across nodes.
- Spanner is GCP-only. CockroachDB's licensing and pricing are more restrictive than open-source Postgres.
- Smaller hiring pool and community.
- Can be adopted later if one Postgres primary stops being enough.

## Decision

We choose **PostgreSQL** as the primary database for all transactional data.

1. The scope is relational and transactional. Postgres handles atomic transfers, holds, and the credit ledger natively.
2. Limited-drop stock and purchase limits can use conditional updates or row locks inside a transaction.
3. Idempotency keys map to unique constraints.
4. Kalshi, Polymarket, Dapper Labs, and Sorare all use it for similar problems. DraftKings uses a relational engine for its ledger.
5. It runs on every major host, so this choice does not lock in a cloud provider.

Not decided here:

- **Which managed Postgres host** (for example Amazon RDS or Aurora PostgreSQL, Neon, Supabase, Google Cloud SQL). Decide this together with the server hosting ADR.
- **ORM and migration tool.** Decide this with the API and server ADRs.
- **Cache and leaderboards.** Redis (or similar) can be added for live standings and sports-data fan-out. It is not a source of truth.
- **Analytics.** If reporting queries start to slow the app, add a read replica first. Polymarket's path (ClickHouse beside Postgres) is a later option.

## Consequences

- Use a connection pooler from day one, especially with serverless or autoscaled servers.
- Model the credit ledger as append-only entries. Balances are derived or checked against the ledger.
- Model ownership history as append-only rows per collectible copy.
- Wrap purchases, opens, offer accepts, and settlements in single transactions. Require an idempotency key on each.
- Load test limited-drop purchases and offer accepts under concurrency. Lock contention on hot rows is the main risk. Mitigate with short transactions and per-drop stock rows or counters designed for it.
- Run staging and production as separate instances. Migrations must be backwards-compatible for zero-downtime deploys.
- If a single primary becomes a limit, the first steps are read replicas, partitioning large history tables, and caching. Distributed SQL is the later fallback.

## Sources

Comparable products:

- DraftKings, [Amazon Aurora ledger case study (AWS)](https://aws.amazon.com/solutions/case-studies/draftkings-aurora-case-study/)
- DraftKings Engineering, [Migrate hundreds of microservices to the cloud, Part 1](https://medium.com/draftkings-engineering/migrate-hundreds-of-microservices-to-the-cloud-with-zero-downtime-part-1-781a4b8a21e1) (lists MSSQL, PostgreSQL, MongoDB, Aerospike, Snowflake)
- DraftKings Engineering, [Apache Kafka as a centralized state management platform, Part 1](https://medium.com/draftkings-engineering/apache-kafka-as-a-centralized-state-management-platform-part-1-aa6d3fe4024b) (Kafka as a database cache distributor, which fits our central-fetch, fan-out sports data model)
- Polymarket, [How Polymarket scaled their data stack with Postgres and ClickHouse (ClickHouse blog)](https://clickhouse.com/blog/how-polymarket-scales-data-with-postgres-and-clickhouse)
- Polymarket, [Order Lifecycle docs](https://docs.polymarket.com/concepts/order-lifecycle) (off-chain matching, atomic settlement)
- Kalshi, [Trading Platform engineer posting](https://job-boards.greenhouse.io/kalshi/jobs/6650541003), [Trading Systems Engineer posting](https://job-boards.greenhouse.io/kalshi/jobs/7985523003), [Data Engineer posting](https://job-boards.greenhouse.io/kalshi/jobs/6089733003)
- Sorare, [Senior Backend Engineer posting](https://peerlist.io/company/sorare/careers/senior-software-engineer-backend-goruby/jobhkknlrjqlrrklnfdkg6gebd8aqn)
- Dapper Labs (NBA Top Shot, NFL All Day), engineer profiles: [Quinn Hou](https://linkedin.com/in/quinnhou), [Javier Soto](https://linkedin.com/in/javier-soto-dev), [Harold S.](https://linkedin.com/in/haroldsphinx)

Database documentation:

- PostgreSQL, [Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- PostgreSQL, [Explicit locking (`FOR UPDATE`, `SKIP LOCKED`)](https://www.postgresql.org/docs/current/explicit-locking.html)
- PostgreSQL, [`INSERT ... ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html)
- MongoDB, [Transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- AWS, [DynamoDB transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)
- CockroachDB, [Transactions overview](https://www.cockroachlabs.com/docs/stable/transactions)

Project:

- [Pack Draft development feature scope](../../scope/project_scope.md)
