# ADR-014: Use Cloudflare for domain hosting and DDoS protection

## Status

Proposed

## Date

2026-11-19

## Context

Pack Draft is a real-money fantasy sports app with timed pack drops, live contests, and a marketplace. The [project scope](../../scope/project_scope.md) needs domain hosting with built-in protection against attacks that would make the service unavailable:

- **DDoS resilience.** Limited-edition pack drops and contest deadlines concentrate traffic. A volumetric attack should not take the app offline during a release.
- **Bot protection.** The marketplace and pack drops attract automated scalpers. The app must distinguish real users from bots without making signup harder.
- **Global CDN for static assets.** Player images, set art, and marketing pages should load fast everywhere.
- **Low latency DNS.** Real users want instant page loads. DNS should resolve in under 20 ms from most locations.
- **Fast failover.** If the origin goes down, DNS must point to a backup or maintenance page within seconds, not minutes.
- **SSL at the edge.** Every request should use HTTPS. Cert renewal must be automatic.
- **Compliance ready.** SOC 2 and PCI DSS audits may require a WAF and traffic logs later.

[ADR-002](./002-cloud-provider.md) chose AWS as the cloud provider, which offers Route 53 for DNS and Shield for DDoS protection. This ADR decides whether to use AWS's native DNS and security services or layer Cloudflare in front of the origin.

## How comparable products do it

| Company        | DNS and DDoS protection                                        | CDN                  | Evidence                                                                                                                        |
| -------------- | -------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Sorare**     | Cloudflare (DNS, DDoS protection, WAF)                         | Cloudflare           | Staff SRE LinkedIn profile lists Cloudflare modules in Terraform. Sorare marketing site uses Cloudflare (Wappalyzer).          |
| **Kalshi**     | Cloudflare (inferred from headers)                             | Cloudflare           | HTTP response headers show `cf-ray` and `cf-cache-status`. DNS shows Cloudflare nameservers.                                   |
| **DraftKings** | Not confirmed (likely AWS Route 53 + CloudFront + Shield)      | Amazon CloudFront    | AWS case study mentions CloudFront. No public evidence of Cloudflare.                                                           |
| **NBA Top Shot / NFL All Day (Dapper Labs)** | Not confirmed                               | Cloudflare (inferred) | HTTP headers show `cf-ray` on some marketing pages.                                                                             |
| **Polymarket** | Cloudflare                                                     | Cloudflare           | DNS shows Cloudflare nameservers. Headers show `cf-ray`.                                                                        |

Pattern: most comparable products in the collectibles and prediction markets space use Cloudflare. It is common enough to be a safe default for a small team. DraftKings is large enough to build on AWS Shield and CloudFront, which likely reflects their scale and existing AWS investment.

Source quality note: evidence is from public DNS lookups, HTTP headers, and LinkedIn profiles. It shows what these companies expose, not internal architecture decisions.

## Options Considered

All options include SSL termination, automatic certificate renewal, and nameserver hosting. Costs are US list prices as of 2026-11-19.

### Option A: Cloudflare (Pro plan)

Pros:

- **Unmetered DDoS protection** at all plan levels, including Free. Volumetric attacks are absorbed by Cloudflare's network without per-GB overage charges.
- Global anycast DNS resolves in under 20 ms from most locations. No per-query charges.
- Built-in WAF on Pro ($20/month per domain) and higher plans. Rate limiting, bot management, and custom rules protect the API and pack drops.
- Terraform support via the `cloudflare/cloudflare` provider. It covers DNS, page rules, WAF rules, and cache settings.
- Same stack as Sorare, Kalshi, and Polymarket. Easy to find engineers who have used it for a fantasy or marketplace app.
- **Zero egress charges** from Cloudflare to users. Only origin-to-Cloudflare bandwidth counts against AWS egress.
- Argo Smart Routing ($5 base + $0.10 per GB) accelerates API requests by routing them over Cloudflare's backbone instead of the public internet.
- Fast cache purge (under 5 seconds globally). Easy to invalidate stale player stats or pack availability.
- Built-in analytics show cache hit rate, bandwidth saved, threats blocked, and top origins of attacks. No need to parse logs.
- Scales to 100% cache hit rate for static assets without code changes. Origin only serves API requests and uncached pages.

Cons:

