// 爱诺 / Aino damage formulas.
// Vendor: vendor/go/gi/sheets/src/Characters/Aino/index.tsx
//
// Auto-array layout (claymore, 3-hit normals):
//   auto[0..2]   N1, N2, N3 (×2 in display)
//   auto[3]      charged cyclicDmg
//   auto[4]      charged finalDmg
//   auto[5]      charged stamina (const)
//   auto[6]      charged duration (const)
//   auto[7..9]   plunging dmg / low / high
//
// Skill: 2 hits (skill[0], skill[1]) + cd const at skill[2][0]
// Burst: ballDmg (burst[0]) + duration / cd / energy consts

import { prod, sum, lookup, v, sub, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Aino as {
  auto: number[][]
  skill: number[][]
  burst: number[][]
}

const lvlLookup = (table: number[], lvlVar: string): Node =>
  lookup(table, sub(v(lvlVar), 1))

const atkProd = (table: number[], lvlVar: string) =>
  prod(v('final.atk'), lvlLookup(table, lvlVar))

export const AinoFormulas: FormulaDef[] = [
  // Normals (claymore, physical)
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  // Charged (claymore, physical)
  { name: 'charged_cyclic', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  { name: 'charged_final', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  // Plunging
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[7]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[8]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[9]!, 'talent.auto') },

  // Skill (hydro, ATK)
  { name: 'skill_1', move: 'skill', element: 'hydro', base: atkProd(skillParam.skill[0]!, 'talent.skill') },
  { name: 'skill_2', move: 'skill', element: 'hydro', base: atkProd(skillParam.skill[1]!, 'talent.skill') },

  // Burst (hydro, ATK)
  { name: 'burst_ball', move: 'burst', element: 'hydro', base: atkProd(skillParam.burst[0]!, 'talent.burst') },

  // C2 custom hit: ATK × 25% + EM × 100%, tagged burst.
  // constellation2 = [0.25, 1, 5] → atkDmg=0.25, eleMasDmg=1, cd=5
  {
    name: 'c2_burst',
    move: 'burst',
    element: 'hydro',
    base: sum(
      prod(v('final.atk'), 0.25),
      prod(v('final.eleMas'), 1),
    ),
  },

  // Moon-reaction trigger entries (Aino is moonsign hydro → triggers all 3)
  { name: 'moon_electrocharged', move: 'skill', element: 'electro', kind: 'reactionMoon', moonReaction: 'electrocharged', base: prod(v('final.atk'), 0) },
  { name: 'moon_bloom', move: 'skill', element: 'dendro', kind: 'reactionMoon', moonReaction: 'bloom', base: prod(v('final.atk'), 0) },
  { name: 'moon_crystallize', move: 'skill', element: 'geo', kind: 'reactionMoon', moonReaction: 'crystallize', base: prod(v('final.atk'), 0) },
]

export function applyAinoFormulaBuffs(
  _scope: import('../scope').Scope,
  _condState: Record<string, Record<string, number>>,
) {
  // No A6 / passive3 base boost (Aino doesn't have one — confirmed via vendor).
}
