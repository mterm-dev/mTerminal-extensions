import { execFile, type ExecFileOptions } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'

export interface RunOpts {
  cwd: string
  timeout?: number
  maxBuffer?: number
  input?: string
}

export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_PAGER: 'cat',
  LC_ALL: 'C',
}

export const DEFAULT_TIMEOUT = 30_000
export const NETWORK_TIMEOUT = 60_000
export const DIFF_MAX_BUFFER = 4 * 1024 * 1024

export function runGit(args: string[], opts: RunOpts): Promise<RunResult> {
  return new Promise((resolve) => {
    const execOpts: ExecFileOptions = {
      cwd: opts.cwd,
      env: GIT_ENV,
      timeout: opts.timeout ?? DEFAULT_TIMEOUT,
      maxBuffer: opts.maxBuffer ?? 8 * 1024 * 1024,
      windowsHide: true,
    }
    const child = execFile('git', args, execOpts, (err, stdout, stderr) => {
      const code = err && typeof (err as NodeJS.ErrnoException).code === 'number'
        ? ((err as unknown as { code: number }).code)
        : err
          ? 1
          : 0
      resolve({
        stdout: typeof stdout === 'string' ? stdout : stdout?.toString('utf8') ?? '',
        stderr: typeof stderr === 'string' ? stderr : stderr?.toString('utf8') ?? '',
        code,
      })
    })
    if (opts.input != null && child.stdin) {
      child.stdin.end(opts.input)
    }
  })
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const st = await fsp.stat(cwd)
    if (!st.isDirectory()) return false
  } catch {
    return false
  }
  const r = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd, timeout: 5_000 })
  return r.code === 0 && r.stdout.trim() === 'true'
}

export function isValidRefName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false
  if (name.startsWith('-')) return false
  if (name.startsWith('/') || name.endsWith('/')) return false
  if (name.startsWith('.') || name.endsWith('.')) return false
  if (name.endsWith('.lock')) return false
  if (name.includes('..')) return false
  if (name.includes('@{')) return false
  if (name.includes('//')) return false
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return false
    const ch = name[i]
    if (ch === ' ' || ch === '~' || ch === '^' || ch === ':' ||
        ch === '?' || ch === '*' || ch === '[' || ch === '\\') return false
  }
  return true
}

export function ensureRefName(name: unknown): string {
  if (typeof name !== 'string') throw new Error('ref name must be a string')
  if (!isValidRefName(name)) throw new Error(`invalid ref name: ${name}`)
  return name
}

export function ensureSafeRef(ref: unknown): string {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new Error('ref must be a non-empty string')
  }
  if (ref.startsWith('-')) throw new Error(`invalid ref: ${ref}`)
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) throw new Error(`invalid ref: ${ref}`)
  }
  return ref
}

export function ensurePathArray(paths: unknown): string[] {
  if (!Array.isArray(paths)) throw new Error('paths must be an array')
  const out: string[] = []
  for (const p of paths) {
    if (typeof p !== 'string' || p.length === 0) {
      throw new Error('paths must contain non-empty strings')
    }
    if (p.startsWith('-')) {
      throw new Error(`invalid path: ${p}`)
    }
    out.push(p)
  }
  return out
}

export function ensureCwd(cwd: unknown): string {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new Error('cwd is required')
  }
  if (!fs.existsSync(cwd)) {
    throw new Error(`cwd does not exist: ${cwd}`)
  }
  return cwd
}
