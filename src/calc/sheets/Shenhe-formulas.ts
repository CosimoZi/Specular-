// Shenhe's 13 damage formulas + damage-side cond buffs.

import { sum, prod, when, ne, lookup, v, sub, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import { Scope } from '../scope'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Shenhe as {
  auto: number[][]
  skill: number[][]
  burst: number[][]
  passive2: number[][]
}

// Build `lookup(table, idx_var_minus_one)` so talent lvl 10 hits table[9].
const lvlLookup = (table: number[], lvlVar: string): Node =>
  lookup(table, sub(v(lvlVar), 1))

const lvlIdx = (lvl: number) => Math.max(0, Math.min(14, Math.floor(lvl) - 1))
const effBurst = (s: Scope) => {
  const t = s.get('talent.burst') ?? 1
  const c = s.get('constellation') ?? 0
  return Math.min(15, t + (c >= 5 ? 3 : 0))
}

const atkProd = (table: number[], lvlVar: string) =>
  prod(v('final.atk'), lvlLookup(table, lvlVar))

const icyQuillFlat = (): Node =>
  when(
    ne(v('cond.Shenhe.quillActive', 0), 0),
    prod(v('final.atk'), lvlLookup(skillParam.skill[2]!, 'talent.skill')),
    0,
  )

export const ShenheFormulas: FormulaDef[] = [
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  { name: 'normal_3', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  { name: 'normal_4', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[5]!, 'talent.auto') },
  { name: 'charged', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[6]!, 'talent.auto') },
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[8]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[9]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[10]!, 'talent.auto') },
  { name: 'skill_press', move: 'skill', element: 'cryo', base: sum(atkProd(skillParam.skill[0]!, 'talent.skill'), icyQuillFlat()) },
  { name: 'skill_hold', move: 'skill', element: 'cryo', base: sum(atkProd(skillParam.skill[1]!, 'talent.skill'), icyQuillFlat()) },
  { name: 'burst', move: 'burst', element: 'cryo', base: sum(atkProd(skillParam.burst[0]!, 'talent.burst'), icyQuillFlat()) },
  { name: 'burst_dot', move: 'burst', element: 'cryo', base: sum(atkProd(skillParam.burst[2]!, 'talent.burst'), icyQuillFlat()) },
]

/** Cond-gated buffs that affect DAMAGE (not panel ATK). Call BEFORE evaluating
 *  formulas so dmg_<ele>/dmg_<move>/critDMG_ have the right values. */
export function applyShenheFormulaBuffs(
  scope: Scope,
  condState: Record<string, Record<string, number>>,
) {
  const ascension = scope.get('ascension') ?? 0
  const constellation = scope.get('constellation') ?? 0
  const burstIdx = lvlIdx(effBurst(scope))

  // A1: burst field → +15% cryo DMG.
  if (ascension >= 1 && condState.Shenhe?.burstField) {
    scope.add('final.dmg_.cryo', 0.15)
  }
  // A4 press: skill+burst DMG +X% (X from burst[1] table at burst lvl).
  if (ascension >= 4 && condState.Shenhe?.a4Press) {
    const pct = skillParam.burst[1]![burstIdx]!
    scope.add('final.dmgMove_.skill', pct)
    scope.add('final.dmgMove_.burst', pct)
  }
  // A4 hold: N/C/P DMG +15% (passive2[2]).
  if (ascension >= 4 && condState.Shenhe?.a4Hold) {
    scope.add('final.dmgMove_.normal', 0.15)
    scope.add('final.dmgMove_.charged', 0.15)
    scope.add('final.dmgMove_.plunging', 0.15)
  }
  // C2: burst field → +15% cryo CDmg.
  if (constellation >= 2 && condState.Shenhe?.burstField) {
    scope.add('final.critDMG_', 0.15)
  }
  // C4: per-stack +5% to own skill DMG.
  if (constellation >= 4) {
    const stacks = condState.Shenhe?.c4Stacks ?? 0
    if (stacks > 0) scope.add('final.dmgMove_.skill', stacks * 0.05)
  }
}

/** Q-field RES shred — to be subtracted from enemy preRes for cryo+phys. */
export function shenheQResShred(
  scope: Scope,
  condState: Record<string, Record<string, number>>,
): number {
  if (!condState.Shenhe?.burstField) return 0
  return skillParam.burst[1]![lvlIdx(effBurst(scope))]!
}
