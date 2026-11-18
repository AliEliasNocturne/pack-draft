# ADR-013: Build the mobile app with Expo and React Native

## Status

Proposed (pending client approval)

## Date

2026-11-17

## Context

The tracking item "Mobile framework" was still open. Several later ADRs already assume Expo and React Native: [ADR-006](./006-app-notifications.md) (Expo Push), [ADR-008](./008-mobile-app-deployments.md) (EAS Build / Submit / Update), and [ADR-009](./009-testing-framework.md) (Jest with `jest-expo`). The repo already has `apps/mobile` on Expo SDK 58.

We need an explicit choice so those assumptions are either confirmed or reopened.

Constraints from scope: one codebase for iOS and Android, store distribution, over-the-air fixes, push notifications, and a small TypeScript team that also owns the Fastify API.

## Options Considered

### Option A: Expo (managed) + React Native

- Pros: Matches ADR-006/008/009; EAS handles build, submit, and OTA updates; Expo Push bridges FCM/APNs until we need native tokens directly; one TypeScript codebase; Expo Go and dev clients for day-to-day work.
- Cons: Native modules outside the Expo ecosystem need a config plugin or a development build; SDK upgrades are periodic work.

### Option B: Bare React Native (no Expo)

- Pros: Full control of native projects.
- Cons: We would own Xcode/Android build pipelines, push token plumbing, and OTA ourselves; conflicts with ADR-008; more ops for a small team.

### Option C: Flutter

- Pros: Strong cross-platform UI toolkit; one codebase.
- Cons: Dart instead of TypeScript; breaks the shared-language story with the API; forces a rewrite of ADR-006/008/009 assumptions.

### Option D: Native (Swift + Kotlin)

- Pros: Best platform fidelity.
- Cons: Two apps, two hiring pools, no shared UI logic; far higher cost for this product stage.

## Decision

We choose **Expo with React Native** because:

1. It is already the stack in `apps/mobile` and the deployment/push/testing ADRs.
2. EAS covers store builds and OTA fixes without maintaining `ios/` and `android/` by hand (Continuous Native Generation).
3. The team stays in TypeScript across API and mobile.

Navigation starts as the classic Expo entry (`App.tsx` + `index.ts`). When the app gains multiple screens, adopt **Expo Router** with routes under `src/app/`.

## Consequences

- Keep using `expo install` for native-capable packages so versions match the SDK.
- Do not commit generated `ios/` or `android/` directories; configure native behavior in `app.json` and config plugins.
- ADR-006, ADR-008, and ADR-009 stay valid on this choice. If the client rejects Expo, reopen those three.
- Client sign-off on this ADR closes the "Mobile framework" tracking item.

## Sources

- [Expo docs](https://docs.expo.dev/)
- [ADR-006 — app notifications](./006-app-notifications.md)
- [ADR-008 — mobile app deployments](./008-mobile-app-deployments.md)
- [ADR-009 — testing framework](./009-testing-framework.md)
