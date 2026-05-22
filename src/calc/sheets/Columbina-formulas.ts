// 哥伦比娅 / Columbina damage formulas.
//
// Translated from vendor/go/gi/sheets/src/Characters/Columbina/index.tsx.
//
// Auto-array layout (catalyst, 3-hit normals):
//   auto[0..2] N1..N3 (catalyst → hydro, ATK)
//   auto[3]    charged (hydro, ATK)
//   auto[4]    charged stamina (const)
//   auto[5]    重击月露涤荡 dewDmg (HP, directMoon lunarbloom, multi ×3)
//   auto[6..8] plunging dmg / low / high (physical, ATK)
//
// Skill 万古潮汐 (10 entries):
//   skill[0]  skillDmg (HP, plain skill hydro)
//   skill[1]  continuousDmg — 引力涟漪 follower (HP, plain skill hydro)
//   skill[2]  lchargedDmg (HP, directMoon lunarcharged)
//   skill[3]  lbloomDmg (HP, directMoon lunarbloom, multi ×5)
//   skill[4]  lcrystallizeDmg (HP, directMoon lunarcrystallize)
//   skill[5..9] gravAccumCd / gravAccum / maxGrav / duration / cd (consts, skip)
//
// Burst 她的乡愁 (5 entries):
//   burst[0] skillDmg (HP, plain burst hydro)
//   burst[1] lunar_dmg_ (per-reaction dmg boost coefficient, NOT a damage value)
//   burst[2..4] duration / cd / enerCost
//
// All passives + constellations: see applyColumbinaFormulaBuffs below.

import { prod, sum, lookup, v, sub, ifGE, ifOn, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Columbina as {
  auto: number[][]
  skill: number[][]
  burst: number[][]
}

const lvlLookup = (table: number[], lvlVar: string): Node =>
  lookup(table, sub(v(lvlVar), 1))

const atkProd = (table: number[], lvlVar: string) =>
  prod(v('final.atk'), lvlLookup(table, lvlVar))

const hpProd = (table: number[], lvlVar: string) =>
  prod(v('final.hp'), lvlLookup(table, lvlVar))

// C4 cond `c4Buff`: per-reaction HP-based dmgInc (flat into the lunar dmgInc slot).
// constellation4: [1] lunarcharged=0.125, [2] lunarbloom=0.025, [3] lunarcrystallize=0.125.
// Vendor sheet has a typo where lunarcrystallize_dmgInc uses constellation4[1] (the lunarcharged value).
// We mirror the vendor sheet's expression — using [1] for both lunarcharged and lunarcrystallize.
const c4FlatFor = (coeff: number): Node =>
  ifGE(v('constellation', 0), 4,
    ifOn(v('cond.Columbina.c4Buff', 0), prod(v('final.hp'), coeff), 0),
    0,
  )

export const ColumbinaFormulas: FormulaDef[] = [
  // ---- Normals (catalyst → hydro, ATK) ----
  { name: 'normal_0', move: 'normal', element: 'hydro', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'hydro', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'hydro', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  { name: 'charged', move: 'charged', element: 'hydro', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  // 重击月露涤荡 — 3-hit directMoon lunarbloom (HP).
  {
    name: 'charged_yueluTaoTang',
    move: 'charged',
    element: 'dendro',
    kind: 'directMoon',
    moonReaction: 'bloom',
    base: hpProd(skillParam.auto[5]!, 'talent.auto'),
  },
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[6]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[7]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[8]!, 'talent.auto') },

  // ---- Skill 万古潮汐 (HP-scaling hydro) ----
  { name: 'skill_dmg', move: 'skill', element: 'hydro', base: hpProd(skillParam.skill[0]!, 'talent.skill') },
  { name: 'skill_ripple', move: 'skill', element: 'hydro', base: hpProd(skillParam.skill[1]!, 'talent.skill') },

  // Skill triggers 3 moon reactions when gravity-accumulation triggers Gravity Interference:
  // — lunarcharged hit
  {
    name: 'skill_lunarcharged',
    move: 'skill',
    element: 'electro',
    kind: 'directMoon',
    moonReaction: 'electrocharged',
    base: hpProd(skillParam.skill[2]!, 'talent.skill'),
    flat: c4FlatFor(0.125),
  },
  // — lunarbloom hit (5 hits in vendor display, but each is the same formula)
  {
    name: 'skill_lunarbloom',
    move: 'skill',
    element: 'dendro',
    kind: 'directMoon',
    moonReaction: 'bloom',
    base: hpProd(skillParam.skill[3]!, 'talent.skill'),
    flat: c4FlatFor(0.025),
  },
  // — lunarcrystallize hit
  {
    name: 'skill_lunarcrystallize',
    move: 'skill',
    element: 'geo',
    kind: 'directMoon',
    moonReaction: 'crystallize',
    base: hpProd(skillParam.skill[4]!, 'talent.skill'),
    flat: c4FlatFor(0.125), // vendor sheet uses constellation4[1] (same as lunarcharged) — possible upstream typo, mirrored
  },

  // ---- Burst 她的乡愁 (HP-scaling hydro) ----
  { name: 'burst_dmg', move: 'burst', element: 'hydro', base: hpProd(skillParam.burst[0]!, 'talent.burst') },
]

export function applyColumbinaFormulaBuffs(
  scope: import('../scope').Scope,
  condState: Record<string, Record<string, number>>,
) {
  // A6 月兆祝赐·借汝月光 — HP/1000 × 0.2%, cap 7% (passive3[0]=0.002, [1]=0.07).
  const hp = scope.get('final.hp') ?? 0
  const boost = Math.min(0.07, (hp / 1000) * 0.002)
  if (boost > 0) {
    scope.add('premod.moonReactionBaseBoost', boost, `月兆祝赐·借汝月光(HP ${Math.round(hp)} → +${(boost * 100).toFixed(1)}% 月反应基础)`)
  }
  // C1: +1.5% lunar_specialDmg_ (constellation1[6] = 0.015) — always after C1 unlock.
  // C2: +1% lunar_specialDmg_ (constellation2[6] = 0.01) — always.
  // C3: +1.5% (constellation3[0] = 0.015).
  // C4: +1.5% (constellation4[5] = 0.015).
  // C5: +1.5% (constellation5[0] = 0.015).
  // C6: +7% (constellation6[1] = 0.07).
  const cons = scope.get('constellation') ?? 0
  let elevation = 0
  if (cons >= 1) elevation += 0.015
  if (cons >= 2) elevation += 0.01
  if (cons >= 3) elevation += 0.015
  if (cons >= 4) elevation += 0.015
  if (cons >= 5) elevation += 0.015
  if (cons >= 6) elevation += 0.07
  if (elevation > 0) {
    scope.add('premod.moonReactionElevation', elevation, `命之座累加月反应擢升 +${(elevation * 100).toFixed(1)}%`)
  }
  // Burst burstDomain cond (`burstDomain`): in 月之领域 → +EleM*lunar_dmg_ for each reaction.
  // burst[1] is the per-level coefficient (0.13/0.4/0.55 at lv1/10/15).
  if (condState.Columbina?.burstDomain) {
    const lvl = (scope.get('talent.burst') ?? 1)
    const idx = Math.max(0, Math.min(lvl - 1, skillParam.burst[1]!.length - 1))
    const coef = skillParam.burst[1]![idx] ?? 0
    scope.add('premod.moonReactionDmgBoost', coef, `月之领域(burst${lvl} 月反应 +${(coef * 100).toFixed(0)}%)`)
  }
  // Suppress unused
  void sum
}
