import { defineConfig } from 'tsup'
import { readFile } from 'node:fs/promises'

const stripNewFunctionPlugin = {
  name: 'ssh2-strip-new-function',
  setup(build: import('esbuild').PluginBuild) {
    build.onLoad({ filter: /ssh2\/lib\/protocol\/node-fs-compat\.js$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8')
      return {
        contents: src.replace(
          /new Function\(\s*['"]return 2n \*\* 32n['"]\s*\)\(\)/,
          '(2n ** 32n)',
        ),
        loader: 'js',
      }
    })
  },
}

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
    esbuildPlugins: [stripNewFunctionPlugin],
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
