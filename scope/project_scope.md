# Pack Draft — Development Feature Scope

**Kaedama Studios Inc.** · Prepared for prospective developers · October 9, 2026

---

## Overview

**Pack Draft** is a multi-league sports collecting app. Users open packs, collect athletes, and watch collectibles evolve as those athletes achieve things in real life. Collections can be used in contests and users can buy, sell, or trade collectibles and unopened packs.

This document describes the **launch experience** we want to build. It is meant to clarify build scope, platform choices, and what is realistic for budget and timeline. If phasing is needed, we want your advice. Future ideas and open decisions are listed at the end.

**Target leagues (licensing dependent):** NBA, NFL, MLB, NHL, NCAA football, NCAA basketball — including bowl games and March Madness where applicable.

**Out of scope for this document:** Admin dashboard.

---

## Accounts and profiles

- Sign up: email/password, Apple, Google.
- Verify account; reset forgotten password.
- **Profile:** unique username, avatar, favorite teams/sports, Collection Score, contest history.
- **Privacy:** public or private profile/collection. Public profiles allow browsing the collection; balances and private transactions stay hidden.
- Delete account; notification preferences.
- Account verification triggers referral rewards (when applicable).

---

## Home and navigation

**Main areas:** Home, Packs, Collection, Marketplace, Contests, Profile/Wallet.

**Home:** featured packs, upcoming/live contests, active lineup results, recent evolutions; filter by sport.

*Deferred:* marketplace trends and marketplace highlights.

---

## Store and currency

- Single currency at launch: **credits** (primary revenue: buying credits with real money).
- Buy packs/bundles with real money or credits.
- **Wallet:** spendable credits vs credits held in offers (shown separately).
- Transaction history: purchases, rewards, entry fees, sales, trades, refunds, offer holds/releases.
- Pricing and bundle amounts TBD; payment platforms TBD based on your recommendation.
- Credits are not withdrawable as cash; cash prizes are out of scope.

---

## Packs and unopened inventory

- League-specific and mixed-sport packs; **5 collectibles** standard; alternate sizes for deals, promos, starter packs.
- **Starter grant:** one free 10-collectible pack per league/sport offered, once per account (timing during signup TBD).
- Packs can stay sealed, open later, or be sold/traded.
- **Limited releases:** timed, quantity-limited, or both; show time/stock remaining.
- **Per-account purchase limits** for limited editions; limits and stock must be correct under high concurrent demand.
- **Contents fixed at issue:** hidden until open; unchanged if held/traded (including years later); tied to original release odds.
- Open after release ends is allowed; cannot open while listed or held in an offer.

---

## Breaker-style pack reveal

- On open, all collectibles enter the collection at once and become evolution-eligible.
- Reveal shows already-added items; **resume-safe** if the app closes mid-reveal (no loss, duplicates, or double charge).
- Experience: breaker-style slow reveal — border tease → rarity → athlete.
- **UX requirements:** press-and-hold, drag, pause on release, progress counter, reveal-all; all pack sizes.
- Nothing evolves inside a sealed pack; copy must be owned when the real-world achievement occurs.

---

## Collection and collectible details

- Browse, search by player, filter (league/sport, team, position, rarity, set/season, availability).
- Sort: player name, PR, rarity, acquisition date, evolution progress; favorites.
- **Duplicates:** group identical collectible + rarity with quantity; different rarities separate; expand to inspect individual copies and history/milestone progress.
- **Detail view:** player info, Player Rating, rarity, milestones, achievements, availability.
- **Card back:** latest 10 games (dates, opponents, sport-appropriate stats) from sports data integration.
- **Wishlist:** unowned filter; add/remove wanted items; find marketplace listings (no auto wishlist alerts at launch).
- Show copies listed, in lineups, or reserved in offers; individual copies remain distinguishable when grouped.

---

## Collection Score and set completion

