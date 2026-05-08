/**
 * Renderer-side OpenAI Codex provider.
 *
 * The actual Codex SDK lives in the main process (see `main.ts`) because it
 * spawns child processes and reads files. The renderer-side activate() does
 * three things:
 *
 *   1. Registers an AI provider that translates `complete()` / `stream()`
 *      into a `codex:run` IPC call against the main-side handler.
 *   2. Watches vault key + extension settings and pushes the latest values
 *      to main via `codex:configure` so the SDK client stays in sync with
 *      whatever the user typed in Settings → AI.
 *   3. Wires teardown so deactivation also clears the configured client.
 */

import type { ExtensionContext } from '@mterminal/extension-api'

interface CompleteReq {
  provider?: string
  model?: string
  messages: Array<{ role: string; content: string }>
  system?: string
  signal?: AbortSignal
}

interface RunResult {
  text: string
}

const DEFAULT_MODELS = [
  { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
  { id: 'gpt-5-codex-pro', label: 'GPT-5 Codex Pro' },
]

function flattenPrompt(req: CompleteReq): string {
  const parts: string[] = []
  if (req.system) parts.push(`System: ${req.system}`)
  for (const m of req.messages) {
    const head = m.role.charAt(0).toUpperCase()
    parts.push(`${head}${m.role.slice(1)}: ${m.content}`)
  }
  return parts.join('\n\n')
}

export async function activate(ctx: ExtensionContext): Promise<void> {
  const pushConfig = async (): Promise<void> => {
    const apiKey = await ctx.vault.get('ai_keys.openai-codex').catch(() => null)
    const baseUrl = (ctx.settings.get<string>('baseUrl') ?? '').trim() || null
    try {
      await ctx.ipc.invoke('codex:configure', { apiKey, baseUrl })
    } catch (err) {
      ctx.logger.warn('codex:configure failed', err)
    }
  }

  // Initial sync, then react to vault/settings changes.
  await pushConfig()

  ctx.subscribe(
    ctx.vault.onChange((key) => {
      if (key === 'ai_keys.openai-codex') void pushConfig()
    }),
  )
  ctx.subscribe(
    ctx.settings.onChange((key) => {
      if (key === 'baseUrl') void pushConfig()
    }),
  )

  ctx.subscribe(
    ctx.ai.registerProvider({
      id: 'openai-codex',
      label: 'OpenAI Codex',
      models: DEFAULT_MODELS,
      requiresVault: true,
      vaultKeyPath: 'ai_keys.openai-codex',

      async complete(reqRaw: unknown) {
        const req = reqRaw as CompleteReq
        const prompt = flattenPrompt(req)
        const result = await ctx.ipc.invoke<RunResult>('codex:run', {
          prompt,
          model: req.model,
        })
        return {
          text: result.text,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }
      },

      // No incremental streaming yet — Codex SDK runs entirely in main and
      // streaming events would need a separate IPC channel. For now we yield
      // the final text as a single delta and then `finished`.
      async *stream(reqRaw: unknown) {
        const req = reqRaw as CompleteReq
        const prompt = flattenPrompt(req)
        const result = await ctx.ipc.invoke<RunResult>('codex:run', {
          prompt,
          model: req.model,
        })
        if (req.signal?.aborted) return
        if (result.text) yield { text: result.text }
        yield {
          finished: true,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }
      },
    }),
  )
}

export function deactivate(): void {
  /* ctx.subscribe handlers run automatically on host-side teardown */
}
