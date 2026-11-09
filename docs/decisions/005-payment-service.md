# ADR-005: Use Apple and Google in-app purchases through RevenueCat to sell credits

## Status

Proposed (pending client approval)

## Date

2026-11-08

## Context

[ADR-001](./001-primary-database.md) chose PostgreSQL, [ADR-003](./003-api-runtime-and-compute.md) chose a Fastify API on ECS Fargate, and [ADR-004](./004-auth-service.md) chose Auth0. This ADR picks how a user pays real money for credits.

What the [project scope](../../scope/project_scope.md) asks of payments:

- **One job: sell credits.** "Single currency at launch: credits (primary revenue: buying credits with real money)." Packs and bundles can be bought with real money or credits. Pricing and bundle amounts are TBD.
- **Credits are a closed loop.** They are not withdrawable as cash, and cash prizes are out of scope. Credits move between users only inside offers and sales, and that is an entry in our own ledger. The payment service never moves money between users, so payouts, Stripe Connect-style onboarding, and user identity checks for payouts are not needed.
- **Wallet and history.** Spendable credits and credits held in offers are shown separately. History lists purchases, rewards, entry fees, sales, trades, refunds, and offer holds and releases.
- **Server-side validation and idempotent retries.** "No duplicate credits/assets/charges/awards." This is the same rule as ADR-003.
- **Limited drops.** Stock and per-account limits must be correct under high concurrent demand.
- **Refunds exist.** The history list names refunds, and cancelled contests refund entry fees. A refund from a payment provider is a different thing, and it needs its own rule (see Consequences).

What the platform asks of it:

- **iOS and Android apps.** The mobile framework is not decided.
- **Our ledger is the source of truth.** Credits are `bigint` integers in Postgres (ADR-003). Whatever takes the money must feed that ledger and not replace it.
- **Small team, no constant monitoring.** The same rule as ADR-003.

Out of scope: pricing and bundle amounts, notification delivery, and the legal review of contests (flagged in Open questions).

### How we scored the options

In the order the client gave:

1. **Security.** How little card and account risk we carry, and how hard it is to get free credits.
2. **Ease of use.** For the user at checkout, and for our developers.
3. **No redirects.** The purchase happens in a native sheet inside the app. No browser, no web page, no card form we draw.
4. **Mature APIs.** Documented, versioned, signed events, official libraries, and a record of use at scale.
5. **Credits only.** No user-to-user money features.
6. Then cost, build time, and how hard it is to leave.

### The rule that decides this

Apple's guideline 3.1.1 says in-game currencies must be sold with in-app purchase. In the US storefront, Apple lets apps add buttons and links to a website checkout, with no commission today. The sources we read say the same credits must still be sold through in-app purchase as well. Outside the US storefront, links to other payment methods are not allowed.

Stripe's own documentation draws the same line:

- **iOS.** For digital goods, the Stripe Payment Sheet cannot be used. Stripe tells developers to send the customer to a Stripe-hosted checkout page in the external browser, and return with a Universal Link.
- **Android.** In the US, Stripe's in-app Payment Sheet is allowed for digital goods.

So on iOS, the only way to meet "no redirects" is Apple's own in-app purchase sheet. On Android it is Google Play Billing, or Stripe on US users only.

## How comparable products do it

| Company | What we found | Evidence |
| ------- | ------------- | -------- |
| **NBA Top Shot** | Packs are bought in the app with in-app purchase on iPhone (Apple ID payment method) and Android (Google Play). Purchases in the app cannot use the Dapper balance. | NBA Top Shot support article |
| **Sorare** | The iOS app lists in-app purchases ("Instant Buy" products from $1.09 to $11.90). | Sorare App Store listing |
| **Topps Digital** | Offers "Web Pay" next to the store checkout. It opens a browser checkout, and the item is added after the user returns. | Topps Digital support article |
| **Fanatics Collect** | Cards, Apple Pay, Google Pay, and bank transfer. It sells physical collectibles, so the in-app purchase rules do not apply to it. | Fanatics Collect payment methods |
| **Kalshi, DraftKings** | Not comparable. They are licensed real-money products. | Not researched |