- **Collection Score:** current-season collectibles only; each player counts once per set at highest owned rarity; duplicates don’t add points; same player in different sets counts separately.
- Updates on ownership, counted rarity, or seasonal eligibility changes.
- **Contest tiers** unlocked by Collection Score (points per rarity and thresholds TBD).
- **Set progress:** owned vs required players, %, missing list; duplicates don’t inflate completion.
- **Completion rewards:** designated collectible; separate tiers by rarity; all required players at target rarity or higher.
- One award per account per set per completion tier; higher rarity satisfies lower tiers; reward collectible excluded from checklist.
- Rewards are **permanent** (not revoked if user later sells required copies); delivery/claim UX and exact player catalogue TBD.

---

## Evolution and seasonal lifecycle

- **Player Rating (PR):** fixed for the collectible’s season; lineup cost / milestone difficulty; evolution increases **rarity**, not PR.
- Evolution is automatic when an owned copy qualifies for a real achievement; all eligible duplicates upgrade; optional evolution reveal (no manual claim required).
- Must own the copy **at achievement time**; retroactive purchase does not count.
- Milestones: league, position, starting PR, player context (templates, thresholds, rarity cap TBD).
- Earned rarity and achievement history persist per copy through trades/sales.
- Collectibles can evolve in later seasons until rarity cap; post-original-season evolution is collect-only.
- Older collectibles keep PR/history; no contests or Collection Score; still tradable.
- Listed/trade-reserved copies still evolve; rarity change may require offer reconfirmation; fixed-price listing after evolution TBD.
- Cross-season milestones and rollover dates TBD; no finalized post-cap reward system.

---

## Standard contests and lineup building

- Single-sport and mixed-sport; single-day and multi-day.
- One lineup per user per contest; athlete appears at most once per lineup (even across sets/rarities).
- Per-contest config: lineup size, PR cap, eligible sports/sets, positions, Collection Score threshold, etc. (8 players / 425 PR cap are **prototype placeholders**).
- One active contest entry per copy; overlapping entries need another copy; submitted lineup copies cannot be listed/sold/traded.
- **Cutoff:** entry/editing closes 1 hour before earliest game on opening day (across eligible sports); full lock at cutoff.
- Editable until cutoff; no refund on withdrawal; removing from editable lineup frees copy unless held elsewhere.
- UI: filter eligible copies, PR remaining, invalid selection reasons; lineup presets and auto-fill (legal lineup, not optimal).
- Presets revalidate on apply.
- Pre-entry: scoring rules, games, entry fee, guaranteed pool, payout breakdown.
- Other lineups hidden until contest start (including hour between cutoff and first game); then visible with per-player scoring.
- Multi-day policy TBD; baseline = lineup locked for full duration.

---

## Live scoring, results, and rewards

- Live points and standings; per-athlete contribution breakdown.
- Contest history with final standings and rewards; automatic settlement when finalized.
- Launch rewards: credits, packs, exclusive collectibles (physical prizes later); exact payouts TBD.
- Currency ties: combine and split equally (rounding / pack-collectible ties TBD).
- Cancel disrupted contests: refund fees, release copies (separate from user withdrawal prohibition).
- Rules needed: finalization timing, stat corrections, postponements, minimum participation, inventory release, mixed-sport scoring parity.

---

## Private leagues and tournaments

- Create private leagues/tournaments; invite via link/code; **standings-based** at launch (no elimination brackets).
- League spans multiple contests; cumulative contest points; registration closes at first cutoff.
- Creators: presets or custom sports, PR caps, lineup rules, eligibility.
- Admin chooses one lineup for the series or fresh lineup per contest (must respect cutoff/reservation rules).
- Join fee in credits; creator picks preset entry tier (not arbitrary amounts).
- Pack rewards from platform based on tier + participant count; creator does not supply prizes; schedule visible pre-join; final allocation at registration close.
- Separate from standard contests’ guaranteed pools; tier tables and cancellation rules TBD.

---

## Marketplace: sales, offers, and trading

