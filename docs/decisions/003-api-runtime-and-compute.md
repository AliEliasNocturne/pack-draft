# ADR-003: Use Node.js with TypeScript on ECS Fargate for the API

## Status

Proposed (pending client approval)

## Date

2026-11-08

## Context

[ADR-001](./001-primary-database.md) chose PostgreSQL. [ADR-002](./002-cloud-provider.md) chose AWS and left the server runtime open: "For example ECS Fargate, App Runner, or Lambda. Decide in the server hosting ADR." This ADR picks the API language, the compute platform that runs it, and how it is deployed. It covers the tracking items API, Server, and Server hosting / deployments as one decision.

What the [project scope](../../scope/project_scope.md) asks of the API:

- **Correctness first.** Purchases, pack opens, offer accepts, and settlements run server-side, in one transaction, with idempotency keys. Limited drops must enforce stock and per-account limits under high concurrent demand.
- **Spiky traffic, partly self-inflicted.** Pack drops, contest cutoffs (1 hour before the first game), and live games cause bursts. Push notifications for pack releases are on the scope's notification list, so we control when a stampede starts.
- **Live data.** Sports stats are fetched once and fanned out to users. The update cadence is still an open decision. If it is under one minute, something must run continuously to poll the provider.
- **Background work.** Offer expiry after 24 hours, contest settlement, evolution checks after stat updates, daily and weekly resets, and notification fan-out.
- **Mobile clients.** iOS and Android apps stay in the wild for a long time, so the API must stay backward compatible.
- **Small team, no constant monitoring.** The API must scale up on its own. A person should be paged only when something is actually wrong.
- **Terraform, with separate staging and production accounts** (ADR-002).
- **Repeatable deploys.** The team uses CircleCI. A deploy must be one pipeline run, with a safe rollback, and no long-lived AWS keys.

Out of scope here: auth service, payments, notifications, sports data provider, mobile framework, and ORM. Each has its own tracking item or later decision.

The AWS costs below were checked against AWS pricing pages on 2026-11-08. They are US East (N. Virginia), on demand, and exclude tax.

## How comparable products do it

| Company         | API language                                                                                  | Compute                                                                                                    | Evidence                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Kalshi**      | Go, Rust, or C++ for exchange and trading roles. Go, JavaScript, and Python for a growth role. | AWS ECS and RDS. The SRE posting also lists Docker, Terraform, Kubernetes, and EC2.                        | Trading Systems Engineer, SRE, and Growth Engineer postings.                                                                                                                   |
| **Sorare**      | Ruby on Rails and Go. TypeScript on the frontend.                                             | Kubernetes on AWS, with PostgreSQL/Aurora and Redis.                                                       | Backend Engineer posting and Sorare's tech page.                                                                                                                               |
| **Dapper Labs** | Go, with Postgres, GraphQL, REST, gRPC, and Kafka.                                            | Event-driven microservices for NBA Top Shot. They moved to a near-monolith for NFL All Day.                | Engineer profile and a conference talk, "Microservices to Monolith: Lessons from NBA Topshot". Their words: 20 services slowed shipping and created tech debt.                 |
| **DraftKings**  | C#/.NET, Java, and Node.js (TypeScript for some cloud pieces).                                | Kubernetes with autoscaling. Lambda for small glue (SNS and SQS handlers). Load tests for game-day spikes. | Careers pages and an engineer profile.                                                                                                                                         |
| **Polymarket**  | Not confirmed                                                                                 | Not confirmed                                                                                              | No source found.                                                                                                                                                               |

Pattern: every confirmed core API runs in long-lived containers (ECS or Kubernetes). Lambda appears only as glue. None of the sources name Python as the main API language. DraftKings handles spiky game-day traffic with autoscaling, caching, read replicas, and load testing. Dapper Labs warns against splitting into many services early.

Source quality note: all of this comes from job postings, careers pages, and personal profiles. It shows what they hire for and use, not an architecture document.

## Options Considered

This ADR makes two decisions: the language and runtime, then the compute platform.

### Part 1: Language and runtime

#### Option A: Node.js with TypeScript (Fastify)

Pros:

- One language with the mobile app if it is React Native (not decided yet), and with any web admin. Zod schemas give shared types and one source for request validation.
- The event loop suits an API that mostly waits on Postgres, the sports provider, and push services. SSE or WebSockets for live standings run in the same process model.
- Good Postgres tooling. The `pg` and `postgres` drivers, Drizzle, Kysely, and Prisma all support transactions and raw SQL (`FOR UPDATE SKIP LOCKED`, `ON CONFLICT`).
- Large SDK coverage for later ADRs: AWS SDK v3, Apple and Google sign-in, payment SDKs, push providers.
- The only language that runs on Lambda Web Functions (Option H). This keeps a cheaper idle-cost path open.
- Large hiring pool. DraftKings runs Node.js services and Sorare uses TypeScript on the frontend.

Cons:

- One CPU-heavy request blocks every other request on that task. Heavy work (batch settlement, large recalculations) goes to the worker.
- No built-in admin UI. The admin dashboard is out of scope for the scope document, but it will be needed. Django has one.
- Types disappear at runtime. Every boundary needs validation.
- npm supply-chain risk. Needs a lockfile, pinned versions, and dependency audits.
- JavaScript numbers lose precision above 2^53. Credits must be stored as integers (`bigint` in Postgres), never floats.

#### Option B: Python (FastAPI or Django)

Pros:

- Django ships an admin UI, migrations, and a mature ORM. It is the fastest route to the later admin dashboard.
- Best language for data work: Player Rating formula tuning, odds modeling, stat-correction analysis.
- FastAPI with Pydantic gives typed validation and generated OpenAPI docs.
- Large hiring pool and readable code.

Cons:

- Per-request CPU cost is usually higher than Node for JSON and validation work, so the same load needs more tasks. We did not benchmark it. The load test item should confirm.
- Mixing sync and async code is a common source of blocking bugs.
- No type sharing with a TypeScript mobile app.
- Cannot use Lambda Web Functions. On Lambda Event Functions it needs an adapter.
- No comparable product names it as the main API language.

#### Option C: Go

Pros:

- Cheapest to run: small memory footprint, so small Fargate tasks. Fast, with one static binary.
- Strong concurrency model. `pgx` with `sqlc` gives typed hand-written SQL, which fits ledger code.
- Used by Kalshi, Dapper Labs, and Sorare.

Cons:

- No code sharing with the mobile app.
- More boilerplate for the long tail of CRUD features (collection filters, challenges, referrals, private leagues). Slower for a small team to ship.
- Smaller pool of developers who also build the mobile and web parts.

Not evaluated: Ruby on Rails, Java or Kotlin, C#/.NET, and Rust. Sorare and DraftKings use some of them at their size. We have no team skill that points to them, and we did not price or score them.

### Part 2: Compute platform

All options run in the AWS account from ADR-002.

#### Option D: ECS on Fargate behind an Application Load Balancer, API via ECS Express Mode

Pros:

- Long-lived containers. Connection pools, in-memory caches for live standings, SSE or WebSockets, and background workers all work as normal. The same image runs locally, in staging, and in production.
- No servers to patch. Target-tracking autoscaling on CPU, memory, or ALB requests per target is built in.
- Express Mode creates the ECS service, ALB with HTTPS, security groups, autoscaling policy, log group, canary deployment, and a deployment-failure alarm from an image and two IAM roles. There is no extra charge. Up to 25 Express services in a VPC share one ALB. Terraform resource: `aws_ecs_express_gateway_service`.
- Same platform as Kalshi (ECS and RDS).
- Fargate on ARM (Graviton) is 20% cheaper than x86. Compute Savings Plans cut up to 50%. Fargate Spot is up to 70% off for workers that tolerate interruption.
- Scheduled scaling can raise capacity ahead of known events.

Cons:

- Scale-out takes minutes, not seconds. Metrics must show the load, then tasks must start and pass health checks. A burst that arrives in 30 seconds outruns reactive scaling. It needs scheduled pre-scaling and headroom.
- Pays for idle. The floor is 2 tasks plus an ALB, about $85 per month at launch size.
- About 14% more than the same CPU and memory on EC2 on demand (2 vCPU and 8 GB: $68.07 on Fargate ARM, $59.57 on `m7g.large`).
- The ALB does not queue. An overloaded task returns 5xx errors.
- Express Mode is about a year old and only fronts web services. Workers use plain ECS service resources.