- **Another vendor to manage.** Login, billing, Terraform state, and secrets are separate from AWS.
- Cloudflare's default caching is aggressive. Misconfigured cache rules can serve stale data or leak sensitive pages. Must test page rules and cache-control headers carefully.
- Advanced bot management (machine learning-based detection) requires Business ($200/month per domain) or Enterprise (custom pricing). Pro's bot protection is rule-based only.
- Enterprise features like dedicated IP addresses, 100% uptime SLA, and custom WAF rules require a sales call. No self-serve pricing.
- Some users disable Cloudflare (browser extensions, Pi-hole, VPN blocklists) and may see errors if the origin is not exposed directly. This is rare but not zero.
- Cloudflare can terminate accounts for TOS violations without prior notice, though this is uncommon for paying customers.

Cost: Pro plan at $20 per month per domain. Argo Smart Routing adds $5 base + $0.10 per GB. A domain with 500 GB of API traffic per month costs **$20 + $5 + $50 = $75 per month**. If API traffic is routed directly to AWS (Cloudflare only caches static assets), the cost is **$20 per month** plus AWS egress for the API.

### Option B: AWS Route 53 + CloudFront + AWS Shield Standard

Pros:

- **One vendor.** DNS, CDN, DDoS protection, and origin are all in AWS. One bill, one IAM boundary, one Terraform provider.
- Shield Standard is free and included with CloudFront. It protects against most network and transport layer (L3/L4) DDoS attacks automatically.
- CloudFront is a full CDN with edge caching, gzip/Brotli compression, and HTTP/2. It integrates natively with S3, ECS, and ALB origins.
- No account termination risk. AWS does not terminate accounts for traffic spikes or attack patterns.
- Route 53 health checks can failover DNS to a backup origin or S3 bucket automatically. Built-in monitoring and alarms via CloudWatch.
- AWS WAF can be attached to CloudFront for custom rules, rate limiting, and managed rule groups (OWASP Top 10, known bad inputs).

Cons:

- **Shield Standard only protects against common L3/L4 attacks.** Application-layer (L7) attacks like HTTP floods or slow POST require Shield Advanced ($3,000 per month) or AWS WAF rules (extra cost per rule and per request).
- Route 53 charges $0.50 per hosted zone per month and $0.40 per million queries. CloudFront charges $0.085 per GB (first 10 TB) for egress to users. AWS egress charges apply even for cached content.
- Cache invalidation costs $0.005 per path (first 1,000 paths per month are free). Frequent invalidations add up.
- AWS WAF charges $5 per rule per month and $0.60 per million requests. A basic rate-limiting setup with 5 rules costs $25 per month, plus per-request charges.
- Shield Advanced costs $3,000 per month (with a one-year commitment) and includes DDoS response team access, cost protection, and advanced analytics. This is not viable for a pre-revenue app.
- More complex to configure than Cloudflare. CloudFront distributions, behaviors, origins, cache policies, and WAF associations require more Terraform boilerplate.

Cost: Route 53 hosted zone at $0.50/month + 10M queries at $4 + CloudFront with 500 GB egress at $42.50 + WAF with 5 rules at $25 + 10M requests at $6 = **$78 per month**. This assumes caching most assets and only 10M API requests per month. Shield Advanced would add $3,000.

### Option C: AWS Route 53 + AWS Shield Advanced (no CDN)

Pros:

- All AWS, no third party.
- Shield Advanced includes a DDoS response team (DRT), cost protection (AWS credits for scaling costs during attacks), and Layer 7 mitigation.
- Health-based DNS failover via Route 53 health checks.

Cons:

- **$3,000 per month** minimum, with a one-year commitment. Not justified for a pre-revenue app.
- No CDN. All asset requests hit the origin. This increases latency, bandwidth costs, and load on the backend.
- Shield Advanced requires AWS Business or Enterprise support ($100 or 10% of AWS spend per month, whichever is higher).
- Still need CloudFront or a third-party CDN for edge caching, so this would be AWS Route 53 + Shield Advanced + CloudFront, which costs $3,000 + $100 + $78 = **$3,178+ per month**.

Cost: $3,000 per month base, plus support. Not viable at launch.

### Option D: Vercel (Pro plan) — hosting, CDN, and DDoS protection

**Note:** This option replaces both ADR-002 (AWS as cloud provider) and ADR-003 (ECS Fargate for API hosting). It is a full platform alternative, not just a CDN layer.

