// 菲林斯 / Flins damage formulas.
// Vendor: vendor/go/gi/sheets/src/Characters/Flins/index.tsx
//
// 5★ Electro Polearm. Normals/Q are ATK-scaling.
//
// Auto-array (polearm, 5-hit chain):
//   auto[0..4] N1..N5 (with N4 ×2 in display) — physical
//   auto[5]    charged — physical
//   auto[6]    charged stamina (const)
//   auto[7..9] plunging
//
// Skill (10 entries): spear-storm mode N1-N5 + charged + spearDmg + duration/cd:
//   skill[0..4] na1..na5 (electro-infused skill-tagged normals)
//   skill[5]    ca (electro-infused skill-tagged charged)
//   skill[6]    spearstormDmg (electro skill)
//   skill[7..9] spearstorm cd / flame duration / cd consts
//
// Burst (8 entries):
//   burst[0]   skillDmg (electro burst, ATK)
//   burst[1]   middlePhaseLunarDmg (ATK directMoon lunarcharged)
//   burst[2]   finalPhaseLunarDmg (ATK directMoon lunarcharged)
//   burst[3]   enerCost (const)
//   burst[4]   cd (const)
//   burst[5]   thunderDmg (ATK directMoon lunarcharged)
//   burst[6]   thunderAddlDmg (ATK directMoon lunarcharged)
//   burst[7]   thunderEnerCost (const)

import { prod, lookup, v, sub, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Flins as {
  auto: number[][]; skill: number[][]; burst: number[][]
}
const lvlLookup = (table: number[], lvlVar: string): Node => lookup(table, sub(v(lvlVar), 1))
const atkProd = (table: number[], lvlVar: string) => prod(v('final.atk'), lvlLookup(table, lvlVar))

export const FlinsFormulas: FormulaDef[] = [
  // Normals (polearm, physical)
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  { name: 'normal_3', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  { name: 'normal_4', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  { name: 'charged', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[5]!, 'talent.auto') },
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[7]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[8]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[9]!, 'talent.auto') },

  // 持枪 mode N1-N5 + charged + spear skill (electro skill)
  { name: 'skill_na1', move: 'normal', element: 'electro', base: atkProd(skillParam.skill[0]!, 'talent.skill') },
  { name: 'skill_na2', move: 'normal', element: 'electro', base: atkProd(skillParam.skill[1]!, 'talent.skill') },
  { name: 'skill_na3', move: 'normal', element: 'electro', base: atkProd(skillParam.skill[2]!, 'talent.skill') },
  { name: 'skill_na4', move: 'normal', element: 'electro', base: atkProd(skillParam.skill[3]!, 'talent.skill') },
  { name: 'skill_na5', move: 'normal', element: 'electro', base: atkProd(skillParam.skill[4]!, 'talent.skill') },
  { name: 'skill_ca', move: 'charged', element: 'electro', base: atkProd(skillParam.skill[5]!, 'talent.skill') },
  { name: 'skill_spear', move: 'skill', element: 'electro', base: atkProd(skillParam.skill[6]!, 'talent.skill') },

  // Burst (electro + 4 lunarcharged directMoon hits)
  { name: 'burst_dmg', move: 'burst', element: 'electro', base: atkProd(skillParam.burst[0]!, 'talent.burst') },
  {
    name: 'burst_middle_lunar',
    move: 'burst', element: 'electro',
    kind: 'directMoon', moonReaction: 'electrocharged',
    base: atkProd(skillParam.burst[1]!, 'talent.burst'),
  },
  {
    name: 'burst_final_lunar',
    move: 'burst', element: 'electro',
    kind: 'directMoon', moonReaction: 'electrocharged',
    base: atkProd(skillParam.burst[2]!, 'talent.burst'),
  },
  {
    name: 'burst_thunder',
    move: 'burst', element: 'electro',
    kind: 'directMoon', moonReaction: 'electrocharged',
    base: atkProd(skillParam.burst[5]!, 'talent.burst'),
  },
  {
    name: 'burst_thunder_addl',
    move: 'burst', element: 'electro',
    kind: 'directMoon', moonReaction: 'electrocharged',
    base: atkProd(skillParam.burst[6]!, 'talent.burst'),
  },

  // C2 extra MC hit: lunarDmg(percent(constellation2[0]=0.5), 'atk', 'lunarcharged')
  // = ATK × 50% directMoon lunarcharged, gated by constellation >= 2.
  // (Vendor doesn't gate by cond, just by constellation level — auto-fires when C2 unlocked.)
  {
    name: 'c2_lunar',
    move: 'skill', element: 'electro',
    kind: 'directMoon', moonReaction: 'electrocharged',
    base: prod(v('final.atk'), 0.5),
  },

  // Generic moon-electrocharged trigger
  {
    name: 'moon_electrocharged',
    move: 'skill', element: 'electro',
    kind: 'reactionMoon', moonReaction: 'electrocharged',
    base: prod(v('final.atk'), 0),
  },
]

export function applyFlinsFormulaBuffs(
  scope: import('../scope').Scope,
  _condState: Record<string, Record<string, number>>,
) {
  // A6 (passive3): ATK/100 × 0.7% → moon-base, cap 14%.
  const atk = scope.get('final.atk') ?? 0
  const boost = Math.min(0.14, (atk / 100) * 0.007)
  if (boost > 0) {
    scope.add('premod.moonReactionBaseBoost', boost, `月兆祝赐(ATK ${Math.round(atk)} → +${(boost * 100).toFixed(1)}% 月反应基础)`)
  }
}

/** C2 -25% electro RES (moonFull + c2AfterElectro gated). Vendor:
 *  `teamBuff.premod.electro_enemyRes_`. */
export const flinsC2ElectroResShred: import('../sheet-types').CharResShredFn = (ctx, condState) => {
  if (ctx.constellation < 2) return {}
  if (!condState.Flins?.c2AfterElectro || !condState.Flins?.moonFull) return {}
  return { electro: 0.25 } // constellation2[2]
}
