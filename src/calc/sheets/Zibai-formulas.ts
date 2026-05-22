// 兹白 / Zibai damage formulas.
//
// Translated from vendor/go/gi/sheets/src/Characters/Zibai/index.tsx.
//
// Auto-array layout (sword, 4-stage chain with N3 being 2-hit):
//   auto[0]      N1
//   auto[1]      N2
//   auto[3]      N3 (multi-hit ×2; auto[2] paired)
//   auto[4]      N4
//   auto[6]      charged (multi-hit ×2; auto[5] paired)
//   auto[7]      charged stamina (const, skip)
//   auto[8..10]  plunging dmg / low / high
//
// Skill (12 entries — both 灵驹飞踏 and 月转时隙 mode N/C/E):
//   skill[0]  stride1Dmg — 灵驹飞踏 first hit (DEF, plain skill geo)
//   skill[1]  stride2Dmg — 灵驹飞踏 second hit (DEF, directMoon crystallize)
//             — gets A1 + C2 DEF-flat (via `flat`) AND C1 +220% MC dmg boost (per-formula premod)
//   skill[2]  shift4GleamDmg — N4 shift hit (DEF directMoon crystallize, gated tally.moonsign>=2)
//             — gets C4 multiplier
//   skill[3]  duration (const, skip)
//   skill[4]  cd (const, skip)
//   skill[5]  shift1Dmg — N1 in 月转时隙 mode (DEF, geo normal)
//   skill[6]  shift2Dmg — N2 in 月转时隙 mode (DEF, geo normal)
//   skill[8]  shift3Dmg — N3 in 月转时隙 mode (DEF, geo normal, multi ×2)
//   skill[9]  shift4Dmg — N4 in 月转时隙 mode (DEF, geo normal)
//   skill[11] shiftCaDmg — charged in 月转时隙 mode (DEF, geo charged, multi ×2)
//
// Burst (4 entries):
//   burst[0]  skill1Dmg — first hit (DEF, plain burst geo)
//   burst[1]  skill2Dmg — second hit (DEF, directMoon crystallize)
//   burst[2]  cd (const), burst[3]  energy cost (const)

