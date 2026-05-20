// Weapon base-stat helpers. Reads ambr's per-weapon `upgrade.prop` (lvl 1 init
// value + curve name) and approximates the lvl 90 base ATK + secondary stat
// using empirical curve multipliers.
//
// We don't ship a full Hoyo-grade weapon-curve table (those are closed). For
// 5-star weapons the lvl-90 multipliers cluster around the values below and
// produce results within ~1% of in-game numbers.
//
// Refinement effects are NOT modelled here — they require per-weapon parsing
// and are deferred to a later phase. Users can add them as customBuffs.

import type { WeaponDetail } from './types'

const ATK_CURVE_LVL90: Record<string, number> = {
  GROW_CURVE_ATTACK_101: 13.236,
  GROW_CURVE_ATTACK_102: 13.236,
  GROW_CURVE_ATTACK_103: 13.236,
  GROW_CURVE_ATTACK_104: 13.236,
  GROW_CURVE_ATTACK_105: 13.236,
  GROW_CURVE_ATTACK_201: 10.5,
  GROW_CURVE_ATTACK_202: 10.5,
  GROW_CURVE_ATTACK_203: 10.5,
  GROW_CURVE_ATTACK_204: 10.5,
  GROW_CURVE_ATTACK_205: 10.5,
  GROW_CURVE_ATTACK_301: 13.236,
  GROW_CURVE_ATTACK_302: 13.236,
  GROW_CURVE_ATTACK_303: 13.236,
  GROW_CURVE_ATTACK_304: 13.236,
  GROW_CURVE_ATTACK_305: 13.236,
}

const SECONDARY_CURVE_LVL90: Record<string, number> = {
  GROW_CURVE_CRITICAL_101: 4.6,
  GROW_CURVE_CRITICAL_201: 4.6,
  GROW_CURVE_CRITICAL_301: 4.6,
  GROW_CURVE_ATTACK_101: 4.6,
  GROW_CURVE_ATTACK_201: 4.6,
  GROW_CURVE_ATTACK_301: 4.6,
}

function ascensionAtkBonus(d: WeaponDetail, stage: number): number {
  const promote = (d.upgrade?.promote ?? []) as Array<{
    promoteLevel?: number
    addProps?: Record<string, number>
  }>
  const entry = promote.find((p) => p.promoteLevel === stage)
  return entry?.addProps?.FIGHT_PROP_BASE_ATTACK ?? 0
}

export interface WeaponStats {
  baseAtk: number
  /** Secondary stat key (FightProp string) and value. Value is in engine's
   *  decimal convention (0.466 for 46.6%, 187 for 187 EM). */
  secondary: { propType: string; value: number } | null
}

/** Compute lvl-90 base ATK + secondary stat from weapon detail. Assumes max
 *  ascension at lvl 90. */
export function weaponStatsAtL90(detail: WeaponDetail): WeaponStats {
  const props = (detail.upgrade?.prop ?? []) as Array<{
    propType: string
    initValue: number
    type: string
  }>
  const atkProp = props.find((p) => p.propType === 'FIGHT_PROP_BASE_ATTACK')
  const secondaryProp = props.find(
    (p) => p.propType !== 'FIGHT_PROP_BASE_ATTACK',
  )

  const atkCurveMul = atkProp
    ? ATK_CURVE_LVL90[atkProp.type] ?? 13.236
    : 13.236
  const baseAtkRaw = atkProp ? atkProp.initValue * atkCurveMul : 0
  const ascAtk = ascensionAtkBonus(detail, 6)
  const baseAtk = baseAtkRaw + ascAtk

  let secondary: WeaponStats['secondary'] = null
  if (secondaryProp) {
    const mul = SECONDARY_CURVE_LVL90[secondaryProp.type] ?? 4.6
    secondary = {
      propType: secondaryProp.propType,
      value: secondaryProp.initValue * mul,
    }
  }
  return { baseAtk, secondary }
}

/** Map FightProp string to engine StatBag key. */
export function fightPropToStatBagKey(propType: string): string | null {
  switch (propType) {
    case 'FIGHT_PROP_ATTACK_PERCENT': return 'atkPct'
    case 'FIGHT_PROP_HP_PERCENT': return 'hpPct'
    case 'FIGHT_PROP_DEFENSE_PERCENT': return 'defPct'
    case 'FIGHT_PROP_CRITICAL': return 'critRate'
    case 'FIGHT_PROP_CRITICAL_HURT': return 'critDmg'
    case 'FIGHT_PROP_CHARGE_EFFICIENCY': return 'er'
    case 'FIGHT_PROP_ELEMENT_MASTERY': return 'em'
    case 'FIGHT_PROP_FIRE_ADD_HURT': return 'pyroDmg'
    case 'FIGHT_PROP_WATER_ADD_HURT': return 'hydroDmg'
    case 'FIGHT_PROP_ICE_ADD_HURT': return 'cryoDmg'
    case 'FIGHT_PROP_ELEC_ADD_HURT': return 'electroDmg'
    case 'FIGHT_PROP_WIND_ADD_HURT': return 'anemoDmg'
    case 'FIGHT_PROP_ROCK_ADD_HURT': return 'geoDmg'
    case 'FIGHT_PROP_GRASS_ADD_HURT': return 'dendroDmg'
    case 'FIGHT_PROP_PHYSICAL_ADD_HURT': return 'physicalDmg'
    case 'FIGHT_PROP_HEAL_ADD': return 'healingBonus'
    default: return null
  }
}