#### Option E: ECS on EC2 (capacity provider)

Pros:

- Cheapest per vCPU for steady load with reservations. A 3-year Reserved `m7g.large` is about $0.037 per hour against $0.0816 on demand.
- Can pack many small workers onto one instance.

Cons:

- Two layers to scale: tasks and instances. If the cluster is full, new tasks sit pending. That is the kind of failure that needs someone watching.
- We own AMI updates, instance draining, disk space, and the ECS agent.
- At our size the cost is the same as Fargate (see the cost table), so the extra work buys nothing yet.

#### Option F: Manual EC2 (Auto Scaling group running containers or PM2)

Pros:

- Simplest to picture, and the cheapest at launch: 2 × `t4g.medium` is about $49 per month.
- Full host access.

Cons:

- We patch the OS, build AMIs, and write deploy and rollback scripts.
- `t4g` instances are burstable. Past the baseline, CPU credits run out or bill extra (T4g Unlimited is $0.04 per vCPU-hour above baseline).
- A dead instance at 2 a.m. depends on someone noticing. This is the opposite of the "no constant monitoring" requirement.
- Staging and production drift apart more easily.

#### Option G: Lambda Event Functions with API Gateway (HTTP API) and RDS Proxy

Pros:

- Scales to zero. Near-zero cost at launch.
- Each function scales by up to 1,000 execution environments every 10 seconds. That is faster than Fargate.
- No servers, no ALB, no task sizing.

Cons:

- Every concurrent execution holds a database connection. It needs RDS Proxy (about $21.90 per month for a 2 vCPU database, $0.015 per vCPU-hour with a 2 vCPU minimum) and a reserved-concurrency cap. A drop spike can otherwise open thousands of connections.
- Reaching RDS needs a VPC. The sports provider, Apple, Google, and push services then need a NAT gateway.
- No fit for a sub-minute sports poller. Scheduled invocations run at best once a minute, so a long-running worker is needed anyway. That means two compute models.
- API Gateway HTTP API has no WebSockets. The WebSocket API bills $1.00 per million messages and $0.25 per million connection-minutes.
- Cost grows linearly with traffic: about $1.87 per million requests at our assumptions (see cost table).
- New AWS accounts start with a reduced concurrency quota (commonly 10). It rises with usage or by request. AWS advises requesting increases two weeks ahead.
- Cold starts add latency to the first requests after idle time.

#### Option H: Lambda Web Functions (announced October 2026)

Pros:

- Runs a standard Fastify or Hono server unchanged. No handler adapter.
- Up to 128 concurrent requests per execution environment. Billing is by active CPU time, so waiting on Postgres costs little.
- Built-in HTTPS endpoint, scale to zero, and no ALB or API Gateway. Endpoint-level `rateLimit` and `maxEnvironments` caps can protect the database.
- With capped environments, an in-process pool may be enough and RDS Proxy may be unnecessary.
- Terraform resources exist (`aws_lambdaweb_function`, `aws_lambdaweb_function_revision`, `aws_lambdacore_network_connector`).

Cons:

- Weeks old, with no production track record and no comparable using it. Node.js only.
- Reaching RDS needs a network connector, and only home-Region endpoints support it. Outbound internet still needs a NAT gateway.
- At the limit it returns HTTP 429 instead of queueing. New accounts have reduced vCPU and request-rate quotas.
- A custom domain or WAF needs CloudFront in front.
- More expensive than Fargate at steady load. Active CPU costs $0.0997 per vCPU-hour against $0.0324 on Fargate ARM. At 60% utilization Fargate still costs about half as much per CPU-hour of real work.
- A sub-minute sports poller still needs a long-running worker.

Not evaluated:

- **AWS App Runner.** It stopped accepting new customers on 2026-04-30. AWS points new customers to ECS Express Mode, which is Option D.
- **Amazon EKS (Kubernetes).** Kalshi, Sorare, and DraftKings use it. It needs someone who runs a platform. That is too much for one API and one worker.
- **Lambda Managed Instances.** Lambda's programming model on EC2 with a 15% management fee, aimed at steady high-volume load. Revisit if we outgrow Fargate pricing.

