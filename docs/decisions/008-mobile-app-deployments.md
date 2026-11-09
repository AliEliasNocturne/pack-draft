# ADR-008: Build and ship the mobile apps with Expo Build, Submit, and Update, run by Expo Workflows

## Status

Proposed (pending client approval)

## Date

2026-11-08

## Context

[ADR-001](./001-primary-database.md) chose PostgreSQL, [ADR-002](./002-cloud-provider.md) chose AWS, [ADR-003](./003-api-runtime-and-compute.md) chose a Fastify API on ECS Fargate with CircleCI deploys, [ADR-004](./004-auth-service.md) chose Auth0, [ADR-005](./005-payment-service.md) chose RevenueCat with our own ledger, [ADR-006](./006-app-notifications.md) chose an inbox in Postgres with push through the Expo Push Service, and [ADR-007](./007-load-testing-framework.md) chose k6. This ADR picks how the iOS and Android apps are built, signed, tested by people, released to the stores, and fixed after release. It covers the tracking item "App hosting / deployments." The backend's hosting and deploys are in ADR-003.

What the [project scope](../../scope/project_scope.md) and the setup requirements ask for:

- **iOS and Android apps, with staging and production environments, "preferably deployed."** The setup list asks for staging builds, production builds, a staging distribution path (TestFlight or an internal track), a production distribution path, and apps pointed at the staging and production APIs.
- **Apps that stay in the wild.** Users update slowly. ADR-003 says the API must stay backward compatible with old app versions.
- **Fixes that cannot wait for a store review.** The breaker-style reveal must be resume-safe, with no loss, duplicates, or double charge. A crash there on launch day needs a fast fix.

What the earlier ADRs hand to this one:

- ADR-004: sign-in returns to the app through Universal Links and App Links, per environment. Staging and production are separate Auth0 tenants.
- ADR-005: separate RevenueCat projects for staging and production. "Decide in the spike whether staging builds need their own bundle ID and store records." TestFlight and internal-track purchases are sandbox purchases, and the production handler rejects sandbox events. The company needs the Apple and Google store accounts first, and they can take weeks.
- ADR-006: a separate Expo project and Firebase project for each environment, Android notification channels created on every launch, and the Time Sensitive Notifications capability on iOS.
- ADR-003: a small team with no one watching constantly, and a rule of "build once, promote the same artifact." The API runs one image from staging to production. We will see below that mobile cannot do exactly this.

What the platform asks of it:

- **iOS and Android built with Expo and React Native.** This is an assumption for this ADR, as in ADR-006. The mobile framework has its own tracking item, which has not been researched yet. If it changes, Option C (self-run builds) becomes the default.
- **The team does not own a fleet of Macs.** An iOS build needs macOS and Xcode.
- **Code on GitHub in a monorepo, CircleCI for the backend** (ADR-003, tracking items).

Out of scope: the mobile framework choice, test frameworks (the "Testing framework" item, [ADR-009](./009-testing-framework.md)), crash and analytics tools, store listing copy and screenshots, and legal review of contests (flagged in ADR-005).

### How we scored the options

The client has not ranked criteria for this item. We used the team's order below and ask the client to confirm it.

1. **Hiring pool and familiarity.** Can we hire someone who has done this before, or will we train them?
2. **Language ubiquity.** Does it use the TypeScript, JavaScript, and YAML the team already writes, or does it add a language?
3. **Long-term support.** Who maintains it, how is it funded, how often does it ship, and how hard is it to leave?
4. **Ease of use.** Setup effort, lines of configuration, and how often a person must touch it.
5. **Support.** What do we do when it breaks at a release? Is there a person to ask, and is there an SLA?
6. Then fit with the scope, cost, and the failure we can least afford: a release that cannot ship.

### What the stores and Apple require