Pattern: the two closest comparables use the store's in-app purchase. The one that offers a browser checkout offers it as a second option.

Source quality note: all of this comes from public help pages and store listings. We found nothing about their fees, volumes, or refund handling.

## Options Considered

Prices are US list prices on 2026-11-08. Store fees are the 2026 rates on the official pages. Build effort figures are our estimates.

### Option A: Native store purchases through RevenueCat, with our ledger as the source of truth

The app uses the RevenueCat SDK, which calls StoreKit and Google Play Billing. RevenueCat validates each purchase with the store and sends our API a webhook. Our API writes the ledger entry.

Pros:

- **Meets "no redirects."** The user sees Apple's or Google's own purchase sheet, with Face ID or the Play authentication. We draw no card form.
- **Security.** No card data touches our systems. Apple and Google are the merchant of record, so they handle card fraud checks, sales tax and VAT, and chargebacks. Purchases are checked with the store, not trusted from the phone.
- **Handles the awkward parts of mobile purchases.** Pending and "Ask to Buy" states, interrupted purchases, and finishing or acknowledging transactions. Google refunds a purchase that is not acknowledged within three days.
- **One webhook for both stores.** `NON_RENEWING_PURCHASE` for a consumable credit purchase, with `transaction_id`, `product_id`, `app_user_id`, `store`, and `environment`. A refund arrives as a `CANCELLATION` event.
- **Webhook basics are there.** An `Authorization` header we set, optional HMAC signing, a stable event `id` for deduplication, and five retries over about 80 minutes.
- **Free until $2,500 in monthly tracked revenue,** then 1%. Consumables and virtual currency are included.
- **Subscriptions later cost nothing extra.** The scope has none, but the same tool covers them.
- **Public record of handling outages.** RevenueCat's "Fortress" issues temporary entitlements and replays transactions when its API is down. It reports it was used on May 7, 2026, with no transactions lost.

Cons:

- **One more vendor in the purchase path.** A third-party monitor lists 44 RevenueCat incidents in the last 365 days. Many are not about purchases, but some are: delayed Google purchase events on Oct 29 (2 h 35 min), delayed webhooks on Aug 7 (3 h 7 min), and Apple connection problems on Jul 26 (10 h 44 min, purchases replayed). Our reconcile job covers this (see Consequences).
- **Webhook delivery stops after about 80 minutes of failures.** A longer outage on our side needs a way to catch up.
- **We cannot use its virtual currency feature as the ledger.** It is in public beta. It floors balances at zero ("negative balances are not supported"), and it has no concept of credits held in offers. Spending needs a separate Developer API, and API adjustments do not send webhooks. We use it only to validate purchases.
- **Partial refunds on Google Play are not reflected.** RevenueCat treats a partly refunded purchase as fully paid.
- **1% of tracked revenue.** About $10,000 a year at $1M in sales (an upper bound, if the 1% applies to all revenue).
- **Store fees are high** (see the fee table).
- **Does not answer all of Apple's refund process for us** (unverified): when a customer asks Apple for a refund, Apple sends a consumption request that must be answered within 12 hours. We did not confirm that RevenueCat answers it for consumables.

Build effort: **4 to 6 days,** including the ledger entry, webhook handler, reconcile job, and refund handling. Excluding store account setup and pack-reservation logic.

### Option B: Native store purchases directly, no middle layer

StoreKit 2 and Google Play Billing in the app. Our API calls the App Store Server API and the Google Play Developer API and receives their notifications.

Pros:

- **Fewest parties.** Only Apple, Google, and us. No 1% fee and no third-party outage.
- **Mature, official APIs.** Apple's App Store Server Notifications V2 are signed (JWS), retry five times over about a week in production, and can be replayed with Get Notification History. Apple publishes official server libraries (Node, Swift, Python, Java). Google's side is RTDN over Pub/Sub plus `purchases.products` and `productsv2` calls, and it has a Voided Purchases API.
- **Full refund control.** We answer Apple's consumption requests and review Google's chargeback requests ourselves.
- **Same transaction IDs as Option A.** Moving from A to B later does not change the ledger.

