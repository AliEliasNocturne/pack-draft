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
- Docker (local Postgres for the API)
- For the mobile app: Xcode (iOS simulator) and/or Android Studio (emulator), or Expo Go on a device

## Getting started

```sh
pnpm install
pnpm db:up
pnpm db:migrate
```

| App | Quick start | Details |
| --- | --- | --- |
| API | `pnpm dev:api` | [apps/api/README.md](apps/api/README.md) |
| Mobile | `pnpm dev:mobile` | [apps/mobile/README.md](apps/mobile/README.md) |

Local Postgres defaults: `postgresql://pack:pack@localhost:5432/pack_draft` (see `docker-compose.yml`).

## Scripts (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm dev:api` | API with file watching (`tsx watch`) |
| `pnpm dev:mobile` | Expo dev server |
| `pnpm db:up` | Start local Postgres (Docker Compose) |
| `pnpm db:down` | Stop local Postgres |
| `pnpm db:generate -- --name=<slug>` | Generate a named Drizzle SQL migration from the API schema |
| `pnpm db:migrate` | Apply pending Drizzle migrations |
| `pnpm build` | Build every package that has a `build` script |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm lint` | ESLint in every package that defines it |
| `pnpm format` | Prettier write in every package that defines it |
| `pnpm test` | Run tests in every package (Vitest API, Jest mobile) |
| `pnpm check` | lint + typecheck + test + build (CI-ready) |

Run a script in one package with `pnpm --filter @pack-draft/api <script>`.

## Conventions

- Package names use the `@pack-draft/` scope.
- Dependency versions used by several packages live in the `catalog:` section of `pnpm-workspace.yaml`.
- Shared Zod schemas will go in `packages/` when the API and app need to share them.

## Cursor: Ponytail (optional)

[Ponytail](https://github.com/DietrichGebert/ponytail) steers the Cursor agent toward the smallest correct change. It is a personal install (user hooks), not checked into this repo.

```sh
git clone https://github.com/DietrichGebert/ponytail.git
node ponytail/scripts/cursor-hooks.js install
```

Leave the clone where you put it — the hooks point at that path. Open a new Cursor chat to activate.

| Message | Effect |
| --- | --- |
| `/ponytail` | Show the current level |
| `/ponytail lite` | Light touch |
| `/ponytail full` | Default |
| `/ponytail ultra` | Max minimalism |
| `/ponytail off` | Turn off for this chat |

Uninstall: `node ponytail/scripts/cursor-hooks.js uninstall`. Full agent list and options: [INSTALL.md](https://github.com/DietrichGebert/ponytail/blob/main/INSTALL.md).
