// 菈乌玛 / Lauma damage formulas.
// Vendor: vendor/go/gi/sheets/src/Characters/Lauma/index.tsx
//
// 5★ Dendro Catalyst, 月绽放 char. EM-scaling on moon hits.
//
// Auto-array (catalyst, 12 entries):
//   auto[0..2]  N1..N3 (catalyst → dendro, ATK)
//   auto[3..7]  charged consts (spirit move stam, spirit jump stam, duration, cd, call cost)
//   auto[8]     charged.dmg (catalyst dendro, ATK)
//   auto[9..11] plunging triplet
//
// Skill (10 entries):
//   skill[0]  pressDmg (ATK dendro skill)
//   skill[1]  hold1Dmg (ATK dendro skill)
//   skill[2]  hold2Dmg (lunarDmg EM lunarbloom; multiplier × verdantDew stacks 1-3)
//   skill[3]  frostgroveAtkDmg (split ATK coef)
//   skill[4]  frostgroveEleMasDmg (split EM coef)
//   skill[5..9] consts
//
// Burst (7 entries):
//   burst[0]  stacksGained (const)
//   burst[1]  moonToPale (const)
//   burst[2]  bloomDmgInc (per-talent EM coef for team bloom DMG add)
//   burst[3]  lunarBloomDmgInc (per-talent EM coef for team lunarbloom DMG add)
//   burst[4..6] consts

import { prod, sum, lookup, v, sub, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Lauma as {
  auto: number[][]; skill: number[][]; burst: number[][]; passive2: number[][]; passive3: number[][]
  constellation2: number[]; constellation6: number[]
}
const lvlLookup = (table: number[], lvlVar: string): Node => lookup(table, sub(v(lvlVar), 1))
const atkProd = (table: number[], lvlVar: string) => prod(v('final.atk'), lvlLookup(table, lvlVar))
// emProd helper not needed here — hold2 uses inline prod() with verdantDew multiplier.
const splitScale = (atkTable: number[], emTable: number[], lvlVar: string): Node =>
  sum(
    prod(v('final.atk'), lvlLookup(atkTable, lvlVar)),
    prod(v('final.eleMas'), lvlLookup(emTable, lvlVar)),
  )

export const LaumaFormulas: FormulaDef[] = [
  // Catalyst normals (dendro, ATK)
  { name: 'normal_0', move: 'normal', element: 'dendro', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'dendro', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'dendro', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  // Charged (catalyst dendro)
  { name: 'charged', move: 'charged', element: 'dendro', base: atkProd(skillParam.auto[8]!, 'talent.auto') },
  // Plunging (physical, ATK)
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[9]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[10]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[11]!, 'talent.auto') },

  // Skill — pressDmg + hold1Dmg ATK; hold2Dmg is EM-lunarbloom (×N stacks of verdantDew)
  { name: 'skill_press', move: 'skill', element: 'dendro', base: atkProd(skillParam.skill[0]!, 'talent.skill') },
  { name: 'skill_hold1', move: 'skill', element: 'dendro', base: atkProd(skillParam.skill[1]!, 'talent.skill') },
  // hold2: lunarbloom directMoon, EM-scaled, with cond-input verdantDew (1-3) as a multiplier.
  // We model the cond `verdantDew` as a num multiplier on EM × skill[2] multiplier.
  {
    name: 'skill_hold2_lunar',
    move: 'skill', element: 'dendro',
    kind: 'directMoon', moonReaction: 'bloom',
    base: prod(
      v('final.eleMas'),
      lvlLookup(skillParam.skill[2]!, 'talent.skill'),
      v('cond.Lauma.verdantDew', 3),
    ),
  },
  // frostgroveDmg — split scaling ATK + EM
  {
    name: 'skill_frostgrove',
    move: 'skill', element: 'dendro',
    base: splitScale(skillParam.skill[3]!, skillParam.skill[4]!, 'talent.skill'),
  },

  // C6 dmg1 + dmg2 (when constellation>=6, EM-scaled lunarbloom hits)
  {
    name: 'c6_dmg1_lunar',
    move: 'skill', element: 'dendro',
    kind: 'directMoon', moonReaction: 'bloom',
    base: prod(v('final.eleMas'), skillParam.constellation6[0] ?? 0),
  },
  {
    name: 'c6_dmg2_lunar',
    move: 'skill', element: 'dendro',
    kind: 'directMoon', moonReaction: 'bloom',
    base: prod(v('final.eleMas'), skillParam.constellation6[4] ?? 0),
  },

  // Generic moon-bloom trigger
  {
    name: 'moon_bloom',
    move: 'skill', element: 'dendro',
    kind: 'reactionMoon', moonReaction: 'bloom',
    base: prod(v('final.atk'), 0),
  },
]