## Scaling without constant monitoring

What each option does by itself, and what stays with us:

| Concern                  | D. Fargate + ALB                                                | E / F. EC2                                   | G. Lambda Event + API GW                         | H. Lambda Web Functions                           |
| ------------------------ | --------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| Add capacity on load     | Target tracking (CPU, memory, requests per target). Minutes.    | Needs task and instance scaling. Minutes.    | Automatic. Seconds. Capped by account quota.     | Automatic. Capped by `maxEnvironments` and quota. |
| OS and runtime patching  | AWS                                                             | Us                                           | AWS                                              | AWS                                               |
| Bad deploy               | Express Mode canary and failure alarm. Circuit breaker for workers. | Us                                       | Versions and aliases                             | Revisions, 1 or 2 per endpoint                    |
| What fails first         | Database, then task ceiling                                     | Pending tasks, then the database             | Database connections                             | 429s at quota, then the database                  |

Whatever the compute, the database is the real ceiling. A `db.t4g.medium` allows a few hundred connections, and the hot-row contention from ADR-001 appears long before the API tier runs out of room. Scaling the API tier is the easy part. The rule we set is:

**max tasks × connections per task ≤ about half of the database's `max_connections`.**

The default Express Mode ceiling of 20 tasks, at 20 ms of CPU per request and a 50% CPU target, is roughly 500 requests per second. Raise it on purpose, with the database budget in view.

Burst handling for the API:

- Raise minimum capacity with scheduled actions before known events: pack drops, contest cutoffs, and the start of game windows.
- Control the stampede. Stagger or delay the push notification for a pack release, or pre-scale before sending it.
- Keep a 50% CPU target, below the Express default of 60%, to leave room for the minutes a scale-out takes.
- If a limited drop outgrows this, add a queue or waiting room for the drop purchase path. That is later work.

## Cost summary

Monthly cost of the API tier only, for production. Assumptions, which are ours and not measured:

- Node.js on Graviton (ARM). 100 ms average request time, of which 20 ms is active CPU.
- Lambda Event Functions at 512 MB (this is optimistic for Lambda: at 512 MB, 20 ms of CPU takes longer than 20 ms of wall time).
- Traffic is spread evenly. Real traffic is spikier, so peak capacity will be higher than the average implies.
- Launch is 10 million requests per month (about 4 per second). Growth is 100 million (about 39 per second). Large is 1 billion (about 386 per second).
- Fargate tasks are 1 vCPU and 2 GB: $28.84 per month each. Launch has 2 tasks, growth averages 3, large averages 15.
- ALB is $16.43 per month for the hour charge, $7.30 for two public IPv4 addresses, plus load balancer capacity units.

| Option                                       | Launch (10M req)             | Growth (100M req)             | Large (1B req)                    | Notes                                                                |
| -------------------------------------------- | ---------------------------- | ----------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| **D. ECS Fargate + ALB**                     | ~$85 ($58 tasks + ~$27 ALB)  | ~$122 ($87 tasks + ~$35 ALB)  | ~$538 ($433 tasks + ~$105 ALB)    | Floor of ~$85 at zero traffic. Savings Plans up to 50% off tasks.    |
| **E / F. EC2 (ECS on EC2 or manual)**        | ~$76 (2 × `t4g.medium` + ALB) | ~$154 (2 × `m7g.large` + ALB) | ~$582 (8 × `m7g.large` + ALB)     | Same ballpark as Fargate. Reservations lower it. Needs us to operate it. |
| **G. Lambda Event + API Gateway + RDS Proxy** | ~$41                        | ~$209                         | ~$1,884                           | $1.00 per million (API GW) + $0.20 (requests) + ~$0.67 (duration). Proxy $21.90 to $87.60. |
| **H. Lambda Web Functions**                  | ~$13                         | ~$100                         | ~$900                             | $0.30 per million (requests) + ~$0.55 (CPU) + memory. No ALB, no API Gateway. |

Costs that apply to every option and are not in the table:

- NAT gateway: $32.85 per month plus $0.045 per GB (if tasks or functions sit in private subnets).
- The sports-data worker: about $14 per month for one 0.5 vCPU and 1 GB Fargate task.
- The database from ADR-002.
- CloudWatch logs, data transfer out, and a staging environment. Staging is priced in the Decision section (about $60 per month).

Reading the table:

- At launch size every option is under about $90. The difference is smaller than one hour of engineering time. Do not pick on launch cost.
- At growth size the options are within a factor of two, and Fargate, Lambda Web Functions, and EC2 are close.
- At large size Fargate is the cheapest of the managed options. Lambda Event Functions cost about 3.5 times as much.

## Decision

We choose **Node.js with TypeScript** (Fastify, validated with Zod) for the API, running on **ECS Fargate (ARM64) behind an Application Load Balancer**. The API service uses ECS Express Mode. Workers are plain ECS services. All of it is defined in Terraform.

Why Node.js with TypeScript:

1. **One language across the product.** If the mobile app is React Native, request and response types are shared with the apps and any web admin. If not, we lose only that benefit.
2. **It fits an I/O-bound API.** Most time is spent waiting on Postgres and external services. The same model serves live updates and the sports-data fan-out.
3. **Postgres tooling is strong enough for the ledger.** We can write the `SERIALIZABLE`, `FOR UPDATE SKIP LOCKED`, and `ON CONFLICT` queries that ADR-001 depends on.
4. **Hiring and libraries.** The largest pool and SDK coverage of the three. DraftKings runs Node.js services.

Why not Python or Go:

- Python's main advantage is the Django admin. That matters for a later admin dashboard, and an off-the-shelf admin tool can cover it. Node has the type sharing and the better per-request CPU.
- Go is the best runtime for the money and the closest to what Kalshi and Dapper Labs run. We give up type sharing and ship slower on a feature-heavy product. If one path (the limited-drop purchase) becomes CPU-bound, a Go service for that path is the later move.

Why ECS Fargate:

1. **Long-lived containers fit the workload.** Connection pools, live standings in memory, a sports-data poller that runs under a minute apart, and queue workers all run on the same platform.
2. **Scaling without watching it.** Target tracking is built in, scheduled scaling covers the events we know about, and Express Mode adds a canary deployment and a failure alarm.
3. **No servers to patch.** EC2 gives about the same price at our size and adds work we do not need.
4. **Lowest cost at scale among the managed options**, and a small, predictable floor (about $85 per month) at launch.
5. **Same pattern as Kalshi.** Same cloud, same containers, same database.

Why not Lambda yet:

- Event Functions need RDS Proxy, a NAT gateway, and a second compute model for the poller. They cost the most at scale.
- Web Functions are the closest competitor. They are weeks old, Node-only, and throttle with 429s at their limits, which is the wrong failure mode for a limited drop. Revisit them when they have a track record.

We accept that Fargate costs about $85 per month at zero traffic and that reactive scaling takes minutes. We reduce both with scheduled scaling, a 50% CPU target, and a small minimum.

Use Lambda only for short, event-driven glue (for example S3 triggers or scheduled sweeps), not for the API.