Cons:

- **Two integrations to build and keep correct.** JWS certificate chain checks, Pub/Sub, the three-day Google acknowledgement limit, pending states, sandbox and production separation, and refund and chargeback handling on both sides.
- **No SDK for the awkward client states.** The mobile framework is undecided, and React Native or Flutter would need a purchase library on top of StoreKit and Play Billing. We did not evaluate those.
- **More surface to get wrong in the part of the system that creates money.**

Build effort: **12 to 18 days.**

### Option C: Another purchase wrapper (Adapty, Qonversion, Apphud)

Same idea as Option A, from a different vendor.

Pros:

- **Lower published prices.** Qonversion is free under $7K a month, then 0.8% of all tracked revenue, with webhooks included. Adapty is free under $5K, then 1%. Apphud is free under $10K, then 0.99% (webhooks need its Expert plan at 1.19%).
- Qonversion lists a "Refund Keeper" feature, and its webhooks carry an event `id` for deduplication.

Cons:

- **We did not evaluate them in depth.** We did not check consumable handling, SDK coverage for the undecided framework, incident history, or refund events.
- **The saving is small.** Qonversion's 0.2 points are about $2,000 a year at $1M in sales.
- Same drawbacks as Option A: another vendor, and we still own the ledger.

Build effort: **4 to 6 days,** our estimate.

### Option D: Stripe with the in-app Payment Sheet

Pros:

- **Native sheet,** with Apple Pay, Google Pay, and over 100 payment methods.
- **Cheapest card fee:** 2.9% plus $0.30 in the US.
- **Mature API.** Signed webhooks, an official Node SDK, and Radar for fraud.

Cons:

- **Not allowed on iOS for digital goods.** Stripe's own docs say so. Using it would risk App Store rejection.
- **Android in the US only.** It needs enrollment in Google's alternative billing program, reporting of every transaction within 24 hours, and Google's service fee (10% on the first $1M a year, 20% to 25% above). We would also own PCI scope, tax, disputes, and customer support for these purchases.
- **Two payment systems.** iOS would still need Option A, so we would run both.

Not usable for iOS. Android-only build effort would be about 4 to 6 days on top of Option A.

### Option E: Web checkout (Stripe Checkout, Paddle, or similar) with a link from the app

Pros:

- **Lowest fees.** About $0.59 per $10 with Stripe. Apple takes nothing today on US link-outs. Google takes its 10% to 20% service fee on external links in the US.
- **Full control of price, bonuses, and promotions.**
- Topps Digital offers this next to the store checkout.

Cons:

- **It is a redirect.** On iOS, the customer leaves for the external browser and comes back by Universal Link. Stripe and Apple both say an in-app web view is unlikely to pass review. This breaks the client's second rule.
- **US storefront only.** Elsewhere Apple does not allow the link.
- **Still needs Option A.** The sources we read say the same credits must also be sold through in-app purchase.
- **Apple's fee is not settled.** Apple asked the court to allow 15% (5% for Small Business Program members) on link-out sales. The court has not approved it, and the Supreme Court has said it will hear a related case. The savings could shrink.
- **We become the merchant of record:** tax, disputes, refunds, and PCI scope for Stripe Checkout (small, since the page is hosted).

Build effort: **4 to 6 days** on top of Option A.

### Not evaluated in depth

- **Adyen, Braintree, Checkout.com.** Card processors with the same Apple rule as Stripe.
- **Paddle and Lemon Squeezy as merchant of record.** Web checkout, so the same redirect problem as Option E.
- **Cryptocurrency.** Apple 3.1.1 does not allow it for unlocking content.
- **Our own receipt validation without any library.** Option B with the official Apple library covers it.

## Comparison

### Fit against the client's criteria