export function applyLaumaFormulaBuffs(
  scope: import('../scope').Scope,
  condState: Record<string, Record<string, number>>,
) {
  // A6 (passive3): EM × passive3[0]=0.000175 → lunarbloom_baseDmg, cap passive3[1]=0.14 (14%).
  const em = scope.get('final.eleMas') ?? 0
  const baseBoost = Math.min(0.14, em * 0.000175)
  if (baseBoost > 0) {
    scope.add('premod.moonReactionBaseBoost', baseBoost, `月兆祝赐(EM ${Math.round(em)} → +${(baseBoost * 100).toFixed(1)}% 月反应基础)`)
  }
  // A4 (passive2): EM × 0.0004 → skill_dmg_, cap 0.32 (32%).
  const ascension = scope.get('ascension') ?? 0
  if (ascension >= 4) {
    const a4skill = Math.min(0.32, em * 0.0004)
    if (a4skill > 0) {
      scope.add('premod.dmg_.skill', a4skill, `A4 (EM ${Math.round(em)} → +${(a4skill * 100).toFixed(1)}% 元素战技伤害)`)
    }
  }
  // C2 + burst Pale Hymn: bloom_dmgInc + lunarbloom_dmgInc flat (EM-based).
  // bloomDmgInc + lunarBloomDmgInc from Q's burst[2]/[3] tables (per talent level).
  // Apply EM-scaled flat into per-reaction flat-add slot.
  // constellation2[0] = 5 (bloom_dmgInc EM coef); constellation2[1] = 4 (lunarBloom_dmgInc EM coef);
  // constellation2[2] = 0.4 (lunarBloom_dmg_ +40%).
  if ((scope.get('constellation') ?? 0) >= 2 && condState.Lauma?.burstPaleHymn) {
    const em = scope.get('final.eleMas') ?? 0
    // C2 stacks on top of the burst's base EM coefficient.
    // For lunarbloom (the moon variant), our reaction key is 'bloom'.
    const c2lb = skillParam.constellation2[1] ?? 0
    if (c2lb > 0) {
      const flat = em * c2lb * 0.01 // percent() in GO = / 100
      scope.add('premod.dmgIncReaction.bloom', flat, `C2 (月绽放 +EM ${Math.round(em)} × ${(c2lb * 0.01 * 100).toFixed(1)}% = ${Math.round(flat)} flat)`)
    }
    // C2 lunarBloom_dmg_ +40% (moonFull-gated)
    if (condState.Lauma?.moonFull) {
      const c2dmg = skillParam.constellation2[2] ?? 0
      if (c2dmg > 0) scope.add('premod.lunarbloomDmgBoost', c2dmg, `C2 月兆·满辉(+${(c2dmg * 100).toFixed(0)}% 月绽放增伤)`)
    }
  }
  // Q burstPaleHymn lunarBloom_dmgInc: burst[3] per-talent EM coef into flat.
  if (condState.Lauma?.burstPaleHymn) {
    const em = scope.get('final.eleMas') ?? 0
    const lvl = scope.get('talent.burst') ?? 1
    const idx = Math.max(0, Math.min(lvl - 1, (skillParam.burst[3]?.length ?? 1) - 1))
    const burstLBCoef = skillParam.burst[3]![idx] ?? 0
    if (burstLBCoef > 0) {
      const flat = em * burstLBCoef * 0.01
      scope.add('premod.dmgIncReaction.bloom', flat, `Q 月域(月绽放 +EM × ${(burstLBCoef * 0.01 * 100).toFixed(1)}% = ${Math.round(flat)} flat)`)
    }
  }
  // C6 lunarbloom_specialMult_ (constellation6[5] = 0.25 → +25% 擢升, moonsign>=2).
  if ((scope.get('constellation') ?? 0) >= 6 && condState.Lauma?.moonFull) {
    const c6elev = skillParam.constellation6[5] ?? 0
    if (c6elev > 0) scope.add('premod.moonReactionElevation', c6elev, `C6 月兆·满辉(+${(c6elev * 100).toFixed(0)}% 月绽放擢升)`)
  }
}

/** E 命中后队伍敌人水/草抗 -X% (vendor:
 *  `teamBuff.premod.{hydro,dendro}_enemyRes_: skillAfterHit_<ele>_res_`).
 *  Value = skill[7][effSkillLvl-1], cap at table length. C5 boost (+3 skill
 *  levels) applies. Same amount for both hydro and dendro. */
export const laumaSkillResShred: import('../sheet-types').CharResShredFn = (ctx, condState) => {
  if (!condState.Lauma?.skillAfterHit) return {}
  const effLvl = Math.min(15, ctx.talents.skill + (ctx.constellation >= 5 ? 3 : 0))
  const table = skillParam.skill[7]!
  const idx = Math.max(0, Math.min(effLvl - 1, table.length - 1))
  const amount = table[idx] ?? 0
  return amount > 0 ? { hydro: amount, dendro: amount } : {}
}
