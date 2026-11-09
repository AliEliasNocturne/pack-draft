# ADR-006: Keep the notification inbox in Postgres and send push through the Expo Push Service

## Status

Proposed (pending client approval)

## Date

2026-11-08

## Context

[ADR-001](./001-primary-database.md) chose PostgreSQL, [ADR-002](./002-cloud-provider.md) chose AWS, [ADR-003](./003-api-runtime-and-compute.md) chose a Fastify API and a worker on ECS Fargate, [ADR-004](./004-auth-service.md) chose Auth0, and [ADR-005](./005-payment-service.md) chose RevenueCat with our own ledger. This ADR picks how the app tells users that something happened: where notifications are stored, and what delivers the push.

What the [project scope](../../scope/project_scope.md) asks of notifications:

- **In-app inbox plus push, with category preferences.** "In-app inbox + push; category preferences." Preferences also appear under accounts and profiles.
- **Six topics:** contest cutoff and results, evolution, marketplace activity, daily rewards, pack releases, and referrals.
- **No wishlist listing alerts at launch.** Social and chat are future scope.
- **Events the notifications come from.** Contests lock 1 hour before the first game. Offers expire after 24 hours. Evolutions happen automatically after stat updates, and one achievement can upgrade every owner's copy at once. Contests settle automatically. Packs release on a timer with limited stock.
- **Correctness rules that reach notifications.** The scope requires server-side validation and idempotent retries, "no duplicate credits/assets/charges/awards." Other users' lineups stay hidden until a contest starts. Balances and private transactions stay hidden from other users. Accounts can be deleted.

What the platform asks of it:

- **iOS and Android apps built with Expo and React Native.** This is an assumption for this ADR. The mobile framework has its own tracking item, which comes before this one and has not been researched yet. If the framework changes, Option A below is the default.
- **Bursts we cause ourselves.** ADR-003 already says to stagger or pre-scale before a pack release push, because a push sends everyone to the API at once.
- **Small team, no constant monitoring.** The same rule as ADR-003.
- **Terraform, separate staging and production, and secrets in AWS Secrets Manager** (ADR-002, ADR-003).

Out of scope: email and SMS notifications (the scope lists none, and Auth0 sends the verification and reset emails, ADR-004), the admin dashboard, in-app chat, and iOS Live Activities.

### How we scored the options

The client has not ranked criteria for this item. We used the order below and ask the client to confirm it.

1. **Correctness.** The right user gets the right notice once, it matches what the ledger says, and it respects the user's preferences.
2. **Timely delivery under bursts.** Pack releases, contest cutoffs, and mass evolutions.
3. **Time to build and ease of use,** for users and for developers.
4. **Fit with the scope's feature list.**
5. Then cost, operations, reliability record, and how hard it is to leave.

### What push can and cannot promise

- **Push is best effort.** APNs and FCM can delay, coalesce, or drop a message. Apple says priority 5 messages "might be grouped and delivered in bursts," are throttled, and "in some cases are not delivered." The inbox must hold every notification, and anything with a deadline (a contest cutoff) must also show inside the app.
- **Apple requires the app to work without push.** Guideline 4.5.4: push "must not be required for the app to function" and must not carry "sensitive personal or confidential information." Promotions and direct marketing need explicit opt-in "via consent language displayed in your app's UI," plus an opt-out in the app. The iOS permission prompt alone is not that consent. Pack release alerts sell packs, so we treat them as promotional.
- **Android 13 and later asks at runtime.** Notifications are off until the user grants `POST_NOTIFICATIONS`. Android also needs a channel for every notification, and users can mute each channel in system settings. Once a channel exists, only the user can change how it behaves.
- **Android push goes through FCM.** Every option below, including Expo's push service, needs FCM credentials for Android, which means a Firebase project and a service account key. That is a second cloud account for one purpose, which ADR-004 counted against Firebase Auth. Here we cannot avoid it. (We did not check Android devices without Google services.)

## How comparable products do it

| Company | What we found | Evidence |
| ------- | ------------- | -------- |
| **NBA Top Shot** | Bell icon opens an in-app list of "purchases, sales, gifts, drop alerts, and more." Notification Settings has per-type toggles. Push is used for drops and Challenges. The app tells users to check system settings if alerts stop. | NBA Top Shot support and blog pages |
| **InCrowd** (sports fan engagement platform, not a comparable product) | Built its own native push, moved to AWS SNS, then to Google's push service, then to OneSignal. It says maintaining its own system "required a significant amount of resources." It also sells push to its own customers, so it needs segmentation and scheduling that a single app does not. | OneSignal case study (written by the vendor) |
| **Sorare, DraftKings, Kalshi** | No source names their push provider. DraftKings describes a mostly in-house platform. Third-party commentary guesses at Braze or Airship, with no confirmation. | No source found |

