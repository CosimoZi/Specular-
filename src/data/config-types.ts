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
  level: number // 1..100 (Genshin 5.7+ raised cap from 90 → 100)
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
  /** Unix ms timestamp of last edit. Drives "recently configured first" sort. */
  lastModified: number
  /** Default reaction tied to this character (used when they're the focus in /team). */
  reaction:
    | 'none'
    | 'vape_strong'
    | 'vape_weak'
    | 'melt_strong'
    | 'melt_weak'
    | 'aggravate'
    | 'spread'
  /** Per-hit scaling override (atk → hp/def/em). Persists across sessions. */
  scalingOverride?: Record<string, 'atk' | 'hp' | 'def' | 'em'>
  /** Default position when this character is the focus in /team.
   *  Some buffs are gated by "on-field" / "off-field"; this hints which. */
  position?: 'frontline' | 'backline'
}

/** Team config + which character is the "focus" for the damage display. */
export interface TeamConfig {
  slots: Array<number | string | null> // up to 4
  focusIndex: number | null // index into slots; null = first non-null
  /** Enemy + reaction live on the team now, not per-character. */
  enemyLevel: number
  enemyBaseRes: number
  enemyResReduction: number
  enemyDefReduction: number
  reaction:
    | 'none'
    | 'vape_strong'
    | 'vape_weak'
    | 'melt_strong'
    | 'melt_weak'
    | 'aggravate'
    | 'spread'
  /** Per-buff toggles, keyed by buff id. Default = whatever the buff spec says. */
  buffToggles: Record<string, boolean>
}

export function defaultTeam(): TeamConfig {
  return {
    slots: [null, null, null, null],
    focusIndex: null,
    enemyLevel: 100,
    enemyBaseRes: 10,
    enemyResReduction: 0,
    enemyDefReduction: 0,
    reaction: 'none',
    buffToggles: {},
  }
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
    lastModified: 0,
    reaction: 'none',
    scalingOverride: {},
  }
}

/** A config counts as "configured" once the user has touched it (lastModified > 0)
 *  OR it has any weapon / artifact piece picked / non-default talent levels. */
export function isConfigured(c: CharacterConfig | undefined): boolean {
  if (!c) return false
  if (c.lastModified > 0) return true
  if (c.weapon.weaponId != null) return true
  if (Object.keys(c.artifacts).length > 0) return true
  if (c.constellation > 0) return true
  if (c.importMode) return true
  return false
}
