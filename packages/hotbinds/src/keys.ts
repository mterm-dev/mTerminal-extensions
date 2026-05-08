/**
 * Format a native KeyboardEvent into the host's expected combo string.
 *
 * Convention (matches existing manifest entries like `Ctrl+Alt+H`):
 *   - Modifiers are prepended in fixed order: Ctrl, Alt, Shift, Meta.
 *   - The base key uses `e.key`, with single-character keys upper-cased and
 *     space rendered as `Space`.
 *   - Pressing only a modifier (Ctrl/Alt/Shift/Meta) returns null — combos
 *     require a non-modifier base key.
 */
export function formatNativeKeyEvent(e: KeyboardEvent): string | null {
  const k = e.key
  if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta') return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  let key = k
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  parts.push(key)
  return parts.join('+')
}
