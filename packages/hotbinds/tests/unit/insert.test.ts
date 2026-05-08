// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fire, isInsideXterm, randomId } from '../../src/insert'
import type { Binding, ExtCtx } from '../../src/types'

interface TestCtx {
  ctx: ExtCtx
  toast: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  insertAtPrompt: ReturnType<typeof vi.fn>
  setActiveTerminal(t: TestCtx['terminal']): void
  terminal: { write: TestCtx['write']; insertAtPrompt: TestCtx['insertAtPrompt']; tabId: number } | null
}

function makeCtx(overrides?: { terminal?: TestCtx['terminal'] }): TestCtx {
  const toast = vi.fn()
  const warn = vi.fn()
  const error = vi.fn()
  const info = vi.fn()
  const write = vi.fn().mockResolvedValue(undefined)
  const insertAtPrompt = vi.fn().mockResolvedValue(undefined)
  const handle = overrides?.terminal === undefined
    ? { tabId: 1, write, insertAtPrompt }
    : overrides.terminal
  const test = {
    toast,
    warn,
    error,
    info,
    write,
    insertAtPrompt,
    terminal: handle,
    setActiveTerminal(t: TestCtx['terminal']) {
      this.terminal = t
    },
  } as TestCtx
  test.ctx = {
    id: 'hotbinds',
    logger: {
      info,
      warn,
      error,
    },
    terminal: {
      active: () => test.terminal,
    },
    ui: {
      toast,
      // openModal is unused in fire()
      openModal: vi.fn(),
    },
    // The remaining ExtCtx surface is unused in fire() — cast through unknown.
  } as unknown as ExtCtx
  return test
}

function bind(patch: Partial<Binding> = {}): Binding {
  return {
    id: 'b1',
    name: 'test',
    key: 'Ctrl+Alt+T',
    text: 'echo hi',
    submit: false,
    ...patch,
  }
}

describe('randomId', () => {
  it('returns a non-empty string', () => {
    expect(typeof randomId()).toBe('string')
    expect(randomId().length).toBeGreaterThan(0)
  })

  it('produces unique values across many calls', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(randomId())
    expect(seen.size).toBe(100)
  })
})

describe('isInsideXterm', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('returns false for null', () => {
    expect(isInsideXterm(null)).toBe(false)
  })

  it('detects the xterm container', () => {
    document.body.innerHTML = '<div class="xterm"><div class="inner" id="x"></div></div>'
    expect(isInsideXterm(document.getElementById('x'))).toBe(true)
  })

  it('detects the xterm-helper-textarea directly', () => {
    document.body.innerHTML = '<textarea class="xterm-helper-textarea" id="t"></textarea>'
    expect(isInsideXterm(document.getElementById('t'))).toBe(true)
  })

  it('detects nested xterm-screen', () => {
    document.body.innerHTML = '<div class="xterm-screen"><span id="s"></span></div>'
    expect(isInsideXterm(document.getElementById('s'))).toBe(true)
  })

  it('detects nested xterm-viewport', () => {
    document.body.innerHTML = '<div class="xterm-viewport"><span id="v"></span></div>'
    expect(isInsideXterm(document.getElementById('v'))).toBe(true)
  })

  it('returns false for unrelated elements', () => {
    document.body.innerHTML = '<div class="not-a-terminal"><span id="n"></span></div>'
    expect(isInsideXterm(document.getElementById('n'))).toBe(false)
  })
})

describe('fire', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('inserts into a focused HTMLInputElement at the caret', async () => {
    const input = document.createElement('input')
    input.value = 'abXYef'
    document.body.appendChild(input)
    input.focus()
    input.setSelectionRange(2, 4) // selects 'XY'

    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'CD' }))

    expect(input.value).toBe('abCDef')
    expect(input.selectionStart).toBe(4)
    expect(input.selectionEnd).toBe(4)
    expect(t.write).not.toHaveBeenCalled()
    expect(t.insertAtPrompt).not.toHaveBeenCalled()
  })

  it('inserts into a focused HTMLTextAreaElement and dispatches input/change', async () => {
    const ta = document.createElement('textarea')
    ta.value = ''
    document.body.appendChild(ta)
    ta.focus()
    const onInput = vi.fn()
    const onChange = vi.fn()
    ta.addEventListener('input', onInput)
    ta.addEventListener('change', onChange)

    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'hello' }))

    expect(ta.value).toBe('hello')
    expect(onInput).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('routes a focused contenteditable to the contenteditable path, not the terminal', async () => {
    const div = document.createElement('div')
    div.contentEditable = 'true'
    div.tabIndex = 0 // jsdom only marks tabbable elements as focusable
    document.body.appendChild(div)
    div.focus()
    // jsdom doesn't compute isContentEditable from the attribute, so force it.
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true })
    // Sanity: confirm focus actually landed.
    expect(document.activeElement).toBe(div)

    const onInput = vi.fn()
    div.addEventListener('input', onInput)

    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'hi' }))

    // The contract: a focused contenteditable must NOT fall through to the
    // terminal write path. jsdom's execCommand / selection support is partial,
    // so we don't assert on textContent — only on routing + the input event
    // that insertIntoContentEditable always fires.
    expect(t.write).not.toHaveBeenCalled()
    expect(t.insertAtPrompt).not.toHaveBeenCalled()
    expect(onInput).toHaveBeenCalled()
  })

  it('routes to the terminal when focus is inside an xterm helper textarea', async () => {
    const wrap = document.createElement('div')
    wrap.className = 'xterm'
    const helper = document.createElement('textarea')
    helper.className = 'xterm-helper-textarea'
    wrap.appendChild(helper)
    document.body.appendChild(wrap)
    helper.focus()

    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'ls', submit: false }))

    expect(t.insertAtPrompt).toHaveBeenCalledWith('ls')
    expect(t.write).not.toHaveBeenCalled()
    // Critically: did NOT write into the helper textarea's value
    expect(helper.value).toBe('')
  })

  it('appends a newline when submit:true', async () => {
    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'pwd', submit: true }))

    expect(t.write).toHaveBeenCalledWith('pwd\n')
    expect(t.insertAtPrompt).not.toHaveBeenCalled()
  })

  it('uses insertAtPrompt when submit:false', async () => {
    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'git ', submit: false }))

    expect(t.insertAtPrompt).toHaveBeenCalledWith('git ')
    expect(t.write).not.toHaveBeenCalled()
  })

  it('falls back to terminal when nothing focusable is active', async () => {
    document.body.innerHTML = '<div></div>'
    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'echo', submit: true }))

    expect(t.write).toHaveBeenCalledWith('echo\n')
  })

  it('toasts a warning when no terminal is available and no input is focused', async () => {
    document.body.innerHTML = '<div></div>'
    const t = makeCtx({ terminal: null })

    await fire(t.ctx, bind({ text: 'x' }))

    expect(t.toast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'warn', message: expect.stringContaining('Hotbinds') }),
    )
    expect(t.write).not.toHaveBeenCalled()
  })

  it('toasts an error when terminal write rejects', async () => {
    const t = makeCtx()
    t.write.mockRejectedValueOnce(new Error('pty closed'))
    await fire(t.ctx, bind({ text: 'x', submit: true }))

    expect(t.error).toHaveBeenCalled()
    expect(t.toast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'error' }),
    )
  })

  it('logs diagnostic info on every fire', async () => {
    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'ls', submit: true }))

    expect(t.info).toHaveBeenCalledWith(
      'hotbinds.fire',
      expect.objectContaining({ key: 'Ctrl+Alt+T', submit: true, textLen: 2 }),
    )
  })
})
