import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { renderer: 'src/renderer.ts' },
  format: ['esm'],
  outExtension: () => ({ js: '.mjs' }),
  outDir: 'dist',
  target: 'es2022',
  clean: true,
  splitting: false,
  sourcemap: true,
  external: ['@mterminal/extension-api'],
  noExternal: [/.*/],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})
