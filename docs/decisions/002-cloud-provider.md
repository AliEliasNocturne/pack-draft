# ADR-002: Use AWS as the cloud provider

## Status

Proposed (pending client approval)

## Date

2026-11-08

## Context

[ADR-001](./001-primary-database.md) chose PostgreSQL and left the host open: "Decide this together with the server hosting ADR." This ADR picks the cloud provider that will run the database and the rest of the backend.

What we need from it:

- **Managed PostgreSQL** with automated backups, point-in-time recovery, a standby for failover, and a connection pooler. Staging and production are separate instances.
- **Terraform support.** Staging and production must be built from code, not clicked together. The provider should be maintained by the vendor and cover more than "create a database".
- **Ease of use for a small team.** Few moving parts, good docs, and a large hiring pool.
- **Predictable pricing** at launch size, with a clear path to a bigger database.
- **Services beyond the database.** The [project scope](../../scope/project_scope.md) needs a place to run the API and the central sports-data fetcher, a queue or scheduler, a cache for live standings, object storage for assets, push notifications, and secrets.
- **Compliance room.** The app sells credits for real money. Customers or payment partners may ask for SOC 2 and an uptime SLA later.

Out of scope here: server runtime, API framework, auth service, payments, and mobile app hosting. Each has its own tracking item. This ADR only makes sure the cloud choice does not block them.

## How comparable products do it

| Company        | Cloud                                                    | Terraform                              | Evidence                                                                                                                              |
| -------------- | -------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Kalshi**     | AWS (RDS, Kubernetes, Kafka)                             | Yes                                    | Infrastructure Engineer posting lists "AWS, k8s, terraform, RDS, Kafka". SRE posting lists Terraform and EC2.                         |
| **DraftKings** | AWS (Aurora for the financial ledger)                    | Not confirmed                          | AWS case study (see ADR-001).                                                                                                         |
| **Sorare**     | AWS (EKS), plus Cloudflare                               | Yes (modules for AWS and Cloudflare)   | Senior SRE and Staff SRE LinkedIn profiles. The Staff SRE lists PostgreSQL, AWS, and Terraform.                                       |
| **Dapper Labs** | Some GCP (Cloud Spanner in some services, per ADR-001)  | Not confirmed                          | Engineer profiles. Overall cloud split is not confirmed.                                                                              |
| **Polymarket** | Not confirmed                                            | Not confirmed                          | The ClickHouse case study names no cloud.                                                                                             |

Pattern: where we can confirm the cloud, the closest comparables (Kalshi, DraftKings, Sorare) run on AWS and manage it with Terraform. None of the sources point to Supabase or a specialist Postgres host for the ledger.

Source quality note: Kalshi, Sorare, and Dapper Labs evidence comes from job postings and personal profiles. It shows what they hire for and use, not an architecture document.

## Options Considered

Prices are US list prices on 2026-11-08, on demand, 730 hours per month. They exclude egress, tax, logs, and poolers unless noted. Check each vendor's calculator before quoting a number to the client.

### Option A: AWS (RDS for PostgreSQL, Aurora PostgreSQL later)

Pros:

- **Terraform:** the `hashicorp/aws` provider is official and covers the database, network, IAM, secrets, containers, queues, cache, and storage. One tool describes the whole backend.
- Same cloud as Kalshi, DraftKings, and Sorare. Easy to find engineers who have run a ledger-style workload on it.
- Widest service catalog: ECS Fargate, SQS, ElastiCache, S3, SNS, EventBridge Scheduler. This covers the sports-data fetcher, live standings cache, and push fan-out without a second vendor.
- RDS Multi-AZ gives automatic failover. Backups up to the size of the provisioned storage are free.
- Clear upgrade path: RDS to Aurora PostgreSQL for faster replicas and failover. Aurora Serverless v2 can scale to 0 ACUs (about 15 seconds to resume), which suits staging.
- SOC 2, ISO, and other compliance reports are available to customers. Reserved Instances and savings plans cut cost once load is known.

Cons:

- Hardest to learn. VPCs, subnets, security groups, and IAM must be set up before the first query runs.
- The bill has many lines: instance, storage, backups, NAT gateways, data transfer, RDS Proxy, Performance Insights. Costs are easy to underestimate.
- Multi-AZ doubles the instance and storage cost. The standby does not serve reads. Read replicas cost extra.
- T4g burstable instances bill CPU credits above baseline ($0.075 per vCPU-hour in Unlimited mode). Production needs a sustained-CPU class once traffic is real.
- RDS Postgres versions past standard support incur Extended Support fees.

