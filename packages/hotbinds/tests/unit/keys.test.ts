// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { formatNativeKeyEvent } from '../../src/keys'

function ev(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('formatNativeKeyEvent', () => {
  it('returns null when only a modifier key is pressed', () => {
    expect(formatNativeKeyEvent(ev({ key: 'Control', ctrlKey: true }))).toBeNull()
    expect(formatNativeKeyEvent(ev({ key: 'Shift', shiftKey: true }))).toBeNull()
    expect(formatNativeKeyEvent(ev({ key: 'Alt', altKey: true }))).toBeNull()
    expect(formatNativeKeyEvent(ev({ key: 'Meta', metaKey: true }))).toBeNull()
  })

  it('uppercases single-character letters', () => {
    expect(formatNativeKeyEvent(ev({ key: 'a' }))).toBe('A')
    expect(formatNativeKeyEvent(ev({ key: 'z' }))).toBe('Z')
  })

  it('keeps already-uppercase letters as-is', () => {
    expect(formatNativeKeyEvent(ev({ key: 'B', shiftKey: true }))).toBe('Shift+B')
  })

  it('preserves modifier order: Ctrl, Alt, Shift, Meta', () => {
    expect(
      formatNativeKeyEvent(
        ev({ key: 'k', ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }),
      ),
    ).toBe('Ctrl+Alt+Shift+Meta+K')
  })

  it('Ctrl+Alt+H matches the manifest format', () => {
    expect(formatNativeKeyEvent(ev({ key: 'h', ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+H')
  })

  it('Ctrl+B matches the manifest format', () => {
    expect(formatNativeKeyEvent(ev({ key: 'b', ctrlKey: true }))).toBe('Ctrl+B')
  })

  it('Ctrl+Shift+B (browser would deliver key="B" because of shift)', () => {
    expect(formatNativeKeyEvent(ev({ key: 'B', ctrlKey: true, shiftKey: true }))).toBe(
      'Ctrl+Shift+B',
    )
  })

  it('renders space as Space', () => {
    expect(formatNativeKeyEvent(ev({ key: ' ', ctrlKey: true }))).toBe('Ctrl+Space')
  })

  it('passes named keys through unchanged', () => {
    expect(formatNativeKeyEvent(ev({ key: 'Enter', ctrlKey: true }))).toBe('Ctrl+Enter')
    expect(formatNativeKeyEvent(ev({ key: 'Escape' }))).toBe('Escape')
    expect(formatNativeKeyEvent(ev({ key: 'ArrowUp', altKey: true }))).toBe('Alt+ArrowUp')
    expect(formatNativeKeyEvent(ev({ key: 'F5' }))).toBe('F5')
  })

  it('digits without shift', () => {
    expect(formatNativeKeyEvent(ev({ key: '1', ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+1')
  })

  it('shifted digits deliver the shifted glyph (browser-native behaviour)', () => {
    // Note: when the user presses Shift+1, the browser fires e.key = '!'.
    // The recorder stores this glyph verbatim, which means firing the same
    // physical combo later relies on the host dispatcher delivering the same
    // glyph. This test pins down the documented behaviour.
    expect(formatNativeKeyEvent(ev({ key: '!', ctrlKey: true, shiftKey: true }))).toBe(
      'Ctrl+Shift+!',
    )
  })
})
