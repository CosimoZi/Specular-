// Bridge from our CharacterConfig to GenshinOptimizer's Pando calculator.
// Feeds full equipment (character + weapon + 5 artifacts) so damage numbers
// are real, not just panel-baseline.

import type { ICharacter, IWeapon } from '@genshin-optimizer/gi/good'
import {
  charData,
  teamData,
  withMember,
  ownBuff,
  enemyDebuff,
  own,
  userBuff,
  weaponData,
  artifactsData,
  type TagMapNodeEntries,
  genshinCalculatorWithEntries,
} from '@genshin-optimizer/gi/formula'
import type { CharacterConfig } from '@/data/config-types'
import {
  configToGoCharacter,
  weaponConfigToGoWeapon,
  artifactPieceToGoArtifact,
  goCharacterKey,
  goArtifactSetKey,
} from './good-adapter'

const MAIN_KEY_MAP: Record<string, string> = {
  hpFlat: 'hp', atkFlat: 'atk',
  hpPct: 'hp_', atkPct: 'atk_', defPct: 'def_',
  em: 'eleMas', er: 'enerRech_',
  critRate: 'critRate_', critDmg: 'critDMG_',
  healingBonus: 'heal_',
  pyroDmg: 'pyro_dmg_', hydroDmg: 'hydro_dmg_', cryoDmg: 'cryo_dmg_',
  electroDmg: 'electro_dmg_', anemoDmg: 'anemo_dmg_', geoDmg: 'geo_dmg_',
  dendroDmg: 'dendro_dmg_', physicalDmg: 'physical_dmg_',
}
const SUB_KEY_MAP: Record<string, string> = { ...MAIN_KEY_MAP, defFlat: 'def' }

/** Per-piece aggregated stats for GO Pando — flattens main + 4 substats. */
function pieceToFeed(piece: NonNullable<CharacterConfig['artifacts']['flower']>): {
  set: string
  stats: Array<{ key: string; value: number }>
} | null {
  const setKey = goArtifactSetKey(piece.setId)
  if (!setKey) return null
  const stats: Array<{ key: string; value: number }> = []
  // Main stat: GO expects mainStatValue at the piece's level. We pass the
  // displayed final value here using a known per-rarity table. For now,
  // approximate by using the table value at piece.level (lvl 20 for 5*).
  const mainGoKey = MAIN_KEY_MAP[piece.mainStat]
  if (mainGoKey) {
    // GO Pando stores percent stats as decimals internally (0.466 for 46.6%).
    // Flat values (HP, ATK, DEF, EM) are absolute numbers.
    const MAX_5: Record<string, number> = {
      hp: 4780, atk: 311,
      hp_: 0.466, atk_: 0.466, def_: 0.583,
      eleMas: 187, enerRech_: 0.518,
      critRate_: 0.311, critDMG_: 0.622, heal_: 0.359,
      pyro_dmg_: 0.466, hydro_dmg_: 0.466, cryo_dmg_: 0.466,
      electro_dmg_: 0.466, anemo_dmg_: 0.466, geo_dmg_: 0.466,
      dendro_dmg_: 0.466, physical_dmg_: 0.583,
    }
    stats.push({ key: mainGoKey, value: MAX_5[mainGoKey] ?? 0 })
  }
  for (const s of piece.substats) {
    const goKey = SUB_KEY_MAP[s.key]
    if (!goKey) continue
    // Our store already uses decimals for percent stats and raw for flat,
    // matching GO's internal convention.
    stats.push({ key: goKey, value: s.value })
  }
  return { set: setKey, stats }
}

/** Returns the GO character key (e.g. "Mona", "TravelerAnemo") if we have a
 *  mapping for the given internal id; null if unmapped (e.g. brand-new 5.x
 *  characters not yet in GO sheets). */
export function getGoKey(characterId: number | string): string | null {
  return goCharacterKey(characterId)
}

