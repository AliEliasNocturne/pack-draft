# ADR-010: Choose SportsDataIO as the lead sports data provider, and poll it from one central worker

## Status

Proposed (pending vendor quotes, written license answers, a trial comparison, and client approval). The provider is not final. This ADR names a lead candidate, a benchmark, and the checks that decide between them.

## Date

2026-11-09

## Context

[ADR-001](./001-primary-database.md) chose PostgreSQL, [ADR-002](./002-cloud-provider.md) chose AWS, [ADR-003](./003-api-runtime-and-compute.md) chose a Fastify API and a worker on ECS Fargate, and [ADR-006](./006-app-notifications.md) chose a Postgres inbox with Expo push. This ADR picks the sports data provider and how we pull from it. It covers the tracking item "Sports API data pulling."

What the [project scope](../../scope/project_scope.md) asks of sports data:

- **A paid API** with "live stats, schedules/status, IDs, rosters, historical game logs for requested competitions."
- **Six leagues, "licensing dependent":** NBA, NFL, MLB, NHL, NCAA football, and NCAA basketball, including bowl games and March Madness.
- **One shared pipeline** for contest scoring, live standings, collectible card backs (latest 10 games), evolution, and performance challenges.
- **"Central fetch, fan-out to users,"** not per-user provider calls. The scope asks us to assess caching, cadence, rate limits, failure recovery, and cost.
- **Provider criteria the scope names:** "commercial rights, NCAA depth, career milestones, latency, corrected stats." It also says "data feed ≠ collectible licensing."
- **Shortlist:** Tank01, SportsDataIO, Goalserve, Sportradar.

What the rest of the scope puts on this decision:

- **Contests lock 1 hour before the earliest game.** The lock time depends on trustworthy start times. Postponements and flex scheduling move it.
- **Evolution needs ownership "at achievement time."** A copy bought after the achievement does not evolve. Rewards are permanent once granted.
- **Results rules are open:** finalization timing, stat corrections, postponed games, and cancelled contests (scope, "Open decisions").
- **Persistence.** We keep ownership history, milestones, and achievement history per copy for years, including after a season ends. A provider contract that forces us to delete stats would collide with that.

What the platform asks of it:

- **One sports-data worker task, guarded by a Postgres advisory lock** (ADR-003). A sub-minute poller runs on Fargate.
- **A "sports data staleness" page** (ADR-003) and **idempotent processing with dedupe keys** (ADR-003, ADR-006).

Out of scope: league, team, and player name, image, and likeness licensing. None of the vendors below grants it (see Rights). Also out of scope: odds and betting data, which the scope does not ask for.

### How we scored the options

The client has not ranked criteria. We used this order and ask the client to confirm it.

1. **Rights fit.** Can we run contests and a collectibles app on this data, store it for years, and score from it?
2. **Coverage of the six leagues,** especially NCAA depth and live player stats.
3. **Correct final stats and latency.** A way to know a game is final and verified, and a way to catch corrections.
4. **Ease of use and time to build.**
5. **Cost, free trial, and reviews.**

### What we could and could not check

We read vendor pages, documentation, and public terms on 2026-11-09. We did not sign up for any trial, call any API, or talk to any vendor. So:

- **Verified from vendor pages:** coverage statements, trial terms, published prices, refresh guidance, and terms of service.
- **Not verified:** actual latency, actual NCAA player-stat completeness, API error behavior, and any unpublished price. Every price marked "reported" comes from a single public post and is not a quote.
- **Review volume is small for all three.** What we found is in the review table below.

## How comparable products do it

| Company | What we found | Evidence |
| ------- | ------------- | -------- |
| **Sorare** | Scores come from third-party match data, named as Opta (Stats Perform) for football. We found no source naming its NBA or MLB data provider. Its NBA deal came with a separate NBPA license for names and images, which fits "data feed is not collectible licensing." | Wikipedia, SorareData (a third-party site) |
| **FanDuel** | Expanded a Sportradar partnership in 2020 to add official NFL data. That is betting and daily fantasy, not collectibles. | SportBusiness |
| **Small fantasy apps** | Developers on Reddit use free ESPN and Sleeper endpoints, and say a real-time commercial feed costs $10,000 to $15,000 a year. Unofficial endpoints carry terms-of-service risk and are not a model for us. | r/fantasyfootballcoding |

