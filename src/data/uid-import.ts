// Parse a player's character showcase from Enka.Network into FULL
// CharacterConfig objects (not just aggregated stat snapshots). The user wants
// per-piece import: every artifact's main + 4 subs + set + level, every weapon.
//
// Enka returns:
//   - playerInfo.{nickname, level, worldLevel, ...}
//   - avatarInfoList[].{
//       avatarId, propMap, fightPropMap, skillLevelMap, talentIdList, equipList
//     }
//
// We support UIDs from any server (CN 国服 1xxxxxxxx, CN B服 5xxxxxxxx, global
// 6/7/8/9xxxxxxxx). enka.network handles them all transparently. If we ever
// need a mirror for BiliBili UIDs we can swap the base URL based on the prefix.
//
// `?info` query yields just playerInfo (lightweight); without it Enka returns
// the full showcase. We always request the full version on Fetch.

import type { DamageElement } from '@/engine/types'
import type {
  CharacterConfig,
  ArtifactPiece,
  ArtifactMainStat,
  ArtifactSubStat,
  ArtifactSlot,
} from './config-types'
import { defaultConfig } from './config-types'

// --- FightProp numeric keys (Enka fightPropMap) ---
const FP = {
  BASE_HP: 1,
  ATTACK: 4,
  DEFENSE: 7,
  CRIT_RATE: 20,
  CRIT_DMG: 22,
  ENERGY_RECHARGE: 23,
  HEALING_BONUS: 26,
  ELEMENT_MASTERY: 28,
  PHYSICAL_DMG: 30,
  PYRO_DMG: 40,
  ELECTRO_DMG: 41,
  HYDRO_DMG: 42,
  DENDRO_DMG: 43,
  ANEMO_DMG: 44,
  GEO_DMG: 45,
  CRYO_DMG: 46,
  CUR_HP_MAX: 2000,
  CUR_ATTACK: 2001,
  CUR_DEFENSE: 2002,
} as const

// --- Enka equipType → our slot ---
const SLOT_FROM_EQUIP: Record<string, ArtifactSlot> = {
  EQUIP_BRACER: 'flower',
  EQUIP_NECKLACE: 'plume',
  EQUIP_SHOES: 'sands',
  EQUIP_RING: 'goblet',
  EQUIP_DRESS: 'circlet',
}

// --- FIGHT_PROP_* → our stat key. Returns {key, isPercent}. ---
function statKeyFromFightProp(prop: string): { key: ArtifactMainStat | ArtifactSubStat; isPercent: boolean } | null {
  switch (prop) {
    case 'FIGHT_PROP_HP': return { key: 'hpFlat', isPercent: false }
    case 'FIGHT_PROP_ATTACK': return { key: 'atkFlat', isPercent: false }
    case 'FIGHT_PROP_DEFENSE': return { key: 'defFlat', isPercent: false }
    case 'FIGHT_PROP_HP_PERCENT': return { key: 'hpPct', isPercent: true }
    case 'FIGHT_PROP_ATTACK_PERCENT': return { key: 'atkPct', isPercent: true }
    case 'FIGHT_PROP_DEFENSE_PERCENT': return { key: 'defPct', isPercent: true }
    case 'FIGHT_PROP_ELEMENT_MASTERY': return { key: 'em', isPercent: false }
    case 'FIGHT_PROP_CHARGE_EFFICIENCY': return { key: 'er', isPercent: true }
    case 'FIGHT_PROP_CRITICAL': return { key: 'critRate', isPercent: true }
    case 'FIGHT_PROP_CRITICAL_HURT': return { key: 'critDmg', isPercent: true }
    case 'FIGHT_PROP_HEAL_ADD': return { key: 'healingBonus' as ArtifactMainStat, isPercent: true }
    case 'FIGHT_PROP_FIRE_ADD_HURT': return { key: 'pyroDmg' as ArtifactMainStat, isPercent: true }
    case 'FIGHT_PROP_WATER_ADD_HURT': return { key: 'hydroDmg' as ArtifactMainStat, isPercent: true }
    case 'FIGHT_PROP_ICE_ADD_HURT': return { key: 'cryoDmg' as ArtifactMainStat, isPercent: true }
    case 'FIGHT_PROP_ELEC_ADD_HURT': return { key: 'electroDmg' as ArtifactMainStat, isPercent: true }
    case 'FIGHT_PROP_WIND_ADD_HURT': return { key: 'anemoDmg' as ArtifactMainStat, isPercent: true }
    case 'FIGHT_PROP_ROCK_ADD_HURT': return { key: 'geoDmg' as ArtifactMainStat, isPercent: true }
    case 'FIGHT_PROP_GRASS_ADD_HURT': return { key: 'dendroDmg' as ArtifactMainStat, isPercent: true }
    case 'FIGHT_PROP_PHYSICAL_ADD_HURT': return { key: 'physicalDmg' as ArtifactMainStat, isPercent: true }
    default: return null
  }
}

