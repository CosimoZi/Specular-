// Genshin level-scaling curves. Values pulled directly from
// vendor/go/gi/stats/src/allStat_gen.json. We import the JSON instead of
// re-keying each curve so we never go out of sync with the upstream data;
// the JSON is auto-generated from miHoYo's data dumps.
//
// Curve evaluation: `value = base * curve[level]`. Index is the in-game level
// (1-100). Index 0 is a -1 sentinel in the source.

// Path alias `@genshin-optimizer/gi/stats` resolves to vendor/go/gi/stats/src/index.ts
// which doesn't export the JSON directly. We import via the package's known
// vendor path; if the dep eventually goes away (M7), copy the JSON to
// src/calc/data/.
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

export type CharCurveKey =
  | 'GROW_CURVE_HP_S4' | 'GROW_CURVE_HP_S5'
  | 'GROW_CURVE_ATTACK_S4' | 'GROW_CURVE_ATTACK_S5'

export type WeaponCurveKey =
  // Common subset; the full enum is in the JSON but we only need what's
  // referenced by weapons we've implemented. Add as needed.
  | 'GROW_CURVE_ATTACK_101' | 'GROW_CURVE_ATTACK_102' | 'GROW_CURVE_ATTACK_103' | 'GROW_CURVE_ATTACK_104' | 'GROW_CURVE_ATTACK_105'
  | 'GROW_CURVE_ATTACK_301' | 'GROW_CURVE_ATTACK_302' | 'GROW_CURVE_ATTACK_303' | 'GROW_CURVE_ATTACK_304' | 'GROW_CURVE_ATTACK_305'
  | 'GROW_CURVE_CRITICAL_101' | 'GROW_CURVE_CRITICAL_201' | 'GROW_CURVE_CRITICAL_301'

const charCurves = (statsJson as any).char.expCurve as Record<string, number[]>
const weaponCurves = (statsJson as any).weapon.expCurve as Record<string, number[]>

export function charCurve(key: CharCurveKey, level: number): number {
  const arr = charCurves[key]
  if (!arr) throw new Error(`Unknown char curve: ${key}`)
  const v = arr[level]
  if (v === undefined) throw new Error(`Char curve ${key} has no entry for level ${level}`)
  return v
}

export function weaponCurve(key: WeaponCurveKey | string, level: number): number {
  const arr = weaponCurves[key]
  if (!arr) throw new Error(`Unknown weapon curve: ${key}`)
  const v = arr[level]
  if (v === undefined) throw new Error(`Weapon curve ${key} has no entry for level ${level}`)
  return v
}

// =============================================================================
// Raw character / weapon data accessors
// =============================================================================

export interface CharLvlCurveEntry { key: string; base: number; curve: string }
export interface CharDataRaw {
  ele: string
  weaponType: string
  rarity: number
  lvlCurves: CharLvlCurveEntry[]
  ascensionBonus: Record<string, number[]>
}

export interface WeaponDataRaw {
  weaponType: string
  rarity: number
  mainStat: { type: string; base: number; curve: string }
  subStat?: { type: string; base: number; curve: string }
  lvlCurves: CharLvlCurveEntry[]
  ascensionBonus: Record<string, number[]>
  refinementBonus: Record<string, number[]>
}

export function charDataRaw(key: string): CharDataRaw {
  const data = (statsJson as any).char.data[key]
  if (!data) throw new Error(`No character data for: ${key}`)
  return data as CharDataRaw
}

export function weaponDataRaw(key: string): WeaponDataRaw {
  const data = (statsJson as any).weapon.data[key]
  if (!data) throw new Error(`No weapon data for: ${key}`)
  return data as WeaponDataRaw
}