Pattern: operators with money buy from the incumbent vendors. We found no collectible product that names its provider.

## Options Considered

Prices are US list or reported prices on 2026-11-09. Request estimates are ours, not measured.

### Option A: SportsDataIO

One REST API per league (JSON or XML), one key, 13 sports including all six of ours plus women's college basketball.

Pros:

- **The clearest public rights language of the three.** Its FAQ says commercial licenses permit ingesting, caching, and storing responses, with "no forced refresh intervals or caching restrictions." It allows models and derived analytics, display of raw data in our product, and display of derived outputs. Post-termination retention is "set in your individual license agreement," and many clients negotiate to keep data.
- **Unlimited API calls** on the commercial Leagues API, with an SLA and dedicated support. Pricing "is not a factor" of call volume.
- **Built for polling.** Delta endpoints (`PlayerGameStatsDelta`, `BoxScoresDelta`) return only changes in the last N minutes. Bulk endpoints return a whole date or week. A "Player Game Logs - by Season" endpoint returns a player's last N games, which is the card-back feature. The API caches content for at least 3 seconds, and the docs say syncing faster gives no benefit.
- **Good developer material.** Per-sport docs, data dictionaries, workflow guides, refresh-rate guidance, OpenAPI files, and a status page.
- **NCAA.** Every D-I FBS game and every men's D-I basketball game, with live and final player stats.
- **Corrections are documented.** The refresh guide says leagues amend stats after games close, that corrections "flow into the API," and that box scores "are subject to change after the game is Final."
- **Replay** lets us test live-data code off-season with real past games, self-serve.

Cons:

- **Price is a quote.** A 2026 Reddit post says commercial licenses have a $10,000 a year minimum, and commenters put real-time fantasy data at $10,000 to $15,000 a year. This is not official. SportsDataIO says only that "minimum license fees apply."
- **The free trial returns scrambled data,** with a small daily call limit. It cannot be used for "analysis or display." Real data needs a Dev Key (sales, and still scrambled), Replay (select sports), or a paid license.
- **The trial's scope is unclear.** The developer page says all 13 sports. Per-sport documentation pages say the trial "only provides access to the UEFA Champions League." We cannot tell whether the trial covers NCAA.
- **REST polling only.** We found no push or webhook delivery.
- **Delay.** Scores run 20 to 30 seconds behind the cable and over-the-air broadcast (15 to 20 seconds for college football player stats).
- **College football defensive player stats are not live.** They post 1 to 2 hours after the game.
- **No FCS coverage is stated** for college football.
- **Documented call intervals differ by endpoint.** The college football live box score lists 1 minute, and the NBA delta endpoint lists 3 seconds. Which endpoints give 3 to 5 second freshness for each league needs checking.
- **Scheduled maintenance** on the first and third Wednesday of each month, 4:00 to 10:00 am Eastern. Few games run then.

### Option B: Sportradar

A separate API per league, each with its own reference. REST, plus Push feeds (streams) sold through sales.

Pros:

- **The deepest NCAA data.** NCAA football covers 100% of Division I games, with live play-by-play for FBS. NCAA men's basketball and women's basketball have their own APIs. Its Unified Player Profiles share identifiers between NCAA and NFL, which helps career history.
- **The best documentation of final and corrected stats.** Game status runs `complete` (score correct, stats in review) then `closed` (stats validated). A Daily Change Log lists later corrections, does not count against API limits, and is meant to be pulled at least every 10 minutes. Postponed games get a new game ID.
- **A real trial.** Self-serve, 30 days, on real data: 1,000 requests per rolling 30 days at 1 request per second. Trial data is not slowed down.
- **Published SLA** in its standard terms: 99.5% monthly availability, per minute.
- **Push feeds** would remove most polling.
- **Offers two packages** with published request caps: Real-time (2,000,000 requests per 30 days per core sport) and Standard (25,000). Multi-sport discounts are offered.

Cons:

