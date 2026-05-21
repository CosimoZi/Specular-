// Shared sheet interfaces. A "sheet" is anything that can contribute buffs:
// character, weapon, artifact set. Each sheet declares:
//   * Conds — toggles the UI surfaces (bool / num).
//   * apply(scope, params, condState) — mutates scope with the sheet's
//     stat contributions. Damage-formula contributions are added separately
//     (see src/calc/formula.ts when that lands).
//
// The buff system is intentionally not AST-everywhere: numeric stat
// contributions are pure-scope mutation (fast, readable). AST is reserved
// for damage-formula expressions where introspection matters.

import type { Scope } from './scope'

export type CondType = 'bool' | 'num'
export interface CondDef {
  /** Local name within the sheet (e.g. 'quillActive', 'set4', 'stack'). */
  name: string
  type: CondType
  /** Display label — Chinese preferred for our UI. */
  label?: string
  /** For 'num' conds: integer-only by default. */
  intOnly?: boolean
  min?: number
  max?: number
}

/** Cond state, flattened per-sheet:
 *    { ShenheConds: { quillActive: 1, c4Stacks: 12, ... }, NoblesseOblige: { set4: 1 } } */
export type CondState = Record<string, Record<string, number>>

export interface CharacterSheet {
  key: string
  conds: CondDef[]
  /** Apply character ascension passives, constellation buffs, etc. */
  apply: (scope: Scope, ctx: CharacterApplyCtx, condState: CondState) => void
}

export interface CharacterApplyCtx {
  level: number
  ascension: number
  constellation: number
  talents: { auto: number; skill: number; burst: number }
}

export interface WeaponSheet {
  key: string
  conds: CondDef[]
  /** Apply weapon passive at the given refinement. base stats (curves +
   *  ascension flats + substat) are handled by the generic pipeline; this
   *  is for the passive only. */
  apply: (scope: Scope, ctx: WeaponApplyCtx, condState: CondState) => void
}

export interface WeaponApplyCtx {
  level: number
  ascension: number
  refinement: number  // 1..5
}

export interface ArtifactSetSheet {
  key: string
  conds: CondDef[]
  /** Apply 2pc and 4pc effects based on the equipped count. */
  apply: (scope: Scope, count: number, condState: CondState) => void
}