- List individual collectibles and sealed packs (including limited packs held after release).
- Fixed credit prices; offers and counteroffers; **no marketplace fees** at launch (auctions later).
- Discovery by item listing, not by user search.
- Browse/search/filter; inspect rarity, history, evolution, recent 10-game stats; pack listings show set/size/odds metadata **without** revealing hidden contents.
- Offers can mix packs, collectibles, credits on either side; propose, counter, accept, reject, cancel.
- Offers expire after 24 hours (counter timer restart TBD).
- **Holds:** offered assets locked until resolved; cannot open, spend, sell, lineup, or double-offer.
- Multiple offers per listing; each bidder’s assets held; accept/sale closes others and releases holds.
- Listed assets cannot enter lineups; lineup copies cannot list; listed packs cannot open.
- On accept: validate balances/availability; atomic transfer; preserve history and sealed contents; update Collection Score and ledger.
- Reject/cancel/expire releases holds; counteroffer reservation rules must prevent uncommitted transfers.
- All collectibles (referral, completion rewards included) eligible for sale/trade/contests when rules allow.

---

## Login challenges and referrals

- **Daily login:** streak-based rewards; claim daily; miss a day resets streak.
- Prize-paying contest finish can restore streak (not necessarily 1st); recovery window and private league eligibility TBD; restored streak likely without back-paying missed days (TBD).
- **Daily/weekly challenges:** app actions and real-world achievements with owned collectibles; show requirements, progress, deadline, reward; claim button; unclaimed reward rule TBD.
- **Referral:** link/code on signup; verification qualifies once per new account.
- Referrer: random sealed 1-collectible pack from referral set; new user gets normal starter packs only.

---

## Notifications

- In-app inbox + push; category preferences.
- Topics: contest cutoff/results, evolution, marketplace activity, daily rewards, pack releases, referrals.
- No wishlist listing alerts at launch; social/chat future scope.

---

## Sports data and supporting systems

- Paid API: live stats, schedules/status, IDs, rosters, historical game logs for requested competitions.
- Shared pipeline for: contest scoring, live standings, collectible backs, evolution, performance challenges.
- **Central fetch, fan-out to users** — not per-user provider calls; assess caching, cadence, rate limits, failure recovery, cost.
- Persist: accounts, unique copies, hidden pack contents, ownership history, milestones, lineups, transactions, offer holds, claims, completion awards.
- **Server-side validation** for purchases, opens, transfers, contest eligibility, rewards; **idempotent retries** (no duplicate credits/assets/charges/awards).
- Provider choice: commercial rights, NCAA depth, career milestones, latency, corrected stats; data feed ≠ collectible licensing.

### Sports API shortlist (evaluate)

| Provider | Notes | Link |
|----------|--------|------|
| **Tank01** | NBA, NFL, MLB, NHL, WNBA; no NCAA listed. Tiered req/day pricing. | [tank01.com](https://www.tank01.com/) |
| **SportsDataIO** | Pro + NCAA FB/BB; commercial pricing by use case/volume. | [sportsdata.io/developers](https://sportsdata.io/developers) |
| **Goalserve** | US package incl. NCAA; confirm coverage and commercial price. | [goalserve USSports API](https://www.goalserve.com/about-us/sport-data-feeds/ussports-api/prices) |
| **Sportradar** | Pro + NCAA APIs; commercial quote; validate all leagues. | [developer.sportradar.com](https://developer.sportradar.com/) |

---

## Future features

- Physical contest prizes and fulfillment.
- Marketplace trends/highlights; auctions.
- Social: following, friends, chat, messaging.
- Elimination brackets / public leagues (possible later).
- Additional sports and post-cap rewards (ideas only).

---

## Open decisions and configurable values

| Area | Items to decide |
|------|------------------|
| **Balancing** | PR formula, sport scoring, mixed-sport parity, lineup defaults, rarity ladder/cap, milestones, score values, contest thresholds |
| **Economy** | Credit/pack pricing and odds, fees, login/challenge rewards, standard payouts, private league reward tables |
| **Season rules** | Rollover by sport, active sets, cross-boundary contests, milestone continuity |
| **Results** | Settlement delay, stat corrections, postponed games, min participants, rounding, tie handling for non-currency rewards |
| **Transactions** | Listing behavior after evolution, counteroffer timers/reservations, reconfirmation |
| **Rewards** | Claim expiry, set completion delivery, streak recovery, private league payout eligibility |
| **Private series** | Cancellation/refunds, long-series asset reservations, evolving copies in locked lineups |
| **Implementation** | Starter pack timing, timezone for daily/weekly resets, payments, final API/plan, live update cadence |
