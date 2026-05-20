// Compute auto-base stats (HP / ATK / DEF) and the ascension-stat bonus for
// a character at any (level, ascensionStage) — using ambr's per-character
// `curve` and `ascensionStages` plus the curve tables in engine/stat-curves.

import type { CharacterMeta } from './meta'
import {
  characterCurve,
  defaultAscensionFor,
  MAX_LEVEL_BY_ASCENSION,
} from '@/engine/stat-curves'
import type { StatBag } from '@/engine/types'
import { ascensionBonusToStatBag } from './meta'

export interface BaseStats {
  hp: number
  atk: number
  def: number
}

/** Returns the cumulative ascension addProps map for the given stage.
 *  ambr's `ascensionStages` has these as totals at stage N (not per-stage diffs). */
function cumulativeAddProps(
  meta: CharacterMeta,
  stage: number,
): Record<string, number> {
  // Find the stage entry. `stage` is 0..6.
  const entry = meta.ascensionStages.find((s) => s.stage === stage)
  return entry?.addProps ?? {}
}

/** Compute base HP / ATK / DEF at a level + ascension stage. */
export function computeBaseStats(
  meta: CharacterMeta,
  level: number,
  stage: number,
): BaseStats {
  const initHp = meta.curve.FIGHT_PROP_BASE_HP?.initValue ?? 0
  const curveHp = meta.curve.FIGHT_PROP_BASE_HP?.curve ?? 'GROW_CURVE_HP_S5'
  const initAtk = meta.curve.FIGHT_PROP_BASE_ATTACK?.initValue ?? 0
  const curveAtk =
    meta.curve.FIGHT_PROP_BASE_ATTACK?.curve ?? 'GROW_CURVE_ATTACK_S5'
  const initDef = meta.curve.FIGHT_PROP_BASE_DEFENSE?.initValue ?? 0
  const curveDef = meta.curve.FIGHT_PROP_BASE_DEFENSE?.curve ?? 'GROW_CURVE_HP_S5'

  const add = cumulativeAddProps(meta, stage)
  const hp = initHp * characterCurve(curveHp, level) + (add.FIGHT_PROP_BASE_HP ?? 0)
  const atk = initAtk * characterCurve(curveAtk, level) + (add.FIGHT_PROP_BASE_ATTACK ?? 0)
  const def = initDef * characterCurve(curveDef, level) + (add.FIGHT_PROP_BASE_DEFENSE ?? 0)

  return { hp, atk, def }
}

/** Bonus to non-base stats at the given ascension stage (i.e. the character's
 *  "ascension stat" — e.g. +28.8% ATK at stage 6 for an ATK% character).
 *  Returns the FightProp keys that are NOT in BASE_HP/ATK/DEF. */
export function computeAscensionBonus(
  meta: CharacterMeta,
  stage: number,
): StatBag {
  const add = cumulativeAddProps(meta, stage)
  const bag: StatBag = {}
  const baseKeys = new Set([
    'FIGHT_PROP_BASE_HP',
    'FIGHT_PROP_BASE_ATTACK',
    'FIGHT_PROP_BASE_DEFENSE',
  ])
  for (const [k, v] of Object.entries(add)) {
    if (baseKeys.has(k)) continue
    Object.assign(bag, ascensionBonusToStatBag(k, v))
  }
  return bag
}

export { defaultAscensionFor, MAX_LEVEL_BY_ASCENSION }