export interface GoComputeResult {
  goKey: string
  /** Whether weapon/artifact data was fed (vs panel-only). */
  fed: { weapon: boolean; artifacts: number }
  /** Map of formula tag name → computed value. */
  values: Record<string, number>
}

/** Compute via GO Pando with the character's full equipment.
 *  Returns null if character isn't in GO sheets. */
export function computeViaGo(config: CharacterConfig): GoComputeResult | null {
  const goChar = configToGoCharacter(config)
  if (!goChar) return null

  const goWep = weaponConfigToGoWeapon(config.weapon, goChar.key)

  const artFeed: Array<{ set: string; stats: Array<{ key: string; value: number }> }> = []
  for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const) {
    const piece = config.artifacts[slot]
    if (!piece) continue
    const f = pieceToFeed(piece)
    if (f) artFeed.push(f)
  }
  void artifactPieceToGoArtifact // kept for GOOD export path

  const memberEntries: TagMapNodeEntries = [
    ...charData(goChar as unknown as ICharacter),
  ]
  if (goWep) memberEntries.push(...weaponData(goWep as unknown as IWeapon))
  if (artFeed.length > 0) {
    memberEntries.push(
      ...artifactsData(artFeed as unknown as Parameters<typeof artifactsData>[0]),
    )
  }

  const data: TagMapNodeEntries = [
    ...teamData(['0']),
    ...withMember('0', ...memberEntries),
    enemyDebuff.common.lvl.add(100),
    enemyDebuff.common.preRes.add(0.1),
    ownBuff.common.critMode.add('avg'),
  ]

  let calc
  try {
    calc = genshinCalculatorWithEntries(data)
  } catch (e) {
    console.warn(`[Specular] GO calc init failed for ${goChar.key}:`, (e as Error).message)
    return null
  }
  const mem = calc.withTag({ src: '0' })

  const formulas = mem.listFormulas(own.listing.formulas)
  const values: Record<string, number> = {}
  for (const f of formulas) {
    const tag = (f as unknown as { tag: { name?: string; q?: string } }).tag
    const name = String(tag?.name ?? tag?.q ?? 'unnamed')
    try {
      const val = mem.compute(f as unknown as Parameters<typeof mem.compute>[0]).val
      if (typeof val === 'number' && Number.isFinite(val)) values[name] = val
    } catch {
      // Some formulas need conditional buffs we haven't set — skip silently
    }
  }
  return {
    goKey: goChar.key,
    fed: { weapon: !!goWep, artifacts: artFeed.length },
    values,
  }
}

// =============================================================================
// Substat marginal value via GO Pando
// =============================================================================

/** One max-roll value for each substat (5* artifact, max tier). Decimals. */
const SUBSTAT_ROLL: Record<string, number> = {
  critRate_: 0.0389,
  critDMG_: 0.0777,
  atk_: 0.0583,
  hp_: 0.0583,
  def_: 0.0729,
  eleMas: 23.31,
  enerRech_: 0.0648,
  atk: 19.45,
  hp: 298.75,
  def: 23.15,
}

export interface SubstatMargin {
  substat: string
  /** Damage delta vs baseline (one designated "target" formula's damage). */
  absoluteDelta: number
  pctDelta: number
}

/** Pick the formula we treat as "main damage" — typically burst, then skill.
 *  Returns the formula name + baseline value. */
function pickMainFormula(values: Record<string, number>): { name: string; value: number } | null {
  // Common keys for damage formulas
  const priority = [
    'burst', 'burst_', 'q_dmg',
    'skill', 'e_dmg',
    'normal0', 'normal1', 'normal2', 'normal3', 'normal4',
  ]
  for (const k of priority) {
    if (values[k] !== undefined && values[k] > 0) return { name: k, value: values[k] }
  }
  // Fallback: largest non-zero damage formula (exclude panel stats)
  const PANEL = new Set(['hp', 'atk', 'def', 'eleMas', 'enerRech_', 'cappedCritRate_', 'critDMG_', 'dmg_', 'heal_'])
  let best: { name: string; value: number } | null = null
  for (const [k, v] of Object.entries(values)) {
    if (PANEL.has(k)) continue
    if (typeof v !== 'number' || v <= 0) continue
    if (!best || v > best.value) best = { name: k, value: v }
  }
  return best
}

