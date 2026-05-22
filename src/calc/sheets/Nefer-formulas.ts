// 奈芙尔 / Nefer damage formulas.
// Vendor: vendor/go/gi/sheets/src/Characters/Nefer/index.tsx
//
// 5★ Dendro Catalyst, 月绽放 char. Heavy split-scaling (ATK + EM).
// Core mechanic: 神纱 (Veil) stacks 1-5 boost skill damage by veils × 8%.

import { prod, sum, lookup, v, sub, ifGE, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Nefer as {
  auto: number[][]; skill: number[][]; burst: number[][];
  passive1: number[][]; passive3: number[][];
  constellation1: number[]; constellation2: number[]; constellation4: number[]; constellation6: number[]
}
const lvlLookup = (table: number[], lvlVar: string): Node => lookup(table, sub(v(lvlVar), 1))
const atkProd = (table: number[], lvlVar: string) => prod(v('final.atk'), lvlLookup(table, lvlVar))
const splitScale = (atkTable: number[], emTable: number[], lvlVar: string): Node =>
  sum(
    prod(v('final.atk'), lvlLookup(atkTable, lvlVar)),
    prod(v('final.eleMas'), lvlLookup(emTable, lvlVar)),
  )

// A1 veil multiplier: (1 + veils × 0.08). Veils > 3 require constellation >= 2.
// passive1[5] = 0.08 (phantasmVeilMult_)
const veilMult = (): Node =>
  sum(1, prod(v('cond.Nefer.a1VeilStacks', 5), 0.08))

export const NeferFormulas: FormulaDef[] = [
  // Catalyst normals (dendro, ATK; N3 is ×2 in display)
  { name: 'normal_0', move: 'normal', element: 'dendro', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'dendro', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'dendro', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  { name: 'normal_3', move: 'normal', element: 'dendro', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  // Charged (dendro)
  { name: 'charged', move: 'charged', element: 'dendro', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  // Plunging (physical)
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[7]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[8]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[9]!, 'talent.auto') },

  // Skill (all multiplied by veilMult)
  {
    name: 'skill_main',
    move: 'skill', element: 'dendro',
    base: prod(splitScale(skillParam.skill[0]!, skillParam.skill[1]!, 'talent.skill'), veilMult()),
  },
  {
    name: 'skill_nefer1',
    move: 'skill', element: 'dendro',
    base: prod(splitScale(skillParam.skill[4]!, skillParam.skill[5]!, 'talent.skill'), veilMult()),
  },
  // nefer2: post-C6 it becomes a lunarDmg (skipping the C6 branch for clarity; show base form).
  {
    name: 'skill_nefer2',
    move: 'skill', element: 'dendro',
    base: prod(splitScale(skillParam.skill[6]!, skillParam.skill[7]!, 'talent.skill'), veilMult()),
  },
  // Shade hits: lunarbloom directMoon EM-scaled, with veil multiplier and C1 +%
  {
    name: 'skill_shade1_lunar',
    move: 'skill', element: 'dendro',
    kind: 'directMoon', moonReaction: 'bloom',
    base: prod(v('final.eleMas'), lvlLookup(skillParam.skill[8]!, 'talent.skill'), veilMult()),
  },
  {
    name: 'skill_shade2_lunar',
    move: 'skill', element: 'dendro',
    kind: 'directMoon', moonReaction: 'bloom',
    base: prod(v('final.eleMas'), lvlLookup(skillParam.skill[9]!, 'talent.skill'), veilMult()),
  },
  {
    name: 'skill_shade3_lunar',
    move: 'skill', element: 'dendro',
    kind: 'directMoon', moonReaction: 'bloom',
    base: prod(v('final.eleMas'), lvlLookup(skillParam.skill[10]!, 'talent.skill'), veilMult()),
  },

  // Burst — 2 hits, splitScale
  {
    name: 'burst_hit1',
    move: 'burst', element: 'dendro',
    base: splitScale(skillParam.burst[0]!, skillParam.burst[1]!, 'talent.burst'),
  },
  {
    name: 'burst_hit2',
    move: 'burst', element: 'dendro',
    base: splitScale(skillParam.burst[2]!, skillParam.burst[3]!, 'talent.burst'),
  },

  // C6 extra lunarbloom hit
  {
    name: 'c6_lunar',
    move: 'skill', element: 'dendro',
    kind: 'directMoon', moonReaction: 'bloom',
    base: ifGE(v('constellation', 0), 6,
      prod(v('final.eleMas'), skillParam.constellation6[1] ?? 0, veilMult()),
      0,
    ),
  },

  // Generic moon-bloom trigger
  {
    name: 'moon_bloom',
    move: 'skill', element: 'dendro',
    kind: 'reactionMoon', moonReaction: 'bloom',
    base: prod(v('final.eleMas'), 0),
  },
]

export function applyNeferFormulaBuffs(
  scope: import('../scope').Scope,
  condState: Record<string, Record<string, number>>,
) {
  // A6 (passive3): EM × 0.000175 → lunarbloom_baseDmg, cap 14%.
  const em = scope.get('final.eleMas') ?? 0
  const baseBoost = Math.min(0.14, em * 0.000175)
  if (baseBoost > 0) {
    scope.add('premod.moonReactionBaseBoost', baseBoost, `月兆祝赐(EM ${Math.round(em)} → +${(baseBoost * 100).toFixed(1)}% 月反应基础)`)
  }
  // A1 EM bonus: at 3+ veil stacks + moonsign>=2 → +100 EM (passive1[2]=100); at 5 veils + C2 → +200 EM (constellation2[2]=200).
  if ((scope.get('ascension') ?? 0) >= 1 && condState.Nefer?.moonFull) {
    const veils = condState.Nefer?.a1VeilStacks ?? 5
    const cons = scope.get('constellation') ?? 0
    if (veils >= 3) {
      const emBonus = (cons >= 2 && veils >= 5) ? 200 : 100
      scope.add('premod.eleMas', emBonus, `A1 (神纱 ${veils} 层 → +${emBonus} EM)`)
    }
  }
  // C6 lunarbloom_specialDmg_ (constellation6[2] = 0.15 → +15% 擢升, moonsign>=2).
  if ((scope.get('constellation') ?? 0) >= 6 && condState.Nefer?.moonFull) {
    const c6elev = skillParam.constellation6[2] ?? 0
    if (c6elev > 0) scope.add('premod.moonReactionElevation', c6elev, `C6 月兆·满辉(+${(c6elev * 100).toFixed(0)}% 月绽放擢升)`)
  }
  // Burst veils-absorbed buff (cond burstVeilsAbsorbed 1-5): +N × dmgPerStack% burst dmg.
  // burst[4] is the per-level coefficient. C2 unlocks veils 4-5.
  if ((scope.get('ascension') ?? 0) >= 1 && condState.Nefer?.moonFull) {
    const absorbed = condState.Nefer?.burstVeilsAbsorbed ?? 0
    const cons = scope.get('constellation') ?? 0
    const maxAbsorbed = cons >= 2 ? 5 : 3
    const effective = Math.min(absorbed, maxAbsorbed)
    if (effective > 0) {
      const lvl = scope.get('talent.burst') ?? 1
      const idx = Math.max(0, Math.min(lvl - 1, skillParam.burst[4]!.length - 1))
      const perStack = skillParam.burst[4]![idx] ?? 0
      const burstBonus = effective * perStack
      if (burstBonus > 0) scope.add('premod.dmg_.burst', burstBonus, `A1 (${effective} 神纱 → +${(burstBonus * 100).toFixed(1)}% Q 增伤)`)
    }
  }
}

/** C4 -20% dendro RES (c4ShadowDance gated). Vendor:
 *  `teamBuff.premod.dendro_enemyRes_`. */
export const neferC4DendroResShred: import('../sheet-types').CharResShredFn = (ctx, condState) => {
  if (ctx.constellation < 4) return {}
  if (!condState.Nefer?.c4ShadowDance) return {}
  return { dendro: Math.abs(skillParam.constellation4[2] ?? 0.2) }
}
