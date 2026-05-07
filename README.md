# mterminal-extensions

Reference implementations of the six core mTerminal extensions, distributed via the mTerminal marketplace.

## Layout

```
packages/
  remote-ssh/         remote SSH host registry, terminal sessions, SFTP filesystem service
  file-browser/       side-panel file browser with full CRUD over local fs and SSH/SFTP
  git-panel/          full-featured Git panel
  error-linkifier/    detects file:line:col patterns in terminal output
  git-status-mini/    small Git status panel (proof-of-concept extension)
  theme-pack-extra/   extra terminal themes (oxocarbon, rose pine pine)
```

This repository is a **pnpm workspace**. Each package builds to `dist/` (where applicable) and is published independently to the mTerminal marketplace as a `.mtx` bundle by the `mtx` CLI.

The application repository (`mTerminal`) does not bundle these extensions in production — they install at runtime from the marketplace via the in-app browser (`Ctrl+Shift+X` / `Cmd+Shift+X`).

## Prerequisites

- Node.js >= 20
- pnpm >= 10
- The mTerminal source repo cloned next to this one (sibling directory): `../mTerminal/`. The `@mterminal/extension-api` types are consumed via a `file:` link to `../../../mTerminal/packages/extension-api` until a stable npm release exists.

## Develop

```bash
pnpm install
pnpm -r build         # build all packages
pnpm -r typecheck     # tsc --noEmit on all packages
```

Build a single package:

```bash
pnpm --filter @mterminal/ext-remote-ssh build
```

Each package writes its bundle to `packages/<id>/dist/`:

- `dist/main.cjs` for extensions with a main-process entry (`remote-ssh`, `file-browser`, `git-panel`).
- `dist/renderer.mjs` for the renderer entry (or pre-shipped `src/renderer.mjs` for the small extensions that don't need a build step).

## Publishing

Publishing is automated by tag push. Tags follow `<id>-v<semver>`:

```bash
git tag remote-ssh-v1.0.1
git push origin remote-ssh-v1.0.1
```

The `publish` workflow:

1. parses the tag into `(extId, version)`;
2. installs deps and builds the matching package;
3. runs `mtx pack && mtx publish` from `packages/<extId>/`.

Required GitHub secrets:

- `MTX_API_KEY` — author API key issued by the marketplace.
- `MTX_PRIVATE_KEY` — Ed25519 private key (raw bytes b64) used to sign the `.mtx` bundle.
- `MTX_ENDPOINT` — optional override (default points to production marketplace).

For a local batch publish (avoid in CI):

```bash
node scripts/publish-all.mjs            # build all + pack + publish each
node scripts/publish-all.mjs --dry-run  # print what would happen
node scripts/publish-all.mjs --skip-build
```

## Publisher placeholder

Every `package.json` ships with `mterminal.publisher.{authorId, keyId}` set to `gh-PLACEHOLDER` / `gh-PLACEHOLDER:key1`. Replace these with the real values issued by `mtx login` + `mtx keygen` before the first publish — the marketplace will reject manifests whose publisher block doesn't match the authenticated author.

## Conventions

The same conventions documented in [`mTerminal/CLAUDE.md`](../mTerminal/CLAUDE.md) apply here:

- TypeScript strict, no code comments.
- pnpm only.
- Lowercase UI labels.
- Semver per package; tag-driven release.

## Add a new extension

See [CONTRIBUTING.md](./CONTRIBUTING.md).
