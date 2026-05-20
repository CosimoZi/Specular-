// Pulls a player's character showcase from Enka.Network. The endpoint is CORS-friendly
// and uses a server-side cache (`ttl` seconds field in response).
//
// We map Enka's `fightPropMap` (numeric FightProp keys → already-computed final
// values) into a shape that the character-detail BuildForm can consume directly.

import type { DamageElement } from '@/engine/types'

/** Numeric FightProp keys we care about. The full list is in Enka's docs but
 *  these are the ones that drive damage. */
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
  // The "current" / final aggregated stats:
  CUR_HP_MAX: 2000,
  CUR_ATTACK: 2001,
  CUR_DEFENSE: 2002,
} as const

/** Per-character build derived from an Enka showcase entry. */
export interface ImportedBuild {
  characterId: number | string
  characterLevel: number
  ascensionStage: number
  finalHp: number
  finalAtk: number
  finalDef: number
  baseHp: number
  baseAtk: number
  baseDef: number
  em: number
  critRate: number // percentage 0..100
  critDmg: number
  er: number
  elementalDmg: Partial<Record<DamageElement, number>> // percentage 0..100
  physicalDmg: number
  talentLevels: { auto: number; skill: number; burst: number }
}

export interface ImportResult {
  uid: string
  playerName: string
  level: number
  worldLevel: number
  builds: ImportedBuild[]
  ttl: number
  fetchedAt: number
}

const ENKA_BASE = 'https://enka.network/api/uid'

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

// Enka's avatar payload has nested fields. Sloppy types because the shape varies by version.
function parseAvatar(raw: Record<string, unknown>): ImportedBuild | null {
  const avatarId = raw.avatarId as number | undefined
  if (!avatarId) return null

  const propMap = raw.propMap as Record<string, { val?: string }> | undefined
  const fightPropMap = raw.fightPropMap as Record<string, number> | undefined
  const skillLevelMap = (raw.skillLevelMap as { skillLevelMap?: Record<string, number> } | undefined)
    ?.skillLevelMap

  // Character level lives at propMap["4001"].val
  const levelStr = propMap?.['4001']?.val ?? '1'
  const ascensionStr = propMap?.['1002']?.val ?? '0'
  const level = parseInt(levelStr, 10) || 1
  const ascensionStage = parseInt(ascensionStr, 10) || ascensionFromLevel(level)

  const finalHp = n(fightPropMap, FP.CUR_HP_MAX)
  const finalAtk = n(fightPropMap, FP.CUR_ATTACK)
  const finalDef = n(fightPropMap, FP.CUR_DEFENSE)
  const baseHp = n(fightPropMap, FP.BASE_HP)
  const baseAtk = n(fightPropMap, FP.ATTACK)
  const baseDef = n(fightPropMap, FP.DEFENSE)
  const em = n(fightPropMap, FP.ELEMENT_MASTERY)
  const critRate = n(fightPropMap, FP.CRIT_RATE) * 100
  const critDmg = n(fightPropMap, FP.CRIT_DMG) * 100
  const er = n(fightPropMap, FP.ENERGY_RECHARGE) * 100

  const elementalDmg: Partial<Record<DamageElement, number>> = {
    Pyro: n(fightPropMap, FP.PYRO_DMG) * 100,
    Hydro: n(fightPropMap, FP.HYDRO_DMG) * 100,
    Cryo: n(fightPropMap, FP.CRYO_DMG) * 100,
    Electro: n(fightPropMap, FP.ELECTRO_DMG) * 100,
    Anemo: n(fightPropMap, FP.ANEMO_DMG) * 100,
    Geo: n(fightPropMap, FP.GEO_DMG) * 100,
    Dendro: n(fightPropMap, FP.DENDRO_DMG) * 100,
  }
  const physicalDmg = n(fightPropMap, FP.PHYSICAL_DMG) * 100

  // Skill levels — find auto/skill/burst by inferring from the keys.
  // Each character has 3 main skill ids (sorted by definition order in ambr).
  // We grab the first three from skillLevelMap as auto/skill/burst.
  const skillIds = skillLevelMap ? Object.keys(skillLevelMap).sort() : []
  const talentLevels = {
    auto: skillIds[0] ? skillLevelMap![skillIds[0]] : 1,
    skill: skillIds[1] ? skillLevelMap![skillIds[1]] : 1,
    burst: skillIds[2] ? skillLevelMap![skillIds[2]] : 1,
  }

  return {
    characterId: avatarId,
    characterLevel: level,
    ascensionStage,
    finalHp,
    finalAtk,
    finalDef,
    baseHp,
    baseAtk,
    baseDef,
    em,
    critRate,
    critDmg,
    er,
    elementalDmg,
    physicalDmg,
    talentLevels,
  }
}

const CACHE_KEY = 'specular-enka-cache'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min, regardless of API's longer ttl

function readCache(uid: string): ImportResult | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${uid}`)
    if (!raw) return null
    const obj = JSON.parse(raw) as ImportResult
    if (Date.now() - obj.fetchedAt > CACHE_TTL_MS) return null
    return obj
  } catch {
    return null
  }
}

function writeCache(uid: string, result: ImportResult) {
  try {
    localStorage.setItem(`${CACHE_KEY}:${uid}`, JSON.stringify(result))
  } catch {
    // Quota exceeded etc — ignore.
  }
}

/** Fetch player showcase from Enka.Network with localStorage caching. */
export async function fetchEnkaUid(uid: string): Promise<ImportResult> {
  const cached = readCache(uid)
  if (cached) return cached

  const url = `${ENKA_BASE}/${encodeURIComponent(uid)}`
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 404) throw new Error('UID not found (404)')
    if (res.status === 424) throw new Error('Account exists but no public characters (424)')
    if (res.status === 429) throw new Error('Rate-limited, try again in a minute (429)')
    throw new Error(`Enka HTTP ${res.status}`)
  }
  const body = await res.json()

  const playerInfo = body.playerInfo ?? {}
  const avatarInfoList = (body.avatarInfoList ?? []) as Array<Record<string, unknown>>
  const builds = avatarInfoList.map(parseAvatar).filter((b): b is ImportedBuild => b !== null)

  const result: ImportResult = {
    uid: body.uid ?? uid,
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