- **Apple Developer Program: $99 a year. Google Play Developer account: $25 once.** (Expo docs.) Both must be held by the client's company, not by an engineer. A company account on either store needs a D-U-N-S number, and it can take weeks.
- **Google's closed-test rule.** A personal Play account created after Nov 13, 2023 must run a closed test with at least 12 testers opted in for 14 continuous days before it can apply for production access. Organization accounts are exempt. A third-party source estimates 4 to 8 weeks for the organization route. We did not verify that figure.
- **TestFlight.** Up to 100 internal testers (App Store Connect users, no review) and up to 10,000 external testers. The first build sent to an external group goes to App Review. A build can be tested for 90 days.
- **Apple limits over-the-air updates.** Guideline 2.5.2: apps may not "download, install, or execute code which introduces or changes features or functionality of the app." Expo's own FAQ says updates must follow store rules and that behavior changes "usually" need review. An over-the-air (OTA) update is a tool for fixes, not features.
- **Purchases and odds.** ADR-005 says Apple 3.1.1 and Google Play both require odds disclosure before purchase. A change to that screen is a change reviewers looked at.
- **Android first upload.** Expo Submit's first Google Play upload creates a release on the internal testing track. The app stays in draft until the store listing is complete.

## How comparable products do it

| Company | What we found | Evidence |
| ------- | ------------- | -------- |
| **Kalshi** | The mobile engineer posting asks for Flutter. React or React Native is a "bonus." No CI or release tool named. | Software Engineer, Mobile posting |
| **Sorare** | Native iOS (SwiftUI) and a separate Android team. Web is React and TypeScript. | iOS and Frontend Engineer postings, an engineer's post |
| **Dapper Labs** (NBA Top Shot) | Engineers' public profiles show React Native on Expo and Swift or SwiftUI. One iOS engineer owned "CI/CD workflows, App Store deployments, release validation" with no tool named. | Engineer profiles, iOS engineer posting |
| **DraftKings, Polymarket** | Not found. | No source found |
| **Lendable** (a lender, not a comparable product, same stack) | React Native, TypeScript, Expo, EAS, Jest, React Testing Library, and Maestro. Tests run in GitHub Actions. | Mobile Quality Engineer posting |

Pattern: the three sports and trading comparables use three different mobile stacks, and none names its build tool. We found no evidence for how any of them ships. The only same-stack example (Lendable) uses Expo's build service with GitHub Actions for checks.

Source quality note: all of this comes from job postings and personal profiles.

## Options Considered

Prices are US list prices on 2026-11-08. Build effort figures are our estimates, not measurements.

This ADR makes two decisions: how builds and releases run (Part 1), then whether and how to send over-the-air fixes (Part 2).

### Part 1: Build and release pipeline

All options use the stores' own tracks for testers: TestFlight and Google Play internal testing.

#### Option A: Expo Build, Submit, and Update, with Expo Workflows as the pipeline

Expo's hosted services build and sign the binaries, upload them to the stores, and serve updates. The pipeline is YAML files in `.eas/workflows/`, run by Expo and triggered from a GitHub app link or by hand. CircleCI keeps running lint, type checks, and tests.

Pros:

- **Least to build and keep.** Expo's own comparison puts the same two-platform build at under 20 lines of YAML, against about 110 lines and 9 CI secrets plus a signing repository when done by hand with Fastlane. This is Expo's claim.
- **Signing is handled.** Expo generates and stores the iOS certificates, provisioning profiles, and Android keystores. A teammate with an Expo account can start a build.
- **Fits Expo and React Native.** First-party jobs for build, TestFlight, submit, update, staged rollout (`update-rollout`), and a `require-approval` job. A `fingerprint` job decides whether native code changed, so a JS-only change ships as an update and not a new binary.
- **Familiar language.** YAML and the JavaScript or TypeScript app config. No new language.
- **Runs the E2E tests.** Expo's `maestro` job runs flows on a build it just made. We need that for [ADR-009](./009-testing-framework.md).
- **A way out.** `eas build --local` builds on a Mac we control. The same `eas` commands run from any CI.
- **Wide use.** `expo` has about 17.3 million weekly npm downloads and `eas-cli` about 2.2 million (week of Nov 1 to 7, 2026). Expo and EAS appear in React Native job postings we found.

Cons:

- **A second pipeline tool.** CircleCI for the backend and checks, Expo Workflows for mobile releases. Two places to look.
- **Workflows are new and limited.** No matrix builds. The `maestro` job is labeled alpha in Expo's docs.
- **Expo is in the path of every release.** A third-party tracker lists 24 Expo incidents in 90 days (6 major or critical), with iOS submission failures and Linux build queue delays among them. On Sep 4, 2026, Linux worker queue times were elevated for 15 h 4 min.
- **Support is community-only below the $199 plan.** Priority support starts on Production. A 99.9% uptime SLA is Enterprise only.
- **Source code is built on Expo's machines.** Expo reports a SOC 2 Type 2 report on the Production plan and above.
- **Staging and production binaries differ** (see Decision). This is true of every option here.

Build effort: **4 to 6 days** for accounts, three app variants, the workflows, and the first store uploads.

#### Option B: Expo Build, Submit, and Update, with the pipeline in CircleCI

The same Expo services, but CircleCI runs `npx eas-cli build --non-interactive --no-wait` and `eas update`. Expo documents a CircleCI example.

Pros:

- **One pipeline tool.** Matches ADR-003. CircleCI is the team's choice and a known skill.
- **Least lock-in.** The pipeline is shell commands that also run from a laptop. If Workflows disappears, nothing is rewritten.
- **Approval step** with CircleCI's own approval job.

Cons:

- **More glue.** No fingerprint job: we call `@expo/fingerprint` ourselves to decide between a build and an update. `--no-wait` makes the CircleCI job pass when the build is queued, not when it succeeds. Waiting for the build uses CircleCI credits.
- **No place to run Maestro.** The `maestro` job lives in Workflows. On CircleCI we would run emulators ourselves (a machine executor for Android and a macOS executor for iOS), or pay for Maestro Cloud.
- **A long-lived `EXPO_TOKEN` in CircleCI** instead of a GitHub app link.
- **Two dashboards anyway.** Expo shows the build, CircleCI shows the pipeline.

Build effort: **4 to 6 days.**

#### Option C: Build natively on our own CI with Fastlane

CircleCI (or GitHub Actions) macOS runners run Xcode and Gradle. Fastlane signs, builds, and uploads (`match`, `gym`, `pilot`, `supply`).

Pros:

- **Full control.** Our code never leaves our CI. Any Xcode or Gradle setting works.
- **Large hiring pool for Fastlane itself.** It is the long-standing tool for this job and appears in job postings alongside Bitrise, GitHub Actions, and CircleCI. About 219 million RubyGems downloads and about 42,000 GitHub stars.
- **No dependency on Expo's services.**

Cons:

- **Adds a language: Ruby.** Fastfiles are Ruby. Fastlane dropped Ruby 2.7 with its May 2026 release (2.235.0) and Ruby 3.0 with its September 2026 release (2.239.0), so the Ruby toolchain on CI needs upkeep.
- **We own signing.** Certificates, profiles, a `match` repository, keystores, and Xcode image updates on every Apple SDK deadline.
- **Funding is thin.** Google stopped sponsoring Fastlane in late 2021. Volunteers kept it going, and it moved to the Mobile Native Foundation. Its maintainers describe repeated "is this project dead?" questions before activity resumed in November 2025. It has shipped about monthly in 2026, and an Open Collective began in April 2026. It is alive and volunteer-run.
- **No OTA.** We would still need one of the options in Part 2.
- **macOS minutes cost about the same as Expo's flat fee.** At $0.062 a minute on GitHub's standard macOS runner and our guess of 25 minutes per iOS build, that is about $1.55 against Expo's $2.

Build effort: **12 to 18 days.**

#### Option D: A mobile CI platform (Bitrise or Codemagic)

A hosted CI built for mobile, with signing and store steps built in.

Pros:

- **Mobile-first.** Visual workflow editor on Bitrise, many store and signing steps, and tools for flaky tests. Codemagic offers per-minute pricing.
- **Built-in OTA.** Bitrise CodePush (Beta since November 2025, free to 100,000 MAU) and Codemagic Patch (free under 100,000 MAU).

Cons:

- **A third pipeline tool** next to CircleCI, for a team that has none of its skills.
- **More assembly than Expo.** Expo's comparison says fingerprint-based build skipping is something you wire up yourself on both. This is a competitor's view.
- **Cost.** Bitrise starts at $89 a month billed yearly. Codemagic is $0.095 a minute on M2 or $0.114 on M4.
- We did not check either platform's Expo support in detail, or its support terms.

