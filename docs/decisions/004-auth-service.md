# ADR-004: Use Auth0 with browser sign-in for authentication

## Status

Proposed (pending client approval)

## Date

2026-11-08

## Context

[ADR-001](./001-primary-database.md) chose PostgreSQL, [ADR-002](./002-cloud-provider.md) chose AWS, and [ADR-003](./003-api-runtime-and-compute.md) chose a Fastify API on ECS Fargate. ADR-002 left this open: "Supabase Auth or a similar bundled service is still an option for the auth ADR." This ADR picks how users sign up, sign in, and prove who they are to the API.

What the [project scope](../../scope/project_scope.md) asks of accounts:

- **Sign up with email and password, Apple, or Google.** Verify the account. Reset a forgotten password.
- **Delete account.** Apple requires in-app deletion for apps that create accounts, and requires revoking Sign in with Apple tokens when the account is deleted (App Store guideline 5.1.1(v), TN3194).
- **Verification triggers referral rewards.** A free starter pack per account and referral packs give people a reason to create fake accounts. Auth is the first line of defense.
- **Real value behind the login.** Credits are bought with real money and collectibles are tradable. A stolen account loses money, so we want passkeys or MFA available, even if not forced at launch.
- **Profile data stays ours.** Username, avatar, favorite teams, and privacy settings live in our Postgres, not in the auth vendor.

What the platform asks of it:

- **iOS and Android apps.** The mobile framework is not decided (ADR-003 assumes React Native might be chosen).
- **Fastify API on AWS.** Every request carries a token the API must check.
- **Terraform and separate staging and production** (ADR-002).
- **Small team, no constant monitoring.** The same rule as ADR-003.

Out of scope: payments, notification delivery, the admin dashboard, and the mobile framework.

### How we scored the options

An earlier draft of this ADR ranked options by how streamlined sign-in feels, which favored Clerk's native screens. The client then dropped that requirement: control and maturity come first, and a redirect to a hosted login page is acceptable if the mature options need one. The order is now:

1. **Control.** Can we change the login flow, add our own checks, and keep the configuration as code?
2. **Maturity.** How established is it, and is there a contractual SLA path, compliance reports, and tooling?
3. **Feature list** against the scope.
4. **Time to build.**
5. Then cost, reliability record, and how hard it is to leave.

"Control" has three levels in this ADR:

- **We run the code** (Better Auth, our own). Most control, and we own every security patch.
- **Vendor-hosted, with code hooks and config as code** (Auth0, Cognito, Firebase, Supabase). We write code that runs inside the sign-in flow and manage settings in Terraform.
- **Vendor-hosted, settings and webhooks** (Clerk, as far as we checked). We did not check whether Clerk has hooks that run inside sign-in.

### What a redirect means for users

With browser sign-in, the app opens the system browser to a hosted login page and comes back with a token. Users see these things:

- **The iOS consent alert.** When an app uses `ASWebAuthenticationSession` with shared cookies, iOS shows ""App" Wants to Use "vendor.com" to Sign In". It appears on login and on logout. It is an OS feature and no SDK can hide it. The only way to avoid it is an ephemeral session, which turns off single sign-on ([Auth0 support](https://support.auth0.com/center/s/article/IOS-permission-popup-shows-during-login)). We have one app and no need for browser single sign-on.
- **A browser sheet** with the login page, not a native screen.
- **Apple and Google through a web page** instead of the phone's own native sheet.
- **Email links.** A verification or reset link opens the mail app's browser, outside our app.

Apple has no native sign-in SDK for Android. The [AWS](https://docs.aws.amazon.com/cognito/latest/developerguide/apple.html) and [Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple?platform=react-native) docs both say so. On Android, Sign in with Apple is a web flow in every option below.

We accept the redirect. The Decision section lists the cheap steps we still take, and the path to removing the browser later.

## How comparable products do it

We found little. No source names the auth vendor for Sorare, Kalshi, or DraftKings.

| Company         | What we found                                                                                                                                                  | Evidence                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **NBA Top Shot** | Sign up with Google, Apple ID, or email and password. Email accounts verify by email. A 6-digit code sent to a mobile phone secures the account. One account per collector. | NBA Top Shot support article                               |
| **Sorare**      | Operates its own OAuth provider ("Login with Sorare") for third parties. The vendor behind its own login is not confirmed.                                      | Sorare API repository                                      |
| **Kalshi, DraftKings** | Not confirmed.                                                                                                                                          | No source found.                                           |

Pattern: the one comparable we can see in detail offers the same three sign-up methods as our scope. It also asks for a phone code and limits one account per person, which is an abuse control we should discuss (see Open questions). Nothing here shows what they would pick today.

## Options Considered

Prices are US list prices on 2026-11-08. "Users" means monthly active users, except Clerk, which bills monthly retained users (a user who comes back at least a day after signing up). Clerk's count is never higher than a plain MAU count, so the Clerk numbers are an upper bound against the others. Build effort figures are our estimates, not measurements.

### Option A: Auth0

Pros:

- **Control.** Actions (custom code that runs in the login and registration flow) and Forms: 5 on Free, 10 on Essentials, 15 on Professional. Event Streams send user events to our API. A Management API, an official Terraform provider (`auth0/auth0`, v1.60.0), and a custom domain. Professional adds custom database connections, so logins can check against our own user table.
- **Maturity.** Established vendor with compliance certifications on every plan and a 99.99% SLA on Enterprise.
- **Features in the scope.** Email and password, Apple, Google, passwordless codes, passkeys, and unlimited social connections on every plan, including Free. Essentials adds MFA, account linking, roles, email workflow, and log streaming.
- **Free plan covers 25,000 users,** with one custom domain (credit card verification required).
- **A way to remove the browser later.** Apple on iOS and Google on Android can be exchanged for Auth0 tokens without a browser (native social login), and passkey APIs work in the app. That is optional work on the same vendor.
- SDKs for Swift, Android, React Native, and Flutter (we saw documentation for each).

Cons:

- **The default is a browser redirect.** Universal Login opens `ASWebAuthenticationSession` or a Custom Tab. On iOS the consent alert shows unless we use an ephemeral session and give up browser single sign-on. Auth0's docs say fully in-app login means we ship app updates whenever login features change.
- **Steep, stepped pricing.** Free ends at 25,000 users, and the next published tier is 30,000 at $2,100 per month. Essentials is $700 per month at 10,000 users and $3,500 at 50,000. Above 50,000 it is a custom quote. Billing uses the next tier up when usage falls between tiers.
- **Free plan gaps.** No signup and login customization, no email workflow (we read this as no custom email templates), no account linking, no role management, no MFA, one tenant, and 1 day of log retention. Account linking matters when one person signs in with Apple and later with the same email.
- **Tenants.** The pricing page lists 1 tenant on Free and 3 on Essentials. Staging and production need separate tenants (ADR-002 separates the accounts).
- **Some security features sit higher.** Breached-password detection is Professional. Bot Detection is an Enterprise add-on. Long-lived sessions are Enterprise.
- Auth0's status history shows login incidents this year (for example Jul 24 and Nov 4). We did not compare incident counts across vendors.

Build effort: **3 to 5 days** with Universal Login. **8 to 12 days** if we later add in-app screens.

### Option B: Amazon Cognito

Pros:

- Same AWS account as everything else. One bill, Terraform through `hashicorp/aws`, no new vendor.
- Lambda triggers let us run code in the sign-in flow.
- Essentials tier has 10,000 free users, then $0.015 per user. Managed login has a visual branding editor, with passkeys and email codes.
- 99.9% SLA on Lite and Essentials. 99.99% on Plus.

Cons:

- **Apple and Google can only use the browser.** A user pool cannot sign in federated users through its normal API calls. Social sign-in goes through the authorize endpoint, a redirect. Native Apple or Google tokens only work with Cognito identity pools, which return AWS credentials and not user pool tokens. An Amplify issue from 2023 asks for native social sign-in with user pools, and we found no fix. Unlike Auth0, there is no path to remove the browser for social sign-in.
- The October 2025 us-east-1 outage caused Cognito sign-in errors. Our API is in the same region, so a regional outage takes both down.
- Threat protection (compromised passwords, adaptive checks) needs Plus at $0.02 per user with no free tier.
- Lite is cheaper but has the classic hosted UI only, with no passkeys or email codes.

It is the cheap, mature alternative to Auth0: $0 at 10,000 users and $600 at 50,000, against $700 and $3,500.

Build effort: **5 to 8 days.**

### Option C: Clerk (hosted, native screens)

Pros:

- **Prebuilt native sign-in screens.** `AuthView` is SwiftUI on iOS and Jetpack Compose on Android. For Expo, native components render the same way (beta). Sign-in, Apple, Google, email verification, password reset, MFA, passkeys, and biometrics all happen in the app. Nothing opens a browser.
- **Code-based email verification.** Clerk emails a 6-digit code, so the user stays in the app.
- **Fastify support.** `@clerk/fastify` verifies webhooks. Session tokens can be checked without calling Clerk by passing the instance's public key (`jwtKey`).
- **Cheap at launch.** Pro is $25 per month ($20 billed annually) and includes 50,000 retained users.
- Abuse tools: brute-force prevention and basic bot checks on every plan, user bans and blocklists on Pro.
- Every plan has unlimited applications and 50,000 retained users per application.

Cons:

- **Reliability record in 2026.** Three outages: DNS provider failure on Feb 10 (authoritative DNS down 2 h 32 min), a database query-plan flip on Feb 19 (about 90 min, over 95% of requests returned 429), and a failed Google Cloud SQL live migration on Mar 10 (about 25 min). Clerk's pricing page lists a 99.99% SLA on Enterprise only.
- **Short-lived sessions.** The session token is a 60-second JWT that the app refreshes from Clerk, so signed-in users depend on Clerk being reachable.
- **Terraform is community-only.** We found `vanillauys/clerk` (pre-1.0, breaking changes allowed in minor versions) and `buildwithdeck/clerk`. The first cannot detect dashboard drift on most settings.
- **Less control** as far as we checked: settings, JWT templates, and webhooks.
- **Expo native components are beta.** Hobby is free but keeps Clerk branding and fixes sessions at 7 days, so production needs Pro.
- **Cost grows with every user:** about $1,025 per month at 100,000 retained users and $8,225 at 500,000.
- We verified Swift, Kotlin, and Expo only. We did not check Flutter.

Clerk is the faster and cheaper option to build and run. It is the best choice if the streamlined native flow comes back as a requirement.

Build effort: **3 to 5 days.**

### Option D: Firebase Authentication on Google Identity Platform

Pros:

- Native flows. Apple, Google, and email sign-in happen in the app with no browser.
- Free up to 50,000 users, then $0.0055 per user to 100,000 and $0.0046 up to 1,000,000.
- Terraform through `google_identity_platform_config` in `hashicorp/google`. Blocking functions can run our checks before sign-in.

Cons:

- **Second cloud.** A Google Cloud project, billing account, and IAM just for sign-in. ADR-002 picked AWS because one vendor covers the backend.
- **Email links, not codes.** Mobile links use Firebase Hosting and app links, and Firebase Dynamic Links was shut down on August 25, 2025. We found no email-code option in the docs we checked.
- We build every screen. We did not check SLA terms or incident history.

Build effort: **6 to 9 days.**

### Option E: Supabase Auth (auth only)

Pros:

- Cheapest hosted option at scale. Pro is $25 per month with 100,000 users included, then $0.00325 per user.
- Native Apple and Google through `signInWithIdToken`. Email codes work. An official Terraform provider can set auth settings.

Cons:

- **A whole project for auth.** The app database stays on RDS (ADR-002), so account data lives in two places.
- **Custom email is required.** The built-in email service sends only to team addresses and 2 emails per hour.
- No uptime SLA below Enterprise. SOC 2 reports start at Team ($599 per month).
- We build every screen.

Build effort: **6 to 9 days.**

### Option F: Better Auth (open-source library inside our API)

Pros:

- The most control among the practical options, with no per-user fee. It runs inside the Fastify API and stores users in our RDS, so a referral reward and a verification can share one transaction.
- MIT license, TypeScript, Expo plugin, native Apple and Google through ID tokens, email codes, and passkeys. A venture-backed company maintains it.

Cons:

- **Security patch load.** On Nov 3, 2026 it shipped fixes for 12 security advisories, one critical in the Expo plugin (an authorization proxy that can sign values it did not issue), plus a high-severity flaw that lets phone numbers be claimed before they are verified, and a passkey check that did not enforce origin or user verification. The 1.7.7 release in September fixed a critical Magic Link account takeover. Fast patching becomes our job.
- The 1.7 upgrade needs schema changes and coordinated package updates.
- We own email delivery, rate limits, bot defense, account linking rules, and deletion. An auth bug is an API incident, and our on-call carries it.
- We build every screen.

Build effort: **10 to 15 days,** plus ongoing patch time.

### Option G: Build our own

Pros:

- Full control. No vendor. No per-user cost.

Cons:

- We would write password hashing, sessions and refresh rotation, Apple and Google token checks, email codes, reset, account linking, rate limiting, breach checks, deletion, and Apple token revocation. Every item is a place for a security bug. Better Auth already covers most of this and still shipped 12 advisories in one release.
- Slowest and riskiest. Nothing in the scope needs this.

Build effort: **25 to 40 days.**

### Not evaluated in depth

- **WorkOS AuthKit.** Free to 1 million users, custom domain $99 per month. Its new iOS and Android SDKs (the Android one is at 0.2.1) open the sign-in page in a browser with PKCE. Its strength is enterprise single sign-on, which the scope does not ask for.
- **Self-hosted identity servers (Keycloak, Ory, FusionAuth).** Another service to run, patch, and page for. That conflicts with ADR-003's "no constant monitoring" rule.
- **Stytch, Descope, Frontegg.** Not researched.

## Comparison

### Control, maturity, and features

| Capability                          | A. Auth0                                          | B. Cognito                              | C. Clerk                                   | D. Firebase / IdP                | E. Supabase                      | F. Better Auth                  | G. Our own |
| ----------------------------------- | ------------------------------------------------- | --------------------------------------- | ------------------------------------------ | -------------------------------- | -------------------------------- | ------------------------------- | ---------- |
| Control level                       | Hooks (Actions, Forms), config as code            | Hooks (Lambda triggers), config as code | Settings and webhooks (hooks unchecked)    | Hooks (blocking functions)       | Hooks and settings               | We run the code                 | We run the code |
| Terraform                           | Official                                          | `hashicorp/aws`                         | Community, pre-1.0                         | `hashicorp/google`               | Official                         | Not applicable (code)           | Not applicable |
| SLA                                 | Enterprise only (99.99%)                          | 99.9% (Lite, Essentials), 99.99% (Plus) | Enterprise only (99.99%)                   | Not checked                      | None below Enterprise            | Ours                            | Ours       |
| Apple and Google without a browser  | Yes, via token exchange (extra work)              | No                                      | Yes                                        | Yes                              | Yes                              | Yes                             | Yes        |
| Email code instead of link          | Passwordless codes (all plans)                    | Yes (Essentials and up)                 | Yes                                        | No (link)                        | Yes                              | Yes                             | We build   |
| Passkeys                            | All plans                                         | Essentials and up                       | Pro                                        | Not checked                      | Not checked                      | Plugin                          | We build   |
| Abuse controls                      | Brute force and IP throttling; Bot Detection is Enterprise add-on | Threat protection on Plus only | Brute force, basic bot checks; bans and blocklist on Pro | Blocking functions | Rate limits | Rate limits, CAPTCHA plugin | We build |
| Second vendor or cloud              | Yes                                               | No                                      | Yes                                        | Yes (GCP)                        | Yes                              | No                              | No         |

### Where a browser appears

| Option         | Apple and Google on iOS                | Google on Android | Apple on Android | Email verify and reset |
| -------------- | -------------------------------------- | ----------------- | ---------------- | ---------------------- |
| A. Auth0       | Browser by default; native possible    | Browser by default; native possible | Browser | Link by default (Universal Login) |
| B. Cognito     | Browser always                         | Browser always    | Browser          | Native with SDK, or browser |
| C. Clerk       | Native sheet                           | Native            | Web (no Android SDK from Apple; Clerk presentation unchecked) | Code in app |
| D. Firebase    | Native sheet                           | Native            | Web              | Link (Hosting domain)  |
| E. Supabase    | Native sheet                           | Native            | Web              | Code (needs SMTP)      |
| F. Better Auth | Native sheet                           | Native            | Web              | Code                   |
| G. Our own     | Native sheet                           | Native            | Web              | We build               |

### Build effort

Our estimates, in engineer-days. They cover sign up, sign in, Apple, Google, verification, reset, sign out, account deletion, token check in the API, and staging plus production setup. They exclude profile screens and referral logic.

| Option                                       | Days      |
| -------------------------------------------- | --------- |
| A. Auth0 (Universal Login)                   | 3 to 5    |
| A. Auth0 (later, in-app screens)             | 8 to 12   |
| B. Cognito                                   | 5 to 8    |
| C. Clerk (native screens)                    | 3 to 5    |
| D. Firebase / Identity Platform              | 6 to 9    |
| E. Supabase Auth                             | 6 to 9    |
| F. Better Auth                               | 10 to 15  |
| G. Our own                                   | 25 to 40  |

### Monthly cost

Auth service only. Excludes email sending (SES is $0.10 per 1,000 emails à la carte, $0.16 on the Essentials plan new accounts start on) and SMS.

| Users per month | A. Auth0 (B2C)                  | B. Cognito Essentials | C. Clerk Pro | D. Identity Platform | E. Supabase Pro | F / G. Own code |
| --------------- | ------------------------------- | --------------------- | ------------ | -------------------- | --------------- | --------------- |
| 10,000          | $0 (Free) or $700 (Essentials)  | $0                    | $25          | $0                   | $25             | $0              |
| 50,000          | $3,500 (Essentials)             | $600                  | $25          | $0                   | $25             | $0              |
| 100,000         | Custom quote                    | $1,350                | $1,025       | $275                 | $25             | $0              |
| 500,000         | Custom quote                    | $7,350                | $8,225       | $2,115               | $1,325          | $0              |

Auth0 B2C base price by users (Essentials and Professional; Free covers up to 25,000):

| Users  | Essentials | Professional |
| ------ | ---------- | ------------ |
| 500    | $35        | $240         |
| 1,000  | $70        | $240         |
| 2,500  | $175       | $545         |
| 5,000  | $350       | $1,000       |
| 7,500  | $525       | $1,200       |
| 10,000 | $700       | $1,600       |
| 20,000 | $1,400     | $3,200       |
| 30,000 | $2,100     | Contact us   |
| 50,000 | $3,500     | Not available |

Reading the tables:

- **Auth0 is the most expensive managed option per user.** At 50,000 users it costs $3,500 per month, against $600 on Cognito and $25 on Clerk. That is the price of the control and maturity the client chose.
- **The free tier has a cliff.** At 25,000 users the cost goes from $0 to $2,100 (the 30,000 tier). Plan for it before we reach about 20,000.
- **The Free plan is probably not enough for production.** No MFA, no account linking, no custom email templates, no log streaming, 1-day logs. If a spike confirms that, production starts on Essentials at $35 to $700 per month depending on the user tier.
- Cognito and Clerk scale smoothly instead of in steps: Cognito charges $0.015 per user above 10,000, and Clerk charges about a cent per retained user above 50,000.
- Firebase and Supabase are the cheapest managed options at scale, and we would pay for that in build time and a second vendor.

## Decision

We choose **Auth0**, using **Universal Login** (the hosted login page, opened in the system browser), with production on the **Essentials plan** unless the setup spike shows the Free plan's gaps are acceptable.

We accept the redirect. The client chose control and maturity over a streamlined flow.

Why Auth0:

1. **Control without running the code.** Actions and Forms run inside the login and registration flow. Event Streams, the Management API, and an official Terraform provider cover automation and config as code. Better Auth and our own code give more control, but then every security patch and abuse defense is ours. Better Auth shipped 12 advisories in one release, one critical.
2. **Maturity.** An established vendor with certifications on every plan and an SLA path. Clerk had three outages in early 2026 and has no SLA below Enterprise.
3. **The scope's features are available.** Email and password, Apple, Google, passwordless codes, and passkeys on every plan. MFA, account linking, and roles on Essentials.
4. **The browser is not permanent.** Native social login for Apple (iOS) and Google (Android), and passkey APIs, can remove the redirect for the common paths later (about 8 to 12 days). Cognito cannot do this for social sign-in with user pools.
5. **Three to five days to build** with Universal Login.

Why not the others:

- **Cognito.** The strongest alternative, and much cheaper ($600 against $3,500 at 50,000 users). It also has Lambda triggers, Terraform, and a 99.9% SLA, in our own cloud. We chose Auth0 because Cognito can never remove the browser for Apple and Google sign-in, and because Auth0's Actions, Forms, and Event Streams give more room to change the flow. If cost becomes the main concern, Cognito is the first place to look.
- **Clerk.** The fastest and cheapest to build, with the best user flow. We give that up for control (hooks, official Terraform) and the reliability and SLA record. If the client brings back the streamlined-flow requirement, Clerk is the answer.
- **Firebase and Supabase.** Native flows and the lowest cost at scale, but we build every screen and email flow, and we add a second vendor. Supabase also adds a second Postgres that holds accounts.
- **Better Auth and our own.** Highest control, but the patching and abuse defense become our job.

We accept these risks:

- **Cost steps.** The $0 to $2,100 cliff at 25,000 users, and $3,500 at 50,000. We set review triggers below.
- **Redirect.** Users see a browser sheet. On iOS they see the consent alert unless we use an ephemeral session.
- **Free plan limits.** Plan on Essentials for production.
- **Sessions.** Long-lived sessions are an Enterprise feature. We must check how long a refresh token can live on Essentials, because the app is opened daily.

What we still do to keep the redirect tidy (low cost, high value):

- Use a **custom domain** (for example `login.<our domain>`) so users see our name, not `auth0.com`. Set it up before any user signs in, so the API only ever sees one token issuer.
- **Brand the login page** with our logo, colors, and fonts. Free has a configurable login experience. Essentials adds signup and login customization and email workflow.
- Use the **system browser session** (`ASWebAuthenticationSession`, Custom Tabs). Never an embedded web view.
- On iOS, **use an ephemeral session** to remove the consent alert, since we have no use for browser single sign-on. Check in the spike that the password manager still fills the login form.
- Use **refresh tokens with rotation** and store them in the Keychain and Keystore through the Auth0 SDK, so users see the browser once, not on every launch.
- Use **Universal Links (iOS 17.4 and later) and App Links** for the return to the app, so the callback is clean.

## Consequences

- **Plan and tenants.** Production on Essentials. Staging and production are separate tenants. The pricing page lists 1 tenant on Free and 3 on Essentials, so confirm in the spike how many tenants we get and what staging costs. Expected launch cost is $35 to $700 per month depending on the user tier.
- **Mobile.** Use Auth0's SDKs (Auth0.swift, Auth0.Android, `react-native-auth0`, or `auth0_flutter`, depending on the framework decision). Authorization Code flow with PKCE, which the SDKs do. The mobile framework is no longer a blocker for this ADR.
- **Email.** Auth0's default verification and reset emails are links that open in the browser. Decide in the spike between links and passwordless email codes. Configure SES as the email provider, and confirm Auth0's built-in sender is test-only before launch.
- **API.** Verify access tokens against Auth0's JWKS with a standard library (for example `jose`), with the audience set to our API identifier and the issuer set to our custom domain. Cache the keys.
- **Our own identity table.** Create `users` with our own UUID and `auth_identities (provider, subject)` linking to the Auth0 `sub`. Foreign keys everywhere else point at our UUID, never at the Auth0 ID. This keeps a later move to another provider from touching the ledger.
- **Events.** A post-registration Action or an Event Stream tells our API when a user is created or verified. Handlers must be idempotent and tolerate duplicates and out-of-order events (ADR-003 requirement). The referral reward is granted only after our server confirms `email_verified`.
- **Account deletion.** In-app flow, with re-authentication. Our API deletes or anonymizes data (ledger rows we must keep stay, anonymized), then calls the Auth0 Management API to delete the user. Cache the Management API token (Free and Essentials include 1,000 machine-to-machine tokens per month). Sign in with Apple needs a token revocation call (`appleid.apple.com/auth/revoke`). Verify in the spike how to get the Apple refresh token when Auth0 handles the Apple exchange.
- **Abuse.** Brute-force protection and suspicious-IP throttling are included. Bot Detection is an Enterprise add-on and breached-password detection is Professional. Use an Action to block disposable email domains. Apple, Google, and passkeys reduce password risk. Whether to add phone verification or device attestation is a separate decision (see Open questions).
- **Logs.** Free keeps logs for 1 day. Essentials keeps 5 days and allows 1 log stream. Stream Auth0 logs to CloudWatch or S3 so we can investigate fraud.
- **Account linking.** Not on Free. On Essentials, decide the rule for the same email arriving through Apple, Google, and password. Apple "Hide My Email" gives a different address, so those accounts will not link by email.
- **Terraform.** Use `auth0/auth0` for each tenant: applications, API, connections, actions, custom domain, and email provider. Keep secrets (client secrets, Apple and Google keys) in AWS Secrets Manager and inject them into ECS (ADR-003).
- **Monitoring.** Subscribe to the Auth0 status page. Add a synthetic login check to the paging list from ADR-003. Auth0's history shows login incidents on Jul 24 and Nov 4.
- **Load test.** Auth0 enforces rate limits. We did not check the limits for a pack-drop login spike, and native social login has its own limits. Check them before the load-test ADR runs a sign-in burst.
- **Run the spike first.** Before approval is final, build sign-in on a test device and check: tenant count and cost, iOS ephemeral session with password autofill, refresh token lifetime on Essentials, email code or link for verification, Apple token revocation, and Apple on Android.
- **Review triggers.** Revisit this decision if: users approach 20,000 (the free-tier cliff), the monthly bill passes a ceiling the client sets (Cognito is the cheaper mature option), users approach 50,000 (custom quote), the client brings back a streamlined-flow requirement (Clerk, or Auth0 native login), or an Auth0 incident lasts more than an hour.
- **Exit plan.** Export users on a schedule. We did not check whether Auth0 can export password hashes. Verify before launch, because it decides whether a later move forces password resets. Passkeys, codes, and Apple and Google sign-in reduce that cost.

### Open questions for the client

- **Budget ceiling and expected users.** The cost steps are large. We need a forecast of monthly users at launch and after 12 months.
- **Apple on Android.** Show Sign in with Apple on Android (a web flow), or offer Google and email only. App Store rules apply on iOS, so the scope's list works there either way.
- **One account per person.** NBA Top Shot asks for a phone code and limits one account per collector. Starter packs and referral rewards may need the same. Auth0 has no included SMS verification in what we read, so this needs its own answer.
- **Passkeys or MFA.** Offer at launch, or required before purchases and offers? MFA is an Essentials feature.
- **SLA expectation.** If the client needs a contractual uptime number, we need Auth0 Enterprise or another option.
- **Native login later.** Whether the 8 to 12 days for native Apple and Google sign-in are worth funding after launch, based on what users say about the browser sheet.

## Sources

Comparable products:

- NBA Top Shot, [Start Your Collection (Opening Your Account)](https://support.nbatopshot.com/hc/en-us/articles/4404371846291-Start-Your-Collection-Opening-Your-Account)
- Sorare, [API repository (OAuth and Login with Sorare)](https://github.com/sorare/api/)

Auth0:

- Auth0, [Pricing](https://auth0.com/pricing), [Native login](https://auth0.com/docs/authenticate/login/native-login), [Token exchange for native social](https://auth0.com/docs/api/authentication/token-exchange-for-native-social/token-exchange-native-social), [Sign in with Apple for native iOS](https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/apple-native), [Sign in with Google for native Android](https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/google-native), [Flutter quickstart](https://auth0.generaltranslation.app/docs/quickstart/native/flutter/interactive)
- Auth0 support, [iOS permission popup during login](https://support.auth0.com/center/s/article/IOS-permission-popup-shows-during-login), [system alert during logout](https://support.auth0.com/center/s/article/system-alert-during-logout-when-using-non-ephemeral-sessions-in-ios-swift-sdk), [Native Apple sign-in in React Native](https://support.auth0.com/center/s/article/Implement-Native-Apple-Sign-In-with-Auth0-in-React-Native), [Auth0.swift browser providers](https://deepwiki.com/auth0/Auth0.swift/2.1.1-browser-providers), [`react-native-auth0` iOS dialog issue](https://github.com/auth0/react-native-auth0/issues/425)
- [Auth0 status history](https://status.auth0.com/incidents), [StatusGator Auth0 history](https://statusgator.com/services/auth0)
- [`auth0/auth0` Terraform provider](https://registry.terraform.io/providers/auth0/auth0/latest)

Amazon Cognito:

- AWS, [Cognito pricing](https://aws.amazon.com/cognito/pricing/), [Managed login](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html), [Branding editor](https://docs.aws.amazon.com/cognito/latest/developerguide/managed-login-brandingeditor.html), [Third-party sign-in](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation.html), [Sign in with Apple (identity pools)](https://docs.aws.amazon.com/cognito/latest/developerguide/apple.html), [Authentication flows and passkeys](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html)
- Amplify, [Social sign-in for React Native](https://docs.amplify.aws/gen1/react-native/build-a-backend/auth/add-social-provider/), [Native social sign-in with user pools (issue #4579)](https://github.com/aws-amplify/aws-sdk-ios/issues/4579)
- AWS, [Oct 2025 us-east-1 event summary](https://aws.amazon.com/message/101925/), [Currents.dev report on Cognito impact](https://currents.dev/posts/us-east-1-incident)

Clerk:

- Clerk, [Pricing](https://clerk.com/pricing), [Status](https://status.clerk.com/)
- Clerk, [Expo native components (beta)](https://clerk.com/docs/reference/expo/native-components/overview), [Expo AuthView](https://clerk.com/docs/reference/expo/native-components/auth-view), [iOS AuthView](https://clerk.com/docs/ios/reference/views/authentication/auth-view), [Android AuthView](https://clerk.com/docs/android/reference/views/authentication/auth-view), [iOS quickstart](https://clerk.com/docs/ios/getting-started/quickstart.md?manual=1)
- Clerk, [Webhooks overview](https://clerk.com/docs/guides/development/webhooks/overview), [`verifyToken()`](https://clerk.com/docs/reference/backend/verify-token), [Handling session expiry in React Native](https://clerk.com/articles/how-to-handle-session-expiry-in-a-react-native-app-with-clerk)
- Clerk postmortems: [DNS provider outage, Feb 10, 2026](https://clerk.com/blog/2026-02-10-dns-outage-postmortem), [System outage, Feb 19, 2026](https://clerk.com/blog/2026-02-19-system-outage-postmortem), [System outage, Mar 10, 2026](https://clerk.com/blog/2026-03-10-service-outage-postmortem)
- Terraform (community): [`vanillauys/clerk`](https://registry.terraform.io/providers/vanillauys/clerk/latest/docs/guides/dev-and-prod-instances), [`buildwithdeck/terraform-provider-clerk`](https://github.com/buildwithdeck/terraform-provider-clerk)

Firebase and Supabase:

- Google Cloud, [Identity Platform pricing](https://cloud.google.com/identity-platform/pricing)
- Firebase, [Email link sign-in (web)](https://firebase.google.com/docs/auth/web/email-link-auth), [Dynamic Links migration (iOS)](https://firebase.google.com/docs/auth/ios/email-link-migration), [React Native Firebase email link](https://rnfirebase.io/auth/email-link-auth)
- Supabase, [Monthly active users pricing](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users), [Sign in with Apple](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple?platform=react-native), [Sign in with Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google?platform=react-native), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- Terraform: [`google_identity_platform_config`](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/identity_platform_config), [`supabase_settings`](https://registry.terraform.io/providers/supabase/supabase/latest/docs/resources/settings)

Better Auth and others:

- Better Auth, [Expo integration](https://better-auth.com/docs/integrations/expo), [Google](https://better-auth.com/docs/authentication/google), [Changelog](https://better-auth.com/changelog), [1.7 upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide), [Security release, Nov 3, 2026](https://better-auth.com/blog/security-release-2026-11-03), [Seed round](https://better-auth.com/blog/seed-round), [Snyk package page](https://security.snyk.io/package/npm/better-auth)
- SoarStarter, [Native authentication with Better Auth](https://soarstarter.com/docs/next/app-api/native-auth)
- WorkOS, [Pricing](https://workos.com/pricing), [iOS SDK](https://workos.com/docs/sdks/ios), [Android SDK](https://workos.com/docs/sdks/android)
- AWS, [SES pricing](https://aws.amazon.com/ses/pricing/)

Apple:

- Apple, [Guideline 5.1.1(v): account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/), [TN3194: account deletions and token revocation](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple.md), [Token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens)

Project:

- [Pack Draft development feature scope](../../scope/project_scope.md)
- [ADR-001: Use PostgreSQL as the primary database](./001-primary-database.md)
- [ADR-002: Use AWS as the cloud provider](./002-cloud-provider.md)
- [ADR-003: Use Node.js with TypeScript on ECS Fargate for the API](./003-api-runtime-and-compute.md)
