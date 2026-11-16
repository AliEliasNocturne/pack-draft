# pack-draft

pnpm monorepo.

```
apps/
  api/      Fastify + Zod API (TypeScript, ESM)
  mobile/   Expo / React Native app (iOS + Android)
packages/   Shared packages (empty for now)
docs/       Architecture decision records
scope/      Project scope and tracking
```

## Requirements

- Node 22 or newer (`.nvmrc` pins 24)
- pnpm 10 (`corepack enable` picks the version from `package.json`)
- For the mobile app: Xcode (iOS simulator) and/or Android Studio (emulator), or Expo Go on a device

## Getting started

```sh
pnpm install
```

| App | Quick start | Details |
| --- | --- | --- |
| API | `pnpm dev:api` | [apps/api/README.md](apps/api/README.md) |
| Mobile | `pnpm dev:mobile` | [apps/mobile/README.md](apps/mobile/README.md) |

## Scripts (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm dev:api` | API with file watching (`tsx watch`) |
| `pnpm dev:mobile` | Expo dev server |
| `pnpm build` | Build every package that has a `build` script |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm test` | Run tests in every package (Vitest for the API) |

Run a script in one package with `pnpm --filter @pack-draft/api <script>`.

## Conventions

- Package names use the `@pack-draft/` scope.
- Dependency versions used by several packages live in the `catalog:` section of `pnpm-workspace.yaml`.
- Shared Zod schemas will go in `packages/` when the API and app need to share them.
