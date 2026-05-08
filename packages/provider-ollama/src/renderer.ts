/**
 * Ollama provider extension.
 *
 * Wraps the official `ollama` npm package (ollama-js) and exposes it both as
 * an AI registry provider (`ollama`) and as the well-known service
 * `ai.sdk.ollama` for advanced consumers (embeddings, model pull, custom
 * tool calls, etc.).
 *
 * Ollama runs locally — no API key required, so `requiresVault: false`.
 * The user picks a host URL (default http://localhost:11434) via the
 * `host` setting.
 */

import { Ollama } from 'ollama/browser'
import type { Disposable, ExtensionContext } from '@mterminal/extension-api'

interface CompleteReq {
  provider?: string
  model?: string
  messages: Array<{ role: string; content: string }>
  system?: string
  signal?: AbortSignal
  /** Per-call host-URL override. Ollama needs no API key, so apiKey is ignored. */
  baseUrl?: string
  apiKey?: string
}

const DEFAULT_HOST = 'http://localhost:11434'
const DEFAULT_MODEL = 'llama3.2'

interface SdkServiceImpl {
  client: Ollama
  factory: (overrides?: ConstructorParameters<typeof Ollama>[0]) => Ollama
}

export async function activate(ctx: ExtensionContext): Promise<void> {
    let client: Ollama | null = null
    let svcDispose: Disposable | null = null

    const buildClient = (): Ollama => {
      const host = ctx.settings.get<string>('host')?.trim() || DEFAULT_HOST
      return new Ollama({ host })
    }

    const republish = (): void => {
      svcDispose?.dispose()
      svcDispose = null
      if (!client) return
      const impl: SdkServiceImpl = {
        client,
        factory: (overrides) =>
          new Ollama((overrides as ConstructorParameters<typeof Ollama>[0]) ?? { host: ctx.settings.get<string>('host') ?? DEFAULT_HOST }),
      }
      svcDispose = ctx.providedServices.publish('ai.sdk.ollama', impl)
    }

    const rebuild = (): void => {
      client = buildClient()
      republish()
    }

    rebuild()

    ctx.subscribe(
      ctx.settings.onChange((key) => {
        if (key === 'host') rebuild()
      }),
    )

    /**
     * Resolve the SDK client for a given request. Honors `req.baseUrl` for
     * per-call host overrides (custom-binding mode); otherwise reuses the
     * persistent client built from extension settings.
     */
    const resolveClient = (req: CompleteReq): Ollama => {
      if (req.baseUrl && req.baseUrl.trim()) {
        return new Ollama({ host: req.baseUrl.trim() })
      }
      return client!
    }

    const messagesFor = (req: CompleteReq) => {
      const out: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
      if (req.system) out.push({ role: 'system', content: req.system })
      for (const m of req.messages) {
        const role = m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user'
        out.push({ role, content: m.content })
      }
      return out
    }

    ctx.subscribe(
      ctx.ai.registerProvider({
        id: 'ollama',
        label: 'Ollama',
        models: [{ id: DEFAULT_MODEL, label: 'llama 3.2' }],
        requiresVault: false,

        async listModels() {
          const c = client!
          try {
            const res = await c.list()
            return res.models.map((m) => ({ id: m.name, label: m.name }))
          } catch {
            return [{ id: DEFAULT_MODEL, label: 'llama 3.2' }]
          }
        },

        async complete(reqRaw: unknown) {
          const req = reqRaw as CompleteReq
          const c = resolveClient(req)
          const res = await c.chat({
            model: req.model || DEFAULT_MODEL,
            messages: messagesFor(req),
            stream: false,
          })
          // Strip any inline `<think>...</think>` reasoning blocks for parity
          // with the legacy raw-fetch provider's behaviour.
          const text = (res.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
          return {
            text,
            usage: {
              promptTokens: res.prompt_eval_count ?? 0,
              completionTokens: res.eval_count ?? 0,
              totalTokens: (res.prompt_eval_count ?? 0) + (res.eval_count ?? 0),
            },
          }
        },

        async *stream(reqRaw: unknown) {
          const req = reqRaw as CompleteReq
          const c = resolveClient(req)
          const stream = await c.chat({
            model: req.model || DEFAULT_MODEL,
            messages: messagesFor(req),
            stream: true,
          })
          let inThink = false
          let promptTokens = 0
          let completionTokens = 0
          for await (const chunk of stream) {
            if (req.signal?.aborted) return
            let content = chunk.message?.content ?? ''
            // Filter <think> reasoning blocks streaming-safe.
            while (content.length > 0) {
              if (!inThink) {
                const open = content.indexOf('<think>')
                if (open === -1) {
                  if (content) yield { text: content }
                  break
                }
                if (open > 0) yield { text: content.slice(0, open) }
                content = content.slice(open + '<think>'.length)
                inThink = true
              } else {
                const close = content.indexOf('</think>')
                if (close === -1) break
                content = content.slice(close + '</think>'.length)
                inThink = false
              }
            }
            if (chunk.done) {
              promptTokens = chunk.prompt_eval_count ?? 0
              completionTokens = chunk.eval_count ?? 0
            }
          }
          yield {
            finished: true,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            },
          }
        },
      }),
    )

    ctx.subscribe({
      dispose: () => {
        svcDispose?.dispose()
        svcDispose = null
      },
    })
}

export function deactivate(): void {
  /* ctx.subscribe handlers run automatically on host-side teardown */
}