| Criterion | A. RevenueCat | B. Direct stores | C. Other wrapper | D. Stripe in-app | E. Web checkout |
| --------- | ------------- | ---------------- | ---------------- | ---------------- | --------------- |
| Meets "no redirects" on iOS | Yes | Yes | Yes | No (not allowed) | No |
| Meets "no redirects" on Android | Yes | Yes | Yes | Yes (US only) | No |
| Card data on our systems | None | None | None | None (Stripe holds it) | None |
| Merchant of record (tax, fraud, chargebacks) | Apple and Google | Apple and Google | Apple and Google | Us | Us |
| Purchase checked with the store | Yes, by vendor | Yes, by us | Yes, by vendor | n/a | n/a |
| API maturity | Store APIs plus a younger vendor API | Store APIs, official libraries | Not evaluated | Very mature | Very mature |
| Third party in the path | RevenueCat | None | Vendor | Stripe | Stripe |
| Needs user-to-user money features | No | No | No | No | No |

### What each purchase costs

Per $10.00 purchase, before tax, and a simplification:

| Path | Fee | We keep |
| ---- | --- | ------- |
| Apple in-app purchase, Small Business Program (up to $1M proceeds) | $1.50 (15%) | $8.50 |
| Apple in-app purchase, standard | $3.00 (30%) | $7.00 |
| Google Play Billing, first $1M a year | $1.50 (10% service + 5% billing) | $8.50 |
| Google Play Billing, standard, new installs | $2.50 (20% + 5%) | $7.50 |
| RevenueCat on top (Option A) | $0.10 (1%) | |
| Stripe card fee (Options D and E) | $0.59 (2.9% + $0.30) | $9.41 |

What the "no redirects" rule costs us on iOS: about $1.01 per $10 at Small Business rates (10 points), and about $2.51 per $10 above $1M (25 points), compared with a US link-out to Stripe today. If Apple's proposed link-out fee is approved, the gap shrinks to about 5 points at Small Business rates. At $1M a year of iOS sales and Small Business rates, that is roughly $100,000 a year.

The Apple Small Business Program is not automatic. The account holder must enroll. It ends for the rest of the year when proceeds pass $1M.

Other markets differ. In the EU, from Oct 1, 2026, Apple's in-app purchase commission is 26% (15% for Small Business Program members).

### Build effort

Our estimates, in engineer-days. They cover the SDK, the webhook, the ledger entry, refund handling, a reconcile job, and staging and production setup. They exclude bundle pricing, store account setup, and pack stock reservation.

| Option | Days |
| ------ | ---- |
| A. RevenueCat | 4 to 6 |
| B. Direct stores | 12 to 18 |
| C. Other wrapper | 4 to 6 |
| D. Stripe in-app | Android only: 4 to 6 on top of A |
| E. Web checkout | 4 to 6 on top of A |

## Decision

We choose **Option A: Apple in-app purchase and Google Play Billing through RevenueCat**, with our own Postgres ledger as the source of truth for credits. We do not use RevenueCat's virtual currency feature. We do not use a web checkout at launch.

Why:

1. **It is the only choice that is both "no redirects" on iOS and quick to build.** Option D is not allowed on iOS, and Option E is a redirect.
2. **Best on security.** No card data on our systems. Apple and Google carry card fraud, tax, and chargebacks. Purchases are checked with the stores before we create credits.
3. **Ease of use.** A native purchase sheet with Face ID, the user's existing store payment method, and no card form to fill in. For us, one SDK and one webhook instead of two store integrations (4 to 6 days against 12 to 18).
4. **The APIs underneath are mature.** The signed store notifications and server libraries are the same ones Option B uses. We keep the store transaction IDs in our ledger, so moving to Option B later does not change the ledger.
5. **Credits only keeps it small.** The payment service only turns a verified store purchase into a ledger entry.

Why not the others:

- **Option B.** The strongest alternative for control and cost. It takes about 8 to 12 more days and puts two store integrations in the code that creates money. It pays off at about $1M a year in sales, where RevenueCat's 1% is about $10,000 a year. This is the first thing to revisit (see review triggers).
- **Option C.** Slightly cheaper, but not evaluated, for a saving of about $2,000 a year at $1M in sales.
- **Option D.** Not allowed on iOS for digital goods. Android-only is a later cost option, not a launch option.
- **Option E.** The way to cut fees if the client relaxes "no redirects." It is a US-only add-on, not a replacement.