Build effort: **6 to 10 days.**

### Part 2: Fixing the app without a store release

#### Option O1: No over-the-air updates

Every fix is a binary and a store review.

Pros: nothing to learn, no vendor, no risk under Apple 2.5.2, and what ships is exactly what was reviewed.

Cons: a crash in the reveal screen waits for review and for users to update. Old versions linger.

#### Option O2: Expo Update

`expo-updates` in the app, with updates served by Expo. Channels map to environments, rollouts can be partial, and a previous update can be republished to revert.

Pros:

- **A fix in minutes for JavaScript-only bugs.** The update reaches the next launch of a compatible build.
- **Safe rollout controls.** Percentage rollouts, republish to revert, and a runtime version that blocks an update from a build with different native code. The `fingerprint` policy raises the runtime version whenever native inputs change.
- **Same vendor, same pipeline** as Part 1, Options A and B. Update health (crash rates, installs) is on the dashboard.

Cons:

- **Apple and Google rules apply to what we send.** See "What the stores and Apple require."
- **Cost scales with users.** See the cost table. It counts every installation that downloads at least one update in a month.
- **End-to-end code signing of updates is Production plan only.**
- **Incidents.** The tracker lists 8 EAS Update incidents in 12 months, including a cache problem with rollout updates for 3 h 34 min on Sep 23, 2026.

#### Option O3: Another OTA vendor, or a server we run

Bitrise CodePush, Codemagic Patch, Revopush, or a self-hosted `expo-updates` server or Hot Updater.

Pros: possibly cheaper at scale, and EU data options exist.

Cons: another vendor or a service to run. Microsoft closed the original hosted CodePush on March 31, 2025, and archived the SDK repository in May 2025. That is the cautionary tale for this category. Several replacements are new. We did not evaluate any in depth.

### Not evaluated in depth

- **Xcode Cloud.** Apple-only. Android would need a second tool.
- **Appcircle, GitLab macOS runners (beta).** Not researched.
- **Device clouds for beta testing (BrowserStack, Sauce Labs, Firebase App Distribution).** TestFlight and the Play internal track already cover tester distribution at no cost.
- **Shorebird.** For Flutter.

## Comparison

### Against our criteria

