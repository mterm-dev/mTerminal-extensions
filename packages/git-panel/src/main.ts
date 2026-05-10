import { registerHandlers } from './main/handlers'
import { createGitService } from './main/service'

interface MainCtx {
  id: string
  logger: { info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void }
  ipc: {
    handle(
      channel: string,
      fn: (args: unknown, sender?: unknown) => unknown | Promise<unknown>,
    ): { dispose(): void }
    emit(channel: string, payload: unknown): void
  }
  providedServices: {
    publish<T>(id: string, impl: T): { dispose(): void }
  }
  subscribe(d: { dispose(): void } | (() => void)): void
}

export function activate(ctx: MainCtx): void {
  ctx.logger.info('git-panel main activating')
  const service = createGitService()
  registerHandlers(ctx, service)
  ctx.subscribe(ctx.providedServices.publish('git', service))
  ctx.logger.info('git-panel main activated')
}

export function deactivate(): void {
  // no-op; ctx subscriptions clean up handlers and service registration
}