Estimated cost (us-east-1): production `db.t4g.medium` (2 vCPU, 4 GB) Multi-AZ with 100 GB gp3 is about $117 per month. Staging `db.t4g.micro` single-AZ with 20 GB is about $14. Total about **$131 per month**. A sustained-CPU production class (`db.m7g.large`, 8 GB, Multi-AZ) is about $269, for a total of about $283.

### Option B: Google Cloud (Cloud SQL for PostgreSQL)

Pros:

- **Terraform:** the `hashicorp/google` provider is official and mature. It covers Cloud SQL, networking, IAM, Cloud Run, Pub/Sub, and Memorystore.
- Simpler networking and IAM than AWS for a small team. Cloud Run is a low-effort way to run the API.
- Committed use discounts: 25% for one year and 52% for three years on vCPU and memory.
- Per-vCPU and per-GB pricing lets you size a database to fit. New customers get $300 in credits.
- Used by Dapper Labs for some services.

Cons:

- No confirmed use by the closest comparables (Kalshi, DraftKings, Sorare).
- HA doubles cost, same as AWS. The Enterprise edition has a 99.95% SLA that excludes maintenance.
- Enterprise Plus is the console and CLI default for PostgreSQL 16 and later. It costs about 30% more per unit, adds data cache charges, and uses 8 GB per vCPU machine shapes. Set the edition explicitly in Terraform.
- Internet egress is $0.19 per GiB on the standard list price, which is higher than AWS's first-tier rate.
- Smaller hiring pool for Cloud SQL and GCP operations than for AWS.

Estimated cost (us-central1, Enterprise edition): production 2 vCPU and 4 GB with HA and 100 GB SSD is about $195 per month. Staging `db-g1-small` with 20 GB is about $29. Total about **$224 per month**.

### Option C: Supabase

Pros:

- Easiest start. A project is a dedicated Postgres instance with a pooler, dashboard, backups, and API keys. It can be used as a database only.
- Lowest entry price. Pro is $25 per month per organization and includes $10 of compute credit.
- **Terraform:** `supabase/supabase` is an official provider. It manages projects, project settings, and branches.
- Auth, Storage, Realtime, and Edge Functions are included and optional. They could save work later, but each belongs to its own ADR.
- Database branching for preview environments ($0.01344 per branch-hour).

Cons:

- It is a database platform, not a cloud. The sports-data fetcher, queues, cache, scheduled jobs, and push delivery still need a home elsewhere. That means a second vendor.
- **Terraform scope is narrow.** It manages the project and its settings. Schema, roles, and extensions still go through SQL migrations. This is true on every host, but on AWS Terraform also builds everything around the database.
- **No uptime SLA below Enterprise.** SOC 2 and ISO 27001 start at Team ($599 per month). Pro has neither.
- Compute below Large ($110 per month) is shared CPU. Dedicated CPU starts at 2 vCPUs.
- Point-in-time recovery is a $100 per month add-on per 7 days of retention. Pro keeps daily backups for 7 days. The pricing page lists no hot-standby tier.
- Supabase's SLA excludes outages caused by its own upstream cloud provider and customer schema migrations.
- No comparable product uses it for a ledger.

Estimated cost: Pro plan $25, production Medium (4 GB, shared) $60, staging Micro $10, less the $10 credit, plus about $11.50 for disk beyond the included 8 GB. Total about **$97 per month**. With a dedicated Large production instance ($110) it is about $147.

### Option D: Specialist Postgres host (Neon, Crunchy Bridge, PlanetScale)

These sell managed Postgres only. They would sit next to a general cloud (usually AWS), not replace it.

| Host              | Terraform                                                                                              | Production example                                  | Notes                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Neon**          | Community provider `kislerdm/neon` 0.18.0. Its repo is archived. `neondatabase/neon` is not yet published. | Launch plan, 1 CU always on, 100 GB: about $112     | Usage-based. Scale to zero. SLA and SOC 2 only on Scale (about $197 same size).  |
| **Crunchy Bridge** | `CrunchyData/crunchybridge` 0.3.0 (verified)                                                           | Standard-4 (1 vCPU, 4 GB) with HA, 100 GB: about $150 | Flat price includes backups, pooling, and transfer. HA doubles price. Runs on AWS, GCP, or Azure. |
| **PlanetScale**   | Official `planetscale/planetscale` 1.x. Postgres supported since March 2026.                          | PS-80 arm64 HA (1 vCPU, 8 GB, primary + 2 replicas): $148 | Newer Postgres product. Storage over the included amount costs extra.            |

