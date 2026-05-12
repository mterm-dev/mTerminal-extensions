import React, { useEffect, useMemo, useRef, useState } from 'react'
import { emptyHost, type HostMeta, type SshAuthMode, type SshKey } from '../shared/types'

interface UiHelpers {
  toast(opts: {
    kind?: 'info' | 'success' | 'warn' | 'error'
    title?: string
    message: string
    details?: string
    durationMs?: number
    dismissible?: boolean
  }): void
}

interface SecretsApi {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

interface Props {
  initial: HostMeta | null
  onClose(): void
  onSave(host: HostMeta): Promise<HostMeta>
  listSshKeys(): Promise<SshKey[]>
  secrets: SecretsApi
  ui: UiHelpers
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function HostEditorModal({
  initial,
  onClose,
  onSave,
  listSshKeys,
  secrets,
  ui,
}: Props) {
  const [form, setForm] = useState<HostMeta>(initial ?? emptyHost())
  const [password, setPassword] = useState('')
  const [keys, setKeys] = useState<SshKey[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [portTouched, setPortTouched] = useState(false)

  const modalRef = useRef<HTMLDivElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    return () => {
      const el = returnFocusRef.current
      if (el && typeof el.focus === 'function') {
        try {
          el.focus()
        } catch {
          // ignore
        }
      }
    }
  }, [])

  useEffect(() => {
    void listSshKeys().then(setKeys).catch(() => setKeys([]))
  }, [listSshKeys])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) {
        onClose()
        return
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => !el.hasAttribute('disabled'))
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const isEdit = Boolean(initial?.id)
  const passwordWillBeSaved = useMemo(
    () => form.auth === 'password' && form.savePassword,
    [form.auth, form.savePassword],
  )
  const portInvalid = form.port < 1 || form.port > 65535 || !Number.isFinite(form.port)
  const showPortError = portTouched && portInvalid
  const keyAuthNoKeys = form.auth === 'key' && keys.length === 0