- **Price is opaque.** One Reddit post (2023) reports a first offer of $1,800 a month, then $1,250, for one sport and a small, non-commercial app. Sales said there is no per-call billing. That is one report, not a quote. Six leagues would multiply it, before any discount.
- **The standard terms conflict with our product** (see Rights). The official-data addendum for NBA, NHL, and MLB bars "electronic trading cards" and new data points. The main terms limit use to display on named properties and require data destruction on termination.
- **NCAA basketball player stats are not live for every game.** Full live coverage applies to games involving 12 named conferences (the page list may be longer). Other Division I games get live scores, and player data "within 60 minutes of an official gamebook release." FCS football games get live scores and player data by the end of the night.
- **The trial is too small to test live scoring.** 1,000 requests and 1 request per second is about 17 minutes of one game at 1 request per second. Push feeds are excluded from the self-serve trial.
- **One API, key, and trial per league,** and a production key needs the `access_level` in every URL changed.
- **NFL official data.** The NFL's 2026 announcement names Genius Sports as the league's "exclusive data distribution partner" for real-time official statistics to its betting partners. We do not know what NFL source Sportradar's feed uses for non-betting use. Ask.

### Option C: Goalserve

XML and JSON feeds from 2005, sold as per-sport packages. Strongest on soccer and odds.

Pros:

- **Published prices,** the only one of the three. The US Sports package (NFL, NBA, MLB, NHL, with NCAA football and basketball in the listing) shows $400 for 1 month, $1,850 for 6 months, and $3,100 for 12 months, with a listed sale price of $2,500 for 12 months. A second, larger package shows $800, $3,550, and $5,100 (sale $4,000). The scraped page does not say what it adds.
- **Free trial:** the general FAQ says 30 days of full access. The US sports pages say 14 days.
- **History since 2010** and live box scores with player stats for NFL, NBA, MLB, and NHL.
- **Claims** scores update every 2 to 4 seconds, 24/7 support, three data centers, and a 99% uptime guarantee.

Cons:

- **NCAA depth is not stated.** Coverage lists say "NCAA" with no game counts, no conference list, and no statement about player stats for non-power games. The documentation pages we read did not mention NCAA. We cannot rate this against the scope.
- **Data origin is vague.** Goalserve says it collects data from "live stadium / TV reporting, statistic data collection and data exchange with other providers." We found no corrections process. Its claim of "direct partnerships with NFL" is marketing and conflicts with the NFL naming Genius Sports as its exclusive distributor.
- **99% uptime is about 7 hours of allowed downtime a month.** Sportradar's standard terms say 99.5% per minute. Not comparable until the contract says how it is measured.
- **Rights are thin.** The NFL page says we cannot "sell or redistribute the raw NFL data feeds" and that we can build any commercial product with display in a mobile app. We found nothing on storage, derived data, or what happens at termination. The same page says users "must first apply for a license" reviewed "case by case," which does not match the published self-serve prices. It also says exceeding the request count may bring "an additional fee," while other pages imply no cap.
- **Developer experience is the weakest evidence.** A 2020 customer review reports a PDF and text-file reference, filters that "don't work," empty responses with status 200 or 500, and "very flakey" JSON that is sometimes raw XML-to-JSON output. That review is old. A July 2026 Reddit post says Goalserve did not answer trial emails.
- **Feeds are XML first.**

### Option D: Tank01 (on RapidAPI)

NBA, NFL, MLB, NHL, and WNBA only, sold per league on RapidAPI: Basic free (1,000 requests a month), Pro $10 a month (1,000 a day), Ultra $25 (15,000 a day), Mega $100 (500,000 a day). Extra requests cost $0.01 each.

- **No NCAA football or basketball,** so it cannot be our only provider. It covers four of six leagues, at $400 a month for all four on Mega.
- **Rights are unchecked.** It is built for fantasy apps. We did not read its terms, and we found no review volume.
- We keep it only as a possible cheap source for the four pro leagues if the main provider cannot cover them.

### Not evaluated

- **Stats Perform (Opta),** Sorare's football source. Soccer is not in our launch scope.
- **Genius Sports,** the NFL's exclusive official distributor for betting partners. Built for sportsbooks.
- **Rolling Insights, api-sports, iSports, Sportmonks.** Mentioned by developers as cheaper. Not researched. Cheap providers can resell another vendor's data with a delay (one Reddit commenter says this happened to them).
- **Scraping ESPN, Sports Reference, or Sleeper.** Terms of service risk, no support, and breakage with no warning.

## Comparison

### Coverage of the six leagues