Pros:

- Simpler to operate than raw RDS. Good developer experience, branching (Neon, PlanetScale), and predictable bills (Crunchy Bridge).
- Crunchy Bridge and PlanetScale have official or verified Terraform providers.
- Crunchy Bridge can run inside our AWS region, which keeps latency low if the API is on AWS.

Cons:

- Two vendors to manage and pay. The database traffic crosses a vendor boundary unless we use private networking, which is a paid or higher-tier feature on some hosts.
- Neon's Terraform provider is community-run, and its move to an official package is not done.
- Smaller vendors than AWS or Google. A vendor change later means a database migration.
- None of the comparables are confirmed to use them for a ledger.

### Not evaluated: Azure

Azure Database for PostgreSQL would work, and `hashicorp/azurerm` is official. We have no stated need for it and no comparable product in our research that uses it. We did not price it.

## Cost summary

Approximate monthly cost for staging plus production at launch size. Hardware is not identical across rows, and shared or burstable CPU is cheaper than dedicated.

| Option                        | Production                                     | Staging              | Total / month | Failover standby |
| ----------------------------- | ---------------------------------------------- | -------------------- | ------------- | ---------------- |
| A. AWS RDS                    | `db.t4g.medium` Multi-AZ, 100 GB: ~$117        | `db.t4g.micro`: ~$14 | **~$131**     | Yes              |
| B. Google Cloud SQL           | 2 vCPU / 4 GB HA, 100 GB: ~$195                | `db-g1-small`: ~$29  | **~$224**     | Yes              |
| C. Supabase Pro               | Medium (shared, 4 GB) + disk: ~$72, plus $25 plan | Micro: $10, less $10 credit | **~$97** | Not listed       |
| D. Neon Launch                | 1 CU always on, 100 GB: ~$112                  | Scale to zero: ~$5 (assumed) | **~$117** | Not confirmed    |
| D. Crunchy Bridge             | Standard-4 HA, 100 GB: ~$150                   | Hobby-2: ~$37        | **~$187**     | Yes              |

Costs that apply on top of these, mostly on AWS and GCP: NAT gateways, data transfer, load balancers, logs, the API hosts, a cache, and a queue. Ask the client for a budget ceiling for the first 12 months so we can compare against the whole backend, not just the database.

## Decision

We choose **AWS** as the cloud provider, with **RDS for PostgreSQL** (Multi-AZ in production) as the managed database. All infrastructure is defined in Terraform using the official `hashicorp/aws` provider.

1. **Terraform covers everything.** One official provider describes the database, network, secrets, queues, cache, and servers. Supabase and the specialist hosts cover the database only.
2. **The closest comparables run on it.** Kalshi, DraftKings, and Sorare use AWS. Kalshi and Sorare use Terraform with it.
3. **One vendor for the whole backend.** The sports-data fetcher, live standings cache, push fan-out, and scheduled jobs need services we would otherwise buy elsewhere.
4. **Lowest cost for a production-grade setup with a standby.** About $131 per month for staging and production at launch size, against about $224 on Google Cloud.
5. **Room to grow.** RDS Reserved Instances, Aurora, read replicas, and SOC 2 reports are available when we need them.

We accept that AWS is harder to start with than Supabase. We reduce that cost with a small set of Terraform modules and by avoiding services we do not need.

Not decided here:

- **Server runtime.** For example ECS Fargate, App Runner, or Lambda. Decided in [ADR-003](./003-api-runtime-and-compute.md).
- **Region.** Default to `us-east-1` unless the client has a user or data residency reason to choose another.
- **Auth, payments, notifications, and sports data provider.** Each has its own ADR. Supabase Auth or a similar bundled service is still an option for the auth ADR, even though we host the database on AWS.
- **RDS or Aurora.** Start with RDS. Revisit Aurora if failover time or read replica lag becomes a problem.

## Consequences