We accept the following risks:

- **We depend on RevenueCat's uptime.** Mitigation: a reconcile job that does not depend on webhooks (see Consequences), and status monitoring.
- **High store fees.** The cost of "no redirects" is 10 to 25 points of margin on iOS compared with a link-out. The client should decide whether that is acceptable. See Open questions.
- **A refund can arrive after credits are spent.** We handle it in the ledger (see Consequences).

## Consequences

- **Store accounts first.** The company needs the Apple Paid Applications agreement with tax and banking information, the Small Business Program enrollment, and a Google Play merchant profile. These can take days to weeks and block testing real purchases. Start them early. Payouts arrive after month end, not at the time of purchase (check the schedule in App Store Connect and Play Console).
- **Products.** Credit bundles are consumable products with the same IDs on both stores, defined in the repo. **The number of credits for each product lives on the server.** The app never sends an amount.
- **Our own ledger table for purchases.** `credit_purchases (store, store_transaction_id UNIQUE, user_id, product_id, credits, status, event_id)`. A purchase and its ledger entry are written in one transaction. The unique key on the store transaction ID means a repeated or replayed event adds nothing (ADR-003 idempotency).
- **Bind the purchase to the user.** The user must be signed in before buying. Call RevenueCat `logIn` with our `users.id` (the UUID from ADR-004, never the Auth0 ID or email) before the purchase. Do not allow anonymous RevenueCat IDs to buy. Also set Apple's `appAccountToken` and Google's `obfuscatedAccountId`, which help the stores detect fraud.
- **Webhook.** A public route that checks the `Authorization` header (and the HMAC signature if enabled) with secrets from AWS Secrets Manager (ADR-003). It deduplicates on the event `id`, returns 200 quickly, and does the work on the queue. **Production must reject `SANDBOX` events,** or a TestFlight purchase would give real credits. Before granting credits, the handler confirms the transaction with RevenueCat's REST API (confirm the response fields in the spike).
- **Reconcile on demand and on a schedule.** Webhooks stop retrying after about 80 minutes. The app calls "sync purchases" when the wallet opens and after a purchase. The API fetches the customer's purchases from RevenueCat and grants any that are missing, by transaction ID. A scheduled job does the same for recent purchases. This also covers the Oct 29 type of delay.
- **Refunds.** A refund from Apple or Google becomes a negative ledger entry. The ledger must allow a negative balance, because RevenueCat cannot and the user may have spent the credits. A negative balance blocks spending, listing, trading, and entering contests until it is cleared, and flags the account for review. The scope does not say what happens to items already bought with refunded credits. This needs a client decision (see Open questions).
- **Apple's consumption requests.** Apple asks for consumption data on a refund request and wants an answer within 12 hours. Check in the spike whether RevenueCat answers it. If not, our API must call Apple's Send Consumption Information endpoint with the official library.
- **Real-money pack purchases and limited drops.** If a user pays real money and the stock is gone, we would have to refund through the store. To avoid that, a pack bought with real money is a two-step flow: the server **reserves stock first** (with a time limit), then the user pays, and the credits are granted and spent in one transaction. If payment finishes after the reservation expires, the user keeps the credits and the pack purchase fails. The ledger stays uniform: credits in, credits out. The simplest rule is to sell packs only for credits, and sell credits only through bundles. The client should choose.
- **Credits must not expire.** Apple 3.1.1 says credits bought with in-app purchase may not expire. The scope has no expiry, so keep it that way. Account deletion follows ADR-004: the ledger rows we must keep are anonymized. Ask the client what happens to a remaining balance when a user deletes their account.
- **Pack odds must show before purchase.** Apple 3.1.1 and Google Play's Payments policy both require odds disclosure for randomized items before purchase. The scope already shows odds metadata. Put it on every purchase screen.
- **Abuse limits.** Add per-account daily purchase caps and a lower cap for new accounts. Tie this to the one-account-per-person question in ADR-004.
- **Staging and production.** Separate staging and production RevenueCat projects, with separate webhook secrets. Decide in the spike whether staging builds need their own bundle ID and store records. TestFlight and internal test purchases are sandbox purchases.
- **RevenueCat setting list.** Document every setting in the repo, as ADR-004 does for Auth0 (in Terraform). We found no Terraform provider for RevenueCat (not checked).
- **Load test.** Ask RevenueCat about API rate limits before testing purchase bursts. A pack drop brings purchases.
- **Monitoring.** Subscribe to status.revenuecat.com. Alert on webhook lag, purchases that RevenueCat has and the ledger does not, and refund rate. Add these to the paging list from ADR-003.
- **Run the spike first.** Before approval is final, make a sandbox purchase on iOS and Android with a test device, and check: the webhook and reconcile flow, a sandbox refund, a refund after the credits are spent, a production handler rejecting a sandbox event, and whether RevenueCat answers Apple's consumption request.
- **Review triggers.** Revisit this decision if: yearly sales approach $1M (Apple's 15% rate ends and Option B's saving pays for itself), the client relaxes "no redirects" for US users (add Option E), Apple's link-out fee is settled at a low rate, another multi-hour RevenueCat purchase incident happens, or the client chooses a framework RevenueCat does not support well.
- **Exit plan.** The ledger is keyed on store transaction IDs. Moving to Option B means adding Apple notification and Google RTDN handlers. Nothing in the ledger changes.

