import { fire } from './insert'
import { openManager } from './manager'
import type { Binding, ExtCtx } from './types'

export function activate(ctx: ExtCtx): void {
  ctx.logger.info('hotbinds activated')

  let dynamicDisposers: Array<{ dispose(): void }> = []

  const disposeDynamic = (): void => {
    for (const d of dynamicDisposers) {
      try {
        d.dispose()
      } catch (err) {
        ctx.logger.warn('hotbinds: dispose failed', err)
      }
    }
    dynamicDisposers = []
  }

  const applyBindings = (): void => {
    disposeDynamic()
    const raw = ctx.settings.get<Binding[]>('bindings')
    if (!Array.isArray(raw)) return

    for (const b of raw) {
      if (!b || typeof b !== 'object') continue
      if (typeof b.id !== 'string' || !b.id) continue
      if (typeof b.key !== 'string' || !b.key.trim()) continue
      if (typeof b.text !== 'string') continue

      const cmdId = `hotbinds.fire.${b.id}`
      try {
        const cmd = ctx.commands.register({
          id: cmdId,
          title: b.name ? `Hotbinds: ${b.name}` : `Hotbinds: ${b.key}`,
          run: () => void fire(ctx, b),
        })
        dynamicDisposers.push(cmd)
        const kb = ctx.keybindings.register({ command: cmdId, key: b.key })
        dynamicDisposers.push(kb)
      } catch (err) {
        ctx.logger.warn(`hotbinds: failed to register binding ${b.id}`, err)
      }
    }
  }

  ctx.subscribe(
    ctx.commands.register({
      id: 'hotbinds.manage',
      title: 'Hotbinds: Manage bindings',
      run: () => void openManager(ctx),
    }),
  )

  ctx.subscribe(
    ctx.settings.onChange((key) => {
      if (key === 'bindings') applyBindings()
    }),
  )

  ctx.subscribe(() => disposeDynamic())

  applyBindings()
}

export function deactivate(): void {
  /* ctx.subscribe handlers run automatically */
}
