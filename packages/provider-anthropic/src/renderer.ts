/**
 * Anthropic AI provider extension.
 *
 * Registers itself with the host AI registry as the `anthropic` provider, so
 * the chat panel, command palette, explain popover, and any other consumer
 * of `ctx.ai.complete()` / `ctx.ai.stream()` can reach Claude. Also publishes
 * the live `Anthropic` SDK client as the well-known service `ai.sdk.anthropic`
 * so other extensions can grab it for advanced flows (Agent SDK loops, batch
 * API, files API, custom tool use, etc.).
 *
 * Vault key path: `ai_keys.anthropic` — managed by the host's Settings → AI
 * panel (the same vault keys.set IPC the legacy code used).
 *
 * Reactivity: when the user rotates the API key or changes baseUrl, the SDK
 * client is rebuilt and the service is re-published so consumers'
 * `onAvailable` callbacks fire with the fresh client.
 */

import Anthropic from '@anthropic-ai/sdk'
import { defineExtension, type Disposable } from '@mterminal/extension-api'

interface CompleteReq {
  provider?: string
  model?: string
  messages: Array<{ role: string; content: string }>
  system?: string
  maxTokens?: number
  temperature?: number
  topP?: number
  signal?: AbortSignal
}

const DEFAULT_MODEL = 'claude-opus-4-7'

const DEFAULT_MODELS = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
]

interface SdkServiceImpl {
  client: Anthropic
  factory: (overrides?: ConstructorParameters<typeof Anthropic>[0]) => Anthropic
}

export default defineExtension({
  async activate(ctx) {
    let client: Anthropic | null = null
    let svcDispose: Disposable | null = null

    const buildClient = async (): Promise<Anthropic | null> => {
      const apiKey = await ctx.vault.get('ai_keys.anthropic')
      if (!apiKey) return null
      const baseURL = ctx.settings.get<string>('baseUrl')?.trim() || undefined
      return new Anthropic({ apiKey, baseURL, dangerouslyAllowBrowser: true })
    }

    const republishService = (): void => {
      svcDispose?.dispose()
      svcDispose = null
      if (!client) return
      const impl: SdkServiceImpl = {
        client,
        factory: (overrides) =>
          new Anthropic({ ...overrides, dangerouslyAllowBrowser: true }),
      }
      svcDispose = ctx.providedServices.publish('ai.sdk.anthropic', impl)
    }

    const rebuild = async (): Promise<void> => {
      client = await buildClient()
      republishService()
    }

    await rebuild()

    ctx.subscribe(
      ctx.vault.onChange('ai_keys.anthropic', () => {
        void rebuild()
      }),
    )
    ctx.subscribe(
      ctx.settings.onChange((key) => {
        if (key === 'baseUrl') void rebuild()
      }),
    )

    const requireClient = (): Anthropic => {
      if (!client) {
        throw new Error(
          'Anthropic SDK not configured — set the API key in Settings → AI → Anthropic.',
        )
      }
      return client
    }

    const mapMessages = (req: CompleteReq) =>
      req.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.content,
        }))

    ctx.subscribe(
      ctx.ai.registerProvider({
        id: 'anthropic',
        label: 'Anthropic',
        models: DEFAULT_MODELS,
        requiresVault: true,
        vaultKeyPath: 'ai_keys.anthropic',

        async listModels() {
          try {
            const c = requireClient()
            const list = await c.models.list({ limit: 50 })
            return list.data.map((m) => ({ id: m.id, label: m.display_name ?? m.id }))
          } catch {
            return DEFAULT_MODELS
          }
        },

        async complete(reqRaw: unknown) {
          const req = reqRaw as CompleteReq
          const c = requireClient()
          const res = await c.messages.create(
            {
              model: req.model || DEFAULT_MODEL,
              max_tokens: req.maxTokens ?? 4096,
              system: req.system,
              messages: mapMessages(req),
              temperature: req.temperature,
              top_p: req.topP,
            },
            { signal: req.signal },
          )
          const text = res.content
            .filter(
              (c2): c2 is { type: 'text'; text: string } & typeof c2 =>
                (c2 as { type?: string }).type === 'text',
            )
            .map((c2) => c2.text)
            .join('')
          return {
            text,
            usage: {
              promptTokens: res.usage.input_tokens,
              completionTokens: res.usage.output_tokens,
              totalTokens: res.usage.input_tokens + res.usage.output_tokens,
            },
          }
        },

        async *stream(reqRaw: unknown) {
          const req = reqRaw as CompleteReq
          const c = requireClient()
          const stream = c.messages.stream(
            {
              model: req.model || DEFAULT_MODEL,
              max_tokens: req.maxTokens ?? 4096,
              system: req.system,
              messages: mapMessages(req),
              temperature: req.temperature,
              top_p: req.topP,
            },
            { signal: req.signal },
          )
          for await (const evt of stream) {
            if (
              evt.type === 'content_block_delta' &&
              evt.delta.type === 'text_delta'
            ) {
              yield { text: evt.delta.text }
            }
          }
          const final = await stream.finalMessage()
          yield {
            finished: true,
            usage: {
              promptTokens: final.usage.input_tokens,
              completionTokens: final.usage.output_tokens,
              totalTokens: final.usage.input_tokens + final.usage.output_tokens,
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
  },
})
