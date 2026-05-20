// Zone-based buff abstraction. A "buff" in Genshin is a value that lands in
// ONE of the six multiplier zones of the damage formula, optionally gated by
// conditions about the receiver's hit (element, hit type, position).
//
// Formula recap:
//   base       = (atkFlat + atkBase) × (1 + atkPct) + hp/def/em terms
//   dmgBonus   = 1 + sum(matched %DMG bonuses)
//   crit       = 1 + min(CR,1)×CD       (or 1+CD for crit; baseline for avg)
//   reaction   = amp factor × (1 + EM curve + reactionBonus%) | transformative similar
//   addition   = additive flat damage (catalyze, some passives)
//   defM       = (lvl+100) / ((lvl+100) + (enemyLvl+100) × (1 - defRed) × (1 - defIgn))
//   resM       = piecewise of (enemyRes - resShred)
//
//   finalDmg   = (base × dmgBonus + addition) × crit × reaction × defM × resM
//
// Buff parts each carry:
//   • zone:   which slot above the value lands in
//   • value:  the numeric quantity (decimals for percents, raw for flat)
//   • cond:   conditions the receiver/hit must satisfy

import type { DamageElement } from './types'

export type DmgZone =
  // ---- 基础数值区 (base stat zone) ----
  | 'baseAtkFlat' // flat ATK added to base
  | 'baseAtkPct' // % ATK on (charBase + flat)
  | 'baseHpFlat'
  | 'baseHpPct'
  | 'baseDefFlat'
  | 'baseDefPct'
  | 'em' // flat EM
  | 'er' // % ER (above 100%)

  // ---- 直接增伤区 (multiplicative DMG bonus) ----
  | 'dmgBonusAll' // applies to every hit
  | 'dmgBonusElement' // requires cond.element
  | 'dmgBonusHitType' // requires cond.hitType (normal/skill/burst/etc.)

  // ---- 暴击区 ----
  | 'critRate'
  | 'critDmg'

  // ---- 反应区 ----
  | 'reactionBonus' // multiplicative inside (1 + EM-curve + reactionBonus). Optionally gated by cond.reactionKind

  // ---- 目标区 (negative debuff applied on enemy) ----
  | 'resShred' // requires cond.element (or 'physical')
  | 'defIgnore'
  | 'defShred' // enemy DEF reduction (different from defIgnore: applies before, both lower their effective DEF)

  // ---- 加算区 ----
  | 'additiveFlat' // flat damage added inside the dmgBonus bracket (catalyze-style)

export type HitType = 'normal' | 'charged' | 'plunge' | 'skill' | 'burst'
export type ReactionKind = 'vape' | 'melt' | 'aggravate' | 'spread' | 'overload' | 'swirl' | 'electrocharged' | 'superconduct' | 'shatter' | 'burning' | 'bloom' | 'hyperbloom' | 'burgeon'
export type Position = 'frontline' | 'backline' | 'any'

export interface BuffCondition {
  /** Receiver's hit must be this element. Use 'Physical' for physical. */
  element?: DamageElement
  /** Receiver's hit must be one of these types. */
  hitType?: HitType[]
  /** Receiver's character must be in this position. */
  position?: Position
  /** Buff only applies during this reaction kind. */
  reactionKind?: ReactionKind[]
  /** Source character constellation requirement. */
  sourceMinConstellation?: number
  /** Source character talent level requirement. */
  sourceMinTalent?: { role: 'auto' | 'skill' | 'burst'; lvl: number }
  /** Receiver-self only flag — buff applies only when source == receiver. */
  selfOnly?: boolean
}

export interface BuffPart {
  zone: DmgZone
  /** For percent zones, this is a decimal (0.2 = +20%).
   *  For flat zones (baseAtkFlat, em, defFlat etc.), this is the raw number. */
  value: number
  cond?: BuffCondition
}

export interface BuffSpec {
  /** Stable id for the toggle and persistence. */
  id: string
  sourceCharacterId: number
  label: { zh: string; en: string }
  description: { zh: string; en: string }
  parts: BuffPart[]
  /** Optional talent-level scaling for SOME parts: the part's value is taken from
   *  `scaling.table[talentLvl - 1]` instead of the static `parts[i].value`. */
  scaling?: {
    role: 'auto' | 'skill' | 'burst'
    /** 15-entry table indexed by talent level 1..15 (1-based). */
    table: number[]
    /** Indices into `parts` that get their value replaced. */
    appliesToParts: number[]
  }
  /** Top-level requirement gates (visibility). */
  requires?: {
    minConstellation?: number
    minTalent?: { role: 'auto' | 'skill' | 'burst'; lvl: number }
  }
  defaultOn: boolean
}