// --- region from UID prefix ---
export function regionFromUid(uid: string): 'cn-official' | 'cn-bilibili' | 'global' | 'unknown' {
  if (!/^\d{9,10}$/.test(uid)) return 'unknown'
  const first = uid[0]
  if (first === '1' || first === '2') return 'cn-official'
  if (first === '5') return 'cn-bilibili'
  if (['6', '7', '8', '9'].includes(first)) return 'global'
  return 'unknown'
}

function n(map: Record<string, number> | undefined, key: number, fallback = 0): number {
  if (!map) return fallback
  return map[String(key)] ?? fallback
}

function ascensionFromLevel(level: number): number {
  if (level <= 20) return 0
  if (level <= 40) return 1
  if (level <= 50) return 2
  if (level <= 60) return 3
  if (level <= 70) return 4
  if (level <= 80) return 5
  return 6
}

// =============================================================================
// Per-character parse → full CharacterConfig
// =============================================================================
export interface ImportedCharacter {
  /** Full structured config — drops directly into useCharacterConfigs.set(). */
  config: CharacterConfig
  /** Aggregated final-stats snapshot from Enka. Used as a fallback / sanity
   *  check overlay if the user prefers Enka's number to our derived one. */
  snapshot: NonNullable<CharacterConfig['importMode']>
  /** Talent count Enka returned — informational (some chars have alternate sprint). */
  rawSkillCount: number
}

