# Contributing

## Adding a new extension

1. Scaffold:

   ```bash
   cd packages
   pnpm dlx mtx init my-extension
   ```

   `mtx init` creates `packages/my-extension/` with a manifest, `src/`, `tsup.config.ts`, and `tsconfig.json`. It also fills in `mterminal.publisher.{authorId, keyId}` from your local `~/.mtx/config.json`.

2. Update the package name to match the workspace convention:

   ```json
   { "name": "@mterminal/ext-my-extension" }
   ```

3. Add `@mterminal/extension-api` as a devDependency via the workspace protocol:

   ```json
   "devDependencies": {
     "@mterminal/extension-api": "workspace:^"
   }
   ```

   The package lives at `packages/extension-api/` inside this repo.

4. Implement the extension. Build verifies the bundle:

   ```bash
   pnpm install
   pnpm --filter @mterminal/ext-my-extension build
   pnpm --filter @mterminal/ext-my-extension typecheck
   ```

5. Smoke test against a local mTerminal: copy the package into `mTerminal/extensions/` (or symlink) and run with `MTERMINAL_LOAD_BUILTINS=1 pnpm dev` from the mTerminal repo.

6. Publish:

   ```bash
   git tag my-extension-v1.0.0
   git push origin my-extension-v1.0.0
   ```

   The `publish` workflow handles `mtx pack && mtx publish` with the secrets from the repo settings.

## Updating an existing extension

1. Bump `version` in `packages/<id>/package.json`.
2. Build, typecheck, smoke test.
3. Tag: `git tag <id>-v<new-version> && git push origin <id>-v<new-version>`.

Each extension has an independent semver — no monorepo-wide release.

## Commits

Plain, lowercase, imperative. No Claude footer.
