// 香菱 / Xiangling damage formulas.
// Vendor: vendor/go/gi/sheets/src/Characters/Xiangling/index.tsx
//
// 4★ pyro polearm. All ATK-scaling.
//
// Auto-array (polearm, 5-hit with N3 ×2, N4 ×4):
//   auto[0..4]  N1..N5 (physical)
//   auto[5]     charged (physical)
//   auto[6]     charged stamina (const)
//   auto[7..9]  plunging triplet
//
// Skill (2 entries): press dmg + cd const
// Burst (7 entries):
//   burst[0..2] burst initial 3-hit chain (Q first 3 hits)
//   burst[3]    Pyronado tornado hit (the main DPS source)
//   burst[4..6] duration / cd / energy

import { prod, lookup, v, sub, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Xiangling as {
  auto: number[][]; skill: number[][]; burst: number[][]
}
const lvlLookup = (table: number[], lvlVar: string): Node => lookup(table, sub(v(lvlVar), 1))
const atkProd = (table: number[], lvlVar: string) => prod(v('final.atk'), lvlLookup(table, lvlVar))

export const XianglingFormulas: FormulaDef[] = [
  // Normals (polearm, 5-hit chain)
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  { name: 'normal_3', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  { name: 'normal_4', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  { name: 'charged', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[5]!, 'talent.auto') },
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[7]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[8]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[9]!, 'talent.auto') },

  // Skill (Guoba)
  { name: 'skill_press', move: 'skill', element: 'pyro', base: atkProd(skillParam.skill[0]!, 'talent.skill') },

  // Burst (Pyronado)
  { name: 'burst_dmg1', move: 'burst', element: 'pyro', base: atkProd(skillParam.burst[0]!, 'talent.burst') },
  { name: 'burst_dmg2', move: 'burst', element: 'pyro', base: atkProd(skillParam.burst[1]!, 'talent.burst') },
  { name: 'burst_dmg3', move: 'burst', element: 'pyro', base: atkProd(skillParam.burst[2]!, 'talent.burst') },
  { name: 'burst_pyronado', move: 'burst', element: 'pyro', base: atkProd(skillParam.burst[3]!, 'talent.burst') },
]

export function applyXianglingFormulaBuffs(
  _scope: import('../scope').Scope,
  _condState: Record<string, Record<string, number>>,
) {
  // All buffs cross-char (handled in applyTeammateBuff).
}