- Create an AWS Organization with separate staging and production accounts. Use IAM Identity Center (SSO), not long-lived access keys.
- Keep Terraform state in S3 with locking. Start with one module each for the network, the database, and the app environment.
- Use a pooler from day one: RDS Proxy or PgBouncer. ADR-001 requires this for serverless or autoscaled servers.
- Use a sustained-CPU instance class for production. Do not run production on a burstable `t4g` class past the first load tests.
- Turn Multi-AZ on in production only. Use a single-AZ instance in staging, and consider Aurora Serverless v2 with scale to zero if staging idles most of the day.
- Set billing alerts and a monthly budget on day one. Track NAT gateway and data transfer costs separately.
- Enable automated backups and point-in-time recovery. Test a restore into staging before launch.
- Run the ADR-001 load tests (limited drops, offer accepts) on the production instance class before sizing it.
- Ask the client about startup or partner credit programs before the first production bill.
- If AWS cost or complexity becomes a problem, RDS is standard Postgres. A move to another host is a dump-and-restore or logical replication job, not a rewrite.

## Sources

Comparable products:

- Kalshi, [Infrastructure Engineer posting](https://www.welcometothejungle.com/en/companies/kalshi/jobs/infrastructure-engineer_new-york_2mgxxyad), [Site Reliability Engineer posting](https://job-boards.greenhouse.io/kalshi/jobs/6567367003)
- Sorare, [Arnaud Beun profile (Senior SRE)](https://linkedin.com/in/arnaud-beun-031879118), [Dhia Moakhar profile (Principal Engineer / SRE)](https://linkedin.com/in/dhia-moakhar-79a027100)
- DraftKings, [Amazon Aurora ledger case study (AWS)](https://aws.amazon.com/solutions/case-studies/draftkings-aurora-case-study/)
- Dapper Labs, see sources in [ADR-001](./001-primary-database.md)

Pricing and plans:

- AWS, [Amazon RDS for PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/), [Amazon Aurora pricing](https://aws.amazon.com/rds/aurora/pricing/), [Aurora Serverless v2 scaling to 0 ACUs](https://aws.amazon.com/blogs/database/introducing-scaling-to-0-capacity-with-amazon-aurora-serverless-v2/)
- Third-party RDS calculations: [slashcloudbill RDS calculator](https://slashcloudbill.com/rds-pricing-calculator/), [Ownkube RDS pricing explained](https://ownkube.io/compare/aws-rds-pricing-explained)
- Google Cloud, [Cloud SQL pricing](https://cloud.google.com/sql/pricing), [Cloud SQL committed use discounts](https://docs.cloud.google.com/sql/docs/postgres/cud)
- Third-party Cloud SQL calculations: [Datapace Cloud SQL bill](https://datapace.ai/blog/cloud-sql-pricing), [VeriKost HA cost](https://www.verikost.com/blog/cloud-sql-high-availability-cost)
- Supabase, [Pricing](https://supabase.com/pricing), [Compute usage](https://supabase.com/docs/guides/platform/manage-your-usage/compute), [SLA](https://supabase.com/sla)
- Neon, [Pricing](https://neon.com/pricing), [Plans](https://neon.com/docs/introduction/plans)
- Crunchy Bridge, [Plans and pricing](https://docs.crunchybridge.com/concepts/plans-pricing)
- PlanetScale, [Pricing](https://planetscale.com/pricing.md), [Postgres pricing](https://planetscale.com/docs/postgres/pricing)

Terraform providers:

- [`hashicorp/aws`](https://registry.terraform.io/providers/hashicorp/aws/latest), [`hashicorp/google`](https://registry.terraform.io/providers/hashicorp/google/latest), [`hashicorp/azurerm`](https://registry.terraform.io/providers/hashicorp/azurerm/latest)
- Supabase, [Terraform provider](https://supabase.com/docs/guides/deployment/terraform), [`supabase_project` resource](https://registry.terraform.io/providers/supabase/supabase/latest/docs/resources/project)
- Neon, [Terraform and Pulumi FAQ](https://neon.com/faqs/postgres-services-terraform-pulumi-infrastructure-as-code), [`kislerdm/neon`](https://registry.terraform.io/providers/kislerdm/neon/latest), [provider release question](https://github.com/neondatabase/terraform-provider-neon/issues/60)
- Crunchy Bridge, [Terraform provider](https://docs.crunchybridge.com/concepts/terraform)
- PlanetScale, [Terraform provider](https://planetscale.com/docs/terraform), [Terraform provider v1 release](https://planetscale.com/changelog/terraform-provider-v1-release)

Project:

- [Pack Draft development feature scope](../../scope/project_scope.md)
- [ADR-001: Use PostgreSQL as the primary database](./001-primary-database.md)
