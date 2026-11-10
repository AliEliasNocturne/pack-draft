# Project setup — tracking

Source: [requirements.md](./requirements.md)

**Legend:** `- [ ]` not started · `- [x]` done · add dates/notes inline as you go.

---

## Stack research (client approval required)

Each item: research options, document recommendation, get client sign-off.

- [x] **Database** — options evaluated; recommendation documented; client approved
  - Options evaluated and recommendation documented: [ADR-001](../../docs/decisions/001-primary-database.md) (PostgreSQL, status: Proposed). Awaiting client approval.
- [x] **Cloud provider** — options evaluated; recommendation documented; client approved
  - Options evaluated and recommendation documented: [ADR-002](../../docs/decisions/002-cloud-provider.md) (AWS with RDS for PostgreSQL, status: Proposed). Awaiting client approval.
- [x] **API / Server / Server hosting & deployments** — options evaluated; recommendation documented; client approved
  - Combined into one item. Options evaluated and recommendation documented: [ADR-003](../../docs/decisions/003-api-runtime-and-compute.md) (Node.js + TypeScript on ECS Fargate, CircleCI deploys, status: Proposed). Awaiting client approval.
- [x] **Auth service** — options evaluated; recommendation documented; client approved
  - Options evaluated and recommendation documented: [ADR-004](../../docs/decisions/004-auth-service.md) (Auth0 with Universal Login, redirect accepted; status: Proposed). Awaiting client approval.
- [x] **Payment service** — options evaluated; recommendation documented; client approved
  - Options evaluated and recommendation documented: [ADR-005](../../docs/decisions/005-payment-service.md) (Apple/Google in-app purchase through RevenueCat, our Postgres ledger as source of truth, no redirects; status: Proposed). Awaiting client approval.
- [ ] **Mobile framework** — options evaluated; recommendation documented; client approved
  - Not researched yet. Expo + React Native is assumed by the items below it. Needs its own ADR and client sign-off.
- [x] **App notifications** — options evaluated; recommendation documented; client approved
  - Depends on **Mobile framework** (above); assumes Expo + React Native. Options evaluated and recommendation documented: [ADR-006](../../docs/decisions/006-app-notifications.md) (inbox and preferences in Postgres, push sent through the Expo Push Service from a worker via SQS, native tokens stored for a later move to direct FCM/APNs; status: Proposed). Awaiting client approval.
- [x] **Sports API data pulling** — provider(s) evaluated; integration approach documented; client approved
  - Options evaluated and recommendation documented: [ADR-010](../../docs/decisions/010-sports-data-provider.md) (SportsDataIO as lead candidate with Sportradar as benchmark and NCAA fallback, central polling from one worker with our own player and game IDs, evolution and settlement on verified-final stats; status: Proposed). **Provider is not final:** it needs vendor quotes, written license answers (contests and collectibles, derived scoring, data retention after termination), and a trial comparison on real data. Awaiting client approval.
- [x] **App hosting / deployments** — options evaluated; recommendation documented; client approved
  - Depends on **Mobile framework** (above); assumes Expo + React Native. Options evaluated and recommendation documented: [ADR-008](../../docs/decisions/008-mobile-app-deployments.md) (Expo Build, Submit, and Update run by Expo Workflows with separate development, staging, and production app variants, over-the-air updates for fixes only, CircleCI keeps running checks; status: Proposed). Awaiting client approval.
- [x] **Testing framework** — options evaluated; recommendation documented; client approved
  - Options evaluated and recommendation documented: [ADR-009](../../docs/decisions/009-testing-framework.md) (Vitest for server and shared packages, Jest with `jest-expo` and RNTL for mobile, Maestro for end-to-end flows, real Postgres for database tests; status: Proposed). Awaiting client approval.
- [x] **Load testing framework** — options evaluated; recommendation documented; client approved
  - Options evaluated and recommendation documented: [ADR-007](../../docs/decisions/007-load-testing-framework.md) (k6 with TypeScript scripts, run from CircleCI for gate tests and from Fargate in the staging account for full runs against a production-sized test stack, with Postgres invariant checks and stubbed third parties; status: Proposed). Awaiting client approval.

**Stack research gate:** All items above approved before locking setup & delivery work.

| Item                                        | Owner | Target date | Client approved (Y/N) | Notes |
| ------------------------------------------- | ----- | ----------- | --------------------- | ----- |
| Database                                    |       |             |                       |       |
| Cloud provider                              |       |             |                       |       |
| API / Server / Server hosting & deployments |       |             |                       |       |
| Auth service                                |       |             |                       |       |
| Payment service                             |       |             |                       |       |
| Mobile framework                            |       |             |                       |       |
| App notifications                           |       |             |                       |       |
| Sports API data pulling                     |       |             |                       |       |
| App hosting / deployments                   |       |             |                       |       |
| Testing framework                           |       |             |                       |       |
| Load testing framework                      |       |             |                       |       |

---

## Setup & delivery

### Code setup — monorepo, checked in to GitHub

- [ ] Monorepo structure defined (packages/apps, tooling)
- [ ] Repository created on GitHub
- [ ] Initial code scaffold committed and pushed
- [ ] Branch protection / access documented (if applicable)
- [ ] README or contributor docs for local dev (minimal)

### Backend — API and database; staging and production; deployed

- [ ] Database provisioned (staging)
- [ ] Database provisioned (production)
- [ ] API project wired to database (migrations/schema baseline)
- [ ] Staging environment configured
- [ ] Production environment configured
- [ ] Staging deployment live and smoke-tested
- [ ] Production deployment live and smoke-tested
- [ ] Environment variables / secrets documented for team

### Apps — iOS and Android; staging and production; preferably deployed

- [ ] Shared mobile app codebase in monorepo (or linked structure)
- [ ] iOS — staging build/config
- [ ] iOS — production build/config
- [ ] Android — staging build/config
- [ ] Android — production build/config
- [ ] Staging distribution (TestFlight / internal track / equivalent)
- [ ] Production distribution path defined (App Store / Play Store or client preference)
- [ ] Apps pointed at staging API; verified
- [ ] Apps pointed at production API; verified (when ready)

---

## Phase completion checklist

- [ ] Stack research complete and client-approved
- [ ] Monorepo on GitHub
- [ ] Backend deployed to staging and production
- [ ] Mobile apps built for staging and production (deployed or distributable per client preference)