function parseAvatar(raw: Record<string, unknown>): ImportedCharacter | null {
  const avatarId = raw.avatarId as number | undefined
  if (!avatarId) return null

  const propMap = raw.propMap as Record<string, { val?: string }> | undefined
  const fightPropMap = raw.fightPropMap as Record<string, number> | undefined
  // skillLevelMap is the flat dict (not nested)
  const skillLevelMap = (raw.skillLevelMap as Record<string, number>) ?? {}
  const talentIdList = (raw.talentIdList as number[]) ?? []
  const equipList = (raw.equipList as Array<Record<string, unknown>>) ?? []

  const levelStr = propMap?.['4001']?.val ?? '1'
  const ascensionStr = propMap?.['1002']?.val ?? '0'
  const level = parseInt(levelStr, 10) || 1
  const ascensionStage = parseInt(ascensionStr, 10) || ascensionFromLevel(level)

  // Talent levels: Enka sorts by skill id. For most characters this is auto / skill / burst.
  // Some characters (Wanderer, Ayato) have an "alternate sprint" skill that shows up.
  // Genshin canonical order: first non-passive skill = auto, last = burst, middle = E skill.
  const skillIds = Object.keys(skillLevelMap).sort()
  const talentLevels = {
    auto: skillIds.length ? skillLevelMap[skillIds[0]] : 1,
    skill: skillIds.length >= 2 ? skillLevelMap[skillIds[1]] : 1,
    burst: skillIds.length ? skillLevelMap[skillIds[skillIds.length - 1]] : 1,
  }

  const constellation = talentIdList.length

  // Parse equipment
  let weaponConfig: CharacterConfig['weapon'] = {
    weaponId: null, level: 90, ascensionStage: 6, refinement: 1,
  }
  const artifacts: Partial<Record<ArtifactSlot, ArtifactPiece>> = {}

  for (const eq of equipList) {
    const flat = eq.flat as Record<string, unknown> | undefined
    if (!flat) continue
    const itemType = flat.itemType as string
    if (itemType === 'ITEM_WEAPON') {
      const weapon = eq.weapon as { level?: number; affixMap?: Record<string, number> } | undefined
      const wepLevel = weapon?.level ?? 1
      // Refinement: affixMap value is (refinement - 1); take max + 1 to get actual refinement
      const refinement = weapon?.affixMap
        ? Math.max(...Object.values(weapon.affixMap)) + 1
        : 1
      weaponConfig = {
        weaponId: eq.itemId as number,
        level: wepLevel,
        ascensionStage: ascensionFromLevel(wepLevel),
        refinement,
      }
    } else if (itemType === 'ITEM_RELIQUARY') {
      const slot = SLOT_FROM_EQUIP[flat.equipType as string]
      if (!slot) continue
      const rankLevel = flat.rankLevel as number
      const reliquary = eq.reliquary as { level?: number } | undefined
      // Enka stores level + 1 (so level=21 = displayed lvl 20)
      const lvl = reliquary?.level ? reliquary.level - 1 : 0

      const mainstat = flat.reliquaryMainstat as { mainPropId: string; statValue: number } | undefined
      const subs = (flat.reliquarySubstats as Array<{ appendPropId: string; statValue: number }>) ?? []

      if (!mainstat) continue
      const mainInfo = statKeyFromFightProp(mainstat.mainPropId)
      if (!mainInfo) continue

      const substats: ArtifactPiece['substats'] = []
      for (const s of subs) {
        const info = statKeyFromFightProp(s.appendPropId)
        if (!info) continue
        // Enka stores % values as percentages (15.2 not 0.152). Convert to our decimal.
        const value = info.isPercent ? s.statValue / 100 : s.statValue
        substats.push({ key: info.key as ArtifactSubStat, value })
      }

      artifacts[slot] = {
        setId: flat.setId as number,
        slot,
        rarity: rankLevel as 4 | 5,
        level: lvl,
        mainStat: mainInfo.key as ArtifactMainStat,
        substats,
      }
    }
  }

  // Build the CharacterConfig
  const config: CharacterConfig = {
    ...defaultConfig(avatarId),
    level,
    ascensionStage,
    constellation,
    talentLevels,
    weapon: weaponConfig,
    artifacts,
    lastModified: Date.now(),
  }

  // Aggregated stat snapshot (for importMode fallback)
  const snapshot: NonNullable<CharacterConfig['importMode']> = {
    finalAtk: n(fightPropMap, FP.CUR_ATTACK),
    finalHp: n(fightPropMap, FP.CUR_HP_MAX),
    finalDef: n(fightPropMap, FP.CUR_DEFENSE),
    em: n(fightPropMap, FP.ELEMENT_MASTERY),
    critRate: n(fightPropMap, FP.CRIT_RATE) * 100,
    critDmg: n(fightPropMap, FP.CRIT_DMG) * 100,
    er: n(fightPropMap, FP.ENERGY_RECHARGE) * 100,
    elementBonus: 0, // filled in by CharacterDetail based on element
  }

  return { config, snapshot, rawSkillCount: skillIds.length }
}

// =============================================================================
// Legacy ImportedBuild for back-compat — eventually phased out as the new
// CharacterConfig path covers everything.
// =============================================================================
export interface ImportedBuild {
  characterId: number | string
  characterLevel: number
  ascensionStage: number
  constellation: number
  talentLevels: { auto: number; skill: number; burst: number }
  finalHp: number
  finalAtk: number
  finalDef: number
  em: number
  critRate: number
  critDmg: number
  er: number
  elementalDmg: Partial<Record<DamageElement, number>>
  physicalDmg: number
  /** Full structured config for direct write into useCharacterConfigs.set(). */
  fullConfig: CharacterConfig
}

