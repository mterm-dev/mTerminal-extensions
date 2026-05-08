export interface Binding {
  id: string
  name: string
  key: string
  text: string
  submit: boolean
}

export interface ExtCtx {
  id: string
  logger: {
    info: (...a: unknown[]) => void
    warn: (...a: unknown[]) => void
    error: (...a: unknown[]) => void
  }
  commands: {
    register(c: { id: string; title?: string; run: (args?: unknown) => unknown }): {
      dispose(): void
    }
    execute<T = unknown>(id: string, args?: unknown): Promise<T>
  }
  keybindings: {
    register(k: { command: string; key: string; when?: string }): { dispose(): void }
  }
  settings: {
    get<T = unknown>(key: string): T | undefined
    set(key: string, value: unknown): void | Promise<void>
    onChange(cb: (key: string, value: unknown) => void): { dispose(): void }
  }
  terminal: {
    active(): {
      tabId: number
      write(data: string): Promise<void>
      insertAtPrompt(data: string): Promise<void>
    } | null
  }
  statusBar: {
    register(item: {
      id: string
      align: 'left' | 'right'
      text?: string | (() => string)
      icon?: string
      tooltip?: string
      onClick?(): void
      refreshOn?: string[]
      priority?: number
    }): { dispose(): void }
    update(
      id: string,
      patch: Partial<{ text: string; icon: string; tooltip: string; onClick: () => void }>,
    ): void
  }
  events: {
    emit(event: string, payload?: unknown): void
    on(event: string, cb: (payload: unknown) => void): { dispose(): void }
  }
  ui: {
    openModal<T = unknown>(spec: {
      title: string
      width?: number
      height?: number
      render(host: HTMLElement, ctrl: { close(result?: unknown): void; setTitle(t: string): void }): void | (() => void)
    }): Promise<T | undefined>
    toast(opts: {
      kind?: 'info' | 'success' | 'warn' | 'error'
      message: string
      durationMs?: number
    }): void
  }
  subscribe(d: { dispose(): void } | (() => void)): void
}