  function update<K extends keyof HostMeta>(key: K, value: HostMeta[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(): Promise<void> {
    setError(null)
    if (!form.host.trim()) return setError('host is required')
    if (!form.user.trim()) return setError('user is required')
    if (portInvalid) {
      setPortTouched(true)
      return setError('port must be between 1 and 65535')
    }
    if (form.auth === 'key' && !form.identityPath?.trim()) {
      return setError('pick an identity file (or switch to agent auth)')
    }
    if (passwordWillBeSaved && !password) {
      const hadSecret =
        isEdit && initial?.id && Boolean(initial?.savePassword)
          ? Boolean(await secrets.get(`host:${initial.id}`).catch(() => null))
          : false
      if (!hadSecret) {
        return setError("enter the password to save, or uncheck 'save password'")
      }
    }
    setBusy(true)
    try {
      const meta: HostMeta = {
        ...form,
        name: form.name.trim() || `${form.user}@${form.host}`,
        identityPath: form.auth === 'key' ? form.identityPath : undefined,
        savePassword: form.auth === 'password' ? Boolean(form.savePassword) : false,
      }
      const saved = await onSave(meta)
      const savedId = saved?.id || meta.id || initial?.id
      if (savedId) {
        if (passwordWillBeSaved && password) {
          await secrets.set(`host:${savedId}`, password).catch((e) => {
            ui.toast({ kind: 'warn', message: `could not save password: ${(e as Error).message}` })
          })
        } else if (!passwordWillBeSaved) {
          await secrets.delete(`host:${savedId}`).catch(() => {})
        }
      }
      onClose()
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rs-modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="rs-modal" ref={modalRef}>
        <div className="rs-modal-header">
          <span className="rs-modal-title">{isEdit ? 'edit ssh host' : 'new ssh host'}</span>
          <button className="rs-icon-btn" onClick={onClose} disabled={busy} aria-label="close">
            ×
          </button>
        </div>
        <form
          className="rs-modal-body"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label="name" hint="label shown in sidebar">
            <input
              className="rs-input"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder={`${form.user || 'user'}@${form.host || 'host'}`}
              autoFocus
              name="ssh-name"
              autoComplete="off"
            />
          </Field>
          <div className="rs-field-row">
            <Field label="host">
              <input
                className="rs-input"
                value={form.host}
                onChange={(e) => update('host', e.target.value)}
                placeholder="vps.example.com"
                name="ssh-host"
                autoComplete="off"
              />
            </Field>
            <Field
              label="port"
              widthClass="rs-field-narrow"
              hint={showPortError ? '1–65535 required' : undefined}
            >
              <input
                type="number"
                className={'rs-input' + (showPortError ? ' rs-input-error' : '')}
                value={form.port}
                min={1}
                max={65535}
                onChange={(e) => {
                  const raw = e.target.value
                  const n = raw === '' ? 0 : Number(raw)
                  update('port', Number.isFinite(n) ? n : 0)
                  if (!portTouched) setPortTouched(true)
                }}
                onBlur={() => setPortTouched(true)}
                name="ssh-port"
                autoComplete="off"
              />
            </Field>
          </div>
          <Field label="user">
            <input
              className="rs-input"
              value={form.user}
              onChange={(e) => update('user', e.target.value)}
              placeholder="root"
              name="ssh-user"
              autoComplete="off"
            />
          </Field>
          <Field label="authentication">
            <div className="rs-radio-row">
              {(['key', 'agent', 'password'] as SshAuthMode[]).map((a) => (
                <label key={a} className={`rs-radio ${form.auth === a ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="auth"
                    checked={form.auth === a}
                    onChange={() => update('auth', a)}
                  />
                  <span>{a}</span>
                </label>
              ))}
            </div>
          </Field>
          {form.auth === 'key' && (
            <Field
              label="identity file"
              hint={
                keyAuthNoKeys
                  ? 'no keys in ~/.ssh — generate one with ssh-keygen'
                  : 'detected keys in ~/.ssh/'
              }
            >
              <select
                className="rs-input"
                value={form.identityPath ?? ''}
                onChange={(e) => update('identityPath', e.target.value || undefined)}
                disabled={keyAuthNoKeys && !form.identityPath}
              >
                <option value="">— select —</option>
                {keys.map((k) => (
                  <option key={k.path} value={k.path}>
                    {k.name} ({k.keyType})
                  </option>
                ))}
                {form.identityPath && !keys.some((k) => k.path === form.identityPath) && (
                  <option value={form.identityPath}>{form.identityPath}</option>
                )}
              </select>
            </Field>
          )}
          {form.auth === 'agent' && (
            <p className="rs-note">
              uses your running ssh-agent ($SSH_AUTH_SOCK). add keys with <code>ssh-add</code> outside mTerminal.
            </p>
          )}
          {form.auth === 'password' && (
            <>
              <div className="rs-field rs-field-toggle">
                <div className="rs-field-toggle-text">
                  <span>save password</span>
                  <span className="rs-field-hint">
                    stored encrypted in the secrets store; if off you will be asked each session
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.savePassword}
                  className={`rs-toggle ${form.savePassword ? 'on' : ''}`}
                  onClick={() => update('savePassword', !form.savePassword)}
                >
                  <span className="rs-toggle-knob" />
                </button>
              </div>
              {form.savePassword && (
                <Field label={isEdit ? 'password (leave blank to keep current)' : 'password'}>
                  <input
                    type="password"
                    className="rs-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    name="ssh-password"
                  />
                </Field>
              )}
            </>
          )}
          {error && <div className="rs-error">{error}</div>}
          <div className="rs-actions">
            <button type="button" className="rs-btn" onClick={onClose} disabled={busy}>
              cancel
            </button>
            <button type="submit" className="rs-btn rs-btn-primary" disabled={busy}>
              {busy ? '...' : isEdit ? 'save' : 'add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
  widthClass,
}: {
  label?: string
  hint?: string
  children: React.ReactNode
  widthClass?: string
}): React.JSX.Element {
  return (
    <div className={`rs-field ${widthClass ?? ''}`}>
      {label && <label className="rs-field-label">{label}</label>}
      {hint && <span className="rs-field-hint">{hint}</span>}
      <div className="rs-field-control">{children}</div>
    </div>
  )
}
