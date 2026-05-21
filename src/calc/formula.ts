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

export type ElementKey =
  | 'pyro' | 'hydro' | 'cryo' | 'electro' | 'anemo' | 'geo' | 'dendro' | 'physical'
export type MoveKey = 'normal' | 'charged' | 'plunging' | 'skill' | 'burst'
export type CritMode = 'off' | 'on' | 'avg'

export interface FormulaDef {
  name: string
  move: MoveKey
  element: ElementKey
  /** AST for the base damage zone. Typically `prod(v('final.atk'), mult)`,
   *  optionally with element-conditional flat adds (e.g. Icy Quill). */
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
  /** Final damage. */
  value: number
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
  const base = evaluate(def.base, scope)

  // DMG bonus = 1 + dmg_<ele> + dmg_<move>
  const eleBonus = scope.get(`final.dmg_.${def.element}`) ?? 0
  const moveBonus = scope.get(`final.dmgMove_.${def.move}`) ?? 0
  const dmgBonus = 1 + eleBonus + moveBonus

  // Crit multi
  const cr = scope.get('cappedCritRate_') ?? 0
  const cd = scope.get('final.critDMG_') ?? 0
  const critMulti =
    critMode === 'on' ? 1 + cd :
    critMode === 'avg' ? 1 + cr * cd :
    /* off */ 1

  // Enemy DEF
  const charPart = charLevel + 100
  const enemyPart = (enemy.level + 100) * (1 - (enemy.defRed ?? 0) - (enemy.defIgn ?? 0))
  const defMulti = charPart / (charPart + enemyPart)

  // Enemy RES (Genshin's piecewise formula)
  const res = enemy.preRes?.[def.element] ?? 0.1
  const resMulti = res >= 0.75 ? 1 / (1 + 4 * res) : res >= 0 ? 1 - res : 1 - 0.5 * res

  const value = base * dmgBonus * critMulti * defMulti * resMulti
  return {
    name: def.name,
    move: def.move,
    element: def.element,
    value,
    breakdown: { base, dmgBonus, critMulti, defMulti, resMulti },
  }
}