/** Compute the GO baseline + perturb one substat at a time to measure margin.
 *  Returns null if the character isn't in GO sheets. */
export function computeSubstatMarginsViaGo(config: CharacterConfig): {
  baselineFormula: string
  baselineValue: number
  margins: SubstatMargin[]
} | null {
  // Get baseline
  const baseline = computeViaGo(config)
  if (!baseline) return null
  const main = pickMainFormula(baseline.values)
  if (!main) return null

  const margins: SubstatMargin[] = []
  for (const [substat, roll] of Object.entries(SUBSTAT_ROLL)) {
    const perturbed = computeViaGoWithExtraStat(config, substat, roll)
    if (!perturbed) continue
    const newVal = perturbed.values[main.name]
    if (newVal === undefined) continue
    const absoluteDelta = newVal - main.value
    margins.push({
      substat,
      absoluteDelta,
      pctDelta: (absoluteDelta / main.value) * 100,
    })
  }
  margins.sort((a, b) => b.absoluteDelta - a.absoluteDelta)
  return {
    baselineFormula: main.name,
    baselineValue: main.value,
    margins,
  }
}

/** Re-run GO compute with one extra stat boost via userBuff.premod.<key>.add(v). */
function computeViaGoWithExtraStat(
  config: CharacterConfig,
  substat: string,
  rollValue: number,
): GoComputeResult | null {
  const goChar = configToGoCharacter(config)
  if (!goChar) return null
  const goWep = weaponConfigToGoWeapon(config.weapon, goChar.key)

  const artFeed: Array<{ set: string; stats: Array<{ key: string; value: number }> }> = []
  for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const) {
    const piece = config.artifacts[slot]
    if (!piece) continue
    const f = pieceToFeed(piece)
    if (f) artFeed.push(f)
  }

  const memberEntries: TagMapNodeEntries = [
    ...charData(goChar as unknown as ICharacter),
  ]
  if (goWep) memberEntries.push(...weaponData(goWep as unknown as IWeapon))
  if (artFeed.length > 0) {
    memberEntries.push(
      ...artifactsData(artFeed as unknown as Parameters<typeof artifactsData>[0]),
    )
  }
  // Inject one extra substat via userBuff
  const userBuffEntry = (userBuff as unknown as { premod: Record<string, { add: (v: number) => unknown }> })
    .premod[substat]
    ?.add(rollValue) as unknown as TagMapNodeEntries[number]
  if (userBuffEntry) memberEntries.push(userBuffEntry)

  const data: TagMapNodeEntries = [
    ...teamData(['0']),
    ...withMember('0', ...memberEntries),
    enemyDebuff.common.lvl.add(100),
    enemyDebuff.common.preRes.add(0.1),
    ownBuff.common.critMode.add('avg'),
  ]

  let calc
  try {
    calc = genshinCalculatorWithEntries(data)
  } catch {
    return null
  }
  const mem = calc.withTag({ src: '0' })
  const formulas = mem.listFormulas(own.listing.formulas)
  const values: Record<string, number> = {}
  for (const f of formulas) {
    const tag = (f as unknown as { tag: { name?: string; q?: string } }).tag
    const name = String(tag?.name ?? tag?.q ?? 'unnamed')
    try {
      const val = mem.compute(f as unknown as Parameters<typeof mem.compute>[0]).val
      if (typeof val === 'number' && Number.isFinite(val)) values[name] = val
    } catch { /* skip */ }
  }
  return {
    goKey: goChar.key,
    fed: { weapon: !!goWep, artifacts: artFeed.length },
    values,
  }
}