| League | SportsDataIO | Sportradar | Goalserve | Tank01 |
| --- | --- | --- | --- | --- |
| NFL, NBA, MLB, NHL | Yes | Yes | Yes | Yes |
| NCAA football | Every D-I FBS game, live player stats. CFB defensive stats 1 to 2 hours after the game. FCS not stated. | 100% of D-I. FBS has live play-by-play and player data. FCS has live scores, player data by end of night. | "NCAA" listed, depth not stated | No |
| NCAA men's basketball | Every men's D-I game, live and final player stats | All D-I. Live player data for games involving 12 or more named conferences. Others within 60 minutes of the gamebook. | "NCAA" listed, depth not stated | No |
| Women's college basketball | Offered as a sport | Own API | Not stated | No |
| Bowl games, March Madness | Tournament brackets tracked live. Bowls not stated. | Not checked | "USA: Bowls" listed | No |

### Rights

None of these grants name, image, likeness, or logo rights. That comes from the leagues, players' unions, and schools. Check each point below in writing before signing.

| Question | SportsDataIO | Sportradar (standard terms) | Goalserve |
| --- | --- | --- | --- |
| Store data in our database | Yes, no caching limits (FAQ) | License is "perpetual (solely for archiving purposes)" | Not found |
| Derived data and scoring (fantasy points, evolution) | Allowed for models and analytics, with display of derived output ("check with us") | Main terms bar "derivative works of the Products." Official data addendum bars "new or derivative data points" without approval. | Not found |
| Keep data after the contract ends | Negotiable, set in the agreement | Must destroy all data "including all historical data" and "derivatives" within 30 days | Not found |
| Collectibles or trading cards | Not addressed in the FAQ | Official NBA, MLB, NHL data: addendum bars "electronic gaming (e.g. simulated video games or electronic trading cards)" and limits use to "media and editorial purposes and non-commercial use only." NHL's separate addendum names "fantasy games" as allowed. | Not found |
| Redistribution | Not allowed as a standalone feed | Display on named "Properties" only | Raw feed redistribution not allowed |
| Attribution | Required | Notices and bylines must stay | Not found |

Sportradar's addendum applies when "official data" from NBA, NHL, or MLB is licensed and listed on the order form. A negotiated order form can differ from the public terms. The point of this table is what to ask, not a legal reading. A lawyer must review the final agreement.

### Free trial and ease of use

| | SportsDataIO | Sportradar | Goalserve |
| --- | --- | --- | --- |
| Self-serve trial | Yes. Scrambled data, small daily limit. Scope unclear (all 13 sports or one soccer competition). | Yes. Real data, 30 days, 1,000 requests, 1 request per second. Push feeds excluded. | 14 or 30 days, full access. One developer reports no reply. |
| Test live logic off-season | Replay, self-serve, real past games, select sports | "Simulations" for select sports | Not found |
| Unlimited-call test key | Dev Key via sales (scrambled) | By request to sales | Not found |
| Docs | Per-sport docs, dictionaries, workflow guides, OpenAPI, status page | Per-league references, OpenAPI for general APIs, Postman | Reference site, older reports of gaps |
| Delivery | REST polling | REST and Push | REST, XML first |
| Game logs for card backs | Yes, last N games by player | Not checked | Not checked |
| Career history | Season stats by season, sum ourselves. 10+ years in a paid archive. | Unified NCAA and NFL player IDs. Career totals not checked. | History since 2010 |

### Cost

| | SportsDataIO | Sportradar | Goalserve | Tank01 |
| --- | --- | --- | --- | --- |
| Published price | None for commercial | None | US Sports package: $2,500 to $3,100 for 12 months | $25 to $100 a month per league |
| Reported price | $10,000 a year minimum (one 2026 post) | $1,250 to $1,800 a month for one sport (one 2023 post) | None | None |
| Pricing basis | Leagues, feeds, and use case. Not call volume. | Package and request cap, per sport | Per-sport package and term | Requests per day, per league |
| Rough six-league yearly cost, if the reports hold | $10,000 to $15,000 or more | $90,000 to $130,000 before multi-sport discounts (our multiplication of one report) | $2,500 to $5,100 (NCAA depth unknown) | Four leagues only, about $4,800 |

Read the cost row with care. Two of the four rows rest on single anonymous posts, and the Sportradar line multiplies one small-app quote by six. It exists to show the size of the gap, not to predict a quote.

### What people say