Deployments (CircleCI is the team's choice. We did not compare CI tools):

- **CircleCI** builds the image, pushes it to Amazon ECR, and deploys to ECS. The `aws-ecr` and `aws-ecs` orbs have jobs for each step. Code stays on GitHub, which CircleCI builds from.
- **CircleCI OIDC** gives each job a short-lived AWS role in the target account through the `aws-cli/setup` orb command. No access keys are stored in CircleCI. Use the V3 token for the trust policy, and attach a CircleCI context to each job, because the token is only added when the job has a context.
- **Staging deploys automatically** on merge to `main`. **Production deploys on manual approval**, with the same image that passed staging. The image is built once and promoted, not rebuilt.
- **Database migrations** run as a step before the new tasks start. They must be backward compatible (ADR-001), so old and new tasks can run together during a rollout.
- **Rollback** is automatic on a failed health check or deployment alarm (Express Mode canary for the API, circuit breaker for workers). A manual rollback redeploys the previous image tag.
- **Terraform** changes run `plan` on pull requests and `apply` on approval, separately from app deploys.

**Estimated staging cost (scaled down): about $60 per month.** Staging runs in its own AWS account (ADR-002), so it cannot share the production ALB.

| Item                                                          | Monthly |
| ------------------------------------------------------------- | ------- |
| API: 1 Fargate ARM task, 0.5 vCPU and 1 GB, minimum 1 and maximum 2 | $14.42  |
| Worker: 1 Fargate ARM task, 0.5 vCPU and 1 GB                 | $14.42  |
| Application Load Balancer ($16.43 hour charge, $7.30 for two public IPv4 addresses, minimal capacity units) | ~$24    |
| Public IPv4 addresses for the 2 tasks ($3.65 each)            | $7.30   |
| **Total**                                                     | **~$60** |

Assumptions:

- Staging tasks run in public subnets, with inbound traffic limited to the ALB by security group. This avoids a NAT gateway ($32.85 per month plus $0.045 per GB). Production uses private subnets.
- With staging tasks in private subnets and a NAT gateway instead, the total is about $86.
- One task per service means staging has no redundancy across Availability Zones. That is acceptable for staging.
- Not included: CloudWatch logs, ECR storage, data transfer, and CircleCI credits. The staging database is in ADR-002.
- To save more, set the worker to zero tasks outside test windows (saves $14.42). The ALB cannot scale to zero.

Not decided here:

- **ORM and migration tool.** Requirement: handwritten SQL must be easy and transactions must be explicit. Candidates are Drizzle, Kysely, and Prisma. Decide in the setup spike.
- **API style.** Default to REST with OpenAPI, versioned by path (`/v1`). Revisit GraphQL only if collection screens need many round trips.
- **Live standings transport.** Polling a cached endpoint, SSE, or WebSockets. Depends on the live update cadence, which is an open decision in the scope.
- **Auth, payments, notifications, sports data provider, mobile framework, and observability tooling.** Each has its own item.

## Consequences

- Build `linux/arm64` images. Pin the Node.js LTS version.
- Run one API service and one worker image (one codebase, two entry points). Do not split into microservices. Dapper Labs went from about 20 services to a near-monolith because of cost in speed and complexity.
- Deploy at least 2 API tasks across 2 Availability Zones. Set the CPU target to 50%. Raise the maximum task count deliberately, within the database connection budget above.
- Use an in-process connection pool at launch. This relaxes the "pooler from day one" line in ADR-002. Add RDS Proxy or PgBouncer when tasks × pool size passes about half of `max_connections`, or if we ever put Lambda on this database.
- Add scheduled scaling actions for pack drops, contest cutoffs, and game windows. Stagger or pre-scale before the release push notification.
- Page on a short list only: ALB 5xx rate, p95 latency, task count at its maximum, database CPU and connection use, dead-letter queue depth, and sports data staleness.
- Run the sports-data fetcher as a single worker task. Guard it with a Postgres advisory lock so a deploy does not double-fetch.
- Store credits as integers (`bigint`). Never use floating-point numbers for credits.
- Keep API changes backward compatible. Old app versions stay in use. Migrations stay backward compatible (ADR-001).
- During setup, confirm that Express Mode supports private subnets, secret injection, and our health check settings. If it does not, use a standard ECS service module. App code does not change.
- Feed the load-testing ADR: run a limited-drop burst against the real stack, measure how long scale-out takes, and set minimum capacity and scheduled actions from that number.
- Create one IAM OIDC identity provider and one deploy role per AWS account (staging and production). Limit each role to ECR push and ECS deploy. Restrict the production role by repository and branch using the token's `vcs-origin` and `vcs-ref` claims.
- CircleCI cost: the Free plan has 30,000 credits per month and 5 active users. The Performance plan adds credits at $15 per 25,000 and charges 25,000 credits per extra active user. Approving a production deploy makes the approver an active user, so count approvers in the seat total. Check the current plan page before quoting a number.
- Tag images with the git commit SHA, never `latest`. Keep ECR lifecycle rules so old images are cleaned up but recent rollback targets remain.
- Mobile app builds and store distribution are a separate item (App hosting / deployments).
- Revisit after the first few months: a Compute Savings Plan for steady Fargate use, Lambda Web Functions when they have a track record, and a Go service if one path becomes CPU-bound.

## Sources

Comparable products:

- Kalshi, [Trading Systems Engineer posting](https://job-boards.greenhouse.io/kalshi/jobs/7985523003) (Go, Rust, or C++; AWS RDS and ECS), [Site Reliability Engineer posting](https://job-boards.greenhouse.io/kalshi/jobs/6567367003) (Docker, Terraform, Kubernetes, EC2), [Software Engineer, Growth posting](https://jobs.ashbyhq.com/kalshi/37afb8e0-2db4-4342-b479-f526bb860e42) (Go, JavaScript, Python)
- Sorare, [Senior Backend Engineer, Go/Ruby posting](https://peerlist.io/company/sorare/careers/senior-software-engineer-backend-goruby/jobhkknlrjqlrrklnfdkg6gebd8aqn), [Sorare tech page](https://www.welcometothejungle.com/en/companies/sorare/tech-1)
- Dapper Labs, [Quinn Hou profile](https://linkedin.com/in/quinnhou), [Microservices to Monolith: Lessons from NBA Topshot (API World 2023)](https://apiworld2023.sched.com/event/1R8Dz/virtual-pro-talk-api-microservices-to-monolith-lessons-from-nba-topshot)
- DraftKings, [Engineering careers](https://careers.draftkings.com/teams/engineering/), [Build Scalable Systems for Millions of Fans](https://careers.draftkings.com/life-at-draftkings/engineering/build-scalable-systems-for-millions-of-fans/), [Dmitriy Mermelstein profile](https://linkedin.com/in/dmitriy-mermelstein-6872115)

AWS compute and platform:

- AWS, [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [Lambda pricing](https://aws.amazon.com/lambda/pricing/), [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/), [Elastic Load Balancing pricing](https://aws.amazon.com/elasticloadbalancing/pricing/), [VPC pricing (NAT gateway, public IPv4)](https://aws.amazon.com/vpc/pricing/), [RDS Proxy pricing](https://aws.amazon.com/rds/proxy/pricing/), [EC2 on-demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
- Instance prices: Vantage, [`t4g.medium`](https://instances.vantage.sh/aws/ec2/t4g.medium?region=us-east-1), [`m7g.large`](https://instances.vantage.sh/aws/ec2/m7g.large?region=us-east-1)
- RDS Proxy 2 vCPU minimum: [Security Boulevard, RDS Proxy pricing](https://securityboulevard.com/2026/06/rds-proxy-pricing-connection-pooling-cost-vs-performance-benefit/)
- AWS, [App Runner availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)
- AWS, [ECS Express Mode overview](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html), [resources Express Mode creates](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-work.html), [launch post](https://aws.amazon.com/blogs/aws/build-production-ready-applications-without-infrastructure-complexity-using-amazon-ecs-express-mode/)
- AWS, [Lambda Web Functions](https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html), [core concepts](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-how-it-works.html), [scaling behavior](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-scaling.html), [networking](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-networking.html), [announcement](https://aws.amazon.com/blogs/aws/announcing-aws-lambda-web-functions-for-fast-consistent-web-app-performance-anywhere/)
- AWS, [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html), [Lambda Event Function scaling](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html), [Request a concurrency limit increase](https://repost.aws/knowledge-center/lambda-concurrency-limit-increase)

CI and deploys:

- CircleCI, [OpenID Connect tokens in jobs](https://circleci.com/docs/guides/permissions-authentication/openid-connect-tokens/), [Deploy a service update to AWS ECS](https://circleci.com/docs/guides/deploy/deploy-service-update-to-aws-ecs/), [Pricing](https://circleci.com/pricing/), [Using credits](https://circleci.com/docs/guides/plans-pricing/credits/), [What is an active user?](https://support.circleci.com/en/articles/15090855-what-is-an-active-user)

Terraform:

- [`aws_ecs_express_gateway_service`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_express_gateway_service), [`aws_lambdaweb_function`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambdaweb_function), [`aws_lambdaweb_function_revision`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambdaweb_function_revision)

Project:

- [Pack Draft development feature scope](../../scope/project_scope.md)
- [ADR-001: Use PostgreSQL as the primary database](./001-primary-database.md)
- [ADR-002: Use AWS as the cloud provider](./002-cloud-provider.md)
