import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // Renderer side: browser-targeted, thin IPC wrapper.
    entry: { renderer: 'src/renderer.ts' },
    format: ['esm'],
    outExtension: () => ({ js: '.mjs' }),
    outDir: 'dist',
    target: 'es2022',
    platform: 'browser',
    clean: true,
    splitting: false,
    sourcemap: true,
    external: ['@mterminal/extension-api'],
    noExternal: [/.*/],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  },
  {
    // Main side: Node-targeted, hosts the Codex SDK (which spawns child
    // processes and reads files). Externalize Node built-ins; bundle the
    // SDK so the host doesn't need to resolve npm deps at runtime.
    //
    // The Codex SDK uses `createRequire(import.meta.url)` to load its
    // platform-specific native binary. tsup → esbuild compiles the source
    // to CJS but emits `var import_meta = {}` for the ESM-only token,
    // leaving `import.meta.url` as undefined → SDK crashes at module load.
    // Inject a real value via a banner + define rewrite:
    entry: { main: 'src/main.ts' },
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    outDir: 'dist',
    target: 'node20',
    platform: 'node',
    clean: false,
    splitting: false,
    sourcemap: true,
    external: ['@mterminal/extension-api'],
    noExternal: [/.*/],
    define: {
      'import.meta.url': '__mt_import_meta_url__',
    },
    banner: {
      js: 'const __mt_import_meta_url__ = require("url").pathToFileURL(__filename).href;',
    },
  },
])
