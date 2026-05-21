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
  // Linnea has no damage-side buffs that gate by element/move at the formula
  // level (her stat-only buffs C2/C4 live in Linnea.ts apply()). A4/A6/C1/C6
  // need engine extensions (cross-char EM, moon-reaction layer, companion
  // damage) so they're TODO.
}

/** A1 RES shred on enemy: -15% geo RES while Lumi is out;
 *  additional -15% under 月兆·满辉 condition.
 *  Returns the AMOUNT to subtract from enemy.preRes.geo. */
export function linneaA1GeoResShred(
  scope: import('../scope').Scope,
  condState: Record<string, Record<string, number>>,
): number {
  const ascension = scope.get('ascension') ?? 0
  if (ascension < 1) return 0
  let shred = 0
  if (condState.Linnea?.lumiActive) shred += 0.15
  if (condState.Linnea?.moonFull) shred += 0.15
  return shred
}

// Re-suppress unused-var while sum is imported for parity with other formula files.
export const _unused = sum
