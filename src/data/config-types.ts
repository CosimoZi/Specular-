// Per-character configuration — the user's saved build for one character.
//
// Persisted to localStorage via Zustand. Future: optional GitHub Gist sync.

import type { StatKey } from '@/engine/types'

export type ArtifactSlot = 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet'

/** Possible main-stat keys for an artifact piece. Slot-specific subsets enforced
 *  by ARTIFACT_MAIN_OPTIONS in artifact-tables.ts. */
export type ArtifactMainStat =
  | 'hpFlat'
  | 'atkFlat'
  | 'hpPct'
  | 'atkPct'
  | 'defPct'
  | 'em'
  | 'er'
  | 'critRate'
  | 'critDmg'
  | 'healingBonus'
  | 'pyroDmg'
  | 'hydroDmg'
  | 'cryoDmg'
  | 'electroDmg'
  | 'anemoDmg'
  | 'geoDmg'
  | 'dendroDmg'
  | 'physicalDmg'

/** Possible substat keys. Excludes flat HP/ATK/DEF % which are mains-only. */
export type ArtifactSubStat =
  | 'hpFlat'
  | 'atkFlat'
  | 'defFlat'
  | 'hpPct'
  | 'atkPct'
  | 'defPct'
  | 'em'
  | 'er'
  | 'critRate'
  | 'critDmg'

export interface ArtifactPiece {
  setId: number
  slot: ArtifactSlot
  rarity: 4 | 5
  level: number // 0..20 for 5*, 0..16 for 4*
  mainStat: ArtifactMainStat
  substats: Array<{ key: ArtifactSubStat; value: number; rolls?: number }>
}

export interface WeaponConfig {
  weaponId: number | null
  level: number // 1..90
  ascensionStage: number // 0..6
  refinement: number // 1..5
}

export interface CharacterConfig {
  characterId: number | string
  level: number // 1..90
  ascensionStage: number // 0..6
  constellation: number // 0..6
  talentLevels: { auto: number; skill: number; burst: number }
  weapon: WeaponConfig
  artifacts: Partial<Record<ArtifactSlot, ArtifactPiece>>
  // Free-form buff entries the user can layer on top (Bennett ATK%, Furina fanfare, etc.)
  customBuffs?: Array<{
    label: string
    bag: Partial<Record<StatKey, number>>
    enabled: boolean
  }>
  // "Imported from Enka" mode — if true, the engine uses the snapshot
  // aggregated stats below instead of deriving from weapon + artifacts.
  // This is the simplest path for UID import; detailed piece-by-piece import
  // is Phase 2.3 in the roadmap.
  importMode?: {
    finalAtk: number
    finalHp: number
    finalDef: number
    em: number
    critRate: number // percentage 0..100
    critDmg: number
    er: number
    elementBonus: number // for the character's matching element
  }
  // Enemy + reaction live next to the config so they persist too.
  enemyLevel: number
  enemyBaseRes: number // %
  enemyResReduction: number // %
  enemyDefReduction: number // %
  reaction:
    | 'none'
    | 'vape_strong'
    | 'vape_weak'
    | 'melt_strong'
    | 'melt_weak'
    | 'aggravate'
    | 'spread'
}

export function defaultConfig(characterId: number | string): CharacterConfig {
  return {
    characterId,
    level: 90,
    ascensionStage: 6,
    constellation: 0,
    talentLevels: { auto: 10, skill: 10, burst: 10 },
    weapon: { weaponId: null, level: 90, ascensionStage: 6, refinement: 1 },
    artifacts: {},
    customBuffs: [],
    enemyLevel: 100,
    enemyBaseRes: 10,
    enemyResReduction: 0,
    enemyDefReduction: 0,
    reaction: 'none',
  }
}