| Provider | What we found |
| --- | --- |
| SportsDataIO | One Clutch review (5.0, Dec 2020): accurate data, flexible, answers "even on the weekends," but the amount of data is overwhelming and unneeded feeds raised cost. A Reddit user (2020) calls the data extensive and "cleaned." A 2023 Reddit poster calls the private pricing a "red flag." A 2026 post is shocked by the $10,000 minimum, while others call that reasonable for real-time data. |
| Sportradar | A developer comparison says the trial key arrives in minutes but each league is its own API. Reddit (2025) calls it the "gold standard" but says "you'll pay serious money and probably deal with contracts." The 2023 pricing thread above. |
| Goalserve | Two customer reviews on SmartCustomer: 2019 positive on breadth and price, 2020 negative on documentation and JSON. A Reddit user in October 2025 calls it the "cheapest reliable route" for Bet365 odds with solid prematch data. A July 2026 post reports unanswered trial emails. Most feedback is about soccer and odds, not US stats. |

## Decision

We pick **SportsDataIO as the lead candidate** for all six leagues. **Sportradar is the benchmark** we compare against and the fallback for NCAA depth. We do not pick Goalserve or Tank01 as the main provider. The pick becomes final only when all three gates below pass.

Why SportsDataIO leads:

1. **Rights fit is the highest risk, and it has the clearest public answer.** The product stores data for years, derives scores and evolution from it, and sells collectibles. SportsDataIO's FAQ already says yes to storing, to derived analytics, and to negotiating post-termination retention. Sportradar's standard terms point the other way on every one of those, and its NBA and MLB addendum names electronic trading cards as barred.
2. **It covers all six leagues,** including every D-I FBS game and every men's D-I basketball game with live player stats.
3. **It fits central polling.** Unlimited calls, delta endpoints, bulk endpoints, game logs, and a documented refresh guide.
4. **Its cost is likely a small fraction of Sportradar's,** if the Reddit reports are close. That is a guess until there is a quote.

Why not the others:

- **Sportradar.** Better NCAA depth, corrections handling, a better trial, and push. We keep it as the benchmark and as the fallback if SportsDataIO fails the NCAA tests. It needs a written carve-out for collectibles and contests, a different retention clause, and a price we have not seen.
- **Goalserve.** The only published price and a low one. We cannot rate its NCAA coverage, corrections, or rights from public material, and its support record is thin. We keep it as the budget fallback if a bake-off shows it covers NCAA at the depth we need.
- **Tank01.** No NCAA.

**Gates before this becomes final:**

1. **Quote.** A written SportsDataIO quote for the six leagues, real-time, within the client's budget. Request the same from Sportradar for comparison.
2. **License letter.** Written answers from the vendor on the questions in the Rights table, including the three that matter most: contests and collectibles are an allowed use, derived scoring and evolution are allowed, and we can keep historical data and ownership history after the contract ends.
3. **Bake-off.** The tests below, run on real data, pass.

We accept these risks:

- **We may be wrong on price.** If SportsDataIO's quote is far above the reported $10,000 a year, the order changes.
- **SportsDataIO has no push.** We poll every few seconds. Stats are 15 to 30 seconds behind broadcast.
- **College football defensive stats arrive late.** Any contest that scores them live is wrong until the feed catches up. See Open questions.
- **Trial data is scrambled,** so we cannot test live accuracy until we have a Dev Key, Replay access, or a paid license.

## Consequences

### Provider-neutral data model

- **Our own IDs everywhere.** `players` and `games` use our UUIDs. A mapping table `provider_ids (entity_type, our_id, provider, provider_id)` links to the vendor's IDs. Foreign keys in lineups, copies, milestones, and the ledger point at our UUIDs only. This is the same rule as ADR-004 (`auth_identities`). A provider change then needs a re-mapping, not a data migration.
- **Postponements and makeup games.** Sportradar gives a makeup game a new ID, unlinked from the postponed game. Other providers may differ. Our `games` table keeps a `replaces_game_id` link we set from the schedule feed, so a contest can follow a moved game.
- **One adapter interface per provider,** returning our own shapes: schedule, game state, player game stats, rosters, injuries, corrections. Contest, evolution, and challenge code never sees a vendor type.

### Polling design

One worker task, as in ADR-003, runs a loop under a Postgres advisory lock. It reads a `sports_poll_state` table (league, job type, `next_due_at`, `last_ok_at`, failure count) and runs what is due. All provider calls go through one rate limiter set below the provider's limit.

Starting cadences. The bake-off tunes them. Cadences follow SportsDataIO's refresh guide where it gives one.

