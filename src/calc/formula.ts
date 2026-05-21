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
 *  - 'reactionMoon' / 'directMoon': moon-reaction formulas per 月白姬君's
 *     community reference. The full expression is:
 *
 *     [transformativeBase × 1.6 (reactionMoon)  OR  3 × mainStat × mult (directMoon)]
 *       × (1 + 基础提升%)                              ← premod.moonReactionBaseBoost
 *       + flatAddFromBaseAst                          ← from `def.base` AST (e.g. Linnea C1)
 *     × (1 + 精通增益 + 月反应增伤%)                    ← premod.moonReactionDmgBoost
 *     × 抗性系数                                       ← enemy preRes (defMulti=1 — perforates DEF)
 *     × 暴击区                                         ← (1 + CR × CDmg)
 *     × (1 + 擢升)                                     ← premod.moonReactionElevation
 *
 *     No element-DMG-bonus, no enemy-DEF mitigation. */
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
  let elevation = 0 // 擢升 — final multiplier, only used for moon reactions

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
    // Moon reactions. No element DMG bonus, no enemy DEF mitigation.
    const baseBoost = scope.get('premod.moonReactionBaseBoost') ?? 0  // 基础提升%
    const dmgBoost = scope.get('premod.moonReactionDmgBoost') ?? 0    // 月反应增伤% (next to EM)
    elevation = scope.get('premod.moonReactionElevation') ?? 0        // 擢升 (final multiplier)
    const em = scope.get('final.eleMas') ?? 0
    const emBonus = (6 * em) / (em + 2000) // 精通增益

    dmgBonus = 1 + emBonus + dmgBoost
    defMulti = 1

    if (kind === 'reactionMoon') {
      const levelBase = TRANSFORMATIVE_REACTION_BASE[Math.floor(charLevel)] ?? 0
      base = levelBase * MOON_REACTION_REACTION_COEFF * (1 + baseBoost) + baseExpr
    } else {
      // directMoon: 3 × main_stat × multiplier (from baseExpr) × (1 + baseBoost) + flat
      // baseExpr is expected to encode `mainStat × multiplier`. We multiply by
      // 3 and by (1 + baseBoost) here. Flat adds aren't standard for direct
      // moon yet — drop in if needed via a separate scope slot.
      base = MOON_REACTION_DIRECT_COEFF * baseExpr * (1 + baseBoost)
    }
  }

  const preCrit = base * dmgBonus * defMulti * resMulti * (1 + elevation)
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