Pattern: the closest comparable has the same two surfaces we plan, an inbox and per-type toggles. We found no confirmed vendor choice for any comparable. The InCrowd case is a real warning about owning push, and it shows what an owner must keep up: tokens, errors, and scheduling. It argues against hand-writing the transport at launch.

Source quality note: all of this comes from help pages, a vendor case study, and commentary. None of it is an architecture document.

## Options Considered

Prices are US list prices on 2026-11-08. Build effort figures are our estimates, not measurements.

Every option needs the same **shared core,** except F, which replaces part of it. The core is the part that is about correctness and that no vendor can own:

- A **device registry** (which devices belong to which user).
- A **preferences** table.
- An **inbox** table with read state.
- An **outbox** so a notification is created in the same Postgres transaction as the change that caused it (a rarity change, an accepted offer, a settled contest).
- A **queue and worker** that fan out and send.

Options differ in what carries the message from the worker to Apple and Google.

### Option A: Our own inbox, with direct FCM (Android) and APNs (iOS)

Our worker calls FCM's HTTP v1 API for Android and Apple's HTTP/2 provider API for iOS. Devices register their native token. FCM and APNs are free to send through.

Pros:

- **No vendor between us and Apple and Google.** No per-user fee. FCM lists Cloud Messaging as no-cost on both Firebase plans.
- **Works with Expo.** Expo's docs say its notification library is "push-service agnostic," and `getDevicePushTokenAsync` returns the native token (APNs on iOS, FCM on Android). Expo documents sending to FCM and APNs directly. It also works with any other framework that can produce native tokens.
- **High ceiling.** FCM's default is 600,000 messages per minute per project. We found no published APNs send rate limit.
- **Full control of the payload.** APNs `apns-collapse-id`, `apns-priority`, `apns-expiration`, and the `interruption-level` key (for time-sensitive alerts). FCM message overrides for the same.
- **Clear errors.** APNs answers `410` when a token is no longer active. FCM answers `UNREGISTERED`. Both tell us to delete the token.

Cons:

- **We own token hygiene.** FCM says registrations go stale after a month without a connection and expire after 270 days on Android. iOS has no such expiry, so we must prune. FCM is also moving from registration tokens to Firebase Installation IDs, and both are supported for now.
- **We own two clients.** APNs token auth uses a signed JWT that must be reused. Refresh it no sooner than every 20 minutes and no later than every 60. A token older than an hour is rejected with `403 ExpiredProviderToken`, and signing a new one per request gets `429 TooManyProviderTokenUpdates`.
- **FCM quota handling.** Over-quota requests get `429`. Client errors count against the quota, so a list full of dead tokens burns it. Google says to ramp over at least 60 seconds and spread a big send over at least 5 minutes.
- **No campaign screen.** Anyone who is not an engineer cannot compose, segment, or schedule a push until the admin dashboard exists.
- **No delivery receipts from the device.** We know the provider accepted the message, not that the user saw it. Opens come from our own API.

Build effort: **3 to 5 days** for transport, **9 to 14 days** with the shared core.

### Option B: Our own inbox, with Amazon SNS mobile push

Same core. The worker publishes to SNS platform endpoints, and SNS calls FCM and APNs.

Pros:

- Same AWS account and IAM. Terraform through `hashicorp/aws`. Same native tokens as Option A.
- Cheap. Mobile push is $0.50 per million deliveries, plus $0.50 per million publish requests, with 1 million of each free each month.
- Publish quota in us-east-1 is 30,000 messages per second per account, and it can be raised.

Cons:

- **One more piece of state per device.** Each token needs a platform endpoint. When a token is invalid, SNS disables the endpoint. AWS says re-enabling it without a fresh token does not work, because the endpoint is disabled again. Token changes need `SetEndpointAttributes`. AWS's own pattern needs a user to device to endpoint map.
- **It does not remove the work.** We still keep our registry and handle failures. We add an endpoint lifecycle on top.
- **No inbox, no scheduling, no preferences.** SNS is transport only.

Build effort: **3 to 5 days** for transport, **9 to 14 days** with the shared core.

### Option C: Our own inbox, with AWS End User Messaging Push

Same core. The worker calls the Pinpoint-style `SendMessages` API with device tokens.

Pros:

- Same AWS account. $0 for the first 1 million pushes a month, then $0.000001 each ($1 per million).
- AWS says push APIs keep working after Pinpoint ended on October 30, 2026.

Cons:

- **Inherited from a retired product.** Pinpoint's console, endpoints, segments, campaigns, and journeys are gone. Only the push API, push templates, OTP, and phone validation remain. In an AWS re:Post thread, a team evaluating it said the documentation is unclear about long-term API continuity and segment management. The answer there suggests using it for raw delivery only.
- Pinpoint endpoints no longer exist, so we target device tokens ourselves anyway.
- It adds nothing over A or B that the scope needs.
- We did not check its send limits.

Build effort: **2 to 4 days** for transport, **8 to 13 days** with the shared core.

### Option D: Our own inbox, with the Expo Push Service

Same core. The app gets an Expo push token with `expo-notifications`. Our worker posts to Expo, which forwards to FCM and APNs.

Pros:

- **Free and the fastest to build.** One request format for both platforms. Expo's official Node SDK (`expo-server-sdk-node`) chunks requests, gzips them, throttles, and retries with backoff. It opens at most six concurrent connections.
- **Fits Expo and React Native.** It is Expo's own service, and its guide covers the credential setup. We hold no APNs signing code and no FCM OAuth code.
- **Payload fields that match our needs.** `interruptionLevel` (iOS, for time-sensitive), `channelId` (Android), `collapseId` (maps to `apns-collapse-id` and FCM `collapse_key`), `tag`, `threadId`, `priority`, `ttl`, and `badge`.
- **Tickets and receipts.** Expo reports whether it accepted each message (ticket), then whether FCM or APNs accepted it (receipt), including `DeviceNotRegistered`.

Cons:

- **600 notifications per second per project,** shared by every kind of send. Above that, requests fail until the rate drops. A 500,000 recipient pack release takes about 14 minutes just to hand off, against about 50 seconds at FCM's quota. A 5-minute spread fits at most 180,000 recipients.
- **No SLA.** Expo's docs say so. Delivery is "best effort," at least once, and a notification may reach Google or Apple more than once or not at all. A third-party status tracker lists three push broker incidents between Sep 5 and Oct 5, 2026: delayed iOS delivery (1 h 1 min), degraded iOS performance (4 h 41 min), and partial unavailability from database load (2 h 13 min).
- **Receipts come later and expire.** Expo suggests checking them 15 minutes after sending, and clears them after 24 hours. A job must poll for them.
- **A middle service in the path of every push,** for a saving of days, not dollars.
- **A missing Android channel hides the notification.** If we send a `channelId` the device has not created, the notification is not displayed.
- iOS notification extensions (for images) are not formally included. We do not plan to use them.
- A request can only carry tokens from one Expo project.

Build effort: **1 to 2 days** for transport, **7 to 11 days** with the shared core.

### Option E: OneSignal for push, with our own inbox

The app uses OneSignal's SDK. Our worker sends through OneSignal's API by external user ID.

Pros:

- Managed delivery, scheduling, segmentation, delivery analytics, and a dashboard that non-engineers can use. Free for organizations up to 1,000 monthly active users (MAU), then the Growth plan from $19 per month.
- Unlimited sends. InCrowd uses it. OneSignal says 1.5 billion MAU are on it.

Cons:

- **Cost is linear in users.** Growth is $19 plus about $0.012 per MAU. That is about $139 per month at 10,000 MAU, $1,219 at 100,000, and $6,019 at 500,000 (an upper bound: the first 1,000 may be free).
- **Two sources of truth.** The scope says preferences, privacy, and ledger events are ours. Either we copy preferences into OneSignal tags and watch them drift, or we check preferences ourselves and use OneSignal only to deliver. In the second case it adds little over A.
- **SLA only on Enterprise.** Notification history API is on Professional and above. Free and Growth keep 30 and 90 days of reporting.
- It needs OneSignal's React Native SDK inside an Expo app. We did not check how well that works.
- We did not confirm a persistent inbox feed. The pricing page lists in-app messages, not an inbox.

Build effort: **2 to 4 days** for transport, **8 to 13 days** with the shared core.

### Option F: A notification platform (Knock or Novu) with its own inbox and workflows

A hosted platform owns workflows, preferences, and an in-app feed. It sends through a push provider we connect (FCM and APNs, Expo, or OneSignal).

Pros:

- Feeds, preferences, batching and digesting, and logs come out of the box. Knock lists a 99.9% uptime SLA on its Free and Starter plans.
- Both list Expo support. Knock has React Native and Expo client SDKs and an Expo push provider. Novu has an Expo Push provider.
- Closest to "buy, not build" for the whole feature.

Cons:

- **Not a replacement for push.** Knock says so itself: it sits on top of providers such as APNs, FCM, and Expo. We still set up Firebase and Apple credentials, and downstream costs stay ours.
- **Price counts every channel.** Knock Starter is $250 per month with 50,000 messages, then $0.005 each. A message is one delivery to one user on one channel, so one event with an inbox item and a push is two. At 30 notifications per user per month that is about $3,000 at 10,000 MAU, $30,000 at 100,000, and $150,000 at 500,000 on list price. Enterprise offers volume and monthly-notified-user pricing, and we did not get a quote.
- Novu Team is $250 per month with 250,000 workflow runs. We did not find the price beyond that on the page we read.
- **Our data would live there.** Ledger-linked events, hidden-lineup rules, and 100,000 recipient fan-outs after a settlement all become API calls to a third party that must stay in step with Postgres.
- A vendor feed is a second place to honor account deletion.

Build effort: **6 to 10 days** including connecting the push provider.

### Not evaluated in depth

- **Braze, Airship, Customer.io, Courier, MagicBell.** Built for marketing teams with budgets and volumes beyond a launch. Not researched.
- **Amazon Connect outbound campaigns.** AWS names it as the destination for Pinpoint's campaign features. It targets voice, SMS, email, and WhatsApp orchestration, which the scope does not ask for.
- **Firebase In-App Messaging or Firestore as the inbox.** A second database for data that belongs next to the ledger.
- **Web push and email.** Not in the scope.

## Comparison

### Fit against the scope

| Capability | A. Direct | B. SNS | C. EUM Push | D. Expo | E. OneSignal | F. Knock / Novu |
| --- | --- | --- | --- | --- | --- | --- |
| Vendor in the path besides Apple and Google | None | AWS (same account) | AWS (same account) | Expo | OneSignal | Platform plus a provider |
| Works with Expo and React Native | Yes (native tokens from `expo-notifications`) | Yes (native tokens) | Yes (native tokens) | Yes (built for it) | React Native SDK (Expo not checked) | Yes (Expo listed) |
| Per-user or per-message fee | None | $0.50 per M plus $0.50 per M | $1 per M | None | $19 plus about $0.012 per MAU | $250 plus $0.005 per message (Knock) |
| Documented send ceiling | FCM 600,000 per minute. APNs: none found | SNS publish 30,000 per second, then FCM and APNs | Not checked | 600 per second per project | Not checked | Provider's, plus the platform's |
| Device token state owned by | Us | Us and SNS endpoints | Us | Us (Expo tokens and receipts) | OneSignal | Platform |
| Scheduling and campaign screen | No | No | No | No | Yes | Yes |
| Inbox in Postgres next to the ledger | Yes | Yes | Yes | Yes | Yes | No (vendor feed) |
| SLA | None found | Not checked | Not checked | None | Enterprise only | Knock 99.9% listed |

### Time to hand off a big send

Transport limits only. Real sends should be spread out regardless.

| Recipients | FCM (600,000 per minute) | Expo (600 per second) |
| --- | --- | --- |
| 100,000 | 10 seconds | 2 min 47 s |
| 180,000 | 18 seconds | 5 min |
| 500,000 | 50 seconds | 13 min 53 s |

The largest send that fits a 5-minute spread is 180,000 recipients on Expo and 3,000,000 on FCM. Expo's limit is shared by every send from the project, so a bulk send must leave room for urgent ones.

Google says a send should still ramp up gradually. Its FAQ says notifying a large customer base within 2 minutes "cannot be supported," that it grants no quota increase for that reason, and that traffic must be spread over 5 minutes. We plan to spread pack release pushes over about 5 minutes in every option.

### Build effort

Our estimates, in engineer-days. They cover the shared core (device registry, preferences, inbox API, outbox, queue, worker, retention) plus the transport, and the staging and production setup. They exclude screens in the app and the copy for each message.

| Option | Transport only | With shared core |
| --- | --- | --- |
| A. Direct FCM and APNs | 3 to 5 | 9 to 14 |
| B. SNS mobile push | 3 to 5 | 9 to 14 |
| C. EUM Push | 2 to 4 | 8 to 13 |
| D. Expo Push | 1 to 2 | 7 to 11 |
| E. OneSignal | 2 to 4 | 8 to 13 |
| F. Knock or Novu | Not separable | 6 to 10 |

### Monthly cost

Transport and fan-out only. Assumptions, which are ours and not measured: 30 notifications per active user per month, each with one inbox item and one push. The client sets the real number. SQS is $0.40 per million requests with 1 million free, and we count three requests per message with no batching.

