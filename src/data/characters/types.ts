// Character definition system.
//
// A character is defined by TWO things:
//   1. AUTO-EXTRACTED GAME DATA (from genshin-db; one JSON per character at
//      src/data/gdb/<id>.json). This is the source of truth for descriptions,
//      per-level scaling parameters, etc.
//   2. ENGINE SEMANTICS (hand-authored TS file at src/data/characters/<id>.ts).
//      This declares which talent params map to which zones in the damage
//      formula, and any constellation effects that need to be modelled.
//
// Each character exports a `CharacterDefinition`. The team resolver collects
// definitions for characters in the team and aggregates their buffs.

import type { DamageElement } from '@/engine/types'
import type { CharacterConfig } from '@/data/config-types'

// ----------------------------------------------------------------------------
// Game-data slice (mirror of src/data/gdb/*.json structure)
// ----------------------------------------------------------------------------

export interface GdbI18nText {
  en: string | null
  zh: string | null
}

export interface GdbTalent {
  name: GdbI18nText
  description: GdbI18nText
  /** From genshin-db: { labels: [...], parameters: { param1: [..15], param2: [..15], ... } } */
  attributes: {
    labels: string[]
    parameters: Record<string, number[]>
  } | null
}

export interface GdbConst {
  name: GdbI18nText
  description: GdbI18nText
}

export interface GdbCharacter {
  id: number
  name: GdbI18nText
  title: GdbI18nText
  element: string // ELEMENT_HYDRO etc.
  weaponType: string
  rarity: string
  substatType: string
  version: string
  talents: {
    combat1?: GdbTalent
    combat2?: GdbTalent
    combatsp?: GdbTalent
    combat3?: GdbTalent
    passive1?: GdbTalent
    passive2?: GdbTalent
    passive3?: GdbTalent
    passive4?: GdbTalent
  } | null
  constellations: {
    c1?: GdbConst
    c2?: GdbConst
    c3?: GdbConst
    c4?: GdbConst
    c5?: GdbConst
    c6?: GdbConst
  } | null
}

// ----------------------------------------------------------------------------
// Engine semantics — what a hand-authored character file declares
// ----------------------------------------------------------------------------

/** Damage formula multiplier zones. */
export type DmgZone =
  | 'baseAtkFlat' | 'baseAtkPct'
  | 'baseHpFlat' | 'baseHpPct'
  | 'baseDefFlat' | 'baseDefPct'
  | 'em' | 'er'
  | 'dmgBonusAll' | 'dmgBonusElement' | 'dmgBonusHitType'
  | 'critRate' | 'critDmg'
  | 'reactionBonus' // applied inside the (1 + EM_curve + reactionBonus) bracket
  | 'resShred' | 'defIgnore' | 'defShred'
  | 'additiveFlat' // added inside the base zone (catalyze, Shenhe-style)
  | 'lunarDmgBonus' // new in 5.x

export type HitType = 'normal' | 'charged' | 'plunge' | 'skill' | 'burst'

/** A part of a buff effect. Conditions are optional and mostly real game
 *  mechanics (element-gated, reaction-gated, talent-level-gated). */
export interface BuffPart {
  zone: DmgZone
  value: number
  /** Element gate — only applies to hits of this element. */
  element?: DamageElement
  /** Hit-type gate — only certain attack categories. */
  hitType?: HitType[]
  /** Reaction-kind gate — only when the receiver triggers this reaction. */
  reactionKind?: Array<'vape' | 'melt' | 'aggravate' | 'spread' | 'swirl' | 'electrocharged' | 'superconduct' | 'overload' | 'bloom' | 'hyperbloom' | 'burgeon' | 'burning' | 'shatter' | 'lunarcharged' | 'lunarbloom' | 'lunarcrystallize'>
  /** Swirl-element gate (for buffs that scope to a specific swirled element). */
  swirlElement?: 'Pyro' | 'Hydro' | 'Cryo' | 'Electro'
  /** When true, the buff applies only when source character == receiver. */
  selfOnly?: boolean
}

/** Whether the buff sums into the receiver's "panel" stats or only at hit time. */
export type BuffStage = 'panel-constant' | 'panel-variable' | 'non-panel'

export interface BuffMethod {
  /** Stable id used for toggle persistence. */
  id: string
  /** Display label. Either explicit, or read from gdb (talent / constellation key). */
  label?: GdbI18nText
  labelFromTalent?: 'combat1' | 'combat2' | 'combat3' | 'passive1' | 'passive2' | 'passive3' | 'passive4'
  labelFromConstellation?: 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6'
  /** Long-form description (mirrors label source if omitted). */
  description?: GdbI18nText
  /** Stage in the team resolver. Defaults to 'non-panel' if unspecified. */
  stage?: BuffStage
  defaultOn: boolean
  requires?: {
    minConstellation?: number
    minTalent?: { role: 'auto' | 'skill' | 'burst'; lvl: number }
  }
  /** Compute returns the BuffParts this buff contributes. Receives the source
   *  character's resolved state. Variable buffs may also receive `ctx` to read
   *  other characters' panels (added later). */
  compute(self: ResolvedCharacter): BuffPart[]
}

/** A character at resolve-time — has config (level/asc/const/talent/weapon/arts)
 *  + (after panel resolution) a `panel` snapshot. */
export interface ResolvedCharacter {
  id: number
  config: CharacterConfig
  /** The genshin-db source data for this character (descriptions, scaling tables). */
  gdb: GdbCharacter
  /** Resolved final panel — filled in by the team resolver after stages.
   *  May be `null` before resolution. */
  panel: null | {
    hp: number; atk: number; def: number
    em: number; er: number
    critRate: number; critDmg: number
    elementalDmg: Partial<Record<DamageElement, number>>
  }
}

export interface CharacterDefinition {
  id: number
  /** The auto-extracted game data slice. Imported from src/data/gdb/<id>.json. */
  gdb: GdbCharacter
  /** Buffs this character provides. */
  buffs: BuffMethod[]
}
