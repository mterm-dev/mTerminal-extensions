/**
 * OpenAI Codex provider extension.
 *
 * Codex is OpenAI's coding-agent SDK (https://developers.openai.com/codex/sdk).
 * Unlike the chat-completion-shaped Anthropic SDK, Codex is agentic: you
 * `startThread()` and `run(prompt)` against it, the agent decides which tools
 * to call, and you get back the final answer plus streaming events.
 *
 * For the simple chat-style `complete()`/`stream()` paths required by
 * AIPanel/CommandPalette/Explain, this extension adapts a single Codex thread
 * run into a text-only response. For richer use cases (full tool-use loops,
 * file diffs, multi-step coding sessions) consumers should grab the live
 * Codex client via `ctx.services['ai.sdk.openai-codex']` and drive it
 * directly.
 *
 * Vault key path: `ai_keys.openai-codex`.
 */

import { Codex } from '@openai/codex-sdk'
import type { Disposable, ExtensionContext } from '@mterminal/extension-api'

interface CompleteReq {
  provider?: string
  model?: string
  messages: Array<{ role: string; content: string }>
  system?: string
  signal?: AbortSignal
}

const DEFAULT_MODELS = [
  { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
  { id: 'gpt-5-codex-pro', label: 'GPT-5 Codex Pro' },
]

interface SdkServiceImpl {
  client: Codex
  factory: (overrides?: ConstructorParameters<typeof Codex>[0]) => Codex
}

function flattenPrompt(req: CompleteReq): string {
  // Codex `run()` takes a single prompt string. Roll the chat history into a
  // labelled transcript so the agent has the full context.
  const parts: string[] = []
  if (req.system) parts.push(`System: ${req.system}`)
  for (const m of req.messages) {
    const head = m.role.charAt(0).toUpperCase()
    parts.push(`${head}${m.role.slice(1)}: ${m.content}`)
  }
  return parts.join('\n\n')
}

export async function activate(ctx: ExtensionContext): Promise<void> {
    let client: Codex | null = null
    let svcDispose: Disposable | null = null

    const buildClient = async (): Promise<Codex | null> => {
      const apiKey = await ctx.vault.get('ai_keys.openai-codex')
      if (!apiKey) return null
      const baseUrl = ctx.settings.get<string>('baseUrl')?.trim() || undefined
      // The Codex SDK constructor signature mirrors the rest of the
      // OpenAI SDK family; pass apiKey + optional baseURL.
      return new Codex({ apiKey, baseUrl } as ConstructorParameters<typeof Codex>[0])
    }

    const republish = (): void => {
      svcDispose?.dispose()
      svcDispose = null
      if (!client) return
      const impl: SdkServiceImpl = {
        client,
        factory: (overrides) => new Codex(overrides as ConstructorParameters<typeof Codex>[0]),
      }
      svcDispose = ctx.providedServices.publish('ai.sdk.openai-codex', impl)
    }

    const rebuild = async (): Promise<void> => {
      client = await buildClient()
      republish()
    }

    await rebuild()

    ctx.subscribe(
      ctx.vault.onChange((key) => {
        if (key === 'ai_keys.openai-codex') void rebuild()
      }),
    )
    ctx.subscribe(
      ctx.settings.onChange((key) => {
        if (key === 'baseUrl') void rebuild()
      }),
    )

    const requireClient = (): Codex => {
      if (!client) {
        throw new Error(
          'OpenAI Codex SDK not configured — set the API key in Settings → AI → OpenAI Codex.',
        )
      }
      return client
    }

    ctx.subscribe(
      ctx.ai.registerProvider({
        id: 'openai-codex',
        label: 'OpenAI Codex',
        models: DEFAULT_MODELS,
        requiresVault: true,
        vaultKeyPath: 'ai_keys.openai-codex',

        async complete(reqRaw: unknown) {
          const req = reqRaw as CompleteReq
          const c = requireClient()
          const thread = c.startThread()
          const prompt = flattenPrompt(req)
          // SDK shape: thread.run({ input }) returns { items, finalResponse }
          // where finalResponse is the assistant's terminal answer.
          const result = await thread.run({ input: prompt } as never)
          const r = result as unknown as { finalResponse?: string }
          return {
            text: r.finalResponse ?? '',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          }
        },

        async *stream(reqRaw: unknown) {
          const req = reqRaw as CompleteReq
          const c = requireClient()
          const thread = c.startThread()
          const prompt = flattenPrompt(req)
          // The streaming variant exposes an event iterable; each event is
          // either an item (intermediate step) or the final response.
          const streamed = thread.runStreamed({ input: prompt } as never)
          const events = streamed as unknown as AsyncIterable<{
            type?: string
            item?: { type?: string; text?: string }
            delta?: string
            text?: string
          }>
          for await (const evt of events) {
            if (req.signal?.aborted) return
            // Surface text-bearing events as deltas; ignore tool-call/agent
            // events here (consumers wanting those should use the raw SDK).
            const text =
              evt.delta ?? evt.text ?? (evt.item?.type === 'message' ? evt.item.text : undefined)
            if (text) yield { text }
          }
          yield {
            finished: true,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
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
