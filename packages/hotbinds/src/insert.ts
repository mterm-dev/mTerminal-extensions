import type { Binding, ExtCtx, TerminalHandleLite } from './types'

export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
}

function insertIntoTextField(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const before = el.value.slice(0, start)
  const after = el.value.slice(end)
  const next = before + text + after
  setNativeValue(el, next)
  const cursor = start + text.length
  try {
    el.setSelectionRange(cursor, cursor)
  } catch {
    /* some input types don't support selection */
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function insertIntoContentEditable(el: HTMLElement, text: string): void {
  el.focus()
  const ok = document.execCommand?.('insertText', false, text)
  if (ok) return
  // Fallback: append to end. Loses cursor position but preserves data.
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(document.createTextNode(text))
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  } else {
    el.append(document.createTextNode(text))
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }))
}

/**
 * xterm.js keeps a hidden textarea for accessibility / IME (.xterm-helper-textarea).
 * When the terminal is focused, `document.activeElement` is that textarea, not
 * the visible buffer. Inserting into it does nothing — keystrokes drive the PTY,
 * not the textarea's value. Detect any descendant of an xterm container and
 * always route to the terminal API in that case.
 */
export function isInsideXterm(el: Element | null): boolean {
  if (!el) return false
  return !!el.closest('.xterm, .xterm-screen, .xterm-helper-textarea, .xterm-viewport')
}

/**
 * Pick which terminal should receive the snippet.
 *
 * `ctx.terminal.active()` is unreliable on this host: it can return null when
 * a plain shell tab is focused, and can return a stale handle (e.g. a
 * sidebar/secondary terminal) instead of the visible tab. We prefer the
 * currently-focused tab if it is a terminal, and fall back through several
 * heuristics so the snippet still lands somewhere sensible.
 */
export function resolveTargetTerminal(ctx: ExtCtx): TerminalHandleLite | null {
  // 1. Whatever tab the user is actually looking at, if it is a terminal.
  try {
    const activeTab = ctx.tabs?.active?.()
    if (activeTab) {
      const t = ctx.terminal.byId(activeTab.id)
      if (t) return t
    }
  } catch {
    /* host may not implement tabs API */
  }

  // 2. Host's idea of the active terminal.
  const active = ctx.terminal.active()
  if (active) return active

  // 3. If exactly one terminal exists, use it.
  try {
    const list = ctx.terminal.list()
    if (Array.isArray(list) && list.length === 1) return list[0] ?? null
  } catch {
    /* list() not available */
  }

  return null
}

export async function fire(ctx: ExtCtx, binding: Binding): Promise<void> {
  const el = document.activeElement as HTMLElement | null
  const insideTerminal = isInsideXterm(el)
  ctx.logger.info('hotbinds.fire', {
    id: binding.id,
    key: binding.key,
    submit: binding.submit,
    textLen: binding.text.length,
    activeTag: el?.tagName,
    activeClass: el?.className,
    insideTerminal,
  })

  if (!insideTerminal) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      insertIntoTextField(el, binding.text)
      return
    }
    if (el && el.isContentEditable) {
      insertIntoContentEditable(el, binding.text)
      return
    }
  }

  const term = resolveTargetTerminal(ctx)
  ctx.logger.info('hotbinds.target', {
    pickedTabId: term?.tabId ?? null,
    activeTabId: ctx.tabs?.active?.()?.id ?? null,
    legacyActiveTabId: ctx.terminal.active()?.tabId ?? null,
    listCount: (() => {
      try {
        return ctx.terminal.list().length
      } catch {
        return -1
      }
    })(),
  })
  if (!term) {
    ctx.ui.toast({ kind: 'warn', message: 'Hotbinds: no active terminal or input focused' })
    return
  }

  try {
    await term.insertAtPrompt(binding.text)
    if (binding.submit) {
      // Submit by sending the Enter key. `write('\n')` is unreliable here:
      // some hosts/PTYs don't translate LF to a line submit (real Enter
      // sends CR, then the line discipline maps it). sendKey('enter') is
      // unambiguous; fall back to a CR write if the host doesn't expose it.
      if (typeof term.sendKey === 'function') await term.sendKey('enter')
      else await term.write('\r')
    }
  } catch (err) {
    ctx.logger.error('hotbinds: failed to write to terminal', err)
    ctx.ui.toast({ kind: 'error', message: 'Hotbinds: failed to write to terminal' })
  }
}
