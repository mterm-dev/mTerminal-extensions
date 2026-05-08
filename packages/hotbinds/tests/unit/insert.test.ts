// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fire, isInsideXterm, randomId, resolveTargetTerminal } from '../../src/insert'
import type { Binding, ExtCtx, TerminalHandleLite } from '../../src/types'

interface TestCtx {
  ctx: ExtCtx
  toast: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  insertAtPrompt: ReturnType<typeof vi.fn>
  sendKey: ReturnType<typeof vi.fn>
  terminal: TerminalHandleLite | null
  terminalsById: Map<number, TerminalHandleLite>
  activeTab: { id: number; type: string } | null
}

function makeTerminal(tabId: number): TerminalHandleLite & {
  write: ReturnType<typeof vi.fn>
  insertAtPrompt: ReturnType<typeof vi.fn>
  sendKey: ReturnType<typeof vi.fn>
} {
  return {
    tabId,
    write: vi.fn().mockResolvedValue(undefined),
    insertAtPrompt: vi.fn().mockResolvedValue(undefined),
    sendKey: vi.fn().mockResolvedValue(undefined),
  }
}

function makeCtx(overrides?: {
  terminal?: TerminalHandleLite | null
  terminalsById?: Map<number, TerminalHandleLite>
  activeTab?: { id: number; type: string } | null
  noTabsApi?: boolean
}): TestCtx {
  const toast = vi.fn()
  const warn = vi.fn()
  const error = vi.fn()
  const info = vi.fn()
  const handle =
    overrides?.terminal === undefined
      ? makeTerminal(1)
      : overrides.terminal
  const write =
    handle && (handle as { write: ReturnType<typeof vi.fn> }).write
      ? (handle as { write: ReturnType<typeof vi.fn> }).write
      : vi.fn()
  const insertAtPrompt =
    handle && (handle as { insertAtPrompt: ReturnType<typeof vi.fn> }).insertAtPrompt
      ? (handle as { insertAtPrompt: ReturnType<typeof vi.fn> }).insertAtPrompt
      : vi.fn()
  const sendKey =
    handle && (handle as { sendKey?: ReturnType<typeof vi.fn> }).sendKey
      ? (handle as { sendKey: ReturnType<typeof vi.fn> }).sendKey
      : vi.fn()
  const test: TestCtx = {
    ctx: undefined as unknown as ExtCtx,
    toast,
    warn,
    error,
    info,
    write,
    insertAtPrompt,
    sendKey,
    terminal: handle,
    terminalsById: overrides?.terminalsById ?? new Map(),
    activeTab: overrides?.activeTab ?? null,
  }
  const ctxBase = {
    id: 'hotbinds',
    logger: { info, warn, error },
    terminal: {
      active: () => test.terminal,
      byId: (id: number) => test.terminalsById.get(id) ?? null,
      list: () => Array.from(test.terminalsById.values()),
    },
    ui: { toast, openModal: vi.fn() },
  } as unknown as ExtCtx & { tabs?: { active(): { id: number; type: string } | null } }
  if (!overrides?.noTabsApi) {
    ctxBase.tabs = { active: () => test.activeTab }
  }
  test.ctx = ctxBase
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

describe('resolveTargetTerminal', () => {
  it('prefers the terminal whose tab id matches tabs.active()', () => {
    const sidebar = makeTerminal(99)
    const visible = makeTerminal(42)
    const t = makeCtx({
      terminal: sidebar,
      terminalsById: new Map([
        [99, sidebar],
        [42, visible],
      ]),
      activeTab: { id: 42, type: 'terminal' },
    })

    const picked = resolveTargetTerminal(t.ctx)
    expect(picked?.tabId).toBe(42)
  })

  it('falls back to terminal.active() when active tab is not a terminal', () => {
    const sidebar = makeTerminal(99)
    const t = makeCtx({
      terminal: sidebar,
      terminalsById: new Map([[99, sidebar]]),
      // active tab is a settings tab — byId(7) returns null
      activeTab: { id: 7, type: 'settings' },
    })

    const picked = resolveTargetTerminal(t.ctx)
    expect(picked?.tabId).toBe(99)
  })

  it('falls back to terminal.active() when host has no tabs API at all', () => {
    const fallback = makeTerminal(5)
    const t = makeCtx({
      terminal: fallback,
      terminalsById: new Map([[5, fallback]]),
      noTabsApi: true,
    })

    const picked = resolveTargetTerminal(t.ctx)
    expect(picked?.tabId).toBe(5)
  })

  it('uses the only terminal when active() returns null and exactly one exists', () => {
    const only = makeTerminal(11)
    const t = makeCtx({
      terminal: null,
      terminalsById: new Map([[11, only]]),
      activeTab: null,
    })

    const picked = resolveTargetTerminal(t.ctx)
    expect(picked?.tabId).toBe(11)
  })

  it('returns null when no terminal can be located', () => {
    const t = makeCtx({
      terminal: null,
      terminalsById: new Map(),
      activeTab: null,
    })

    expect(resolveTargetTerminal(t.ctx)).toBeNull()
  })

  it('does not pick from list() when there are multiple ambiguous terminals', () => {
    // Two terminals exist, host's active() is null, no active tab -> we
    // refuse to guess rather than fire into the wrong one.
    const a = makeTerminal(1)
    const b = makeTerminal(2)
    const t = makeCtx({
      terminal: null,
      terminalsById: new Map([
        [1, a],
        [2, b],
      ]),
      activeTab: null,
    })

    expect(resolveTargetTerminal(t.ctx)).toBeNull()
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

  it('inserts the text and presses Enter via sendKey when submit:true', async () => {
    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'pwd', submit: true }))

    expect(t.insertAtPrompt).toHaveBeenCalledWith('pwd')
    expect(t.sendKey).toHaveBeenCalledWith('enter')
    expect(t.write).not.toHaveBeenCalled()
  })

  it('insertAtPrompt is called in order before sendKey on submit', async () => {
    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'pwd', submit: true }))

    const insertOrder = t.insertAtPrompt.mock.invocationCallOrder[0]
    const enterOrder = t.sendKey.mock.invocationCallOrder[0]
    expect(insertOrder).toBeLessThan(enterOrder)
  })

  it('falls back to write("\\r") when sendKey is not exposed by the host', async () => {
    const term: TerminalHandleLite = {
      tabId: 7,
      write: vi.fn().mockResolvedValue(undefined),
      insertAtPrompt: vi.fn().mockResolvedValue(undefined),
      // no sendKey
    }
    const t = makeCtx({ terminal: term })
    await fire(t.ctx, bind({ text: 'pwd', submit: true }))

    expect(term.insertAtPrompt).toHaveBeenCalledWith('pwd')
    expect(term.write).toHaveBeenCalledWith('\r')
  })

  it('uses insertAtPrompt only when submit:false (no Enter)', async () => {
    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'git ', submit: false }))

    expect(t.insertAtPrompt).toHaveBeenCalledWith('git ')
    expect(t.sendKey).not.toHaveBeenCalled()
    expect(t.write).not.toHaveBeenCalled()
  })

  it('falls back to terminal when nothing focusable is active', async () => {
    document.body.innerHTML = '<div></div>'
    const t = makeCtx()
    await fire(t.ctx, bind({ text: 'echo', submit: true }))

    expect(t.insertAtPrompt).toHaveBeenCalledWith('echo')
    expect(t.sendKey).toHaveBeenCalledWith('enter')
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
    t.insertAtPrompt.mockRejectedValueOnce(new Error('pty closed'))
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