function legacyBuild(parsed: ImportedCharacter, fightPropMap: Record<string, number> | undefined): ImportedBuild {
  return {
    characterId: parsed.config.characterId,
    characterLevel: parsed.config.level,
    ascensionStage: parsed.config.ascensionStage,
    constellation: parsed.config.constellation,
    talentLevels: parsed.config.talentLevels,
    finalHp: parsed.snapshot.finalHp,
    finalAtk: parsed.snapshot.finalAtk,
    finalDef: parsed.snapshot.finalDef,
    em: parsed.snapshot.em,
    critRate: parsed.snapshot.critRate,
    critDmg: parsed.snapshot.critDmg,
    er: parsed.snapshot.er,
    elementalDmg: {
      Pyro: n(fightPropMap, FP.PYRO_DMG) * 100,
      Hydro: n(fightPropMap, FP.HYDRO_DMG) * 100,
      Cryo: n(fightPropMap, FP.CRYO_DMG) * 100,
      Electro: n(fightPropMap, FP.ELECTRO_DMG) * 100,
      Anemo: n(fightPropMap, FP.ANEMO_DMG) * 100,
      Geo: n(fightPropMap, FP.GEO_DMG) * 100,
      Dendro: n(fightPropMap, FP.DENDRO_DMG) * 100,
    },
    physicalDmg: n(fightPropMap, FP.PHYSICAL_DMG) * 100,
    fullConfig: parsed.config,
  }
}

export interface ImportResult {
  uid: string
  region: ReturnType<typeof regionFromUid>
  playerName: string
  level: number
  worldLevel: number
  builds: ImportedBuild[]
  ttl: number
  fetchedAt: number
}

const ENKA_BASE = 'https://enka.network/api/uid'

const CACHE_KEY = 'specular-enka-cache'
const CACHE_TTL_MS = 5 * 60 * 1000

function readCache(uid: string): ImportResult | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${uid}`)
    if (!raw) return null
    const obj = JSON.parse(raw) as ImportResult
    if (Date.now() - obj.fetchedAt > CACHE_TTL_MS) return null
    return obj
  } catch { return null }
}

function writeCache(uid: string, r: ImportResult) {
  try {
    localStorage.setItem(`${CACHE_KEY}:${uid}`, JSON.stringify(r))
  } catch { /* quota */ }
}

export async function fetchEnkaUid(uid: string): Promise<ImportResult> {
  const cached = readCache(uid)
  if (cached) return cached

  const region = regionFromUid(uid)
  if (region === 'unknown') throw new Error('UID format invalid')

  // For CN bilibili (5xxxxxxxx), enka.network may not work; document this in UI later.
  const url = `${ENKA_BASE}/${encodeURIComponent(uid)}`
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 400) throw new Error('UID format rejected by Enka (400)')
    if (res.status === 404) throw new Error('UID not found on Enka (404). For BiliBili 国服 UIDs (starting with 5), Enka may not have data.')
    if (res.status === 424) throw new Error('Account exists but character showcase is empty (424). Enable Character Showcase in-game.')
    if (res.status === 429) throw new Error('Rate-limited by Enka (429). Try again in a minute.')
    throw new Error(`Enka HTTP ${res.status}`)
  }
  const body = await res.json()

  const playerInfo = body.playerInfo ?? {}
  const avatars = (body.avatarInfoList ?? []) as Array<Record<string, unknown>>
  const builds: ImportedBuild[] = []
  for (const a of avatars) {
    const parsed = parseAvatar(a)
    if (!parsed) continue
    builds.push(legacyBuild(parsed, a.fightPropMap as Record<string, number> | undefined))
  }

  const result: ImportResult = {
    uid: body.uid ?? uid,
    region,
    playerName: playerInfo.nickname ?? '',
    level: playerInfo.level ?? 0,
    worldLevel: playerInfo.worldLevel ?? 0,
    builds,
    ttl: body.ttl ?? 60,
    fetchedAt: Date.now(),
  }
  writeCache(uid, result)
  return result
}
