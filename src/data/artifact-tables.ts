// Artifact main-stat and substat tables.
//
// Source: well-known community wiki numbers (KQM, GenshinOptimizer, fandom).
// All "%" values are stored as decimals (0.466 = 46.6%).

import type { ArtifactMainStat, ArtifactSlot, ArtifactSubStat } from './config-types'

/** Which main-stat keys a slot can roll. */
export const ARTIFACT_MAIN_OPTIONS: Record<ArtifactSlot, ArtifactMainStat[]> = {
  flower: ['hpFlat'],
  plume: ['atkFlat'],
  sands: ['hpPct', 'atkPct', 'defPct', 'em', 'er'],
  goblet: [
    'hpPct',
    'atkPct',
    'defPct',
    'em',
    'pyroDmg',
    'hydroDmg',
    'cryoDmg',
    'electroDmg',
    'anemoDmg',
    'geoDmg',
    'dendroDmg',
    'physicalDmg',
  ],
  circlet: ['hpPct', 'atkPct', 'defPct', 'em', 'critRate', 'critDmg', 'healingBonus'],
}

/** Main-stat value at MAX LEVEL (lvl 20 for 5*, lvl 16 for 4*). */
const MAIN_AT_MAX_L: Record<5 | 4, Partial<Record<ArtifactMainStat, number>>> = {
  5: {
    hpFlat: 4780,
    atkFlat: 311,
    hpPct: 0.466,
    atkPct: 0.466,
    defPct: 0.583,
    em: 187,
    er: 0.518,
    critRate: 0.311,
    critDmg: 0.622,
    healingBonus: 0.359,
    pyroDmg: 0.466,
    hydroDmg: 0.466,
    cryoDmg: 0.466,
    electroDmg: 0.466,
    anemoDmg: 0.466,
    geoDmg: 0.466,
    dendroDmg: 0.466,
    physicalDmg: 0.583,
  },
  4: {
    hpFlat: 3571,
    atkFlat: 232,
    hpPct: 0.348,
    atkPct: 0.348,
    defPct: 0.435,
    em: 139,
    er: 0.387,
    critRate: 0.232,
    critDmg: 0.466,
    healingBonus: 0.268,
    pyroDmg: 0.348,
    hydroDmg: 0.348,
    cryoDmg: 0.348,
    electroDmg: 0.348,
    anemoDmg: 0.348,
    geoDmg: 0.348,
    dendroDmg: 0.348,
    physicalDmg: 0.435,
  },
}

/** Main-stat value at a specific level (0..20 for 5*, 0..16 for 4*).
 *  We linearly interpolate between 0 and max, which approximates the
 *  game's actual curve (close enough for UI display; not used in calc when
 *  level=max). */
export function artifactMainValue(
  stat: ArtifactMainStat,
  rarity: 4 | 5,
  level: number,
): number {
  const maxL = rarity === 5 ? 20 : 16
  const maxV = MAIN_AT_MAX_L[rarity][stat] ?? 0
  if (level >= maxL) return maxV
  if (level <= 0) return maxV * 0.115 // approx lvl 0 value
  // Linear interp between lvl 0 (~11.5% of max) and lvl max
  const t = level / maxL
  return maxV * (0.115 + t * (1 - 0.115))
}

/** Max-tier roll value for each substat (5* artifacts). 4* uses the same
 *  for now — minor accuracy hit. */
export const SUBSTAT_MAX_ROLL: Record<ArtifactSubStat, number> = {
  hpFlat: 298.75,
  atkFlat: 19.45,
  defFlat: 23.15,
  hpPct: 0.0583,
  atkPct: 0.0583,
  defPct: 0.0729,
  em: 23.31,
  er: 0.0648,
  critRate: 0.0389,
  critDmg: 0.0777,
}

/** Average (between 70% and 100% roll tier) — used for "+1 roll" approximations. */
export const SUBSTAT_AVG_ROLL: Record<ArtifactSubStat, number> = {
  hpFlat: 253.94,
  atkFlat: 16.54,
  defFlat: 19.68,
  hpPct: 0.0496,
  atkPct: 0.0496,
  defPct: 0.062,
  em: 19.82,
  er: 0.0551,
  critRate: 0.0331,
  critDmg: 0.0661,
}

/** UI label for stat keys (zh + en, picked based on locale). */
export const STAT_LABEL_ZH: Record<ArtifactMainStat | ArtifactSubStat, string> = {
  hpFlat: '固定生命',
  atkFlat: '固定攻击',
  defFlat: '固定防御',
  hpPct: '生命值 %',
  atkPct: '攻击力 %',
  defPct: '防御力 %',
  em: '元素精通',
  er: '充能效率 %',
  critRate: '暴击率 %',
  critDmg: '暴击伤害 %',
  healingBonus: '治疗加成 %',
  pyroDmg: '火元素伤害 %',
  hydroDmg: '水元素伤害 %',
  cryoDmg: '冰元素伤害 %',
  electroDmg: '雷元素伤害 %',
  anemoDmg: '风元素伤害 %',
  geoDmg: '岩元素伤害 %',
  dendroDmg: '草元素伤害 %',
  physicalDmg: '物理伤害 %',
}

export const STAT_LABEL_EN: Record<ArtifactMainStat | ArtifactSubStat, string> = {
  hpFlat: 'Flat HP',
  atkFlat: 'Flat ATK',
  defFlat: 'Flat DEF',
  hpPct: 'HP %',
  atkPct: 'ATK %',
  defPct: 'DEF %',
  em: 'EM',
  er: 'ER %',
  critRate: 'CR %',
  critDmg: 'CD %',
  healingBonus: 'Healing %',
  pyroDmg: 'Pyro %',
  hydroDmg: 'Hydro %',
  cryoDmg: 'Cryo %',
  electroDmg: 'Electro %',
  anemoDmg: 'Anemo %',
  geoDmg: 'Geo %',
  dendroDmg: 'Dendro %',
  physicalDmg: 'Physical %',
}

/** Friendly slot names. */
export const SLOT_LABEL_ZH: Record<ArtifactSlot, string> = {
  flower: '生之花',
  plume: '死之羽',
  sands: '时之沙',
  goblet: '空之杯',
  circlet: '理之冠',
}

export const SLOT_LABEL_EN: Record<ArtifactSlot, string> = {
  flower: 'Flower',
  plume: 'Plume',
  sands: 'Sands',
  goblet: 'Goblet',
  circlet: 'Circlet',
}

export const ALL_SLOTS: ArtifactSlot[] = [
  'flower',
  'plume',
  'sands',
  'goblet',
  'circlet',
]
