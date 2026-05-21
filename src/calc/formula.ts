// Damage formula evaluation.
//
// A formula is a (move, element, base-AST) triple. The pipeline runs base AST
// against the built scope, then layers on:
//   * DMG bonus  = 1 + dmg_<element> + dmg_<move>
//   * Crit multi = 1 + CR × CDmg  (avg mode, our default; on/off modes available)
//   * Enemy DEF  = (charLvl + 100) / (charLvl + 100 + enemyLvl + 100 - defRed - defIgn)
//   * Enemy RES  = piecewise (Genshin RES formula)
//
// No reaction support yet — reaction multipliers (amp / cata / trans) are a
// follow-up. For Shenhe baseline numbers we don't need them.

import { evaluate, type Node } from './ast'
import type { Scope } from './scope'
import { TRANSFORMATIVE_REACTION_BASE, MOON_REACTION_REACTION_COEFF, MOON_REACTION_DIRECT_COEFF } from './data/reaction-base'

export type ElementKey =
  | 'pyro' | 'hydro' | 'cryo' | 'electro' | 'anemo' | 'geo' | 'dendro' | 'physical'
export type MoveKey = 'normal' | 'charged' | 'plunging' | 'skill' | 'burst'
export type CritMode = 'off' | 'on' | 'avg'

/** Formula kind controls how `evaluateFormula` assembles damage:
 *
 *  - 'standard': `(atk × mult) × (1 + dmg_<ele> + dmg_<move>) × crit × def × res`
 *    The default — talent attacks, charged shots, plunge.
 *
 *  - 'reactionMoon': transformative-form moon reaction (月感电 / 月绽放 /
 *     月结晶 from passives, where damage doesn't carry HP/ATK and is shared
 *     across team).
 *     `(transformativeBase[lvl] × 1.8 + flatAdd) × (1 + 精通增益 + reactionBoost)
 *      × crit × res` (no DEF mitigation since transformatives ignore enemy DEF;
 *     no element-DMG-bonus since moon reactions don't take it).
 *
 *  - 'directMoon': direct-form moon reaction (倍率月反应) — character's skill
 *     deals moon-reaction damage scaled by a main stat × multiplier.
 *     `(3 × mainStat × mult + flatAdd) × (1 + 精通增益 + reactionBoost) ×
 *      crit × res` — no DEF mitigation, no element-DMG-bonus. */
export type FormulaKind = 'standard' | 'reactionMoon' | 'directMoon'

export interface FormulaDef {
  name: string
  move: MoveKey
  element: ElementKey
  /** What kind of damage formula. Default 'standard'. */
  kind?: FormulaKind
  /** AST for the base damage zone (standard) or for the multiplier × stat
   *  expression (directMoon). For reactionMoon this is an optional flat
   *  addition (e.g. Linnea C1 stack-consume DEF flat add). */
  base: Node
}

export interface EnemyContext {
  level: number
  /** Pre-mitigation RES, 0..1. Default 0.1 (10% across all elements). */
  preRes?: Partial<Record<ElementKey, number>>
  defRed?: number
  defIgn?: number
}

export interface FormulaContext {
  scope: Scope
  charLevel: number
  enemy: EnemyContext
  critMode?: CritMode
}

export interface FormulaResult {
  name: string
  move: MoveKey
  element: ElementKey
  /** Expected (avg-crit-mode) damage — the headline number. */
  value: number
  /** Non-crit damage (critMulti = 1). */
  nonCrit: number
  /** Crit damage (critMulti = 1 + CDmg). */
  crit: number
  /** Breakdown for UI / debugging. */
  breakdown: {
    base: number
    dmgBonus: number
    critMulti: number
    defMulti: number
    resMulti: number
  }
}

export function evaluateFormula(def: FormulaDef, ctx: FormulaContext): FormulaResult {
  const { scope, charLevel, enemy, critMode = 'avg' } = ctx
  const kind = def.kind ?? 'standard'
  const baseExpr = evaluate(def.base, scope)

  // Crit stats — common to all kinds
  const cr = scope.get('cappedCritRate_') ?? 0
  const cd = scope.get('final.critDMG_') ?? 0
  const critMultiNonCrit = 1
  const critMultiCrit = 1 + cd
  const critMultiAvg = 1 + cr * cd
  const critMultiHeadline =
    critMode === 'on' ? critMultiCrit :
    critMode === 'avg' ? critMultiAvg :
    /* off */ critMultiNonCrit

  // Enemy RES — common to all kinds
  const res = enemy.preRes?.[def.element] ?? 0.1
  const resMulti = res >= 0.75 ? 1 / (1 + 4 * res) : res >= 0 ? 1 - res : 1 - 0.5 * res

  let base: number
  let dmgBonus: number
  let defMulti: number

  if (kind === 'standard') {
    // base = atk × mult (from baseExpr); + dmg_<ele> + dmg_<move> bonus; + DEF mitigation
    base = baseExpr
    const eleBonus = scope.get(`final.dmg_.${def.element}`) ?? 0
    const moveBonus = scope.get(`final.dmgMove_.${def.move}`) ?? 0
    dmgBonus = 1 + eleBonus + moveBonus
    const charPart = charLevel + 100
    const enemyPart = (enemy.level + 100) * (1 - (enemy.defRed ?? 0) - (enemy.defIgn ?? 0))
    defMulti = charPart / (charPart + enemyPart)
  } else {
    // Moon reactions — share the (1 + 精通增益 + 反应提升) bonus, no element DMG
    // bonus, no enemy DEF mitigation (transformative reactions perforate DEF).
    const em = scope.get('final.eleMas') ?? 0
    const emBonus = (6 * em) / (em + 2000) // 精通增益
    const reactionBoost = scope.get('premod.moonReactionBoost') ?? 0
    dmgBonus = 1 + emBonus + reactionBoost
    defMulti = 1

    if (kind === 'reactionMoon') {
      // base = (transformative_level_base × 1.8) + flatAdd (from baseExpr)
      const levelBase = TRANSFORMATIVE_REACTION_BASE[Math.floor(charLevel)] ?? 0
      base = levelBase * MOON_REACTION_REACTION_COEFF + baseExpr
    } else {
      // directMoon: base = 3 × (mainStat × mult from baseExpr) + (no flat)
      // baseExpr is expected to encode `mainStat × multiplier` already.
      base = MOON_REACTION_DIRECT_COEFF * baseExpr
    }
  }

  const preCrit = base * dmgBonus * defMulti * resMulti
  const value = preCrit * critMultiHeadline
  const nonCrit = preCrit * critMultiNonCrit
  const crit = preCrit * critMultiCrit
  return {
    name: def.name,
    move: def.move,
    element: def.element,
    value,
    nonCrit,
    crit,
    breakdown: { base, dmgBonus, critMulti: critMultiHeadline, defMulti, resMulti },
  }
}
