// 莉奈娅 / Linnea damage formulas.
//
// Auto-array (skillParam.auto) — verified against talent "进行至多三段的连续弓箭射击":
//   [0..2] N1..N3 (physical, ATK-scaling)
//   [3]    charged 1 (un-aimed regular shot, physical)
//   [4]    charged 2 (fully-aimed, geo)
//   [5]    plunging_dmg (initial drop, physical)
//   [6]    plunging_low
//   [7]    plunging_high
//
// Skill (skillParam.skill) — Lumi-side damage. Lumi is DEF-scaling, geo-element:
//   [0]  超厉害形态 基本攻击     (lv1=0.96, lv15=2.28)
//   [1]  超厉害形态 加力重锤     (lv1=1.0,  lv15=2.375)
//   [2]  究极厉害形态 百万吨重锤 (lv1=4.0,  lv15=9.5)
//   [3]  25 (CD/duration constant)
//   [4]  18 (CD/duration constant)
//
//   Note: 百万吨重锤 is "视为月结晶反应伤害" — its raw value here is the geo-direct
//   damage portion. The crystallize-reaction add is in `moon_crystallize_ultra`.
//
// Burst (备忘·绝境生存指南) is healing only — no damage formula.
//
// C1 历览编录 (per-hit stack consumption, NOT a user input):
//   * Regular moon-crystallize hit: consumes 1 stack → +DEF × 75% to base
//   * 百万吨重锤 (Lumi ultra): consumes up to 5 stacks, each +DEF × 150%
//   * C6 doubles stack consumption AND boosts the per-stack bonus by 150%
//     → regular hit becomes +DEF × 112.5%, ultra becomes +DEF × 225%/stack
//
// We model both as additive flat into the moon-reaction base bracket, gated
// by constellation in the AST.