| Criterion | A. Expo + Workflows | B. Expo + CircleCI | C. Fastlane on our CI | D. Bitrise or Codemagic |
| --------- | ------------------- | ------------------ | --------------------- | ----------------------- |
| Hiring and familiarity | Expo and EAS in React Native postings | Same, plus CircleCI skill | Fastlane widely known | Bitrise named in postings |
| Language | YAML, TypeScript config | YAML, shell, TypeScript config | Ruby, Gradle, Xcode settings | YAML or visual, shell |
| Long-term support | Company-backed, 13 `expo` npm maintainers. Workflows are new. | Same services, pipeline portable | Volunteer-run, alive, funding thin | Companies. OTA is Beta (Bitrise) |
| Ease of use | Under 20 lines for both platforms (Expo's claim) | More glue, no fingerprint job | Most work to build and keep | Visual editor, more assembly than Expo |
| Support | Community below $199. Priority on Production. SLA on Enterprise. | Same for Expo, plus CircleCI | Community only | Not checked |
| Runs E2E | Yes (Maestro job, alpha) | Our own emulators | Our own emulators | Not checked |
| Exit cost | Low (`eas` commands, `eas build --local`) | Lowest | None | Medium |
| Effort | 4 to 6 days | 4 to 6 days | 12 to 18 days | 6 to 10 days |

### Monthly cost of Expo services

Assumptions, which are ours and not measured: medium workers, iOS $2 and Android $1 per build. Fingerprint skipping means most commits build nothing, so these are upper bounds. OTA counts only installs that download an update that month.

| Builds a month (each platform) | Usage | Starter ($19 + usage over $45 credit) | Production ($199, $225 credit) |
| --- | --- | --- | --- |
| 30 | $90 | $64 | $199 |
| 75 | $225 | $199 | $199 |
| 150 | $450 | $424 | $424 |

For builds alone, Starter is cheaper below 75 builds of each platform a month, and the two plans cost the same above that. The reason to move to Production is what it adds: priority support, SSO, a SOC 2 report, signed updates, and a lower update bill at 100,000 users (below).

Worst case for updates, if every active user downloads an update each month:

| Monthly users | Starter plan | Production plan |
| --- | --- | --- |
| 10,000 | $54 ($19 + $35) | $199 (50,000 included) |
| 100,000 | $504 ($19 + $485) | $449 ($199 + $250) |
| 500,000 | $2,129 ($19 + $2,110) | $2,074 ($199 + $1,875) |

Bandwidth is included at 100 GiB plus 40 MiB per user over the included users, then $0.10 per GiB. We did not model it. We update rarely, so real cost should be far lower.

Other costs: Apple $99 a year, Google $25 once. Fastlane and Maestro CLI are free.

## Decision

We choose **Option A**: build, submit, and update with **Expo Build, Submit, and Update**, driven by **Expo Workflows**. We send **over-the-air fixes with Expo Update (Option O2)** under the strict policy below. CircleCI keeps running checks for the whole monorepo. We start on the **Starter** plan.

Why Option A:

1. **It is the least to build and the least to keep.** Signing, store uploads, fingerprint checks, approvals, and staged rollouts are jobs, not scripts. A small team should not own Xcode images and a Fastlane signing repository.
2. **No new language.** Config is YAML and TypeScript. Fastlane would add Ruby, and its upkeep is volunteer-funded.
3. **It runs the E2E tests.** Expo's Maestro job uses the build the pipeline just made. Option B has no equivalent without us running emulators.
4. **The exit is cheap.** Every job is an `eas` command. Option B is the same pipeline in CircleCI. `eas build --local` builds without Expo's servers. We write the fallback down and test it once (see Consequences).
5. **Hiring.** Expo is the mainstream path for React Native, and the work needs no special skill beyond store knowledge.

Why not the others:

- **Option B.** The strongest alternative and nearly a tie. It has one pipeline tool and the least lock-in. We give it up for the Maestro job, the fingerprint job, and less glue. It is the first thing to switch to (see review triggers).
- **Option C.** Full control at 12 to 18 days of work and a new language, for no cost saving. Choose it only if the client needs builds on its own infrastructure or the mobile framework is not Expo.
- **Option D.** A third pipeline tool, more assembly, and a Beta OTA product.
- **No OTA (O1).** The simplest and safest, but a crash in the reveal screen would wait for review. We keep the option to turn updates off by policy.
- **Other OTA vendors (O3).** CodePush's shutdown is the reason to stay with the vendor that also builds the app.

We accept the following risks:

- **Expo is in the path of every release.** It had 24 incidents in 90 days. We reduce the impact with a tested manual fallback and by not shipping on a day when Expo reports problems.
- **Support below the $199 plan is community only,** and there is no SLA below Enterprise. We accept this at launch and name the trigger to change it.
- **Workflows are young.** No matrix, and the Maestro job is alpha. The jobs we need are build, submit, update, and approval, which the docs show with examples.
- **The binary we test is not the binary we ship.** Staging and production have different bundle IDs, so the production binary is built again from the same commit with the production profile. ADR-003 builds the API image once and promotes it. We cannot do that here. We reduce the gap with the same commit, the same fingerprint, and a smoke test on the production binary in TestFlight before every release.

## Consequences

- **Accounts first.** Before any build can ship:
  - The client's company holds the **Apple Developer Program** (organization) and **Google Play** (organization) accounts, and the **Expo organization** that owns the project. These need D-U-N-S and take weeks. Start now, in parallel with the Paid Applications work in ADR-005.
  - Engineers are added as users with roles, never given the owner login. Turn on two-factor sign-in everywhere.
  - Create an App Store Connect API key and a Google service account key and store them in Expo's credentials.
  - Keep an encrypted copy of the Android upload keystore and the iOS distribution certificate in the client's vault. Never keep the only copy in one vendor.
- **Three variants, three bundle IDs.** This answers ADR-005's open question: staging builds get their own bundle ID and store records.

  | Variant | Bundle ID (client's reverse-DNS name to be chosen) | Backend | Auth0 | RevenueCat | Expo push and Firebase | Distribution | Update channel |
  | ------- | -------------------------------------------------- | ------- | ----- | ---------- | ---------------------- | ------------ | -------------- |
  | development | `...packdraft.dev` | local or staging | staging tenant | staging project | staging | Expo development builds, internal | `development` |
  | staging | `...packdraft.staging` | staging AWS account | staging tenant | staging project | staging | TestFlight internal and Play internal | `staging` |
  | production | `...packdraft` | production AWS account | production tenant | production project | production | TestFlight, then App Store and Google Play | `production` |

  The three variants install side by side on one phone. Each needs its own Universal Link and App Link entries for its Auth0 tenant (ADR-004).
- **One app config.** `app.config.ts` reads `APP_VARIANT` and sets name, icon (add a badge to staging), bundle ID, scheme, associated domains, and update channel. Public settings (API base URL, Auth0 domain and client ID, RevenueCat public SDK key) come from Expo environment variables per environment. Values with the `EXPO_PUBLIC_` prefix are inside the bundle, so no secret goes in the app.
- **Workflows.** Files in `.eas/workflows/`, with the Expo GitHub app linked to the repository:
  - `staging.yml`, on push to `main`: run `fingerprint`. If native code changed, build both platforms with the staging profile and send them to TestFlight internal and the Play internal track. If not, publish an update to the `staging` channel.
  - `production.yml`, run by hand from a tagged commit: build with the production profile, then `require-approval`, then submit to TestFlight and the Play internal track. A person then submits the build for review and releases it.
  - `ota-hotfix.yml`, run by hand: publish to `production` at a low percentage, `require-approval`, then `update-rollout` to 100%. See the OTA policy.
  - E2E workflows are in [ADR-009](./009-testing-framework.md).
  - **Do not use Expo's `deploy` template as is.** It publishes an update to production on every push to `main` when a build exists.
  - Keep each job a plain `eas` command, so Option B stays possible.
- **Monorepo.** The app lives in `apps/mobile`. Expo supports npm, pnpm, Yarn, and Bun workspaces. Only one version of React Native, React, and each native module may exist in the repo. Check this in the monorepo setup item. Expo says third-party monorepo tools "may not work as expected."
- **Release process.**
  - **iOS.** Production builds go to TestFlight. Internal testers run the smoke list. Then submit for App Review and choose manual release, so the release waits until the API changes it needs are live (ADR-003). Add the client's reviewers as App Store Connect users, which avoids Beta App Review for external testers.
  - **Android.** Production builds go to the internal track, then to production with a staged rollout set in Play Console. The first release needs the store listing complete.
  - **Versions.** Use remote version management with auto-increment for build numbers. Tag releases `mobile-vX.Y.Z`. Builds expire in TestFlight after 90 days, so a tester build is not a permanent record.
- **OTA policy.**
  - **Allowed:** fixes to JavaScript or asset bugs, and copy fixes.
  - **Not allowed:** new features, changes to the purchase flow or the odds disclosure (ADR-005), contest or marketplace rules, consent and privacy screens (ADR-006), or anything that changes what the app does. These go through a binary release and review (Apple 2.5.2).
  - Use the `fingerprint` runtime version policy. Start every production update at a low rollout percentage and watch the error rate on the dashboard before completing it. Every production update needs an approval.
  - Revisit signed updates on the Production plan. They protect against a stolen Expo token or a tampered update.
- **Old app versions.** Add a minimum supported version to the API: the app sends its version, and below the floor the API answers with an "upgrade required" response that the app shows as a blocking screen. Raise the floor only after an API change that old versions cannot handle. The window (for example, the last two or three releases) is a client decision.
- **Smoke test on the production binary.** TestFlight and Play internal purchases are sandbox purchases, and the production API rejects sandbox events (ADR-005). So the production smoke test covers sign-in, browsing, opening a pack that a test account already owns, and notification permission, but not buying credits. Purchases are tested on the staging variant.
- **Plan and cost.** Start on **Starter** ($19 a month plus usage). The Free plan has a 45-minute build timeout, a low-priority queue with waits of 90 minutes or more at peak, and one macOS concurrency. Budget about $65 to $200 a month for builds in the first months, plus OTA by user count. Move to **Production** when the client wants signed updates or priority support, or when monthly active users make the update bill larger than the plan difference (about 100,000 users in the worst case above).
- **Fallback runbook.** Write it and run it once during setup.
  - If Expo Build is down: `eas build --local` on a Mac, then upload the `.ipa` with Apple's Transporter and the `.aab` in Play Console.
  - If Workflows are down: run the same `eas` commands from a laptop, or move the workflows to CircleCI (Option B).
  - If Expo Update is down: the app keeps running its last update. Ship the fix as a binary if it cannot wait.
  - Subscribe to Expo's status page. Do not start a release while it shows a major incident.
- **Secrets.** Expo environment variables hold build-time config, with the `staging` and `production` environments separate. Server secrets stay in AWS Secrets Manager (ADR-003). With the GitHub app link, no long-lived Expo token sits in CircleCI.
- **Run the spike first.** Before approval is final, check:
  1. From the monorepo, a staging workflow builds both platforms and lands in TestFlight internal and the Play internal track.
  2. A JS-only change on `main` publishes to the `staging` channel and reaches a staging device without a new build.
  3. The production workflow stops at the approval step. A staged production update can be rolled back by republishing the previous one.
  4. `eas build --local` produces an installable build, and the manual upload works.
  5. The staging and production variants install side by side. Sign-in returns to the right one through its link (ADR-004), and each registers its own push token and creates its Android channels (ADR-006).
  6. The Expo GitHub app works with the private repository and branch rules.
  7. Expo environment variables differ per variant and none of them is a secret.
- **Review triggers.** Switch to Option B if Workflows has an incident during a release, if a limit we need (matrix, concurrency) blocks us, or if the client wants one pipeline tool. Move to Option C if the client needs builds on its own infrastructure, Expo's terms or prices change, or the mobile framework is not Expo. Move to the Production plan on the triggers above. Revisit O1 if the client does not want OTA at all.

### Open questions for the client

- **Mobile framework.** We assumed Expo and React Native. That needs its own approval before this ADR is final. If it changes, Option C is the default.
- **Store accounts.** Which legal entity holds the Apple and Google accounts? Does it have a D-U-N-S number? Who is the account holder and who gets an App Store Connect role?
- **Bundle IDs and app name.** The reverse-DNS prefix and the store name. They cannot be changed after release.
- **Launch markets and store listings.** The scope names none. Listings, privacy answers, and age ratings are the client's.
- **Minimum supported app version.** How many releases back must the API support, and how do we message people on old versions?
- **OTA acceptable?** Is the client comfortable with fixes that reach users without a store review, under the policy above? If not, we choose O1.
- **Source code on Expo's servers.** Is it acceptable that builds run on Expo's machines? Expo reports SOC 2 Type 2 on the Production plan. If not, Option C.
- **Release cadence.** How often does the client expect store releases? This sets build counts and plan cost.
- **External testers.** Does the client need external TestFlight testers, which adds a Beta App Review for the first build?

## Sources

Comparable products:

- Kalshi, [Software Engineer, Mobile posting](https://jobs.ashbyhq.com/kalshi/35ff02ff-c0b0-4560-96c8-4a6a9e4db9f2)
- Sorare, [Senior iOS Engineer posting (web3.career)](https://web3.career/web3-jobs-paris+mobile), [Senior Frontend Engineer posting](https://reactjobs.io/react-jobs/sorare/10571-senior-software-engineer-frontend)
- Dapper Labs, [Senior Mobile Engineer, iOS posting](https://up2staff.com/mobile-engineer-ios-at-dapper-labs), [Joey Harward profile](https://linkedin.com/in/joeyharward), [Tamara Zbitnaja profile](https://linkedin.com/in/tamarazbitnaja), [Jane Molodetskaya resume](https://janemolodetskaya.com/resume)
- Lendable, [Mobile Quality Engineer posting](https://careers.lendable.com/jobs/fdfee8a5-084d-4e01-887f-c9d169ea4e12-mobile-quality-engineer)
- Job postings that list mobile CI skills: [React Native Mobile Engineer (ReactCafe)](https://reactcafe.myjboard.io/jobs/743740213-react-native-mobile-engineer), [Senior React Native Engineer (Zeal)](https://zeal.breezy.hr/p/6593f941ae3e-senior-react-native-engineer-mobile-engineer)

Expo:

- Expo, [Pricing](https://expo.dev/pricing), [Expo Build introduction](https://docs.expo.dev/build/introduction/), [Trigger builds from CI](https://docs.expo.dev/build/building-on-ci/), [Build for app stores](https://docs.expo.dev/deploy/build-project/), [App variants](https://docs.expo.dev/build-reference/variants/), [Build limitations](https://docs.expo.dev/build-reference/limitations/), [Monorepos](https://docs.expo.dev/guides/monorepos/)
- Expo, [Submit to Google Play](https://docs.expo.dev/submit/android/), [Expo Update introduction](https://docs.expo.dev/eas-update/introduction/), [Runtime versions](https://docs.expo.dev/eas-update/runtime-versions/), [Migrate from CodePush](https://docs.expo.dev/eas-update/codepush/)
- Expo, [Workflows: get started](https://docs.expo.dev/eas/workflows/get-started/), [pre-packaged jobs](https://docs.expo.dev/eas/workflows/pre-packaged-jobs/), [limitations](https://docs.expo.dev/eas/workflows/limitations/), [E2E tests with Maestro](https://docs.expo.dev/eas/workflows/examples/e2e-tests/)
- Expo blog, [How to set up CI/CD for React Native apps with GitHub Actions and EAS Workflows](https://expo.dev/blog/how-to-integrate-eas-workflows-with-github-actions), [Best CI/CD for mobile apps in 2026](https://expo.dev/blog/best-ci-cd-for-mobile-apps) (vendor sources), [What to do without CodePush](https://expo.dev/blog/what-to-do-without-codepush)
- OutageDB, [Expo outage history](https://outagedb.com/status/expo/) (third-party monitor, read Nov 9, 2026 UTC)
- npm download counts from the npm API, week of Nov 1 to 7, 2026: `expo`, `eas-cli`.

Other build tools and OTA:

- Fastlane, [release history](https://releasealert.dev/github/fastlane/fastlane), [Open Collective news](https://opencollective.com/fastlane), [A history of fastlane](https://connortumbleson.com/2025/12/01/a-history-of-fastlane/), [Ruby Toolbox](https://www.ruby-toolbox.com/projects/fastlane)
- Bitrise, [CodePush alternatives in 2026](https://bitrise.io/blog/post/codepush-alternatives) (vendor source), Microsoft, [react-native-code-push (archived)](https://github.com/microsoft/react-native-code-push/blob/master/README.md)

Stores:

- Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (2.5.2), [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- Google, [App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en), [Play Console community: 12 testers requirement](https://support.google.com/googleplay/android-developer/community-guide/255621488/everything-about-the-12-testers-requirement?hl=en-gb), [onTest: personal vs organization account](https://ontest.app/blog/personal-vs-organization-google-play-account-12-testers) (third-party estimate)

Project:

- [Pack Draft development feature scope](../../scope/project_scope.md)
- [ADR-001: Use PostgreSQL as the primary database](./001-primary-database.md)
- [ADR-002: Use AWS as the cloud provider](./002-cloud-provider.md)
- [ADR-003: Use Node.js with TypeScript on ECS Fargate for the API](./003-api-runtime-and-compute.md)
- [ADR-004: Use Auth0 with browser sign-in for authentication](./004-auth-service.md)
- [ADR-005: Use Apple and Google in-app purchases through RevenueCat to sell credits](./005-payment-service.md)
- [ADR-006: Keep the notification inbox in Postgres and send push through the Expo Push Service](./006-app-notifications.md)
- [ADR-007: Use k6 for load testing](./007-load-testing-framework.md)
- [ADR-009: Testing framework](./009-testing-framework.md)