| Monthly active users | A. Direct | B. SNS | C. EUM Push | D. Expo | E. OneSignal | F. Knock (list) |
| --- | --- | --- | --- | --- | --- | --- |
| 10,000 (300,000 pushes) | $0 | $0 | $0 | $0 | $139 | $3,000 |
| 100,000 (3M pushes) | about $3 (SQS) | about $5 (SQS and SNS) | about $5 (SQS and EUM) | about $3 (SQS) | $1,219 | $30,000 |
| 500,000 (15M pushes) | about $18 (SQS) | about $32 (SQS and SNS) | about $32 (SQS and EUM) | about $18 (SQS) | $6,019 | $150,000 |

Reading the table:

- Delivery itself is nearly free. FCM and APNs charge nothing. Do not pick on delivery cost.
- Per-user and per-message pricing is the whole difference. OneSignal costs about one cent per MAU. Knock's list price is the highest because every inbox item counts as a message.
- The worker runs on the ECS worker service from ADR-003. We did not add a task for it.

## Decision

Assuming Expo and React Native, we keep the notification **inbox, preferences, device registry, and outbox in our Postgres**, and **send push through the Expo Push Service** from a worker through SQS. Every device registers **both** its Expo push token and its native token, so moving to direct FCM and APNs (Option A) later changes only the server. We do not use a notification platform at launch.

Why:

1. **The hard part is correctness, and it lives in our database.** A notification must be created in the same transaction as the rarity change, accepted offer, or settlement that caused it. It must obey category preferences, never reveal hidden lineups or balances, and survive account deletion. A vendor in the middle means a second copy of that data and a sync that can fail. Expo only carries the message.
2. **Transport is the cheapest it can be.** Expo is free and takes 1 to 2 days, against 3 to 5 for direct sending. We write no APNs signing code, no FCM OAuth code, and no throttling code. InCrowd's history is a warning about hand-rolling this.
3. **It matches the stack.** Expo's guide covers the credential setup, `expo-notifications` produces the token, and the payload fields we need (`interruptionLevel`, `channelId`, `collapseId`) are supported.
4. **The limits fit a launch, and we know where they stop.** 600 per second allows 180,000 recipients in a 5-minute spread. We do not know the user count yet (see Open questions). A review trigger below says when to move.
5. **Cheap to leave.** Our outbox, inbox, and preferences do not change. Native tokens are stored from the first release, so the direct sender needs no app update.

Why not the others:

- **Option A, direct FCM and APNs.** The strongest alternative. It removes the middle service, the 600 per second ceiling, and Expo's missing SLA, and it gives synchronous errors. It costs 2 to 3 more days and two clients to keep running. It is the first thing to switch to (see review triggers).
- **SNS and EUM Push.** Safe and in our account, but they add a lifecycle to learn (SNS endpoints, EUM's Pinpoint history) and save little code over A.
- **OneSignal.** The right answer if non-engineers need to compose and segment campaigns at launch. It costs about $1,200 per month at 100,000 MAU and still leaves us checking preferences ourselves. We would add it for marketing sends only.
- **Knock and Novu.** Strong products, but they sit on top of a push provider, charge per message including the inbox, and move our correctness-critical data to a third party.

We accept the following risks:

- **Expo has no SLA.** A third-party tracker lists three push broker incidents between Sep 5 and Oct 5, 2026, including 4 h 41 min of degraded iOS delivery. We reduce the impact by making the inbox the source of truth, keeping deadlines visible in the app, watching ticket and receipt errors, and keeping the switch to direct sending ready.
- **One shared rate limit.** Bulk and urgent sends share 600 per second. We cap bulk sends below it (see Consequences).
- **Receipts arrive late.** We learn about dead tokens 15 minutes or more after sending, not at send time.
- **No dashboard for ad hoc campaigns.** Pack release, cutoff, and result messages come from data in our database, not from a person. Free-form marketing pushes wait for the admin dashboard, or a vendor added for marketing only.
- **Apple and Google are in every option's path.** We did not check APNs or FCM incident history.

## Consequences

- **Tables (names are a starting point).**
  - `notification_devices (id, user_id, platform, expo_token UNIQUE, native_token, app_version, last_seen_at, disabled_at)`.
  - `notification_preferences (user_id, category, push_enabled, inbox_enabled, consent_at)`.
  - `notifications (id, user_id, category, type, dedupe_key, payload, created_at, read_at, push_state)` with a unique key on `(user_id, dedupe_key)`.
  - `notification_deliveries (notification_id, device_id, state, ticket_id, receipt_state, provider_response, sent_at)`.
- **Register two tokens from the first release.** The app calls `getExpoPushTokenAsync` and `getDevicePushTokenAsync` (APNs token on iOS, FCM token on Android) and uploads both. Treat the native token as an opaque string. FCM is moving from registration tokens to Firebase Installation IDs, and both work now. The native token is the exit path.
- **One transaction per notification.** Insert the `notifications` row in the same transaction as the change that caused it. A `dedupe_key` such as `evolution:{copy_id}:{rarity}`, `offer:{offer_id}:received`, or `contest_result:{contest_id}` means a settlement or evolution run twice notifies once. This is the ADR-003 idempotency rule applied to notifications.
- **Relay and queue.** A relay in the worker reads pending rows with `FOR UPDATE SKIP LOCKED` and puts them on SQS. Use two queues, each with a dead-letter queue: **urgent** (offers, results, cutoffs) and **bulk** (pack releases, broadcasts). A bulk stampede must not delay an offer notice. SQS `DelaySeconds` (up to 15 minutes) adds jitter.
- **One sender, one rate budget.** Expo's 600 per second is per project, so many worker tasks would multiply our rate and trigger `TOO_MANY_REQUESTS`. Run the Expo sender as a single worker task, guarded by a Postgres advisory lock as the sports fetcher is (ADR-003). It reads both queues, caps bulk at about 400 per second, and leaves the rest for urgent sends. Use `expo-server-sdk-node` for chunking (100 messages per request) and backoff. One task is enough: 600 per second is a small load for one process.
- **Tickets and receipts.** Store each ticket ID. A receipts job asks for receipts about 15 minutes after sending (1,000 IDs per request) and must finish within 24 hours, when Expo clears them. Disable the device on `DeviceNotRegistered`. Alert on tickets or receipts with errors, and on receipts that never appear.
- **Duplicates.** SQS delivers at least once and Expo delivers at least once, so a crash between "sent" and "marked sent" can send twice. Set `collapseId` to the notification ID. On iOS it replaces a notification already shown. On Android it only coalesces in transit, so also set `tag` to the notification ID.
- **Spread big sends.** Send a pack release push over at least 5 minutes, ramping up gradually, as Google asks of FCM senders. With the 400 per second bulk cap, 5 minutes covers up to 120,000 recipients, and 180,000 is the hard maximum at 600 per second. Start before the release time if the push should land at it. Also pre-scale the API as ADR-003 says.
- **Coalesce bursts.** One achievement can evolve every owner's copy, and a user may own many copies. Hold evolution pushes for a short window per user and send one ("3 of your collectibles evolved"). Settlement of a large contest creates one row per entrant. Decide in the spike whether broadcast items (pack releases) are stored once with a per-user read marker instead of one row per user.
- **Reminders by sweep, not by pre-set schedules.** A job table swept every 30 seconds or so, under a Postgres advisory lock (as the sports fetcher in ADR-003), reads the current cutoff time. A schedule set in advance would go stale when a postponement moves a game. EventBridge Scheduler (14 million free invocations per month, $1 per million after) stays an option for fixed times.
- **Categories and consent.**
  - Use six categories from the scope: contest, evolution, marketplace, daily rewards, pack releases, and referrals.
  - **Transactional categories** (contest results, evolution, marketplace activity on a user's own offers and listings, referrals) default on once the OS allows push.
  - **Pack releases are promotional.** They default off until the user taps an opt-in shown in the app, and the preferences screen can turn them off. Record `consent_at`.
  - Never use the time-sensitive level for pack releases or any marketing push (Apple's HIG, as quoted by a third-party summary).
- **Privacy in the text.** Keep push text generic. No balances, no private transactions, and nothing about another user's lineup before the contest starts. The app fetches details after sign-in, using the notification ID.
- **App behavior.** Ask for notification permission in context (for example after a first contest entry), not at launch. The app must work with push denied. The inbox and a banner on Home show anything with a deadline.
- **iOS.** Send contest cutoff reminders with `interruptionLevel: 'time-sensitive'` and `priority: 'high'`. That needs the Time Sensitive Notifications capability on the app. Check in the spike how to set it in the Expo build config. Users can switch it off. Use `badge` only for the unread count, and keep it correct from the inbox.
- **Android.**
  - Create one channel per category with `expo-notifications` on **every launch,** before the first release and in every release.
  - Expo does not display a notification whose `channelId` does not exist on the device, and an unset one goes to a user-visible "Default" channel. So send a `channelId` only if the device's `app_version` is known to create it.
  - Channel behavior cannot be changed in code after creation, only by the user, so a changed importance needs a new channel ID.
  - Target Android 13 or later and request `POST_NOTIFICATIONS` at runtime.
- **Token lifecycle.**
  - The app uploads both tokens at each launch. The server updates `last_seen_at`.
  - On sign-out, delete the device row. On sign-in, upsert by token so a shared device moves to the new user.
  - Disable a device on `DeviceNotRegistered` in a receipt. Under direct sending, the equivalent is APNs `410` and FCM `UNREGISTERED`.
  - Stop pushing to devices not seen in 30 days. Keep the row so the inbox still works.
- **Account deletion** (ADR-004). Delete device rows, preferences, and inbox rows. The ledger rows we must keep are anonymized, and they hold no notification text.
- **Credentials and secrets.** Per Expo's guide, the FCM v1 service account and the iOS credentials are set up in Expo's services, under the client's Apple and Google accounts (see ADR-005 on account setup). Keep an Expo access token for sending, if we turn that on, in AWS Secrets Manager (ADR-003). If we move to Option A, the APNs key and FCM service account JSON go in Secrets Manager.
- **Staging and production.** Use a separate Expo project and Firebase project for each environment. A send request can carry tokens from one Expo project only (`PUSH_TOO_MANY_EXPERIENCE_IDS`). Document every setting in the repo. We did not check Terraform support for Firebase or Expo, so assume manual setup.
- **Retention.** Keep inbox rows 90 days by default (open question below). A nightly job deletes older rows in batches.
- **Metrics and paging** (add to ADR-003's list): oldest pending outbox row age, dead-letter queue depth for both queues, ticket error rate, receipt error rate and lag, and the share of disabled tokens in a send. A sudden jump in disabled tokens usually means a bad credential. Subscribe to Expo's status page.
- **Load test.** Feed the load-testing item: fan out to 100,000 fake recipients through a stub that behaves like Expo's push API (including `TOO_MANY_REQUESTS` above 600 per second), kill the sender mid-run, and confirm no loss, no duplicates, and an empty dead-letter queue. Run an urgent send during a bulk run and measure its delay. Do not load test against the real Expo service.
- **Run the spike first.** Before approval is final, check on one iOS and one Android device in staging:
  1. A push from our worker arrives, tapping it opens the right screen, and marks the inbox item read.
  2. Uninstalling the app disables the token on the next send.
  3. Signing out and in as another user moves the device.
  4. A user who opted out of a category gets neither the push nor the inbox item, as configured.
  5. Re-running a contest settlement creates no second notification.
  6. The cutoff reminder shows as time-sensitive on iOS and uses its own Android channel.
  7. The app works fully with notifications denied.
  8. A device on an older app version, with a `channelId` it lacks, is not sent that channel ID.
  9. Receipts are fetched, and an uninstalled device shows `DeviceNotRegistered`.
- **Review triggers.** Switch to Option A (direct FCM and APNs) if: a single send needs more than about 120,000 recipients or must land faster than 5 minutes, Expo's push broker has an incident during a pack drop or contest cutoff, delivery problems appear that Expo's tickets and receipts cannot explain, or the client needs an SLA. Also revisit if the client needs non-engineers to send or segment campaigns before the admin dashboard exists (add OneSignal or Knock for marketing sends), if the mobile framework changes, or if the client wants iOS Live Activities for live contest scoring.
- **Exit plan.** The sender is one interface. The Expo implementation uses `expo_token`. A direct implementation (FCM and APNs) uses `native_token`, which every device has uploaded since the first release. Switching is a server change of about 3 to 5 days and needs no app update. The inbox, preferences, and outbox stay.

### Open questions for the client

- **Mobile framework.** We assumed Expo and React Native. That needs its own approval before this ADR is final. If it changes, Option A is the default.
- **Largest push audience.** How many users do we expect to receive one pack release push, now and in a year? Expo's 600 per second fits about 120,000 in a 5-minute spread at our bulk cap.
- **Ad hoc campaigns.** Does anyone need to compose or segment a push without an engineer at launch? If yes, we add a vendor for that or pull the admin dashboard forward.
- **Pack release alerts and consent.** Apple needs an explicit opt-in for promotions. Is default-off acceptable? The client may want a prompt during onboarding that is still a clear opt-in.
- **Notification volume.** Daily caps, quiet hours, and how many pushes per user per day. The cost tables assume 30 per month.
- **Cutoff reminders.** How long before the cutoff, and to whom: every eligible user, users who entered, or users with an incomplete lineup?
- **Daily reward reminders.** These need the time zone rule that the scope leaves open.
- **Inbox retention.** 90 days, longer, or forever? Transaction history stays in the ledger either way.
- **Email.** The scope lists none. Confirm that push and inbox are enough at launch.
- **Delivery and open analytics.** We would log sent, failed, and opened. Is that enough, or does the client expect a dashboard like OneSignal's?

## Sources

Comparable products:

- NBA Top Shot, [Managing Your Notification Settings in App](https://support.nbatopshot.com/hc/en-us/articles/13593844749075-Managing-Your-Notification-Settings-in-App), [NBA Top Shot Mobile App](https://support.nbatopshot.com/hc/en-us/articles/13778466668051-NBA-Top-Shot-Mobile-App), [The Beginner's Guide to Pack Drops](https://blog.nbatopshot.com/posts/beginners-guide-to-pack-drops)
- OneSignal, [InCrowd case study](https://onesignal.com/case-studies/incrowd-sports-case-study)
- DraftKings, [Investor Day 2026 transcript](https://stockanalysis.com/stocks/dkng/transcripts/547562-investor-day-2026/), Gaming Eminence, [Operator profile: DraftKings](https://www.gamingeminence.com/post/operator-profile-draftkings-inc) (commentary, not confirmation)

Apple:

- Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (4.5.3, 4.5.4), [Sending notification requests to APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns), [Communicating with APNs (archive)](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CommunicatingwithAPNs.html), [WWDC21: Send communication and Time Sensitive notifications](https://developer.apple.com/videos/play/wwdc2021/10091/)
- ASOitis, [Guideline 4.5.4 push notifications](https://asoitis.com/app-review/guideline-4-5-4-push-notifications) (quotes the Human Interface Guidelines), [APNs from the backend: tokens, auth and HTTP/2](https://tuugu.dev/blog/apns-from-the-backend/) (third-party summary of the JWT refresh rule)

Google and Android:

- Firebase, [FCM throttling and quotas](https://firebase.google.com/docs/cloud-messaging/throttling-and-quotas), [Best practices when sending FCM messages at scale](https://firebase.google.com/docs/cloud-messaging/scale-fcm), [FCM troubleshooting and FAQ](https://firebase.google.com/docs/cloud-messaging/troubleshooting), [Best practices for FCM registration management](https://firebase.google.com/docs/cloud-messaging/manage-tokens), [Pricing](https://firebase.google.com/pricing)
- Android, [Notification runtime permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission), [Create and manage notification channels](https://developer.android.com/develop/ui/compose/notifications/channels)

AWS:

- AWS, [SNS pricing](https://aws.amazon.com/sns/pricing/), [SNS endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/sns.html), [Setting up an SNS platform endpoint](https://docs.aws.amazon.com/sns/latest/dg/mobile-platform-endpoint.html), [Sending mobile push and managing device tokens with serverless applications](https://aws.amazon.com/blogs/compute/sending-mobile-push-notifications-and-managing-device-tokens-with-serverless-application/)
- CloudBurn, [Amazon SNS pricing](https://cloudburn.io/blog/amazon-sns-pricing) (third-party summary of the $0.50 per million rate)
- AWS, [End User Messaging pricing](https://aws.amazon.com/end-user-messaging/pricing/), [Amazon Pinpoint end of support](https://docs.aws.amazon.com/pinpoint/latest/userguide/migrate.html), [End User Messaging Push: sending a message](https://docs.aws.amazon.com/push-notifications/latest/userguide/reference-send-message.html), [re:Post: EUM Push long-term support and segment APIs](https://repost.aws/questions/QUFFNovNGXRDmkeG96U7jnrw/eum-push-long-term-support-and-segment-apis)
- AWS, [SQS pricing](https://aws.amazon.com/sqs/pricing/), [EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/)

Expo, OneSignal, Knock, Novu:

- Expo, [Push notifications overview](https://docs.expo.dev/push-notifications/overview/), [Send notifications with the Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/), [FAQ](https://docs.expo.dev/push-notifications/faq), [Using push notifications](https://docs.expo.dev/guides/using-push-notifications-services), [Send with FCM and APNs](https://docs.expo.dev/push-notifications/sending-notifications-custom/)
- OutageDB, [Expo outage history](https://outagedb.com/status/expo/) (third-party monitor)
- OneSignal, [Pricing](https://onesignal.com/pricing)
- Knock, [Pricing](https://knock.app/pricing), [Push channel](https://knock.app/channels/push), [Push notifications with Knock](https://docs.knock.app/integrations/push/overview)
- Novu, [Pricing](https://novu.co/pricing), [Push integrations](https://docs.novu.co/platform/integrations/push)

Project:

- [Pack Draft development feature scope](../../scope/project_scope.md)
- [ADR-001: Use PostgreSQL as the primary database](./001-primary-database.md)
- [ADR-002: Use AWS as the cloud provider](./002-cloud-provider.md)
- [ADR-003: Use Node.js with TypeScript on ECS Fargate for the API](./003-api-runtime-and-compute.md)
- [ADR-004: Use Auth0 with browser sign-in for authentication](./004-auth-service.md)
- [ADR-005: Use Apple and Google in-app purchases through RevenueCat to sell credits](./005-payment-service.md)