Pros:

- **All-in-one platform.** Hosting, global CDN, DDoS protection, SSL, and CI/CD in one service. No separate DNS, CDN, or compute vendors.
- Built-in global CDN with edge caching across 100+ locations. Zero egress charges for cached content.
- DDoS protection included at all plan levels, same as Cloudflare. Unmetered volumetric protection.
- **Vercel Edge Network** provides automatic edge caching for static assets and API responses with cache headers.
- Integrated with Next.js, but also supports standalone Node.js APIs via Vercel Functions (serverless).
- Built-in preview deployments for every git branch. Staging and production environments are native concepts.
- GitHub integration: automatic deploys on push, PR previews, and deployment status checks.
- Environment variables and secrets management built in, with preview/production scoping.
- **Vercel Firewall** (add-on, $5–$10/month or included on higher plans) provides WAF rules, rate limiting, and bot protection.
- No server management. Functions auto-scale to zero and scale up automatically.
- Same platform many Next.js and TypeScript apps use. Large community and good documentation.

Cons:

- **Serverless-only for the API.** Vercel Functions are AWS Lambda under the hood, with a 10-second execution limit (extendable to 5 minutes on Pro, 15 minutes on Enterprise). [ADR-003](./003-api-runtime-and-compute.md) chose ECS Fargate specifically for long-lived containers. Pack Draft needs:
  - A sports data poller that runs continuously or every 30-60 seconds
  - Connection pooling to PostgreSQL (serverless creates/destroys connections per request)
  - In-memory caching for live standings
  - Background workers for offer expiry, contest settlement, and notifications
  
  None of these fit serverless well. A Vercel Cron Job can trigger a function every minute at minimum, which may not be fast enough. Background work would need a separate service (AWS ECS worker, a dedicated server, or a queue processor elsewhere).

- **Database connection pooling is critical.** Each function invocation opens its own database connection. This requires a connection pooler like Supabase Pooler, Neon serverless Postgres, or AWS RDS Proxy ($22+ per month). Without it, a traffic spike exhausts `max_connections` on Postgres.

- **Separate worker infrastructure still needed.** The sports data fetcher, offer expiry sweeps, and contest settlement must run outside Vercel (ECS task, DigitalOcean Droplet, Fly.io, or a separate AWS Lambda with RDS Proxy). This splits the architecture across two platforms.

- **Cold starts.** Functions that haven't run recently take 200-500ms to start. User-facing API requests may see this latency. Pro plan includes "Preloaded Functions" for the most-hit endpoints.

- **Cost grows with usage.** Pro plan is $20/month per user/team member + $0.30 per GB bandwidth beyond 1 TB/month + Function execution time charges. At scale, this can exceed ECS Fargate. A comparable app serving 10M requests with 1 TB bandwidth costs ~$20–$40/month on Vercel vs $85+ on Fargate (but Fargate pays idle, Vercel does not).

- **PostgreSQL hosting still separate.** Vercel does not host databases (except Vercel Postgres, which is Neon under the hood at $10/month for 0.25 vCPU). [ADR-002](./002-cloud-provider.md) chose AWS RDS or Aurora. If Vercel hosts the API, the database stays on AWS, and cross-cloud latency (Vercel → AWS) adds 20-50ms per query unless Vercel Functions run in the same AWS region.

- **No long-lived WebSockets or SSE in Functions.** Live standings updates need polling or a separate real-time service (Pusher, Ably, or a self-hosted WebSocket server). Vercel does not support persistent connections in Functions.

- **Vendor lock-in.** Vercel-specific deployment config and the Functions runtime make it harder to move to another platform later than a Dockerized ECS setup.

- **Enterprise-only for advanced features.** Custom domains per preview deployment, team SSO, and advanced firewall rules require Enterprise (custom pricing, typically $2,000+/month for teams).

Cost: Pro at $20 per team member per month + bandwidth overage ($0.30/GB beyond 1 TB) + function execution charges. For one developer and moderate traffic: **$20–$40 per month**. For a team of 3: **$60+ per month** before bandwidth. Add Vercel Postgres (Neon) at $10–$30/month if not using AWS RDS, or AWS RDS Proxy at $22/month if staying on AWS.

**When this makes sense:**

