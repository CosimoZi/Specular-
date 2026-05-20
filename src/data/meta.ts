import metaSummary from './index/meta-summary.json'
import type { DamageElement, StatBag } from '@/engine/types'

export interface ExtractedHit {
  label: string
  paramIndex: number
  scaling: 'atk' | 'hp' | 'def' | 'em'
  element: DamageElement
  hitType: 'normal' | 'charged' | 'plunge' | 'skill' | 'burst'
}

export interface ExtractedTalent {
  name: string
  skillId: number
  type: number
  role: 'normal' | 'skill' | 'burst'
  cooldown: number | null
  cost: number | null
  levels: number[]
  hits: ExtractedHit[]
  multByLevel: Record<string, Record<string, number>>
}

export interface CharacterMeta {
  id: number
  name: string
  rank: 4 | 5
  element: string
  weaponType: string
  specialProp: string
  icon: string
  curve: Record<string, { initValue: number; curve: string }>
  ascensionStat: { propType: string; value: number } | null
  ascensionStages: Array<{
    stage: number
    unlockMaxLevel: number
    addProps: Record<string, number>
  }>
  talents: {
    auto?: ExtractedTalent
    skill?: ExtractedTalent
    burst?: ExtractedTalent
  }
  _stats: {
    autoHits: number
    skillHits: number
    burstHits: number
    totalHits: number
  }
}

export interface MetaSummaryEntry {
  id: number
  name: string
  stats: {
    autoHits: number
    skillHits: number
    burstHits: number
    totalHits: number
  }
  has: { auto: boolean; skill: boolean; burst: boolean }
}

export const META_SUMMARY = metaSummary as unknown as Record<string, MetaSummaryEntry>

const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
const cache = new Map<string, CharacterMeta>()

/** Eager-load meta for a character. Note: meta files are stored under
 *  src/data/meta/ and are NOT in the bundle by default — we copy them via
 *  the build script into public/data/meta/, then fetch. */
export async function loadCharacterMeta(id: number | string): Promise<CharacterMeta> {
  const k = String(id)
  if (cache.has(k)) return cache.get(k)!
  const res = await fetch(`${base}data/meta/${k}.json`)
  if (!res.ok) throw new Error(`meta ${k}: HTTP ${res.status}`)
  const data = (await res.json()) as CharacterMeta
  cache.set(k, data)
  return data
}

/** Compute multipliers for a hit at a given talent level. */
export function hitMultiplier(
  talent: ExtractedTalent,
  hit: ExtractedHit,
  level: number,
): number | null {
  // Clamp level to available range
  const lvls = talent.levels
  const lo = lvls[0]
  const hi = lvls[lvls.length - 1]
  const clamped = Math.min(hi, Math.max(lo, level))
  const row = talent.multByLevel[String(clamped)]
  if (!row) return null
  return row[String(hit.paramIndex)] ?? null
}

/** Map ambr's specialProp to a StatBag bonus from ascension. */
export function ascensionBonusToStatBag(
  propType: string,
  value: number,
): StatBag {
  switch (propType) {
    case 'FIGHT_PROP_ATTACK_PERCENT':
      return { atkPct: value }
    case 'FIGHT_PROP_HP_PERCENT':
      return { hpPct: value }
    case 'FIGHT_PROP_DEFENSE_PERCENT':
      return { defPct: value }
    case 'FIGHT_PROP_CRITICAL':
      return { critRate: value }
    case 'FIGHT_PROP_CRITICAL_HURT':
      return { critDmg: value }
    case 'FIGHT_PROP_CHARGE_EFFICIENCY':
      return { er: value }
    case 'FIGHT_PROP_ELEMENT_MASTERY':
      return { em: value }
    case 'FIGHT_PROP_FIRE_ADD_HURT':
      return { pyroDmg: value }
    case 'FIGHT_PROP_WATER_ADD_HURT':
      return { hydroDmg: value }
    case 'FIGHT_PROP_ICE_ADD_HURT':
      return { cryoDmg: value }
    case 'FIGHT_PROP_ELEC_ADD_HURT':
      return { electroDmg: value }
    case 'FIGHT_PROP_WIND_ADD_HURT':
      return { anemoDmg: value }
    case 'FIGHT_PROP_ROCK_ADD_HURT':
      return { geoDmg: value }
    case 'FIGHT_PROP_GRASS_ADD_HURT':
      return { dendroDmg: value }
    case 'FIGHT_PROP_PHYSICAL_ADD_HURT':
      return { physicalDmg: value }
    case 'FIGHT_PROP_HEAL_ADD':
      return { healingBonus: value }
    default:
      return {}
  }
}

/** ambr's element keys → engine's DamageElement. */
export function normalizeElement(ambrElement: string): DamageElement {
  const m: Record<string, DamageElement> = {
    Pyro: 'Pyro',
    Fire: 'Pyro',
    Hydro: 'Hydro',
    Water: 'Hydro',
    Cryo: 'Cryo',
    Ice: 'Cryo',
    Electro: 'Electro',
    Electric: 'Electro',
    Anemo: 'Anemo',
    Wind: 'Anemo',
    Geo: 'Geo',
    Rock: 'Geo',
    Dendro: 'Dendro',
    Grass: 'Dendro',
  }
  return m[ambrElement] ?? 'Physical'
}
