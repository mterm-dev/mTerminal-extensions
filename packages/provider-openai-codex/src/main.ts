/**
 * Main-process side of the OpenAI Codex provider.
 *
 * The Codex SDK spawns child processes, reads files, and uses Node-only
 * modules (fs/path/os/child_process), so it cannot run in the renderer.
 * We host the live SDK client here and expose `codex:configure` /
 * `codex:run` IPC handlers; the renderer-side activate() drives the
 * configuration from the vault + settings and uses `ctx.ipc.invoke()` to
 * dispatch completion calls.
 */

import { Codex } from '@openai/codex-sdk'
import type { MainExtensionContext } from '@mterminal/extension-api'

interface ConfigureArgs {
  apiKey: string | null
  baseUrl?: string | null
}

interface RunArgs {
  prompt: string
  model?: string
}

interface RunResult {
  text: string
}

interface SdkServiceImpl {
  client: Codex
}

export async function activate(ctx: MainExtensionContext): Promise<void> {
  let client: Codex | null = null
  let svcDispose: { dispose: () => void } | null = null

  const buildClient = (args: ConfigureArgs): Codex | null => {
    if (!args.apiKey) return null
    const opts: Record<string, unknown> = { apiKey: args.apiKey }
    if (args.baseUrl) opts.baseUrl = args.baseUrl
    return new Codex(opts as ConstructorParameters<typeof Codex>[0])
  }

  const republish = (): void => {
    svcDispose?.dispose()
    svcDispose = null
    if (!client) return
    const impl: SdkServiceImpl = { client }
    svcDispose = ctx.providedServices.publish('ai.sdk.openai-codex', impl)
  }

  ctx.subscribe(
    ctx.ipc.handle('codex:configure', async (raw) => {
      const args = (raw ?? {}) as ConfigureArgs
      try {
        client = buildClient(args)
        republish()
        return { ok: true }
      } catch (err) {
        ctx.logger.error('codex:configure failed', err)
        client = null
        republish()
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }),
  )

  ctx.subscribe(
    ctx.ipc.handle('codex:run', async (raw) => {
      const args = (raw ?? {}) as RunArgs
      if (!client) {
        throw new Error(
          'OpenAI Codex SDK not configured — set the API key in Settings → AI → OpenAI Codex.',
        )
      }
      const thread = client.startThread()
      const result = (await thread.run({ input: args.prompt } as never)) as unknown as {
        finalResponse?: string
      }
      const out: RunResult = { text: result.finalResponse ?? '' }
      return out
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
