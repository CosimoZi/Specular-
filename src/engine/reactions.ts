import {
  AMP_BASE,
  CATALYZE_BASE,
  EM_CURVES,
  TRANSFORMATIVE_BASE,
  levelMultiplier,
} from './constants'
import type { Reaction } from './types'

/** For amp reactions (vape/melt) — multiplier applied to the base hit damage
 *  AFTER the elemental DMG bonus, BEFORE def/res. */
export function ampMultiplier(
  r: Extract<Reaction, { kind: 'vape' } | { kind: 'melt' }>,
  em: number,
  reactionBonus = 0,
): number {
  let base: number
  if (r.kind === 'vape') {
    base = r.trigger === 'pyro_on_hydro' ? AMP_BASE.vape_strong : AMP_BASE.vape_weak
  } else {
    base = r.trigger === 'pyro_on_cryo' ? AMP_BASE.melt_strong : AMP_BASE.melt_weak
  }
  return base * (1 + EM_CURVES.amp(em) + reactionBonus)
}

/** For catalyze (aggravate/spread) — flat additional damage added to base hit
 *  (which itself still goes through DMG bonus + def + res). */
export function catalyzeAddition(
  r: Extract<Reaction, { kind: 'aggravate' } | { kind: 'spread' }>,
  em: number,
  attackerLevel: number,
  reactionBonus = 0,
): number {
  const base = r.kind === 'aggravate' ? CATALYZE_BASE.aggravate : CATALYZE_BASE.spread
  return base * levelMultiplier(attackerLevel) * (1 + EM_CURVES.catalyze(em) + reactionBonus)
}

/** For transformative reactions — produces a STANDALONE damage value
 *  (not modulated by attacker's elemental DMG bonus, not crit'able).
 *  Caller still applies target res multiplier. */
export function transformativeDamage(
  r: Extract<Reaction, { kind: 'transformative' }>,
  em: number,
  attackerLevel: number,
  reactionBonus = 0,
): number {
  const base = TRANSFORMATIVE_BASE[r.type]
  return base * levelMultiplier(attackerLevel) * (1 + EM_CURVES.transformative(em) + reactionBonus)
}

/** Effective resistance multiplier from base res + flat reduction. */
export function resMultiplier(baseRes: number, reduction = 0): number {
  const r = baseRes - reduction
  if (r < 0) return 1 - r / 2
  if (r < 0.75) return 1 - r
  return 1 / (4 * r + 1)
}

/** Defense multiplier. Higher = more damage gets through. */
export function defMultiplier(
  attackerLevel: number,
  targetLevel: number,
  defReduction = 0,
  defIgnore = 0,
): number {
  const a = attackerLevel + 100
  const t = (targetLevel + 100) * (1 - defReduction) * (1 - defIgnore)
  return a / (a + t)
}