import { prod, sum, lookup, v, sub, ifGE, ifOn, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Zibai as {
  auto: number[][]
  skill: number[][]
  burst: number[][]
}

const lvlLookup = (table: number[], lvlVar: string): Node =>
  lookup(table, sub(v(lvlVar), 1))

const atkProd = (table: number[], lvlVar: string) =>
  prod(v('final.atk'), lvlLookup(table, lvlVar))

const defProd = (table: number[], lvlVar: string) =>
  prod(v('final.def'), lvlLookup(table, lvlVar))

// A1 月下素娥降仙: stride hits + DEF × 60% flat (when cond a1Moonfall on).
// dm.passive1.stride_dmgInc = 0.6.
const a1StrideFlat = (): Node =>
  ifGE(v('ascension', 0), 1,
    ifOn(v('cond.Zibai.a1Moonfall', 0), prod(v('final.def'), 0.6), 0),
    0,
  )

// C2 月兆·满辉 additional stride DEF flat. Vendor sheet: (constellation2[1] - passive1[0]) × DEF.
// = (5.5 - 0.6) × DEF = DEF × 4.9 (additional on top of A1's 0.6 → total 5.5).
// Gated on constellation >= 2 + ascension >= 1 + moon-full + a1Moonfall.
const c2MoonFullStrideFlat = (): Node =>
  ifGE(v('constellation', 0), 2,
    ifGE(v('ascension', 0), 1,
      ifOn(v('cond.Zibai.moonFull', 0),
        ifOn(v('cond.Zibai.a1Moonfall', 0), prod(v('final.def'), 4.9), 0),
        0,
      ),
      0,
    ),
    0,
  )

// Stride hit (skill[0] and skill[1]) flat additive: A1 + C2 sum.
const strideFlat = (): Node => sum(a1StrideFlat(), c2MoonFullStrideFlat())

// C1 first-stride +220% MC dmg boost (per-formula multiplier on stride hits' MC).
// In our model: read `cond.Zibai.c1FirstStride`. constellation1[0] = 2.2.
// This is a "lunarcrystallize_dmg_" boost — maps to premod.lunarcrystallizeDmgBoost
// (per-reaction-specific slot) for that formula. Old catch-all moonReactionDmgBoost
// would have also boosted any non-crystallize moon reaction the formula evaluator
// touches, but stride is a directMoon crystallize, so only crystallize matters.
const c1StrideMCBoost = (): Node =>
  ifGE(v('constellation', 0), 1,
    ifOn(v('cond.Zibai.c1FirstStride', 0), 2.2, 0),
    0,
  )

export const ZibaiFormulas: FormulaDef[] = [
  // ---- Normals (sword, ATK-scaling physical) ----
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  { name: 'normal_3', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  { name: 'charged', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[6]!, 'talent.auto') },
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[8]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[9]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[10]!, 'talent.auto') },

  // ---- Skill 灵驹飞踏 (DEF-scaling) ----
  // First hit — plain skill geo. Gets stride flat (A1+C2) AND C1 MC dmg boost
  // (but C1 boost is %, only affects the MC second hit; first hit is plain).
  // Actually vendor sheet applies strideAddl to BOTH stride1 and stride2 — but stride1 is
  // plain dmgNode (no kind), so the lunarcrystallize fields don't apply to it. We mirror that.
  {
    name: 'lingju_1',
    move: 'skill',
    element: 'geo',
    base: sum(defProd(skillParam.skill[0]!, 'talent.skill'), strideFlat()),
  },
  // Second hit — directMoon crystallize. Gets stride flat AND C1 MC dmg boost.
  {
    name: 'lingju_2_crystal',
    move: 'skill',
    element: 'geo',
    kind: 'directMoon',
    moonReaction: 'crystallize',
    base: defProd(skillParam.skill[1]!, 'talent.skill'),
    flat: strideFlat(),
    premod: {
      // C1 first stride boost goes into the per-reaction lunarcrystallize slot.
      'premod.lunarcrystallizeDmgBoost': c1StrideMCBoost(),
    },
  },

  // ---- 月转时隙 mode: N/Charged converted to DEF-scaling geo ----
  // These fire when in mode (we don't gate them — UI shows them; user adjusts).
  // C4 multiplier (shift4_mult_ = 1.5x when active) applies only to shift4GleamDmg per vendor.
  { name: 'shift_1', move: 'normal', element: 'geo', base: defProd(skillParam.skill[5]!, 'talent.skill') },
  { name: 'shift_2', move: 'normal', element: 'geo', base: defProd(skillParam.skill[6]!, 'talent.skill') },
  { name: 'shift_3', move: 'normal', element: 'geo', base: defProd(skillParam.skill[8]!, 'talent.skill') },
  { name: 'shift_4', move: 'normal', element: 'geo', base: defProd(skillParam.skill[9]!, 'talent.skill') },
  { name: 'shift_charged', move: 'charged', element: 'geo', base: defProd(skillParam.skill[11]!, 'talent.skill') },

  // ---- 月转时隙 N4 special: gleam moon-crystallize hit (gated tally.moonsign>=2 / moonFull) ----
  // C4 Splendor multiplier: shift4_mult_ = 2.5 → ×2.5 final multiplier when active.
  // Vendor: `infoMut(..., percent(2.5 - 1))` = +150% → ×2.5 mult.
  // Now using per-formula `mult` field properly.
  {
    name: 'shift4_gleam_crystal',
    move: 'normal',
    element: 'geo',
    kind: 'directMoon',
    moonReaction: 'crystallize',
    base: defProd(skillParam.skill[2]!, 'talent.skill'),
    mult: ifGE(v('constellation', 0), 4,
      ifOn(v('cond.Zibai.c4Splendor', 0), 2.5, 1),
      1,
    ),
  },

  // ---- Burst 三垣威仪法 (DEF-scaling, 2 hits) ----
  { name: 'burst_1', move: 'burst', element: 'geo', base: defProd(skillParam.burst[0]!, 'talent.burst') },
  {
    name: 'burst_2_crystal',
    move: 'burst',
    element: 'geo',
    kind: 'directMoon',
    moonReaction: 'crystallize',
    base: defProd(skillParam.burst[1]!, 'talent.burst'),
  },

  // ---- Generic team-triggered moon-crystallize entry ----
  // (No per-hit C1 flat; Zibai's C1 attaches to stride hits specifically.)
  {
    name: 'moon_crystallize',
    move: 'skill',
    element: 'geo',
    kind: 'reactionMoon',
    moonReaction: 'crystallize',
    base: prod(v('final.def'), 0),
  },
]

export function applyZibaiFormulaBuffs(
  scope: import('../scope').Scope,
  condState: Record<string, Record<string, number>>,
) {
  // A6 月兆祝赐·浮明若流 — DEF/100 × 0.7%, cap 14% (passive3[0]=0.007, [1]=0.14).
  const def = scope.get('final.def') ?? 0
  const boost = Math.min(0.14, (def / 100) * 0.007)
  if (boost > 0) {
    scope.add('premod.moonReactionBaseBoost', boost, `月兆祝赐·浮明若流(DEF ${Math.round(def)} → +${(boost * 100).toFixed(1)}% 月反应基础)`)
  }
  // A4 叠嶂峦岫出云: per (geo teammate -1) × 15% DEF, per hydro teammate × 60 EM.
  // We don't track teammate elements; user can enable via team buff toggles
  // (not modeled — would need cross-char tally). TODO.

  // C2 月转时隙 + c2ShiftMode cond: +30% lunarcrystallize_dmg_ team-wide
  // (constellation2[0] = 0.3). This is a TEAM buff per vendor.
  if ((scope.get('constellation') ?? 0) >= 2 && condState.Zibai?.c2ShiftMode) {
    scope.add('premod.lunarcrystallizeDmgBoost', 0.3, 'C2 化于生而死于尸(月转时隙 → 月结晶 +30% 团队)')
  }
  // C6 点光: per consumed 浮光 stack (1-30) × 1.6% lunar_specialDmg_ (擢升).
  // Cond: c6Point (num, 1-30). constellation6[0] = 0.016.
  if ((scope.get('constellation') ?? 0) >= 6) {
    const pts = condState.Zibai?.c6Point ?? 0
    if (pts > 0) {
      scope.add('premod.moonReactionElevation', 0.016 * pts, `C6 天地忽如一远行(${pts} 点浮光 → +${(pts * 1.6).toFixed(1)}% 擢升)`)
    }
  }
}
