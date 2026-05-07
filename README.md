# mterminal-extensions

Reference implementations of the six core mTerminal extensions, distributed via the mTerminal marketplace.

## Layout

```
packages/
  extension-api/      TypeScript declarations for the mTerminal extension API (consumed via workspace:^)
  remote-ssh/         remote SSH host registry, terminal sessions, SFTP filesystem service
  file-browser/       side-panel file browser with full CRUD over local fs and SSH/SFTP
  git-panel/          full-featured Git panel
  error-linkifier/    detects file:line:col patterns in terminal output
  git-status-mini/    small Git status panel
  theme-pack-extra/   extra terminal themes (oxocarbon, rose pine pine)
```

pnpm workspace. Each extension package is published independently to the marketplace as a `.mtx` bundle. `extension-api` is internal to this repo and not published as `.mtx`.

## Prerequisites

- Node.js >= 20
- pnpm >= 10

`@mterminal/extension-api` lives inside this repo at `packages/extension-api/` and is consumed via `workspace:^`. No sibling `mTerminal/` clone is required.

## Develop

```bash
pnpm install
pnpm -r build
pnpm -r typecheck
```

Single package:

```bash
pnpm --filter @mterminal/ext-remote-ssh build
```

## Publishing

Tag-driven release. Tags follow `<id>-v<semver>`:

```bash
git tag remote-ssh-v1.0.1
git push origin remote-ssh-v1.0.1
```

The `publish` workflow builds the matching package and runs `mtx pack && mtx publish`.

Required secrets: `MTX_API_KEY`, `MTX_PRIVATE_KEY`, `MTX_ENDPOINT` (optional).

Local batch publish:

```bash
node scripts/publish-all.mjs
node scripts/publish-all.mjs --dry-run
```

## Add a new extension

See [CONTRIBUTING.md](./CONTRIBUTING.md).
