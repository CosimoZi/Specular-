// 班尼特 / Bennett damage formulas.
// Vendor: vendor/go/gi/sheets/src/Characters/Bennett/index.tsx
//
// All ATK-scaling. 4★ sword, pyro.
//
// Auto-array (sword, 5-hit chain):
//   auto[0..4]  N1..N5 (physical)
//   auto[5..6]  charged 1+2 (physical)
//   auto[7]     charged stamina (const)
//   auto[8..10] plunging triplet
//
// Skill (9 entries):
//   skill[0]  press
//   skill[1..2]  hold1_1 / hold1_2
//   skill[3..4]  hold2_1 / hold2_2
//   skill[5]  explosion
//   skill[6..8] cd consts
//
// Burst (7 entries):
//   burst[0]  burst dmg
//   burst[1]  regen% (heal)
//   burst[2]  regen flat (heal)
//   burst[3]  atkBonus ratio (team buff)
//   burst[4..6] consts

import { prod, lookup, v, sub, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Bennett as {
  auto: number[][]; skill: number[][]; burst: number[][]
}
const lvlLookup = (table: number[], lvlVar: string): Node => lookup(table, sub(v(lvlVar), 1))
const atkProd = (table: number[], lvlVar: string) => prod(v('final.atk'), lvlLookup(table, lvlVar))

export const BennettFormulas: FormulaDef[] = [
  // Normals (physical, 5-hit sword chain)
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  { name: 'normal_3', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  { name: 'normal_4', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  // Charged
  { name: 'charged_1', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[5]!, 'talent.auto') },
  { name: 'charged_2', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[6]!, 'talent.auto') },
  // Plunging
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[8]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[9]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[10]!, 'talent.auto') },

  // Skill (热情过载) — 6 hits depending on press/hold
  { name: 'skill_press', move: 'skill', element: 'pyro', base: atkProd(skillParam.skill[0]!, 'talent.skill') },
  { name: 'skill_hold1_1', move: 'skill', element: 'pyro', base: atkProd(skillParam.skill[1]!, 'talent.skill') },
  { name: 'skill_hold1_2', move: 'skill', element: 'pyro', base: atkProd(skillParam.skill[2]!, 'talent.skill') },
  { name: 'skill_hold2_1', move: 'skill', element: 'pyro', base: atkProd(skillParam.skill[3]!, 'talent.skill') },
  { name: 'skill_hold2_2', move: 'skill', element: 'pyro', base: atkProd(skillParam.skill[4]!, 'talent.skill') },
  { name: 'skill_explosion', move: 'skill', element: 'pyro', base: atkProd(skillParam.skill[5]!, 'talent.skill') },

  // Burst (美妙旅程) — main dmg hit
  { name: 'burst_dmg', move: 'burst', element: 'pyro', base: atkProd(skillParam.burst[0]!, 'talent.burst') },

  // C4 — hold1_2 boosted by constellation4[0] = 1.35 (×1.35 multiplier).
  // Treat as a separate formula entry for clarity.
  // (We don't add a fixed boost to the base hold1_2 formula since C4 might not always apply.)
]

export function applyBennettFormulaBuffs(
  _scope: import('../scope').Scope,
  _condState: Record<string, Record<string, number>>,
) {
  // Bennett's main team buffs are cross-char (Q ATK to active char + C6 pyro_dmg_),
  // applied in build.ts applyTeammateBuff() when focus is OTHER character.
  // When focus IS Bennett, those apply to himself via the same path.
}
