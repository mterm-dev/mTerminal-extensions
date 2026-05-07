#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const packagesDir = join(root, 'packages')

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const skipBuild = args.has('--skip-build')

function listPackages() {
  return readdirSync(packagesDir)
    .filter((name) => {
      const pkgJson = join(packagesDir, name, 'package.json')
      try {
        return statSync(pkgJson).isFile()
      } catch {
        return false
      }
    })
    .map((name) => {
      const manifest = JSON.parse(readFileSync(join(packagesDir, name, 'package.json'), 'utf8'))
      return { dir: name, name: manifest.name, version: manifest.version }
    })
}

function run(cmd, cmdArgs, opts) {
  const printable = `${cmd} ${cmdArgs.join(' ')}`
  if (dryRun) {
    console.log(`[dry-run] ${printable} (cwd=${opts?.cwd ?? process.cwd()})`)
    return 0
  }
  console.log(`> ${printable}`)
  const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts })
  if (res.status !== 0) {
    console.error(`failed: ${printable}`)
    process.exit(res.status ?? 1)
  }
  return 0
}

const pkgs = listPackages()
console.log(`Found ${pkgs.length} packages:`)
for (const p of pkgs) console.log(`  - ${p.name} @ ${p.version} (packages/${p.dir})`)

if (!skipBuild) {
  run('pnpm', ['-r', 'build'], { cwd: root })
}

for (const p of pkgs) {
  const cwd = join(packagesDir, p.dir)
  console.log(`\n=== ${p.name} ===`)
  run('pnpm', ['exec', 'mtx', 'pack'], { cwd })
  run('pnpm', ['exec', 'mtx', 'publish'], { cwd })
}

console.log('\nDone.')
