import { describe, it, expect } from 'vitest'
import {
  ensurePathArray,
  ensureRefName,
  ensureSafeRef,
  isValidRefName,
} from '../../src/main/exec'

describe('isValidRefName', () => {
  it('accepts normal names', () => {
    expect(isValidRefName('main')).toBe(true)
    expect(isValidRefName('feature/foo')).toBe(true)
    expect(isValidRefName('release-1.2')).toBe(true)
  })

  it('rejects empty', () => {
    expect(isValidRefName('')).toBe(false)
  })

  it('rejects leading dash', () => {
    expect(isValidRefName('-flag')).toBe(false)
  })

  it('rejects names with control chars or dangerous chars', () => {
    expect(isValidRefName('foo bar')).toBe(false)
    expect(isValidRefName('foo~bar')).toBe(false)
    expect(isValidRefName('foo:bar')).toBe(false)
    expect(isValidRefName('foo*bar')).toBe(false)
    expect(isValidRefName('foo?bar')).toBe(false)
    expect(isValidRefName('foo\\bar')).toBe(false)
    expect(isValidRefName('foo\x00bar')).toBe(false)
  })

  it('rejects leading/trailing slashes and dots', () => {
    expect(isValidRefName('/foo')).toBe(false)
    expect(isValidRefName('foo/')).toBe(false)
    expect(isValidRefName('.foo')).toBe(false)
    expect(isValidRefName('foo.')).toBe(false)
  })

  it('rejects .lock suffix and @{ pattern', () => {
    expect(isValidRefName('foo.lock')).toBe(false)
    expect(isValidRefName('foo@{u}')).toBe(false)
  })

  it('rejects consecutive slashes and dots', () => {
    expect(isValidRefName('foo//bar')).toBe(false)
    expect(isValidRefName('foo..bar')).toBe(false)
  })
})

describe('ensureRefName', () => {
  it('returns the value when valid', () => {
    expect(ensureRefName('main')).toBe('main')
  })

  it('throws on invalid', () => {
    expect(() => ensureRefName('-foo')).toThrow(/invalid ref name/)
    expect(() => ensureRefName('')).toThrow(/invalid ref name/)
    expect(() => ensureRefName(123)).toThrow(/must be a string/)
  })
})

describe('ensureSafeRef', () => {
  it('accepts normal refs', () => {
    expect(ensureSafeRef('abc123')).toBe('abc123')
    expect(ensureSafeRef('HEAD~1')).toBe('HEAD~1')
    expect(ensureSafeRef('refs/heads/main')).toBe('refs/heads/main')
  })

  it('rejects empty or non-string', () => {
    expect(() => ensureSafeRef('')).toThrow(/non-empty string/)
    expect(() => ensureSafeRef(undefined)).toThrow(/non-empty string/)
  })

  it('rejects leading dash to prevent flag injection', () => {
    expect(() => ensureSafeRef('-rf')).toThrow(/invalid ref/)
  })

  it('rejects control characters', () => {
    expect(() => ensureSafeRef('foo\x00bar')).toThrow(/invalid ref/)
    expect(() => ensureSafeRef('foo\x7fbar')).toThrow(/invalid ref/)
  })
})

describe('ensurePathArray', () => {
  it('accepts normal paths', () => {
    expect(ensurePathArray(['src/foo.ts', 'README.md'])).toEqual(['src/foo.ts', 'README.md'])
  })

  it('rejects non-array', () => {
    expect(() => ensurePathArray('not-array')).toThrow(/must be an array/)
    expect(() => ensurePathArray(null)).toThrow(/must be an array/)
  })

  it('rejects empty strings or non-string items', () => {
    expect(() => ensurePathArray([''])).toThrow(/non-empty strings/)
    expect(() => ensurePathArray([42])).toThrow(/non-empty strings/)
  })

  it('rejects paths starting with dash to prevent flag injection', () => {
    expect(() => ensurePathArray(['--force'])).toThrow(/invalid path/)
  })
})