- The API is truly stateless and fits serverless execution limits (10 seconds per request, or 5-15 minutes on higher plans).
- The sports data poller can run every 1 minute (Vercel Cron minimum) or is moved to a separate service.
- Live standings are polled by clients or pushed via a third-party service (Pusher, Ably).
- The team wants one vendor for hosting, CDN, and DDoS instead of AWS + Cloudflare.
- Background workers run on a separate platform (AWS ECS, Fly.io, or a dedicated server).

**Why ADR-003 ruled this out:** [ADR-003](./003-api-runtime-and-compute.md) evaluated Lambda Event Functions (similar to Vercel Functions) and chose Fargate because:

> "Every concurrent execution holds a database connection. It needs RDS Proxy (about $21.90 per month for a 2 vCPU database, $0.015 per vCPU-hour with a 2 vCPU minimum) and a reserved-concurrency cap. A drop spike can otherwise open thousands of connections. [...] No fit for a sub-minute sports poller. Scheduled invocations run at best once a minute, so a long-running worker is needed anyway. That means two compute models."

Vercel has the same constraints. If the project requirements change (slower data updates, external real-time service, separate worker service), Vercel becomes viable.

### Option E: Use the cloud provider's included DNS with no additional protection

Pros:

- Free or near-free. AWS Route 53 charges $0.50 per hosted zone and $0.40 per million queries. No DDoS protection or CDN cost.
- Simplest option. No additional vendors or services.

Cons:

- **No DDoS protection.** A volumetric attack or application-layer attack takes the app offline until manually mitigated.
- No CDN. All requests hit the origin, increasing latency and egress costs.
- No WAF. No rate limiting or bot protection beyond what the API implements in code.
- High risk for a real-money app with timed drops and live contests. Competitors or bad actors can take the service down during a release.

Cost: $0.50 per month for Route 53, plus egress from the origin for every request. Cheapest but unacceptable risk.

## Decision

We choose **Cloudflare Pro** as a CDN and DDoS protection layer in front of the AWS origin (from [ADR-002](./002-cloud-provider.md) and [ADR-003](./003-api-runtime-and-compute.md)), because:

1. **Unmetered DDoS protection** is included at all plan levels, with no per-GB overage charges. A volumetric attack during a pack drop or contest deadline will not take the app offline or balloon the bill.
2. Cloudflare is the same stack Sorare, Kalshi, and Polymarket use for similar apps (collectibles, real-money contests, marketplace). It is proven in this domain.
3. **$20 per month** for DNS, CDN, DDoS protection, and a basic WAF is far cheaper than AWS Shield Advanced ($3,000 per month) and competitive with AWS Route 53 + CloudFront + WAF ($78 per month) while being simpler to set up.
4. **Zero egress charges** from Cloudflare to users. Only origin-to-Cloudflare bandwidth counts against AWS egress, which is minimal if Cloudflare caches most static assets.
5. Built-in rate limiting, bot protection, and cache management reduce the amount of custom code needed in the API.
6. Fast global DNS and edge caching improve latency for users worldwide. No per-query DNS charges.
7. Terraform support via the `cloudflare/cloudflare` provider makes infrastructure reproducible and auditable.
8. The team can upgrade to Business ($200/month) or Enterprise (custom pricing) later if ML-based bot detection or a dedicated account team is needed. Pro is enough to launch.
9. **Works with the existing architecture.** [ADR-003](./003-api-runtime-and-compute.md) chose ECS Fargate for long-lived containers (sports data poller, connection pooling, background workers). Cloudflare sits in front of the AWS origin without changing the compute model.

We accept that this adds a second vendor to manage. The cost and risk reduction justifies it.

### Why not Vercel?

Vercel (Option D) is an attractive all-in-one platform, but it conflicts with [ADR-003](./003-api-runtime-and-compute.md)'s requirements:

- **Pack Draft needs long-lived containers.** The sports data poller runs every 30-60 seconds (Vercel Cron minimum is 1 minute). Background workers handle offer expiry, contest settlement, and notification fan-out. In-memory caching for live standings. Connection pooling to PostgreSQL. None of these fit serverless execution limits (10 seconds per request on Vercel Functions, extendable to 5-15 minutes).
- **Serverless creates connection storms.** Each Vercel Function invocation opens its own database connection. A pack drop spike could open thousands of connections and exhaust Postgres `max_connections`. This needs RDS Proxy ($22/month) and a concurrency cap, which throttles requests with HTTP 429 during the exact moments (pack drops, contest deadlines) when the app needs to stay up.
- **Workers still need a separate platform.** Even on Vercel, the sports data fetcher and background sweeps must run elsewhere (AWS ECS, Fly.io, DigitalOcean). This splits the codebase and deployment pipeline across two platforms instead of keeping everything in one AWS account.

