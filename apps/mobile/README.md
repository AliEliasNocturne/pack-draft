# @pack-draft/mobile

**Expo SDK 58** / **React Native** app for iOS and Android. Blank TypeScript entry (`App.tsx` + `index.ts`); navigation and variants will follow [ADR-008](../../docs/decisions/008-mobile-app-deployments.md).

## Prerequisites

- Dependencies installed from the **monorepo root**: `pnpm install`
- **iOS:** Xcode and a simulator (or a device with Expo Go)
- **Android:** Android Studio and an emulator (or a device with Expo Go)

## Development

From the repo root:

```sh
pnpm dev:mobile    # Expo dev server
pnpm ios           # open iOS simulator
pnpm android       # open Android emulator
```

From this directory:

```sh
pnpm start
pnpm ios
pnpm android
```

Press `i` / `a` in the Expo CLI to open a simulator if you started with `start` only.

## Scripts

Run from `apps/mobile` or with `pnpm --filter @pack-draft/mobile <script>` from the root.

| Script | Purpose |
| --- | --- |
| `start` | Expo dev server |
| `ios` | Dev server + iOS |
| `android` | Dev server + Android |
| `web` | Dev server + web (optional) |
| `typecheck` | `tsc --noEmit` |

## Adding dependencies

Use Expo’s resolver so versions match the SDK — **do not** `pnpm add` native/Expo packages directly:

```sh
pnpm --filter @pack-draft/mobile exec expo install <package-name>
```

Check the tree after changes:

```sh
pnpm --filter @pack-draft/mobile exec expo-doctor
```

Only one version of React, React Native, and each native module may exist across the monorepo ([Expo monorepos](https://docs.expo.dev/guides/monorepos/), [ADR-008](../../docs/decisions/008-mobile-app-deployments.md)).

## Configuration

- **`app.json`** — app name, slug (`pack-draft`), icons, platform settings. Native projects are generated (CNG); avoid hand-editing `ios/` or `android/` when they appear.
- **`AGENTS.md`** — agent-oriented Expo notes (SDK version, `expo install`, future Expo Router guidance).

## Docs version

This app targets Expo **58** (`expo` in `package.json`). Use versioned docs: [https://docs.expo.dev/versions/v58.0.0/](https://docs.expo.dev/versions/v58.0.0/).

## Related docs

- [Root README](../../README.md) — monorepo overview
- [ADR-008](../../docs/decisions/008-mobile-app-deployments.md) — builds, variants, EAS / Expo Workflows
- [ADR-009](../../docs/decisions/009-testing-framework.md) — Jest + `jest-expo` (not wired in this scaffold yet)