import { prod, sum, lookup, v, sub, ifGE, ifOn, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Linnea as {
  auto: number[][]
  skill: number[][]
}

const lvlLookup = (table: number[], lvlVar: string): Node =>
  lookup(table, sub(v(lvlVar), 1))

const atkProd = (table: number[], lvlVar: string) =>
  prod(v('final.atk'), lvlLookup(table, lvlVar))

const defProd = (table: number[], lvlVar: string) =>
  prod(v('final.def'), lvlLookup(table, lvlVar))

// C1 per-hit flat add (regular moon-crystallize hits, 1 stack consumed).
// Verified against GO upstream sheet (vendor/go/gi/sheets/.../Linnea/index.tsx):
//   C6 ADDS another DEF×75% on top of C1's DEF×75%, total DEF×150%.
//   (NOT multiplied — game's constellation6.lunarcrystallize_dmgInc data field
//    is 0.75, summed with constellation1.lunarcrystallize_dmgInc = 0.75.)
//   No C1   → 0
//   C1..C5  → DEF × 0.75
//   C6      → DEF × 1.5  (= 0.75 + 0.75)
const c1RegularFlat = (): Node =>
  prod(
    v('final.def'),
    ifGE(
      v('constellation', 0),
      1,
      ifGE(v('constellation', 0), 6, 1.5, 0.75),
      0,
    ),
  )

// 百万吨重锤 special: up to 5 stacks consumed, each +DEF × 1.50.
// Verified against GO upstream: ultra-stack per-stack bonus is constellation1[5]
// = 1.5, used unchanged at C6 (GO doesn't apply C6's +0.75 to the ultra path).
// C6 doubles stack consumption but the panel-display max stays at 5 (real-game
// max is 10 with C6's 2x — user can manually bump the cond value).
//   No C1   → 0
//   C1+    → DEF × 1.50 × stacks  (stacks default 5)
const c1UltraFlat = (): Node =>
  prod(
    v('final.def'),
    v('cond.Linnea.c1UltraStacks', 5),
    ifGE(v('constellation', 0), 1, 1.5, 0),
  )

export const LinneaFormulas: FormulaDef[] = [
  // ---- Auto attacks (bow, Linnea's own attacks) ----
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  { name: 'charged_aim', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  { name: 'charged_full', move: 'charged', element: 'geo', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[5]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[6]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[7]!, 'talent.auto') },

  // ---- Lumi skill attacks ----
  // skill[0] 超厉害形态 普通攻击 — REGULAR geo hit (just plain岩, no reaction).
  { name: 'lumi_basic', move: 'skill', element: 'geo', base: defProd(skillParam.skill[0]!, 'talent.skill') },
  // skill[1] 加力重锤 — directly "视为月结晶反应伤害" (treated as moon-crystallize).
  // C1's general clause: each hit consumes 1 stack, +DEF × 0.75 (C6: ×1.5 → 1.125).
  {
    name: 'lumi_heavy',
    move: 'skill',
    element: 'geo',
    kind: 'directMoon',
    moonReaction: 'crystallize',
    base: defProd(skillParam.skill[1]!, 'talent.skill'),
    flat: c1RegularFlat(),
  },
  // skill[2] 百万吨重锤 — "视为月结晶反应伤害的岩元素范围伤害".
  // C1's special clause: up to 5 stacks consumed, each +DEF × 150% (C6 boost ×1.5).
  // C2 (per GO upstream): "露米在究极厉害形态下使用百万吨重锤的暴击伤害额外提升150%"
  // → ONLY this hit gets +150% CD, gated on c2Resonance + constellation >= 2.
  {
    name: 'lumi_ultra',
    move: 'skill',
    element: 'geo',
    kind: 'directMoon',
    moonReaction: 'crystallize',
    base: defProd(skillParam.skill[2]!, 'talent.skill'),
    flat: c1UltraFlat(),
    premod: {
      'final.critDMG_': ifGE(v('constellation', 0), 2,
        ifOn(v('cond.Linnea.c2Resonance', 0), 1.5, 0),
        0,
      ),
    },
  },

  // ---- Standard moon-crystallize trigger ----
  // A6 turns team-triggered hydro+geo crystallize into 月结晶 (transformative-type:
  // base = transformative_base × 1.6 × (1 + 基础提升%) + flat).
  // C1's general clause: 1 stack consumed, +DEF × 0.75 (C6 → +DEF × 1.125).
  // This entry covers crystallize fired by any team member (Furina, 申鹤 burst,
  // 行秋 hydro burst, etc.) when geo (Linnea's bow charged_full, Lumi's basic
  // attack, allied geo) lands on a hydro-tagged enemy.
  {
    name: 'moon_crystallize',
    move: 'skill',
    element: 'geo',
    kind: 'reactionMoon',
    moonReaction: 'crystallize',
    base: c1RegularFlat(),
  },
]

export function applyLinneaFormulaBuffs(
  scope: import('../scope').Scope,
  condState: Record<string, Record<string, number>>,
) {
  // 月兆祝赐·栖地考察 (passive3, ALWAYS-ON utility — no ascension gate per
  // GO upstream sheet's `a0_lunarcrystallize_baseDmg_`): per 100 DEF, +0.7%
  // moon-reaction BASE damage (cap +14%). The "基础提升%" slot.
  const def = scope.get('final.def') ?? 0
  const boost = Math.min(0.14, (def / 100) * 0.007)
  if (boost > 0) {
    scope.add('premod.moonReactionBaseBoost', boost, `月兆祝赐·栖地考察(DEF ${Math.round(def)} → +${(boost * 100).toFixed(1)}% 月反应基础)`)
  }
  // C6: "月兆·满辉: 队伍中附近的角色造成的月结晶反应伤害擢升25%". GO gates
  // this on `tally.moonsign >= 2` (≈ moon-full state). We approximate with
  // the user-controlled `moonFull` cond toggle.
  if ((scope.get('constellation') ?? 0) >= 6 && condState.Linnea?.moonFull) {
    scope.add('premod.moonReactionElevation', 0.25, 'C6 黄金猎犬之梦(月兆·满辉 → 月结晶 擢升 25%)')
  }
}

/** A1 RES shred on enemy: -15% geo while Lumi is out; additional -15% under
 *  月兆·满辉. Vendor: `teamBuff.premod.geo_enemyRes_` (team-wide). */
export const linneaA1GeoResShred: import('../sheet-types').CharResShredFn = (ctx, condState) => {
  if (ctx.ascension < 1) return {}
  let shred = 0
  if (condState.Linnea?.lumiActive) shred += 0.15
  if (condState.Linnea?.moonFull) shred += 0.15
  return shred > 0 ? { geo: shred } : {}
}

// Re-suppress unused-var while sum is imported for parity with other formula files.
export const _unused = sum
