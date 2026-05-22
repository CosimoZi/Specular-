// 行秋 / Xingqiu damage formulas.
// Vendor: vendor/go/gi/sheets/src/Characters/Xingqiu/index.tsx
//
// 4★ hydro sword. ATK-scaling. Off-field rain-sword applier.
//
// Auto-array (sword, 5-hit chain with N3+N4 multi-hit):
//   auto[0..2]  N1..N3 (physical)
//   auto[4..5]  N4, N5 (physical) — auto[3] / auto[6] skipped per vendor
//   auto[7..8]  charged hit1+hit2
//   auto[9]     charged stamina (const)
//   auto[10..12] plunging triplet
//
// Skill (5 entries):
//   skill[0..1] hit1, hit2 (rain swords, hydro skill)
//   skill[2]    dmgRed_ percentage (utility, not damage)
//   skill[3..4] consts
//
// Burst (4 entries):
//   burst[0]    rain sword dmg (hydro burst — IMPORTANT: 'burst' move-tagged
//               but vendor sets hit.ele to elementKey so it's hydro)
//   burst[1..3] consts
//
// C4 multiplier (1.5x) during burst: vendor uses `nodeC4` as a per-formula
// mult on skill hits. We implement via `mult` field.

import { prod, lookup, v, sub, ifGE, ifOn, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Xingqiu as {
  auto: number[][]; skill: number[][]; burst: number[][]
}
const lvlLookup = (table: number[], lvlVar: string): Node => lookup(table, sub(v(lvlVar), 1))
const atkProd = (table: number[], lvlVar: string) => prod(v('final.atk'), lvlLookup(table, lvlVar))

// C4: skill press 1.5x during Q (cond `burst` on, constellation >= 4).
const c4SkillMult = (): Node =>
  ifGE(v('constellation', 0), 4,
    ifOn(v('cond.Xingqiu.burst', 0), 1.5, 1),
    1,
  )

export const XingqiuFormulas: FormulaDef[] = [
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  { name: 'normal_3', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  { name: 'normal_4', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[5]!, 'talent.auto') },
  { name: 'charged_1', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[7]!, 'talent.auto') },
  { name: 'charged_2', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[8]!, 'talent.auto') },
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[10]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[11]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[12]!, 'talent.auto') },

  // Skill (E) press 1 + press 2 (rain swords, hydro)
  { name: 'skill_press1', move: 'skill', element: 'hydro', base: atkProd(skillParam.skill[0]!, 'talent.skill'), mult: c4SkillMult() },
  { name: 'skill_press2', move: 'skill', element: 'hydro', base: atkProd(skillParam.skill[1]!, 'talent.skill'), mult: c4SkillMult() },

  // Burst (Q) — rain sword dmg
  { name: 'burst_dmg', move: 'burst', element: 'hydro', base: atkProd(skillParam.burst[0]!, 'talent.burst') },
]

export function applyXingqiuFormulaBuffs(
  _scope: import('../scope').Scope,
  _condState: Record<string, Record<string, number>>,
) {
  // All team buffs cross-char (handled in applyTeammateBuff).
}

/** C2 Q field: enemy -15% hydro RES while Q active. Vendor:
 *  `teamBuff.premod.hydro_enemyRes_`. */
export const xingqiuC2HydroResShred: import('../sheet-types').CharResShredFn = (ctx, condState) => {
  if (ctx.constellation < 2) return {}
  if (!condState.Xingqiu?.c2) return {}
  return { hydro: 0.15 }
}
