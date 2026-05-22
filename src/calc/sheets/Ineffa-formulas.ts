// 伊涅芙 / Ineffa damage formulas.
// Vendor: vendor/go/gi/sheets/src/Characters/Ineffa/index.tsx
//
// 5★ Electro Polearm, 月感电 char. ATK-scaling throughout.

import { prod, lookup, v, sub, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Ineffa as {
  auto: number[][]; skill: number[][]; burst: number[][]
  passive1: number[][]; passive2: number[][]; passive3: number[][]
  constellation1: number[]; constellation2: number[]; constellation6: number[]
}
const lvlLookup = (table: number[], lvlVar: string): Node => lookup(table, sub(v(lvlVar), 1))
const atkProd = (table: number[], lvlVar: string) => prod(v('final.atk'), lvlLookup(table, lvlVar))

export const IneffaFormulas: FormulaDef[] = [
  // Polearm normals, 5-hit (N3 ×2)
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2a', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  { name: 'normal_2b', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  { name: 'normal_3', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  { name: 'charged', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[5]!, 'talent.auto') },
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[7]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[8]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[9]!, 'talent.auto') },

  // Skill (ATK electro)
  { name: 'skill_dmg', move: 'skill', element: 'electro', base: atkProd(skillParam.skill[0]!, 'talent.skill') },
  { name: 'skill_birgitta', move: 'skill', element: 'electro', base: atkProd(skillParam.skill[3]!, 'talent.skill') },

  // Burst (ATK electro)
  { name: 'burst_dmg', move: 'burst', element: 'electro', base: atkProd(skillParam.burst[0]!, 'talent.burst') },

  // A1 passive damage: ATK × passive1[0] = 65%, directMoon lunarcharged.
  // Per vendor: lunarDmg(percent(passive1[0]), 'atk', 'lunarcharged')
  {
    name: 'a1_lunar',
    move: 'skill', element: 'electro',
    kind: 'directMoon', moonReaction: 'electrocharged',
    base: prod(v('final.atk'), skillParam.passive1[0]![0] ?? 0.65),
  },

  // C2 extra MC hit: ATK × constellation2[0] = 300%
  {
    name: 'c2_lunar',
    move: 'skill', element: 'electro',
    kind: 'directMoon', moonReaction: 'electrocharged',
    base: prod(v('final.atk'), skillParam.constellation2[0] ?? 3),
  },

  // C6 extra MC hit: ATK × constellation6[0] = 135%
  {
    name: 'c6_lunar',
    move: 'skill', element: 'electro',
    kind: 'directMoon', moonReaction: 'electrocharged',
    base: prod(v('final.atk'), skillParam.constellation6[0] ?? 1.35),
  },

  // Generic moon-electrocharged trigger
  {
    name: 'moon_electrocharged',
    move: 'skill', element: 'electro',
    kind: 'reactionMoon', moonReaction: 'electrocharged',
    base: prod(v('final.atk'), 0),
  },
]

export function applyIneffaFormulaBuffs(
  scope: import('../scope').Scope,
  condState: Record<string, Record<string, number>>,
) {
  // A6 (passive3): ATK/100 × 0.7% → lunarcharged_baseDmg, cap 14%.
  const atk = scope.get('final.atk') ?? 0
  const baseBoost = Math.min(0.14, (atk / 100) * 0.007)
  if (baseBoost > 0) {
    scope.add('premod.moonReactionBaseBoost', baseBoost, `月兆祝赐(ATK ${Math.round(atk)} → +${(baseBoost * 100).toFixed(1)}% 月反应基础)`)
  }
  // A4 (passive2): ATK × 6% → EM (active char on Q via a4AfterBurst cond).
  // Applied to focus when focus is Ineffa.
  const ascension = scope.get('ascension') ?? 0
  if (ascension >= 4 && condState.Ineffa?.a4AfterBurst) {
    const em = atk * 0.06
    if (em > 0) scope.add('premod.eleMas', em, `A4 (ATK ${Math.round(atk)} × 6% → ${em.toFixed(0)} EM)`)
  }
  // C1 (cond c1AfterShield): ATK/100 × 2.5% → lunarcharged_dmg_, cap 50%.
  // constellation1[0] = 0.025, constellation1[1] = 0.5.
  if ((scope.get('constellation') ?? 0) >= 1 && condState.Ineffa?.c1AfterShield) {
    const dmgInc = Math.min(0.5, (atk / 100) * 0.025)
    if (dmgInc > 0) {
      scope.add('premod.lunarchargedDmgBoost', dmgInc, `C1 护盾后(ATK ${Math.round(atk)} → +${(dmgInc * 100).toFixed(1)}% 月感电增伤)`)
    }
  }
}
