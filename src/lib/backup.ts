// Backup and restore. All data lives in this browser's localStorage, so a JSON file is the only way to move or keep it.
import type { State } from './types'

export const APP_ID = 'calorie-counter'
export const BACKUP_SCHEMA = 1
export const PREFIX = 'calorie-app:'
export const STATE_KEY = 'calorie-app:v1'
export const META_KEY = 'calorie-app:backup' // { lastExportAt, dismissedAt }; device-local, never exported
export const REMIND_DAYS = 7
const DAY = 86_400_000

export type BackupFile = { app: typeof APP_ID; schema: number; exportedAt: string; data: Record<string, unknown> }
export type BackupMeta = { lastExportAt: number | null; dismissedAt: number | null }
export type Parsed = { ok: true; file: BackupFile; state: State; summary: { days: number; entries: number; exercises: number; exportedAt: Date } } | { ok: false; error: string }

export function readMeta(): BackupMeta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? '{}')
    return { lastExportAt: typeof m.lastExportAt === 'number' ? m.lastExportAt : null, dismissedAt: typeof m.dismissedAt === 'number' ? m.dismissedAt : null }
  } catch {
    return { lastExportAt: null, dismissedAt: null }
  }
}
export function writeMeta(patch: Partial<BackupMeta>) {
  localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), ...patch }))
}

/** Every calorie-app:* key except the backup bookkeeping, values parsed from JSON. */
export function makeBackup(now = new Date()): BackupFile {
  const data: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!
    if (!k.startsWith(PREFIX) || k === META_KEY) continue
    const raw = localStorage.getItem(k)!
    try { data[k] = JSON.parse(raw) } catch { data[k] = raw }
  }
  return { app: APP_ID, schema: BACKUP_SCHEMA, exportedAt: now.toISOString(), data }
}

const pad = (n: number) => String(n).padStart(2, '0')
export const backupFilename = (d = new Date()) => `calorie-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`

/** Builds the file, triggers the download and records the export time. */
export function downloadBackup(now = new Date()) {
  const blob = new Blob([JSON.stringify(makeBackup(now), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFilename(now)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  writeMeta({ lastExportAt: now.getTime(), dismissedAt: null })
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const BAD = "This file isn't a Calorie counter backup. Pick a file named like calorie-backup-2026-01-31.json."

/** Validates a backup file's text. Never throws; returns a friendly error instead. */
export function parseBackup(text: string): Parsed {
  let j: unknown
  try { j = JSON.parse(text) } catch { return { ok: false, error: BAD } }
  if (!isObj(j) || j.app !== APP_ID || !isObj(j.data)) return { ok: false, error: BAD }
  if (typeof j.schema !== 'number') return { ok: false, error: BAD }
  if (j.schema > BACKUP_SCHEMA) return { ok: false, error: 'This backup was made by a newer version of the app. Update the app, then try again.' }
  const s = j.data[STATE_KEY]
  const broken = { ok: false as const, error: 'This backup looks damaged, so nothing was changed. Try another backup file.' }
  if (!isObj(s) || s.version !== 1) return broken
  if (!Array.isArray(s.entries) || !Array.isArray(s.exercises) || !isObj(s.closedDays)) return broken
  if (s.profile !== null && !isObj(s.profile)) return broken
  if (s.favourites !== undefined && !Array.isArray(s.favourites)) return broken
  const entryOk = (e: unknown) => isObj(e) && typeof e.id === 'string' && typeof e.date === 'string' && typeof e.kcal === 'number'
  const exOk = (e: unknown) => isObj(e) && typeof e.id === 'string' && typeof e.date === 'string' && typeof e.kcal === 'number'
  if (!s.entries.every(entryOk) || !s.exercises.every(exOk)) return broken
  if (isObj(s.profile)) {
    const p = s.profile
    if (!['age', 'heightCm', 'weightKg'].every((k) => typeof p[k] === 'number')) return broken
  }
  const exportedAt = new Date(typeof j.exportedAt === 'string' ? j.exportedAt : NaN)
  const state = { favourites: [], ...s } as unknown as State
  const days = new Set([...state.entries.map((e) => e.date), ...state.exercises.map((e) => e.date)]).size
  return { ok: true, file: j as BackupFile, state, summary: { days, entries: state.entries.length, exercises: state.exercises.length, exportedAt } }
}

/** Writes non-state keys from a backup (the store writes the state itself after the restore action). */
export function restoreExtraKeys(file: BackupFile) {
  for (const [k, v] of Object.entries(file.data)) {
    if (!k.startsWith(PREFIX) || k === STATE_KEY || k === META_KEY) continue
    localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
}

export const daysSince = (t: number, now = Date.now()) => Math.max(0, Math.floor((now - t) / DAY))

export function lastBackupText(meta: BackupMeta, now = Date.now()) {
  if (meta.lastExportAt == null) return 'Last backup: never'
  const d = daysSince(meta.lastExportAt, now)
  return `Last backup: ${d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`}`
}

/** Remind when the data is 7+ days older than the last backup (or there never was one), unless dismissed in the last 7 days. */
export function shouldRemind(state: State, meta: BackupMeta, now = Date.now()) {
  const times = [...state.entries.map((e) => e.createdAt), ...state.exercises.map((e) => e.createdAt)].filter((t) => typeof t === 'number')
  if (!times.length) return false
  const since = meta.lastExportAt ?? Math.min(...times)
  if (now - since < REMIND_DAYS * DAY) return false
  if (meta.dismissedAt != null && now - meta.dismissedAt < REMIND_DAYS * DAY) return false
  return true
}
