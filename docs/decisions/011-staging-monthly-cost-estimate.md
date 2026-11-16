# Staging monthly cost estimate (rollup)

## Date

2026-11-15

## Context

This document tallies **estimated monthly cost for running staging** by rolling up figures and assumptions from [ADR-001](./001-primary-database.md) through [ADR-010](./010-sports-data-provider.md). It is a planning aid, not a new architecture decision. When individual ADRs change, update this rollup.

ADR-001 chooses PostgreSQL only; staging database dollars live in ADR-002.

All underlying ADRs remain **Proposed (pending client approval)** unless noted otherwise.

---

## Always-on staging runtime

Dedicated **staging AWS account** plus **staging SaaS tenants** at low internal usage.

| Line item | ADR | Staging $/mo | Notes |
| --------- | --- | ------------ | ----- |
| RDS (`db.t4g.micro`, 20 GB, single-AZ) | [002](./002-cloud-provider.md) | **~$14** | Staging database only |
| ECS Fargate (API + worker, 0.5 vCPU each) + ALB + task IPv4 | [003](./003-api-runtime-and-compute.md) | **~$60** | Public subnets, no NAT |
| Auth0 staging tenant | [004](./004-auth-service.md) | **$0** | Few test users → Free tier; production Essentials is separate |
| RevenueCat staging project | [005](./005-payment-service.md) | **$0** | Sandbox; free under $2.5k tracked revenue/mo |
| Notifications (Expo Push + SQS) | [006](./006-app-notifications.md) | **$0** | Staging scale within free tiers |
| k6 against existing staging (Tier 1 gate) | [007](./007-load-testing-framework.md) | **$0** | Tool is open source |
| **Subtotal (documented core)** | | **~$74/mo** | $14 + $60 |

### Adjustments called out in ADRs but not priced precisely

| Item | ADR | Staging impact |
| ---- | --- | -------------- |
| Private subnets + NAT | [003](./003-api-runtime-and-compute.md) | Compute stack ~$86/mo → **~$100/mo** with same DB (~$14 NAT base + usage) |
| Scale worker to 0 off-hours | [003](./003-api-runtime-and-compute.md) | **−~$14/mo** (ALB stays) |
| CloudWatch, ECR, transfer, Terraform state | [002](./002-cloud-provider.md), [003](./003-api-runtime-and-compute.md) | Not estimated; real staging is above $74 |
| ElastiCache / live standings cache | [002](./002-cloud-provider.md) | In scope; **no dollar figure in any ADR** for staging |
| Secrets Manager, SQS, EventBridge | [002](./002-cloud-provider.md), [006](./006-app-notifications.md) | Negligible at staging volume |

**Practical “staging is up” range:** about **$74–100/mo** AWS (always-on), plus **~$10–30/mo** cushion for logs/storage if desired → about **$85–130/mo** for the backend environment.

---

## Staging-related but not 24/7 servers

| Line item | ADR | Est. $/mo | Notes |
| --------- | --- | --------- | ----- |
| Expo EAS (Starter + builds) | [008](./008-mobile-app-deployments.md) | **$19 + usage**; ADR budgets **~$65–200** for builds (staging + prod) | Staging workflows on `main`; not split staging-only |
| Maestro E2E on Expo | [009](./009-testing-framework.md) | **~$85** | On top of ADR-008 build costs |
| CircleCI (API deploy, tests, k6 Tier 1) | [003](./003-api-runtime-and-compute.md), [009](./009-testing-framework.md) | **Not estimated** | Plan-dependent |
| Tier 2/3 load tests (ephemeral prod-sized stack) | [007](./007-load-testing-framework.md) | **~$3.50 per 4 h run** | Not run monthly unless scheduled often |
| Apple Developer Program | [008](./008-mobile-app-deployments.md) | **~$8/mo** amortized ($99/yr) | Org-wide |
| Google Play (one-time) | [008](./008-mobile-app-deployments.md) | **~$2/mo** amortized ($25 once) | Org-wide |

**“Staging + mobile CI” ballpark:** about **$170–300/mo** on top of AWS (Expo band + ~$85 E2E), excluding CircleCI.

---

## Sports data (largest wildcard)

[ADR-010](./010-sports-data-provider.md) does not price a staging-only feed. Staging uses slower polling; separate keys **if the vendor allows**—often **$0 marginal** on the same contract.

| Provider (from ADR-010) | Rough org cost | Staging note |
| ----------------------- | -------------- | ------------ |
| SportsDataIO (lead) | ~**$833/mo** (~$10k/yr reported minimum) | Trial/dev keys for bake-off; production license TBD |
| Goalserve (published) | **$400/mo** (1‑mo US package) | Possible trial/benchmark |
| Sportradar / others | Opaque to very high | Quotes only |

If staging must mirror **live** games during QA, expect the **same commercial license** as production, not a separate small staging SKU.

---

## Bottom line

| Scope | Monthly estimate (from ADRs) |
| ----- | ---------------------------- |
| **Backend staging (24/7)** | **~$74** documented minimum → **~$85–130** with overhead; **~$100–115** with NAT/private subnets |
| **+ SaaS at test scale (Auth0, RevenueCat, push)** | **+$0** |
| **+ Mobile staging builds + E2E** | **~+$150–285** (Expo band + ~$85 E2E; CircleCI extra) |
| **+ Sports data (live stats in staging)** | **+$0 marginal** to **~$400–850+/mo** org license (vendor TBD) |

| Scenario | Approximate total |
| -------- | ----------------- |
| Minimal: keep staging AWS + tenants warm | **$75–130/mo** |
| Typical: backend + Expo/E2E, no sports contract | **$230–400/mo** |

### Open items for a spike

- ElastiCache size and cost for staging
- Measured CloudWatch and ECR spend
- Auth0: tenant count and staging cost on Essentials
- Sports vendor: staging key policy and whether QA needs live feeds
- CircleCI plan and monthly credits

---

## Note

Figures are **US list, on-demand, 2026-11-08 era** where ADRs cite pricing; they exclude tax, egress spikes, and client discounts. They are **sums and ranges from proposed ADRs**, not invoices. **Do not quote to the client as committed spend** until vendors and AWS bills are validated. Reconcile this file when any decision ADR is accepted or its cost section changes.