// CharacterConfig + WeaponConfig + ArtifactPiece[] → GOOD format (the
// canonical Genshin community import/export schema, used by GenshinOptimizer,
// Akasha, etc.). Once we produce GOOD-shaped objects, GO's gi/formula module
// happily computes damage end-to-end.

import idMapJson from './go-id-map.json'
import type {
  ArtifactPiece,
  ArtifactMainStat,
  ArtifactSubStat,
  CharacterConfig,
  WeaponConfig,
} from '@/data/config-types'

const ID_MAP = idMapJson as {
  map: {
    characters: Record<string, string>
    weapons: Record<string, string>
    artifacts: Record<string, string>
  }
}

// --- Stat key translation: our keys → GO's keys ---
// GO uses `_` suffix to denote percentage stats. Flat is bare.
const MAIN_STAT_TO_GO: Record<string, string> = {
  hpFlat: 'hp',
  atkFlat: 'atk',
  hpPct: 'hp_',
  atkPct: 'atk_',
  defPct: 'def_',
  em: 'eleMas',
  er: 'enerRech_',
  critRate: 'critRate_',
  critDmg: 'critDMG_',
  healingBonus: 'heal_',
  pyroDmg: 'pyro_dmg_',
  hydroDmg: 'hydro_dmg_',
  cryoDmg: 'cryo_dmg_',
  electroDmg: 'electro_dmg_',
  anemoDmg: 'anemo_dmg_',
  geoDmg: 'geo_dmg_',
  dendroDmg: 'dendro_dmg_',
  physicalDmg: 'physical_dmg_',
}

// Substats lack defFlat → 'def', flat HP/ATK still 'hp'/'atk'.
const SUBSTAT_TO_GO: Record<string, string> = {
  ...MAIN_STAT_TO_GO,
  defFlat: 'def',
}

/** Lookup GO character key for an internal id (handles traveler suffix). */
export function goCharacterKey(id: number | string): string | null {
  const s = String(id)
  // Traveler: e.g. "10000005-anemo" → "TravelerAnemo"
  if (s.startsWith('10000005-') || s.startsWith('10000007-')) {
    const elem = s.split('-')[1]
    if (!elem) return null
    return 'Traveler' + elem.charAt(0).toUpperCase() + elem.slice(1)
  }
  // Direct id lookup
  const numId = parseInt(s, 10)
  if (Number.isFinite(numId)) {
    return ID_MAP.map.characters[String(numId)] ?? null
  }
  return null
}

export function goWeaponKey(weaponId: number | null): string | null {
  if (weaponId == null) return null
  return ID_MAP.map.weapons[String(weaponId)] ?? null
}

export function goArtifactSetKey(setId: number): string | null {
  return ID_MAP.map.artifacts[String(setId)] ?? null
}

// --- GOOD type shapes (subset we produce) ---
export interface GoodArtifact {
  setKey: string
  slotKey: 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet'
  rarity: 3 | 4 | 5
  level: number
  mainStatKey: string
  location: string // empty or character key
  lock: boolean
  substats: Array<{ key: string; value: number }>
}

export interface GoodWeapon {
  key: string
  level: number
  ascension: number
  refinement: number
  location: string
  lock: boolean
}

export interface GoodCharacter {
  key: string
  level: number
  ascension: number
  constellation: number
  talent: { auto: number; skill: number; burst: number }
}

export function configToGoCharacter(config: CharacterConfig): GoodCharacter | null {
  const key = goCharacterKey(config.characterId)
  if (!key) return null
  // Genshin's 5.7+ "Crowning of Insight" raised the character level cap to
  // 100 (with new ascension stages 7-10 in some patches). GO supports
  // level 1..100 (`charMaxLevel = 100` in gi/consts/character.ts).
  const clampedLevel = Math.min(Math.max(config.level, 1), 100)
  // Talent levels can be 1..15 (with C3+C5 bumps). GO uses 0-indexed.
  const clampTalent = (n: number) => Math.max(0, Math.min(14, n - 1))
  return {
    key,
    level: clampedLevel,
    ascension: config.ascensionStage,
    constellation: config.constellation,
    talent: {
      auto: clampTalent(config.talentLevels.auto),
      skill: clampTalent(config.talentLevels.skill),
      burst: clampTalent(config.talentLevels.burst),
    },
  }
}

export function weaponConfigToGoWeapon(
  weapon: WeaponConfig,
  location: string,
): GoodWeapon | null {
  if (weapon.weaponId == null) return null
  const key = goWeaponKey(weapon.weaponId)
  if (!key) return null
  // GO weapon level: 1..90. Refinement: 1..5.
  return {
    key,
    level: Math.min(Math.max(weapon.level, 1), 90),
    ascension: Math.min(Math.max(weapon.ascensionStage, 0), 6),
    refinement: Math.min(Math.max(weapon.refinement, 1), 5),
    location,
    lock: false,
  }
}

export function artifactPieceToGoArtifact(
  piece: ArtifactPiece,
  location: string,
): GoodArtifact | null {
  const setKey = goArtifactSetKey(piece.setId)
  if (!setKey) return null
  const mainStatKey = MAIN_STAT_TO_GO[piece.mainStat as ArtifactMainStat]
  if (!mainStatKey) return null
  const substats = piece.substats
    .map((s) => {
      const key = SUBSTAT_TO_GO[s.key as ArtifactSubStat]
      if (!key) return null
      // GO's substat values: for percentage stats they expect the BIG number
      // (e.g. 5.83 for +5.83% CR), NOT the decimal 0.0583. Our store keeps
      // percentages as decimals; convert back.
      const isPercent = key.endsWith('_')
      const value = isPercent ? s.value * 100 : s.value
      return { key, value }
    })
    .filter((x): x is { key: string; value: number } => x !== null)
  // Pad to 4 substats with empty entries to match GOOD schema length
  while (substats.length < 4) substats.push({ key: '', value: 0 })

  return {
    setKey,
    slotKey: piece.slot as GoodArtifact['slotKey'],
    rarity: piece.rarity,
    level: piece.level,
    mainStatKey,
    location,
    lock: false,
    substats,
  }
}

/** Build a GOOD-format object (`{ format: 'GOOD', source, version, ... }`) for
 *  one or more characters. Importable by GenshinOptimizer's web app directly. */
export interface GoodExport {
  format: 'GOOD'
  source: string
  version: 1 | 2 | 3
  characters: GoodCharacter[]
  weapons: GoodWeapon[]
  artifacts: GoodArtifact[]
}

export function exportGood(configs: CharacterConfig[]): GoodExport {
  const characters: GoodCharacter[] = []
  const weapons: GoodWeapon[] = []
  const artifacts: GoodArtifact[] = []
  for (const c of configs) {
    const goChar = configToGoCharacter(c)
    if (!goChar) continue
    characters.push(goChar)
    const goWep = weaponConfigToGoWeapon(c.weapon, goChar.key)
    if (goWep) weapons.push(goWep)
    for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const) {
      const piece = c.artifacts[slot]
      if (!piece) continue
      const art = artifactPieceToGoArtifact(piece, goChar.key)
      if (art) artifacts.push(art)
    }
  }
  return {
    format: 'GOOD',
    source: 'Specular',
    version: 3,
    characters,
    weapons,
    artifacts,
  }
}
