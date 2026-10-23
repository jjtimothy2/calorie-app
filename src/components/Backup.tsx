import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sheet } from './Sheet'
import { Button, Card } from './ui'
import { downloadBackup, lastBackupText, parseBackup, readMeta, restoreExtraKeys, type Parsed } from '../lib/backup'
import { useStore } from '../lib/store'

type Ok = Extract<Parsed, { ok: true }>
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** Pick a file, validate it, then confirm before replacing what is on this device. */
function useImport(after: () => void) {
  const { state, dispatch } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Ok | null>(null)
  const pick = () => { setError(''); input.current?.click() }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (input.current) input.current.value = ''
    if (f.size > 20_000_000) { setError('That file is too large to be a backup.'); return }
    const r = parseBackup(await f.text())
    if (r.ok) setPending(r)
    else setError(r.error)
  }
  const confirm = () => {
    if (!pending) return
    restoreExtraKeys(pending.file)
    dispatch({ type: 'restore', state: pending.state })
    setPending(null)
    after()
  }
  const hasData = !!state.profile || state.entries.length > 0
  const ui = (
    <>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" data-testid="import-file" onChange={(e) => onFile(e.target.files?.[0])} />
      {error && <p role="alert" className="text-[15px] font-semibold text-danger" data-testid="import-error">{error}</p>}
      {pending && (
        <Sheet label="Restore backup" onClose={() => setPending(null)}>
          <h2 className="text-[22px] font-bold">Restore this backup?</h2>
          <p className="text-[15px] text-mute" data-testid="import-summary">
            {isNaN(pending.summary.exportedAt.getTime()) ? 'Backup' : `Backup from ${pending.summary.exportedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            {': '}{plural(pending.summary.days, 'day')}, {plural(pending.summary.entries, 'food entry', 'food entries')}, {plural(pending.summary.exercises, 'workout')}
            {pending.state.profile ? ', with your profile' : ''}.
          </p>
          {hasData && <p className="text-[15px] font-semibold">This replaces everything currently on this device.</p>}
          <Button data-autofocus onClick={confirm}>{hasData ? 'Replace my data' : 'Restore'}</Button>
          <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
        </Sheet>
      )}
    </>
  )
  return { pick, ui }
}

export function BackupCard() {
  const nav = useNavigate()
  const [meta, setMeta] = useState(readMeta)
  const [msg, setMsg] = useState('')
  // Go to Today after a restore so every screen starts from the restored data.
  const imp = useImport(() => nav('/', { replace: true }))
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-[17px] font-bold">Backup</h2>
      <p className="text-[15px] text-mute">Your data lives only in this browser. Save a backup file now and then, and keep it somewhere safe (Files, iCloud Drive, Google Drive).</p>
      <Button onClick={() => { downloadBackup(); setMeta(readMeta()); setMsg('Backup saved to your downloads.') }}>Export backup</Button>
      <Button variant="ghost" onClick={imp.pick}>Import backup</Button>
      <p className="text-center text-[13px] text-mute" data-testid="last-backup">{lastBackupText(meta)}</p>
      <p role="status" className="text-center text-[15px] text-g-ink empty:hidden" data-testid="backup-status">{msg}</p>
      {imp.ui}
    </Card>
  )
}

/** On first run: bring data over from another device instead of starting fresh. */
export function RestoreLink() {
  const nav = useNavigate()
  const imp = useImport(() => nav('/', { replace: true }))
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" className="px-2 py-1 text-[15px] font-bold text-g-ink" onClick={imp.pick}>Restore from a backup</button>
      {imp.ui}
    </div>
  )
}
