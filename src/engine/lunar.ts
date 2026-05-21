// Lunar reactions (月反应) — introduced in 5.x with Nodkrai / Natlan lunar mechanics.
//
// What's different from normal reactions:
//   1. Two damage "instances" land per trigger:
//        • Personal hit (受触发角色直伤) — scales on trigger char's stat
//        • Reaction hit (反应伤害) — scales on level multiplier + lunar EM curve
//      Each can crit INDEPENDENTLY ("双爆乘区"). Direct crits use trigger
//      char's CR/CD; reaction crits also (per current understanding).
//   2. Lunar reactions DO NOT use the normal element DMG % bonus
//      (e.g. Cryo Goblet 46.6%). They use a SEPARATE stat:
//        • `lunarDmgBonus` (新词条 — silken moon's serenade etc.)
//   3. EM curve is gentler than normal transformative:
//        `lunarEmBonus = 6 × EM / (EM + 2000)`
//   4. Multi-character contribution weighting:
//        contributor #1 (top dmg): 100%
//        contributor #2: 50%
//        contributor #3, #4: ~8.33% each
//      Each contributor's CR/CD applied to their own portion.
//
// All numeric coefficients here are PRELIMINARY — sourced from community
// theorycrafting (KQM, 17173, Baidu Baike, Fandom). They will need
// verification against in-game numbers. Substat valuation results should be
// directional-correct even if absolute damage is off by a few %.
//
// References:
//   - KQM: keqingmains.com/misc/lunar-reactions/
//   - 17173: news.17173.com/content/02122026/114149373.shtml (Chinese)
//   - Fandom: genshin-impact.fandom.com/wiki/Lunar_Reaction

import { levelMultiplier } from './constants'
import { resMultiplier } from './reactions'
import type { DamageElement, FinalStats } from './types'

export type LunarReactionKind = 'lunar-charged' | 'lunar-bloom' | 'lunar-crystallize'

/** Base coefficients for each lunar reaction's two damage components. */
export const LUNAR_BASE = {
  'lunar-charged': { personal: 3.0, reaction: 1.8 },
  'lunar-bloom': { personal: 0, reaction: 1.8 }, // bloom's "personal" is the EM-additive component
  'lunar-crystallize': { personal: 1.6, reaction: 0.96 },
} as const

/** Per-EM bonus for lunar reactions. Different curve than vanilla transformative. */
export function lunarEmBonus(em: number): number {
  return (6 * em) / (em + 2000)
}

/** Element associated with each lunar reaction's reaction-portion (for RES lookup). */
const LUNAR_ELEMENT: Record<LunarReactionKind, DamageElement> = {
  'lunar-charged': 'Electro',
  'lunar-bloom': 'Dendro',
  'lunar-crystallize': 'Geo',
}

export interface LunarContext {
  reaction: LunarReactionKind
  /** Triggering character's stats. */
  attacker: FinalStats
  attackerLevel: number
  /** Target enemy RES + reductions for the lunar reaction's element. */
  enemyRes: number
  enemyResReduction: number
  /** New lunar DMG bonus stat (from artifacts / buffs). Decimal. */
  lunarBonus: number
  /** Reaction-zone bonus % (separate from lunarBonus; e.g. talent passives). */
  reactionBonus: number
}

export interface LunarOutput {
  personalNonCrit: number
  personalCrit: number
  personalAvg: number
  reactionNonCrit: number
  reactionCrit: number
  reactionAvg: number
  totalAvg: number
  trace: Record<string, number>
}

/** Compute one trigger of a lunar reaction. Multi-character team weighting is
 *  caller's job — feed this once per contributor and weight the totals
 *  (top 1.0, second 0.5, others ~0.0833 each per KQM). */
export function calcLunar(
  ctx: LunarContext,
  /** What stat the personal-damage component scales on (e.g. lunar-charged
   *  scales on triggering char's ATK; some lunar reactions scale on HP). */
  personalScalingValue: number,
): LunarOutput {
  const base = LUNAR_BASE[ctx.reaction]
  const lvlMult = levelMultiplier(ctx.attackerLevel)
  const emBonus = lunarEmBonus(ctx.attacker.em)
  const lunarDmgMul = 1 + ctx.lunarBonus + ctx.reactionBonus + emBonus

  // Element of the reaction's damage component — used by callers for trace.
  void LUNAR_ELEMENT[ctx.reaction]
  const rm = resMultiplier(ctx.enemyRes, ctx.enemyResReduction)
  // Lunar reactions ignore defense per community theorycrafting.

  // ---- Personal damage component ----
  // Scales on the triggering character's chosen stat × base coeff, then × lunar
  // DMG bonus, RES. Crits independently.
  const personalBase = personalScalingValue * base.personal
  const personalNonCrit = personalBase * lunarDmgMul * rm

  // ---- Reaction damage component ----
  const reactionBase = lvlMult * base.reaction
  const reactionNonCrit = reactionBase * lunarDmgMul * rm

  // Crits — both components use the triggering character's CR/CD for the
  // top-contributor case. For #2..#4 contributors each uses their own CR/CD;
  // the caller stacks results.
  const cr = Math.min(Math.max(ctx.attacker.critRate, 0), 1)
  const cd = Math.max(ctx.attacker.critDmg, 0)
  const critFactor = 1 + cd
  const avgFactor = 1 + cr * cd

  return {
    personalNonCrit,
    personalCrit: personalNonCrit * critFactor,
    personalAvg: personalNonCrit * avgFactor,
    reactionNonCrit,
    reactionCrit: reactionNonCrit * critFactor,
    reactionAvg: reactionNonCrit * avgFactor,
    totalAvg: (personalNonCrit + reactionNonCrit) * avgFactor,
    trace: {
      lvlMult,
      emBonus,
      lunarDmgMul,
      resMult: rm,
      personalBase,
      reactionBase,
    },
  }
}

/** Weight a list of per-contributor lunar damage outputs by KQM's
 *  multi-character rule (top 100%, 2nd 50%, 3rd+4th ~8.33% each). */
export function weightLunarContributions(outputs: LunarOutput[]): LunarOutput {
  if (outputs.length === 0) {
    return {
      personalNonCrit: 0, personalCrit: 0, personalAvg: 0,
      reactionNonCrit: 0, reactionCrit: 0, reactionAvg: 0,
      totalAvg: 0, trace: {},
    }
  }
  const sorted = [...outputs].sort((a, b) => b.totalAvg - a.totalAvg)
  const weights = [1.0, 0.5, 1 / 12, 1 / 12]
  let pNonCrit = 0, pCrit = 0, pAvg = 0
  let rNonCrit = 0, rCrit = 0, rAvg = 0
  let total = 0
  for (let i = 0; i < sorted.length && i < 4; i++) {
    const w = weights[i] ?? 0
    pNonCrit += sorted[i].personalNonCrit * w
    pCrit += sorted[i].personalCrit * w
    pAvg += sorted[i].personalAvg * w
    rNonCrit += sorted[i].reactionNonCrit * w
    rCrit += sorted[i].reactionCrit * w
    rAvg += sorted[i].reactionAvg * w
    total += sorted[i].totalAvg * w
  }
  return {
    personalNonCrit: pNonCrit, personalCrit: pCrit, personalAvg: pAvg,
    reactionNonCrit: rNonCrit, reactionCrit: rCrit, reactionAvg: rAvg,
    totalAvg: total, trace: { contributors: sorted.length },
  }
}