/** Returns true if `part.cond` is satisfied for the given hit + receiver context. */
export function partMatchesHit(
  part: BuffPart,
  ctx: {
    hitElement: DamageElement
    hitType: HitType | undefined
    receiverPosition: Position
    sourceCharacterId: number
    receiverCharacterId: number | string
    reactionKind?: ReactionKind | 'none'
  },
): boolean {
  const c = part.cond
  if (!c) return true
  if (c.element && c.element !== ctx.hitElement) return false
  if (c.hitType && ctx.hitType && !c.hitType.includes(ctx.hitType)) return false
  if (c.hitType && !ctx.hitType) return false // hit type required but not specified
  if (c.position && c.position !== 'any' && c.position !== ctx.receiverPosition) return false
  if (c.selfOnly && String(ctx.sourceCharacterId) !== String(ctx.receiverCharacterId)) return false
  if (c.reactionKind && c.reactionKind.length > 0) {
    const rk = ctx.reactionKind ?? 'none'
    if (rk === 'none' || !c.reactionKind.includes(rk)) return false
  }
  return true
}

/** Returns the effective value of a part, considering optional talent scaling. */
export function partValue(
  spec: BuffSpec,
  partIndex: number,
  sourceTalentLevels?: { auto: number; skill: number; burst: number },
): number {
  if (!spec.scaling || !spec.scaling.appliesToParts.includes(partIndex)) {
    return spec.parts[partIndex].value
  }
  if (!sourceTalentLevels) return spec.parts[partIndex].value
  const lvl = sourceTalentLevels[spec.scaling.role]
  const idx = Math.max(0, Math.min(spec.scaling.table.length - 1, lvl - 1))
  return spec.scaling.table[idx]
}

/** Aggregated zone-buff vector that the damage path consumes for ONE hit. */
export interface ZoneBuffs {
  baseAtkFlat: number
  baseAtkPct: number
  baseHpFlat: number
  baseHpPct: number
  baseDefFlat: number
  baseDefPct: number
  em: number
  er: number
  dmgBonus: number // sum of all matching dmg bonuses
  critRate: number
  critDmg: number
  reactionBonus: number
  resShred: number // for the hit's element
  defIgnore: number
  defShred: number
  additiveFlat: number
}

export function emptyZones(): ZoneBuffs {
  return {
    baseAtkFlat: 0, baseAtkPct: 0,
    baseHpFlat: 0, baseHpPct: 0,
    baseDefFlat: 0, baseDefPct: 0,
    em: 0, er: 0,
    dmgBonus: 0, critRate: 0, critDmg: 0, reactionBonus: 0,
    resShred: 0, defIgnore: 0, defShred: 0,
    additiveFlat: 0,
  }
}

/** Walk buffs and sum the parts that apply to this hit into a ZoneBuffs. */
export function aggregateZoneBuffs(
  buffs: Array<{ spec: BuffSpec; on: boolean; sourceTalentLevels?: { auto: number; skill: number; burst: number } }>,
  ctx: Parameters<typeof partMatchesHit>[1],
): ZoneBuffs {
  const z = emptyZones()
  for (const b of buffs) {
    if (!b.on) continue
    for (let i = 0; i < b.spec.parts.length; i++) {
      const part = b.spec.parts[i]
      const valueCtx = { ...ctx, sourceCharacterId: b.spec.sourceCharacterId }
      if (!partMatchesHit(part, valueCtx)) continue
      const v = partValue(b.spec, i, b.sourceTalentLevels)
      switch (part.zone) {
        case 'baseAtkFlat': z.baseAtkFlat += v; break
        case 'baseAtkPct': z.baseAtkPct += v; break
        case 'baseHpFlat': z.baseHpFlat += v; break
        case 'baseHpPct': z.baseHpPct += v; break
        case 'baseDefFlat': z.baseDefFlat += v; break
        case 'baseDefPct': z.baseDefPct += v; break
        case 'em': z.em += v; break
        case 'er': z.er += v; break
        case 'dmgBonusAll':
        case 'dmgBonusElement':
        case 'dmgBonusHitType':
          z.dmgBonus += v; break
        case 'critRate': z.critRate += v; break
        case 'critDmg': z.critDmg += v; break
        case 'reactionBonus': z.reactionBonus += v; break
        case 'resShred': z.resShred += v; break
        case 'defIgnore': z.defIgnore += v; break
        case 'defShred': z.defShred += v; break
        case 'additiveFlat': z.additiveFlat += v; break
      }
    }
  }
  return z
}