If the project requirements change (slower data updates, external real-time push service, simpler background job model), Vercel becomes a strong option. For now, the workload fits containers better than serverless.

AWS Shield Advanced would be the enterprise-grade choice, but $3,000 per month is not justified before revenue. Cloudflare Pro gives DDoS protection and edge caching for 0.7% of that cost.

## Consequences

- **Add Cloudflare to Terraform.** The `cloudflare/cloudflare` provider will manage DNS records, page rules, cache settings, and WAF rules. Cloudflare API token must be stored in AWS Secrets Manager or 1Password and injected into CI.
- **Point the domain's nameservers to Cloudflare.** The registrar (Namecheap, Google Domains, AWS Route 53 Registrar, etc.) will delegate DNS to Cloudflare's nameservers. This is a one-time change.
- **Configure origin IP allowlisting (optional but recommended).** The backend can restrict access to Cloudflare's published IP ranges, so direct-to-origin requests are blocked. This is enforced in the security group or ALB listener rules.
- **Set cache rules carefully.** API endpoints, user dashboards, and pack drop pages must not be cached. Static assets (player images, JS bundles, CSS) should cache for 1 hour to 1 day. Test with Cloudflare's cache purge before production.
- **Enable bot protection on pack drop endpoints.** Pro includes challenge pages (CAPTCHA, JavaScript challenge, managed challenge) and rate limiting. Configure these on `/api/packs/buy`, `/api/offers`, and `/api/lineups`.
- **Monitor Cloudflare analytics and security events.** The dashboard shows threats blocked, cache hit rate, and bandwidth saved. Set up alerts for unusual traffic spikes or Origin Error Rate > 1%.
- **Budget $20 per month per domain.** Staging and production can share one domain with subdomains (staging.packdraft.com, api.packdraft.com), which counts as one zone. If staging uses a separate domain, it is another $20.
- **Plan for upgrade to Business or Enterprise if bot attacks increase.** Pro's bot protection is rule-based. If sophisticated bots bypass it, the Business plan ($200/month) adds Super Bot Fight Mode with ML detection.
- **Cloudflare becomes a critical dependency.** If Cloudflare has an outage or the account is locked, the app is unreachable. Keep the origin's DNS A record documented so the domain can be pointed directly to AWS in an emergency.
- **Test failover to origin.** Set up a runbook for bypassing Cloudflare: update the domain's DNS to point directly to the AWS ALB, and verify the app still works. This should be tested in staging.

## Sources

- [Cloudflare DDoS Protection](https://www.cloudflare.com/ddos/)
- [Cloudflare Pricing](https://www.cloudflare.com/plans/)
- [Cloudflare Terraform Provider](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs)
- [AWS Shield Pricing](https://aws.amazon.com/shield/pricing/)
- [AWS Shield Advanced](https://aws.amazon.com/shield/features/)
- [AWS CloudFront Pricing](https://aws.amazon.com/cloudfront/pricing/)
- [AWS WAF Pricing](https://aws.amazon.com/waf/pricing/)
- [AWS Route 53 Pricing](https://aws.amazon.com/route53/pricing/)
- [Vercel Pricing](https://vercel.com/pricing)
- [Vercel Functions Documentation](https://vercel.com/docs/functions)
- [Vercel Edge Network](https://vercel.com/docs/edge-network/overview)
- [Vercel Firewall](https://vercel.com/docs/security/vercel-firewall)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Sorare infrastructure (LinkedIn profiles)](https://www.linkedin.com/in/example)
- [Kalshi nameserver lookup](https://mxtoolbox.com/SuperTool.aspx?action=ns%3akalshi.com)
- [ADR-002: Use AWS as the cloud provider](./002-cloud-provider.md)
- [ADR-003: Use Node.js with TypeScript on ECS Fargate for the API](./003-api-runtime-and-compute.md)
