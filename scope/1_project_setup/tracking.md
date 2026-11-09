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
- [ ] **Sports API data pulling** — provider(s) evaluated; integration approach documented; client approved
- [ ] **App hosting / deployments** — options evaluated; recommendation documented; client approved
- [ ] **Testing framework** — options evaluated; recommendation documented; client approved
- [ ] **Load testing framework** — options evaluated; recommendation documented; client approved

**Stack research gate:** All items above approved before locking setup & delivery work.

| Item                         | Owner | Target date | Client approved (Y/N) | Notes |
| ---------------------------- | ----- | ----------- | --------------------- | ----- |
| Database                     |       |             |                       |       |
| Cloud provider               |       |             |                       |       |
| API / Server / Server hosting & deployments |       |             |                       |       |
| Auth service                 |       |             |                       |       |
| Payment service              |       |             |                       |       |
| Mobile framework             |       |             |                       |       |
| App notifications            |       |             |                       |       |
| Sports API data pulling      |       |             |                       |       |
| App hosting / deployments    |       |             |                       |       |
| Testing framework            |       |             |                       |       |
| Load testing framework       |       |             |                       |       |

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
