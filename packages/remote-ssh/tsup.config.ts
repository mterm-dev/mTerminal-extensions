import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { main: 'src/main.ts' },
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    outDir: 'dist',
    target: 'node18',
    platform: 'node',
    clean: true,
    splitting: false,
    sourcemap: true,
    external: ['electron', 'cpu-features', /\.node$/],
    noExternal: ['ssh2', 'asn1', 'bcrypt-pbkdf'],
  },
  {
    entry: { renderer: 'src/renderer.tsx' },
    format: ['esm'],
    outExtension: () => ({ js: '.mjs' }),
    outDir: 'dist',
    target: 'es2022',
    clean: false,
    splitting: false,
    sourcemap: true,
    external: ['@mterminal/extension-api', 'electron'],
    noExternal: [/.*/],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
  },
])
