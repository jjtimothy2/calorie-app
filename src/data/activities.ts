// Illustrative data: approximate MET values (Compendium of Physical Activities style), prototype use only.
import type { Intensity } from '../lib/types'

export type ActivityDef = { id: string; name: string; met: Record<Intensity, number> }

type Row = [string, number, number, number] // name, light, moderate, vigorous MET
const rows: Row[] = [
  ['Walking', 2.8, 3.5, 5.0],
  ['Running', 7.0, 9.8, 11.8],
  ['Cycling', 4.0, 6.8, 10.0],
  ['Gym / weights', 3.5, 5.0, 6.0],
  ['Badminton', 4.5, 5.5, 7.0],
  ['Futsal', 6.0, 8.0, 10.0],
  ['Football', 6.0, 7.0, 10.0],
  ['Swimming', 5.8, 7.0, 9.8],
  ['Yoga', 2.3, 3.0, 4.0],
  ['Pilates', 2.8, 3.0, 3.8],
  ['Hiking', 5.3, 6.0, 7.8],
  ['Basketball', 4.5, 6.5, 8.0],
  ['Tennis', 5.0, 7.3, 8.0],
  ['Padel', 5.0, 6.5, 7.5],
  ['Dancing / Zumba', 4.5, 5.5, 7.3],
  ['HIIT / circuit', 6.0, 8.0, 10.0],
  ['Jump rope', 8.8, 11.8, 12.3],
  ['Martial arts', 5.3, 7.0, 10.3],
  ['Rowing machine', 4.8, 7.0, 8.5],
  ['Elliptical', 4.6, 5.0, 6.8],
  ['Stair climbing', 4.0, 8.0, 9.0],
  ['Housework', 2.3, 3.3, 4.0],
]
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
export const ACTIVITIES: ActivityDef[] = rows.map(([name, light, moderate, vigorous]) => ({ id: slug(name), name, met: { light, moderate, vigorous } }))
export const ACTIVITY_BY_ID = new Map(ACTIVITIES.map((a) => [a.id, a]))
export const INTENSITY_LABEL: Record<Intensity, string> = { light: 'Light', moderate: 'Moderate', vigorous: 'Vigorous' }

/** kcal = MET x body weight (kg) x hours */
export function exerciseKcal(activityId: string, intensity: Intensity, minutes: number, weightKg: number): number {
  const a = ACTIVITY_BY_ID.get(activityId)
  if (!a) return 0
  return Math.round(a.met[intensity] * weightKg * (minutes / 60))
}