| Data | Cadence | Notes |
| --- | --- | --- |
| Schedule, status, start times | Hourly. Every 5 minutes from 24 hours before a contest cutoff until it locks. | Cutoff is 1 hour before the earliest eligible game. Flex, TBD, and postponed games move it. |
| Rosters and profiles | Hourly | |
| Injuries | Every 5 minutes on game days | |
| Live game stats | Every 5 seconds per league while any game is live. Use delta or bulk endpoints. | The provider caches at least 3 seconds. Check each league's documented interval. |
| After the game | Poll until the provider marks the game verified final. Then pull final stats once. | About 1 hour after the last play for SportsDataIO and Sportradar. |
| Corrections watch | Re-pull final stats every 10 minutes for 24 hours, then hourly until 72 hours after the game, or use the vendor's change log if it has one | SportsDataIO checks changes for 72 hours for betting results. Sportradar's change log is meant to be pulled every 10 minutes. |
| Game logs, season stats | After each verified final, for players who played | Feeds the card back and Collection Score. |

Request load, our estimates:

- Polling a single game every 5 seconds is 720 requests an hour. A heavy college football Saturday of about 60 FBS games over 3.5 hours is about 150,000 requests and 12 requests per second at peak. Bulk and delta endpoints cut that to a few thousand per league per day.
- This is why polling per game fits poorly with Sportradar's 1 request per second trial and why its Push feeds matter. If Sportradar wins, ask for the production QPS in writing.

Processing, per poll:

1. Save the raw response to S3 with provider, endpoint, and fetch time. Keep it for disputes and replay, and check the license allows it.
2. In one Postgres transaction, upsert `games`, and insert a new row in `player_game_stat_versions (game_id, player_id, version, content_hash, observed_at, provider_status)` only if the content hash changed. Insert an outbox row for each change.
3. A relay moves outbox rows to SQS. Consumers (contest scoring, evolution, challenges, notifications) are idempotent, using dedupe keys like `evolution:{copy_id}:{rarity}` (ADR-006).
4. The API serves users from Postgres and cache. No user request reaches the provider.

Failure recovery:

- Back off with jitter on errors and on `429`. The loop resumes from `sports_poll_state` after a restart, and each poll returns current state, so a missed poll loses no stats.
- If `last_ok_at` for a league is older than 60 seconds while a game is live, mark the league `stale`. Show "scores delayed" in the app, stop settling that league's contests, and page. Add this to ADR-003's staleness metric.
- Run a second schedule sync and a daily full reconcile (all of yesterday's finals against stored versions) so a silent gap is caught within a day.

### Correctness rules to confirm with the client

- **Evolution and settlement act on verified-final stats.** Live stats show as "pending." This avoids granting a permanent reward from a stat that a correction later removes. The cost is a delay of about an hour after the game. A correction after verified-final is an exception that needs a rule (see Open questions).
- **Achievement time versus ownership.** The feed runs 15 to 30 seconds behind broadcast, and we poll every 5 seconds. A user watching TV could buy a collectible after the play and before our data shows it. To close this, evaluate "owned at time T" using the play's own timestamp, not our observation time. Ownership history already exists. As a second guard, consider freezing marketplace trades for athletes in a live game. That is a product choice.
- **Contest cutoff** reads current game start times, never a copy made when the contest was created.

### Bake-off (before gates close)

Run on a real game day for each source we can get real data from, using SportsDataIO Replay and a Dev Key, the Sportradar 30-day trial, and the Goalserve trial:

1. **NCAA coverage.** For one college football Saturday and one college basketball slate, count games with live player stats against all games, and note which conferences are missing.
2. **Latency.** Compare 20 scoring events against the broadcast clock.
3. **Corrections.** Re-pull 5 final box scores the next day and diff them.
4. **Game logs.** Pull the last 10 games for 50 players across all six leagues, including NCAA.
5. **IDs.** Check player ID stability across seasons and whether a college player links to the same person in the pros.
6. **Postponements and flex games.** Confirm how each source reports them.
7. **Replay or sandbox.** Check whether the NCAA sports have a replay mode.

### Operations

- Keep the API key in AWS Secrets Manager (ADR-003). Never send it to the app.
- Use separate keys for staging and production if the vendor allows it. Staging polls on a slower schedule.
- Page on: league staleness, outbox age, dead-letter queue depth for stat consumers, and the daily reconcile finding a diff.
- **Load test.** Feed ADR-007: replay a recorded game day through a stub provider at 5-second cadence, kill the worker mid-game, and confirm no lost versions and no duplicate awards.

### Open questions for the client

- **Budget.** What yearly budget is acceptable for sports data? The reported range runs from about $3,000 to over $100,000 depending on the vendor.
- **Women's college basketball.** In launch scope or not? It is a separate API at each vendor.
- **FCS football and lower divisions.** Out of scope, we assume.
- **Live scoring of defensive players in college football.** SportsDataIO posts these 1 to 2 hours late. Is a delayed score for those players acceptable?
- **Non-power NCAA basketball games.** Sportradar gives player data up to an hour late for some. SportsDataIO says every D-I game is covered live. If this matters, the bake-off decides.
- **Live update cadence.** The scope leaves it open. We assume 5 to 10 seconds from our server, and the user sees 15 to 30 seconds behind broadcast at best.
- **Corrections after verified final.** Does a corrected stat change a settled contest, an evolution, or nothing? Our assumption is nothing after settlement, with a manual path for large errors.
- **Trade freeze during live games.** Acceptable or not?
- **Career milestones.** How many seasons back must milestones count? That decides the historical archive we buy.
- **License review.** Who reviews the vendor agreement for collectibles and contests, and does the client need league approval for stats-driven rewards?

## Sources

SportsDataIO:

- SportsDataIO, [Developer access methods](https://sportsdata.io/developers), [Data rights and licensing FAQ](https://sportsdata.io/help/data-rights-and-licensing-questions), [Refresh rates, feeds, and timing](https://sportsdata.io/help/refresh-rates-feeds-and-timing), [NCAA football API](https://sportsdata.io/ncaa-college-football-api), [NCAA football workflow guide](https://sportsdata.io/developers/workflow-guide/ncaa-football), [NCAA football API documentation](https://sportsdata.io/developers/api-documentation/ncaa-football), [NCAA basketball coverage](https://sportsdata.io/developers/coverages/ncaa-basketball), [NCAA basketball API](https://sportsdata.io/ncaa-college-basketball-api), [NBA API documentation](https://sportsdata.io/developers/api-documentation/nba), [NFL API documentation](https://sportsdata.io/developers/api-documentation/nfl), [Fantasy sports API](https://sportsdata.io/fantasy-sports-api)
- Third-party notes on SportsDataIO: [LineGoat](https://linegoat.com/tools/sportsdataio), [APIs.io plans](https://apis.io/plans/sportsdataio/sportsdataio-plans-pricing/), [API Betting review notes](https://www.apibetting.com/providers/sportsdataio), [Clutch profile](https://clutch.co/profile/sportsdataio)
- Reddit: [fantasy football API for the upcoming season (2026)](https://www.reddit.com/r/fantasyfootballcoding/comments/1vb3tnn/looking_for_a_fantasy_football_api_for_the/), [NFL player headshots (2026)](https://www.reddit.com/r/fantasyfootballcoding/comments/1urzlxu/nfl_player_headshots/), [Sportsdata.io pricing (2023)](https://www.reddit.com/r/sportsanalytics/comments/14pw8fg/sportsdataio_pricing/), [Fantasy sites with a data API (2020)](https://www.reddit.com/r/DynastyFF/comments/itzqu6/fantasy_sites_with_a_data_api/)

Sportradar:

- Sportradar, [Get started](https://developer.sportradar.com/getting-started/docs/get-started), [Your account (trial and limits)](https://developer.sportradar.com/getting-started/docs/your-account), [API authentication and headers](https://developer.sportradar.com/getting-started/docs/authentication), [Sports data API packages](https://sportradar.com/media-tech/data-content/sports-data-api/), [Best practices for integrating](https://sportradar.com/content-hub/blog/best-practices-for-integrating-sportradars-sports-data-apis/)
- Sportradar, [NCAA football overview](https://developer.sportradar.com/football/reference/ncaafb-overview), [NCAA men's basketball overview](https://developer.sportradar.com/basketball/reference/ncaamb-overview), [NCAA men's basketball FAQ](https://developer.sportradar.com/basketball/reference/ncaamb-faq), [NFL game status workflow](https://developer.sportradar.com/football/docs/nfl-ig-game-status-workflow), [NBA game status workflow](https://developer.sportradar.com/basketball/docs/nba-ig-game-status-workflow), [Tracking live games](https://developer.sportradar.com/football/docs/nfl-ig-live-game-retrieval), [Retrieving seasonal statistics](https://developer.sportradar.com/football/docs/nfl-ig-seasonal-stats), [Why media and fantasy platforms trust Sportradar football data](https://sportradar.com/content-hub/blog/why-top-media-broadcasters-and-fantasy-platforms-trust-sportradar-football-data-to-power-the-2025-season/?lang=en-us)
- Sportradar terms, [Terms and conditions](https://developer.sportradar.com/sportradar-updates/page/terms-and-conditions), [Official Media Data Addendum](https://developer.sportradar.com/Official_Media_Data_Addendum), [NHL Addendum](https://developer.sportradar.com/sportradar-updates/page/nhl-addendum)
- Third-party notes on Sportradar: [API Betting review notes](https://www.apibetting.com/providers/sportradar), [SportDex](https://sportdex.net/providers/sportradar/)
- Reddit: [API pricing (2023)](https://www.reddit.com/r/Sportradar/comments/s9j4tl/api_pricing/), [Reliable sports data API (2025)](https://www.reddit.com/r/BusinessVault/comments/1n9tf0c/i_need_to_find_a_reliable_sports_data_api_that/)

Goalserve and Tank01:

- Goalserve, [NFL API prices](https://www.goalserve.com/about-us/sport-data-feeds/nfl-api/prices), [USA sports package prices](https://www.goalserve.com/about-us/sport-data-feeds/ussports-api/prices), [USA sports package description](https://www.goalserve.com/en/sport-data-feeds/ussports-api/description), [NBA API description](https://www.goalserve.com/en/sport-data-feeds/NBA-api/description), [Data feed overview and FAQ](https://www.goalserve.com/en/sport-data-feeds/american-football-api/prices), [API reference](https://documentation.goalserve.com/), [Full package coverage](https://www.goalserve.com/en/sport-data-feeds/full-package-api/coverage)
- Third-party notes on Goalserve: [SmartCustomer reviews](https://www.smartcustomer.com/reviews/goalserve.com), [SportDex](https://sportdex.net/providers/goalserve/), [Goalserve vs Sportradar (faun.dev)](https://faun.dev/toolbox/goalserve-vs-sportradar-api/), [Goalserve vs SportsDataIO (faun.dev)](https://faun.dev/toolbox/goalserve-vs-sportsdataio/)
- Reddit: [Any reliable Bet365 odds API (2025)](https://www.reddit.com/r/algobetting/comments/1nxprwy/any_reliable_bet365_odds_api_out_there/), [Soccer livescore API (2026)](https://www.reddit.com/r/Scorebug/comments/1uouk42/soccer_livescore_api/)
- Tank01, [Pricing and coverage](https://www.tank01.com/)

Comparable products and leagues:

- Wikipedia, [Sorare](https://en.wikipedia.org/wiki/Sorare), SorareData, [Opta partnership](https://soraredata.medium.com/soraredata-now-uses-opta-to-provide-real-time-so5-scoring-more-a564e8fd2f1e) (third-party site)
- SportBusiness, [FanDuel adds NFL data in expanded Sportradar partnership](https://www.sportbusiness.com/news/fanduel-adds-nfl-data-in-expanded-sportradar-partnership/)
- NFL, [Betting operator partnerships for 2026](https://www.nfl.com/news/nfl-draftkings-fanduel-fanatics-sports-betting-partners) (names Genius Sports as exclusive data distribution partner)
- MLB, [MLB and Sportradar official partnership](https://www.mlb.com/press-release/mlb-and-sportradar-announce-official-exclusive-global-partnership)

Project:

- [Pack Draft development feature scope](../../scope/project_scope.md)
- [ADR-001: Use PostgreSQL as the primary database](./001-primary-database.md)
- [ADR-002: Use AWS as the cloud provider](./002-cloud-provider.md)
- [ADR-003: Use Node.js with TypeScript on ECS Fargate for the API](./003-api-runtime-and-compute.md)
- [ADR-004: Use Auth0 with browser sign-in for authentication](./004-auth-service.md)
- [ADR-006: Keep the notification inbox in Postgres and send push through the Expo Push Service](./006-app-notifications.md)
- [ADR-007: Load testing framework](./007-load-testing-framework.md)
