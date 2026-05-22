// 叶洛亚 / Illuga damage formulas.
//
// Translated from vendor/go/gi/sheets/src/Characters/Illuga/index.tsx.
//
// Important: Illuga uses **split-scaling** damage — many hits scale on
// EM AND DEF simultaneously (`splitScaleDmgNode(['eleMas', 'def'], [emTable, defTable])`).
// Our AST handles this via `sum(prod(EM, emCoeff), prod(DEF, defCoeff))`.
//
// Auto-array (polearm, 4-stage chain with N3 being 2-hit):
//   auto[0]   N1
//   auto[1]   N2
//   auto[2]   N3 hit 1 (multi-hit)
//   auto[3]   N3 hit 2
//   auto[4]   N4
//   auto[5]   charged forward dash
//   auto[6]   charged stamina (const)
//   auto[7..9] plunging dmg / low / high
//
// Skill 衔莺破晓 (5 entries):
//   skill[0]  pressDmgEleMas — EM coefficient for tap press
//   skill[1]  pressDmgDef    — DEF coefficient for tap press
//   skill[2]  holdDmgEleMas  — EM coefficient for hold
//   skill[3]  holdDmgDef     — DEF coefficient for hold
//   skill[4]  cd (const)
//
// Burst 鉴照无影 (9 entries):
//   burst[0]  skillDmgEleMas — EM coefficient for primary
//   burst[1]  skillDmgDef    — DEF coefficient for primary
//   burst[2]  geo_dmgInc (per-talent-level, EM coefficient for buff propagation)
//   burst[3]  lunarcrystallize_dmgInc (per-talent-level EM coefficient)
//   burst[4..8] stacks gained / duration / cd / energy (consts)

import { prod, sum, lookup, v, sub, ifGE, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Illuga as {
  auto: number[][]
  skill: number[][]
  burst: number[][]
}

const lvlLookup = (table: number[], lvlVar: string): Node =>
  lookup(table, sub(v(lvlVar), 1))

const atkProd = (table: number[], lvlVar: string) =>
  prod(v('final.atk'), lvlLookup(table, lvlVar))

// Split scaling: EM × emCoeff + DEF × defCoeff.
const splitScale = (emTable: number[], defTable: number[], lvlVar: string): Node =>
  sum(
    prod(v('final.eleMas'), lvlLookup(emTable, lvlVar)),
    prod(v('final.def'), lvlLookup(defTable, lvlVar)),
  )

export const IllugaFormulas: FormulaDef[] = [
  // ---- Normals (polearm, ATK-scaling physical) ----
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2a', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  { name: 'normal_2b', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  { name: 'normal_3', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  { name: 'charged', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[5]!, 'talent.auto') },
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[7]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[8]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[9]!, 'talent.auto') },

  // ---- Skill 衔莺破晓 (EM+DEF split-scaling geo) ----
  {
    name: 'skill_press',
    move: 'skill',
    element: 'geo',
    base: splitScale(skillParam.skill[0]!, skillParam.skill[1]!, 'talent.skill'),
  },
  {
    name: 'skill_hold',
    move: 'skill',
    element: 'geo',
    base: splitScale(skillParam.skill[2]!, skillParam.skill[3]!, 'talent.skill'),
  },

  // ---- Burst 鉴照无影 (EM+DEF split-scaling geo) ----
  {
    name: 'burst_primary',
    move: 'burst',
    element: 'geo',
    base: splitScale(skillParam.burst[0]!, skillParam.burst[1]!, 'talent.burst'),
  },

  // ---- C2 噬枝之麋: 阿咚 hit triggered every 7 layers consumed.
  // EM × constellation2[0] + DEF × constellation2[1] = EM × 4 + DEF × 2. Burst-tagged.
  {
    name: 'c2_addong',
    move: 'burst',
    element: 'geo',
    base: ifGE(v('constellation', 0), 2,
      sum(
        prod(v('final.eleMas'), 4),
        prod(v('final.def'), 2),
      ),
      0,
    ),
  },

  // ---- Moon-crystallize trigger entry (Illuga is moonsign char per A6 mechanic) ----
  {
    name: 'moon_crystallize',
    move: 'skill',
    element: 'geo',
    kind: 'reactionMoon',
    moonReaction: 'crystallize',
    base: prod(v('final.def'), 0),
  },
]

export function applyIllugaFormulaBuffs(
  _scope: import('../scope').Scope,
  _condState: Record<string, Record<string, number>>,
) {
  // Illuga's main team buffs (burstSong, a4Song, a1AfterSkillBurst) are TEAM
  // buffs propagated to other characters' geo damage. In our self-only
  // calculation, applying them to focus character makes sense only when focus
  // IS Illuga (she benefits too per vendor's `ownBuff` portion of a1).
  // Stat-side application is in Illuga.ts apply().
}