### Open questions for the client

- **"No redirects" and cost.** The rule costs about 10 points of margin on iOS at Small Business rates, and about 25 points above $1M. Is that acceptable? Or would a US-only web checkout, as a second option next to in-app purchase, be allowed later? Topps Digital does this.
- **Launch markets.** The scope names none. Store fees (the EU is 26% standard), tax, and contest law vary by country and state.
- **Bundle prices and bonus credits.** These set the store price points. Credits cannot expire.
- **Real-money pack purchase.** Allow it with stock reservation, or sell packs only for credits?
- **Refund policy.** What happens when a refund arrives after the credits are spent? Options: freeze the account until the balance is repaid, take back the items, or write it off up to a limit.
- **Purchase limits.** Daily caps, and a lower cap for new accounts?
- **Mobile framework.** RevenueCat supports several. If the client picks one, we check the SDK. We did not verify any of them.
- **Legal review of contests and prizes.** Not legal advice. Apple 5.3.3 bars in-app purchase for credits used in "real money gaming of any kind." Google Play does not allow in-app items bought with money to be used to win a prize of real-world monetary value, outside licensed gambling and daily fantasy apps. Launch prizes are credits, packs, and collectibles, and credits cannot be cashed out. The scope's "physical prizes later" needs review before it ships. A lawyer should confirm the launch design.

## Sources

Apple:

- Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (3.1.1, 3.1.3, 5.3), [In-App Purchase](https://developer.apple.com/in-app-purchase/), [Small Business Program](https://developer.apple.com/app-store/small-business-program/), [Changes for apps in the European Union](https://developer.apple.com/support/apps-in-the-eu/)
- Apple, [WWDC25: Dive into App Store server APIs for In-App Purchase](https://developer.apple.com/videos/play/wwdc2025/249/), [App Store Server Library for Node](https://apple.github.io/app-store-server-library-node/), [TN2413: In-App Purchase FAQ](https://developer.apple.com/library/archive/technotes/tn2413/_index.html)
- [App Store Server Notifications V2: types, setup, testing](https://censuus.com/blog/for-developers/app-store-server-notifications-v2) (retry schedule; third-party summary)
- AppSubmit, [US external purchase links: the real state of play](https://appsubmit.io/blog/us-external-purchase-links-october-2026), The Verge, [Apple and Epic argue over how much Apple should get from purchases made outside the App Store](https://www.theverge.com/tech/979967/apple-epic-games-external-links-fees-filing), FKKS, [Update Your App: External Purchase Developments for Apple & Google](https://technologylaw.fkks.com/post/102mp7y/update-your-app-external-purchase-developments-for-apple-google), [d2c.guide: Apple US link-out rules](https://d2c.guide/rules/apple-us/)

Google:

- Google, [Expanded billing choice and lower fees on Google Play](https://developer.android.com/blog/posts/expanded-billing-choice-and-lower-fees-on-google-play), [Service fees](https://support.google.com/paymentscenter/answer/112622?hl=en), [Alternative billing in the United States](https://support.google.com/googleplay/android-developer/answer/16497028?hl=en), [Update on policies for US developers](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)
- Google, [Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en), [Real-Money Gambling, Games, and Contests](https://support.google.com/googleplay/android-developer/answer/9877032)
- Google, [Integrate the Play Billing Library](https://developer.android.com/google/play/billing/integrate), [One-time purchase lifecycle](https://developer.android.com/google/play/billing/lifecycle/one-time), [Fight fraud and abuse](https://developer.android.com/google/play/billing/security), [RTDN reference](https://developer.android.com/google/play/billing/rtdn-reference), [Maximize your Play Billing integration](https://codelabs.developers.google.com/maximise-your-play-billing-integration)

Stripe:

- Stripe, [Accept in-app purchases on iOS and Android](https://docs.stripe.com/mobile/digital-goods), [Payment Sheet](https://docs.stripe.com/payments/mobile/payment-sheet), [Digital goods on iOS with Checkout](https://docs.stripe.com/mobile/digital-goods/checkout), [How app developers can reduce fees and create an optimized checkout](https://stripe.com/guides/how-app-developers-can-reduce-fees-and-create-an-optimized-checkout)

RevenueCat and other wrappers:

- RevenueCat, [Pricing](https://www.revenuecat.com/pricing), [In-App Currency](https://www.revenuecat.com/docs/offerings/in-app-currency), [In-app currency refunds](https://www.revenuecat.com/docs/offerings/virtual-currency/refunds), [In-app currency events](https://www.revenuecat.com/docs/offerings/virtual-currency/events), [Balance source of truth](https://www.revenuecat.com/docs/offerings/in-app-currency/faq/balance-source-of-truth), [Non-subscription purchases](https://www.revenuecat.com/docs/platform-resources/non-subscriptions)
- RevenueCat, [Webhooks](https://www.revenuecat.com/docs/integrations/webhooks), [Event types and fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields), [Sample events](https://www.revenuecat.com/docs/integrations/webhooks/sample-events), [Web overview and fees](https://www.revenuecat.com/docs/web/overview.md)
- RevenueCat, [Status](https://status.revenuecat.com/), [Building the RevenueCat Fortress](https://www.revenuecat.com/blog/engineering/building-the-rc-fortress), PulsAPI, [RevenueCat outage history](https://www.pulsapi.com/services/revenuecat/incidents) (third-party monitor)
- [Adapty pricing](https://adapty.io/pricing/), [Qonversion pricing](https://qonversion.io/pricing), [Qonversion webhooks](https://documentation.qonversion.io/docs/webhooks), [Best RevenueCat alternatives in 2026](https://revenuedot.app/revenuecat-alternatives)

Comparable products:

- NBA Top Shot, [Purchasing Packs in App](https://support.nbatopshot.com/hc/en-us/articles/17279439037075-Purchasing-Packs-in-App)
- Sorare, [App Store listing](https://apps.apple.com/us/app/sorare-fantasy-sports/id1591453776)
- Topps Digital, [What is Web-Pay?](https://toppsdigitalsupport.zendesk.com/hc/en-us/articles/54369286268443-What-is-Web-Pay)
- Fanatics Collect, [Payment methods](https://support.fanaticscollect.com/en_us/payment-methods-Bkinm0X6lg.md)

Project:

- [Pack Draft development feature scope](../../scope/project_scope.md)
- [ADR-001: Use PostgreSQL as the primary database](./001-primary-database.md)
- [ADR-002: Use AWS as the cloud provider](./002-cloud-provider.md)
- [ADR-003: Use Node.js with TypeScript on ECS Fargate for the API](./003-api-runtime-and-compute.md)
- [ADR-004: Use Auth0 with browser sign-in for authentication](./004-auth-service.md)
