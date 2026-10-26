// v1.5: Me > AI photo estimate. The user's own Gemini or OpenAI key, kept only in localStorage on this device.
// The key is never logged, never exported in backups, and only ever sent to the chosen provider.
import { useEffect, useRef, useState } from 'react'
import { AiError, DEFAULT_PROVIDER, KEY_URL, MODELS, PROVIDERS, PROVIDER_LABEL, clearAi, errorText, readAi, saveAi, testKey, type Provider } from '../lib/ai'
import { readUi, reducedMotion, saveUi, type TextTransition } from '../lib/ui'
import { Button, Card, Chip } from './ui'

type Status = { tone: 'ok' | 'err' | 'info'; text: string } | null

export function AiCard({ focus = false }: { focus?: boolean }) {
  const saved = readAi()
  const [provider, setProvider] = useState<Provider>(saved?.provider ?? DEFAULT_PROVIDER)
  const [key, setKey] = useState(saved?.key ?? '')
  const [stored, setStored] = useState(saved)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [trans, setTrans] = useState<TextTransition>(() => readUi().textTransition)
  const pickTrans = (t: TextTransition) => { setTrans(t); saveUi({ textTransition: t }) }
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focus) return
    ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    if (!saved) input.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  const trimmed = key.trim()
  const dirty = !stored || stored.key !== trimmed || stored.provider !== provider
  const pick = (p: Provider) => { setProvider(p); setStatus(null) }
  const save = () => {
    if (!trimmed) return
    saveAi({ provider, key: trimmed })
    setStored({ provider, key: trimmed })
    setStatus({ tone: 'ok', text: 'Saved. The AI button on Log is ready.' })
  }
  const test = async () => {
    if (!trimmed) return
    setBusy(true)
    setStatus({ tone: 'info', text: 'Testing…' })
    try {
      await testKey({ provider, key: trimmed })
      setStatus({ tone: 'ok', text: dirty ? 'Key works. Tap Save to use it.' : `Key works with ${PROVIDER_LABEL[provider]}.` })
    } catch (e) {
      const t = errorText(e instanceof AiError ? e.kind : 'failed', provider)
      setStatus({ tone: 'err', text: `${t.title}. ${t.body}` })
    } finally { setBusy(false) }
  }
  const remove = () => {
    clearAi()
    setStored(null)
    setKey('')
    setShow(false)
    setStatus({ tone: 'info', text: 'Key removed from this phone.' })
  }

  return (
    <div ref={ref} className="scroll-mt-4" id="ai">
      <Card className="flex flex-col gap-3">
        <h2 className="title text-[21px]">AI photo estimate</h2>
        <p className="text-[15px] leading-snug text-mute">Snap your plate on Log and get a rough estimate. Uses your own API key.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="AI provider">
          {PROVIDERS.map((p) => <Chip key={p} on={provider === p} onClick={() => pick(p)}>{PROVIDER_LABEL[p]}</Chip>)}
        </div>
        <p className="-mt-1 text-[13px] text-mute">
          Model: {MODELS[provider]}.{provider === 'gemini' ? ' Works with a free key.' : ''}{' '}
          <a href={KEY_URL[provider]} target="_blank" rel="noreferrer noopener" className="font-semibold text-g-ink underline">Get a key</a>
        </p>
        <label className="flex flex-col gap-1.5 text-base font-semibold">
          <span>{PROVIDER_LABEL[provider]} API key</span>
          <span className="flex items-center gap-2">
            <input
              ref={input}
              type={show ? 'text' : 'password'}
              value={key}
              onChange={(e) => { setKey(e.target.value); setStatus(null) }}
              placeholder={provider === 'gemini' ? 'AIza…' : 'sk-…'}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-testid="ai-key"
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 font-mono text-[16px] font-normal"
            />
            <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} className="tap shrink-0 rounded-xl border border-line px-3 py-2 text-[15px] font-semibold">
              {show ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!trimmed || !dirty} onClick={save}>{stored && !dirty ? 'Saved' : 'Save'}</Button>
          <Button variant="ghost" className="flex-1" disabled={!trimmed || busy} onClick={test}>Test key</Button>
        </div>
        {status && (
          <p role="status" data-testid="ai-status" data-tone={status.tone} className={`text-[15px] leading-snug ${status.tone === 'err' ? 'text-danger' : status.tone === 'ok' ? 'text-g-ink' : 'text-mute'}`}>
            {status.tone === 'ok' ? '✓ ' : ''}{status.text}
          </p>
        )}
        {stored && <Button variant="danger" onClick={remove}>Remove key</Button>}
        {/* v1.6.4: compare the two text-first transitions on the phone. Stored in calorie-app:ui. */}
        <div className="flex flex-col gap-1.5 border-t border-line pt-3" data-testid="transition-setting">
          <span className="text-[14px] font-semibold" id="tt-label">Text field transition</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="tt-label">
            {([['fade', 'Smooth fade'], ['snap', 'Instant snap']] as const).map(([v, l]) => (
              <Chip key={v} role="radio" aria-checked={trans === v} aria-pressed={undefined} on={trans === v} onClick={() => pickTrans(v)}>{l}</Chip>
            ))}
          </div>
          <p className="text-[13px] leading-snug text-mute">
            {reducedMotion() ? 'Reduce Motion is on, so the AI sheet always snaps.' : 'How the camera gives way when you tap the text field in the AI sheet.'}
          </p>
        </div>
        <p className="text-[13px] leading-snug text-mute">
          🔒 Your key stays on this phone. It isn’t in backups and is only sent to {PROVIDER_LABEL[provider]}. Photos are never kept.
          {provider === 'gemini' ? ' On the free tier Google may use your photos to improve its products.' : ''}
        </p>
      </Card>
    </div>
  )
}
