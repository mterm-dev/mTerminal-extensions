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
  },
])
