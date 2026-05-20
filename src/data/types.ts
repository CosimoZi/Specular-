// Domain types for ambr.top / gi.yatta.moe data we pull in scripts/fetch-data.mjs.
// The slim index entries (src/data/index/*.json) are typed precisely; detail
// payloads (public/data/*/<id>.json) are loose by design — fields we actually
// need get pulled into computed types as the engine grows.

export type Element =
  | 'Pyro'
  | 'Hydro'
  | 'Cryo'
  | 'Electric' // ambr uses "Electric" not "Electro"
  | 'Anemo'
  | 'Geo'
  | 'Grass' // ambr uses "Grass" not "Dendro"
  | 'Wind' // sometimes appears alongside Anemo? double-check
  | 'Rock'
  | 'Ice'
  | 'Water'
  | 'Fire'
  | 'None'

export type WeaponType =
  | 'WEAPON_SWORD_ONE_HAND'
  | 'WEAPON_CLAYMORE'
  | 'WEAPON_POLE'
  | 'WEAPON_BOW'
  | 'WEAPON_CATALYST'

export const WEAPON_TYPE_LABEL: Record<WeaponType, string> = {
  WEAPON_SWORD_ONE_HAND: '单手剑',
  WEAPON_CLAYMORE: '双手剑',
  WEAPON_POLE: '长柄武器',
  WEAPON_BOW: '弓',
  WEAPON_CATALYST: '法器',
}

// ambr uses element keys that don't quite match the in-game names players know.
// Normalise both for display and for use in the damage engine.
export const ELEMENT_LABEL: Record<string, string> = {
  Pyro: '火',
  Hydro: '水',
  Cryo: '冰',
  Electric: '雷',
  Electro: '雷',
  Anemo: '风',
  Wind: '风',
  Geo: '岩',
  Rock: '岩',
  Grass: '草',
  Dendro: '草',
  Ice: '冰',
  Water: '水',
  Fire: '火',
  None: '无',
}

export const ELEMENT_COLOR: Record<string, string> = {
  Pyro: '#ff6b3d',
  Fire: '#ff6b3d',
  Hydro: '#4cc2f1',
  Water: '#4cc2f1',
  Cryo: '#9fd6e3',
  Ice: '#9fd6e3',
  Electric: '#b08cff',
  Electro: '#b08cff',
  Anemo: '#74c2a8',
  Wind: '#74c2a8',
  Geo: '#f7a824',
  Rock: '#f7a824',
  Grass: '#a5c83b',
  Dendro: '#a5c83b',
  None: '#888888',
}

/** Stat key used everywhere in ambr (matches in-game FIGHT_PROP_*). */
export type FightProp = string

export interface CharacterIndexEntry {
  id: number
  name: string
  rank: 4 | 5
  element: Element
  weaponType: WeaponType
  region: string
  specialProp: FightProp
  icon: string
  release: number // unix seconds
  route: string
}

export interface WeaponIndexEntry {
  id: number
  name: string
  rank: 1 | 2 | 3 | 4 | 5
  type: WeaponType
  specialProp: FightProp | null
  icon: string
  route: string
}

export interface ArtifactSetIndexEntry {
  id: number
  name: string
  levelList: number[] // rarities the set ships in
  affixList: number[] // affix ids (2pc, 4pc)
  icon: string
  sortOrder: number
  route: string
}

export interface IndexFile<T> {
  props: Record<string, string>
  types: Record<string, unknown>
  items: Record<string, T>
}

/** Loose detail payload — refine as we consume more fields. */
export interface CharacterDetail {
  id: number
  name: string
  rank: 4 | 5
  element: Element
  weaponType: WeaponType
  specialProp: FightProp
  icon: string
  fetter?: Record<string, unknown>
  upgrade: {
    prop: Array<{ propType: FightProp; initValue: number; type: string }>
    promote: Array<{
      promoteLevel: number
      unlockMaxLevel: number
      addProps?: Record<FightProp, number>
      requiredPlayerLevel?: number
      costItems?: Record<string, number>
      coinCost?: number
    }>
  }
  talent: Record<
    string,
    {
      skillId: number
      type: number // 0=skill/auto, 1=burst, 2=passive
      name: string
      description: string
      icon: string
      promote?: Record<
        string,
        { level: number; description: string[]; params: number[] }
      >
      cooldown?: number
      cost?: number
      advancedProps?: Array<{
        name: string
        elementalGaugeTheory?: string
        [k: string]: unknown
      }>
    }
  >
  constellation: Record<
    string,
    {
      id: number
      talentId: number
      name: string
      description: string
      icon: string
    }
  >
  [extra: string]: unknown
}

export interface WeaponDetail {
  id: number
  name: string
  rank: number
  type: WeaponType
  icon: string
  upgrade?: {
    prop: Array<{ propType: FightProp; initValue: number; type: string }>
    promote: Array<unknown>
  }
  affix?: Record<string, { name: string; upgrade: Record<string, string> }>
  [extra: string]: unknown
}

export interface ArtifactSetDetail {
  id: number
  name: string
  affixList: Array<{ name: string; description: string; needCount?: number }>
  suit: Record<
    string,
    {
      id: number
      pos: string // EQUIP_BRACER (花), EQUIP_NECKLACE (羽), EQUIP_SHOES (沙漏), EQUIP_RING (杯), EQUIP_DRESS (冠)
      name: string
      description: string
      icon: string
    }
  >
  [extra: string]: unknown
}
