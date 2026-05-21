// 莉奈娅 / Linnea damage formulas (skeleton).
//
// Auto-array layout (verified against talent text "进行至多三段的连续弓箭射击"):
//   [0..2] N1..N3 (physical, ATK-scaling)
//   [3]    charged 1 (un-aimed regular shot, physical)
//   [4]    charged 2 (fully-aimed, geo)
//   [5]    plunging_dmg (initial drop, physical)
//   [6]    plunging_low
//   [7]    plunging_high
//
// Skill (Lumi 形态) and Burst (heal) are NOT wired yet. Lumi has its own
// damage formulas tied to its companion mode; the heal-burst doesn't enter
// damage panel anyway. TODO once we model companion-side damage + heals.

import { prod, sum, lookup, v, sub, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Linnea as {
  auto: number[][]
}

const lvlLookup = (table: number[], lvlVar: string): Node =>
  lookup(table, sub(v(lvlVar), 1))

const atkProd = (table: number[], lvlVar: string) =>
  prod(v('final.atk'), lvlLookup(table, lvlVar))

export const LinneaFormulas: FormulaDef[] = [
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  { name: 'charged_aim', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  { name: 'charged_full', move: 'charged', element: 'geo', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[5]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[6]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[7]!, 'talent.auto') },
]

export function applyLinneaFormulaBuffs(
  _scope: import('../scope').Scope,
  _condState: Record<string, Record<string, number>>,
) {
  // TODO: A1 RES shred, A4 EM transfer, C1 stack-consume bonus DMG,
  // C2 hydro/geo CDmg, C4 DEF buff.
}

// Re-suppress unused-var while sum is imported for parity with other formula files.
export const _unused = sum
