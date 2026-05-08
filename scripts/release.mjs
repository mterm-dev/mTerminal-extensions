#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, exit, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const packagesDir = join(root, 'packages');

const sh = (cmd, opts = {}) => {
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  return typeof out === 'string' ? out.trim() : '';
};

const fail = (msg) => {
  stdout.write(`\x1b[31merror:\x1b[0m ${msg}\n`);
  exit(1);
};

const listExtensions = () =>
  readdirSync(packagesDir).filter((name) => {
    try {
      return statSync(join(packagesDir, name, 'package.json')).isFile();
    } catch {
      return false;
    }
  });

const bump = argv[2];
const extId = argv[3];

if (!bump || !extId) {
  stdout.write('usage: pnpm release <patch|minor|major|x.y.z[-pre]> <extension-id>\n');
  stdout.write('\navailable extensions:\n');
  for (const id of listExtensions()) stdout.write(`  - ${id}\n`);
  exit(1);
}

if (!listExtensions().includes(extId)) {
  fail(`unknown extension '${extId}' — run 'pnpm release' to list available ids`);
}

try {
  sh('git rev-parse --is-inside-work-tree');
} catch {
  fail('not inside a git repository');
}

const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'master' && branch !== 'main') {
  fail(`releases must be cut from master/main (current: ${branch})`);
}

if (sh('git status --porcelain')) {
  fail('working tree is dirty — commit or stash first');
}

sh('git fetch --tags --force origin', { stdio: 'inherit' });
const localHead = sh('git rev-parse @');
const remoteHead = sh(`git rev-parse origin/${branch}`);
if (localHead !== remoteHead) {
  fail(`local ${branch} is not in sync with origin/${branch}`);
}

const tagPrefix = `${extId}-v`;
const lastTag = (() => {
  try {
    return sh(`git describe --tags --abbrev=0 --match "${tagPrefix}[0-9]*"`);
  } catch {
    return null;
  }
})();

const baseVersion = lastTag ? lastTag.slice(tagPrefix.length) : '0.0.0';

const parseSemver = (v) => {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    pre: m[4] ?? null,
  };
};

const base = parseSemver(baseVersion);
if (!base) {
  fail(`could not parse last tag '${lastTag}' as semver`);
}

const bumpPrerelease = (pre) => {
  const parts = pre.split('.');
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (/^\d+$/.test(parts[i])) {
      parts[i] = String(parseInt(parts[i], 10) + 1);
      return parts.join('.');
    }
  }
  return `${pre}.1`;
};

const next = (() => {
  if (parseSemver(bump)) return bump;
  if (bump === 'patch') {
    if (base.pre) return `${base.major}.${base.minor}.${base.patch}-${bumpPrerelease(base.pre)}`;
    return `${base.major}.${base.minor}.${base.patch + 1}`;
  }
  if (bump === 'minor') return `${base.major}.${base.minor + 1}.0`;
  if (bump === 'major') return `${base.major + 1}.0.0`;
  fail(`invalid bump '${bump}' — use patch|minor|major or explicit x.y.z[-pre]`);
})();

const tag = `${tagPrefix}${next}`;

const existing = sh(`git tag -l ${tag}`);
if (existing) {
  fail(`tag ${tag} already exists locally`);
}

const remoteTags = sh(`git ls-remote --tags origin refs/tags/${tag}`);
if (remoteTags) {
  fail(`tag ${tag} already exists on origin`);
}

stdout.write(`\x1b[36m→\x1b[0m extension: ${extId}  base: ${lastTag ?? '(none)'}  next: ${tag}\n`);

const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
const commits = sh(`git log ${range} --pretty=format:%s -- packages/${extId}`);
if (!commits) {
  fail(`no commits touching packages/${extId} since ${lastTag ?? 'beginning'} — nothing to release`);
}
stdout.write(
  `\x1b[36m→\x1b[0m ${commits.split('\n').length} commits touching packages/${extId} since ${lastTag ?? 'beginning'}\n`,
);

sh(`git tag -a ${tag} -m "release ${tag}"`, { stdio: 'inherit' });
sh(`git push origin ${tag}`, { stdio: 'inherit' });

stdout.write(`\x1b[32m✓\x1b[0m pushed ${tag} — CI will build and publish ${extId}\n`);
