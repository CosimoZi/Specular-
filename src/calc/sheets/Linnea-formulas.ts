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

import { prod, sum, lookup, v, sub, c, type Node } from '../ast'
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
  // 月结晶 reaction: triggered by hydro+geo on enemy after A6.
  //   transformative-base × 1.8 (handled by formula evaluator)
  //   + DEF × 75% × stacks (C1 stack-consume flat add, expressed in `base`)
  //   × (1 + 精通增益 + 反应提升) × crit × res
  // 反应提升 lives in scope.premod.moonReactionBoost (A6 adds DEF/100 × 0.7%).
  {
    name: 'moon_crystallize',
    move: 'skill',
    element: 'geo',
    kind: 'reactionMoon',
    moonReaction: 'crystallize',
    base: prod(v('final.def'), v('cond.Linnea.c1StacksConsumed', 0), c(0.75)),
  },
]

export function applyLinneaFormulaBuffs(
  scope: import('../scope').Scope,
  _condState: Record<string, Record<string, number>>,
) {
  const ascension = scope.get('ascension') ?? 0
  // A4 月兆祝赐·栖地考察 (passive2 — unlocks at ascension stage 4):
  // per 100 DEF, +0.7% moon-reaction BASE damage (cap +14%).
  // "基础伤害" = 基础提升% slot (multiplies the trans_base × coeff term inside
  // the base bracket, alongside Linnea C1's flat add).
  if (ascension >= 4) {
    const def = scope.get('final.def') ?? 0
    const boost = Math.min(0.14, (def / 100) * 0.007)
    if (boost > 0) {
      scope.add('premod.moonReactionBaseBoost', boost, `A4 月兆祝赐(DEF ${Math.round(def)} → +${(boost * 100).toFixed(1)}% 月反应基础)`)
    }
  }
  // C6: "队伍中附近的角色造成的月结晶反应伤害擢升25%". 擢升 = separate final
  // multiplier slot (outside the EM/dmg-boost bracket).
  if ((scope.get('constellation') ?? 0) >= 6) {
    scope.add('premod.moonReactionElevation', 0.25, 'C6 黄金猎犬之梦(月结晶 擢升 25%)')
  }
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
