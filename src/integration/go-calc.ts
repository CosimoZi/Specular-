// Bridge from our CharacterConfig (per slot) to GenshinOptimizer's Pando calc.
//
// As of phase 8 (multi-build + cond bridging), this module computes the FULL
// 4-member team into a single `genshinCalculatorWithEntries(...)` invocation
// — so team buffs (4pc artifact set bonuses, weapon team buffs, character
// teamBuff.<path> entries) propagate to the focus member automatically via
// `teamData`. Per-character conditional buffs (Bennett's Q field, Nahida's
// burst-active flag, Furina fanfare stacks, etc.) are pushed in via
// `conditionalData(dst, …)` from a Record-shaped store in TeamConfig.

import type { ICharacter, IWeapon } from '@genshin-optimizer/gi/good'
import {
  charData,
  teamData,
  withMember,
  conditionalData,
  ownBuff,
  enemyDebuff,
  own,
  userBuff,
  weaponData,
  artifactsData,
  type TagMapNodeEntries,
  genshinCalculatorWithEntries,
} from '@genshin-optimizer/gi/formula'
import { extractCondMetadata } from '@genshin-optimizer/game-opt/formula'
import { entries as allEntries } from '@genshin-optimizer/gi/formula'
import { condsFor as newSheetCondsForRaw } from '@/calc/sheets'

/** Bridge from src/calc/sheets/'s CondDef → go-calc's CondInfo shape. */
function newSheetCondsFor(sheetKey: string): CondInfo[] {
  const conds = newSheetCondsForRaw(sheetKey)
  return conds.map((c) => ({
    sheet: sheetKey,
    name: c.name,
    type: c.type,
    int_only: c.intOnly,
    min: c.min,
    max: c.max,
  }))
}
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

export type FormulaMove = 'normal' | 'charged' | 'plunging' | 'skill' | 'burst' | 'panel' | 'reaction' | 'other'

/** Each formula the focus member exposes, with enough tag info to group it
 *  in the UI (普攻 / 重击 / 战技 / etc). */
export interface FormulaResult {
  name: string
  value: number
  move: FormulaMove
  /** Element override when present (e.g. cryo for icy_quill). */
  ele?: string
  /** Reaction name when move = 'reaction' (e.g. 'shattered'). */
  reaction?: string
}

export interface GoComputeResult {
  goKey: string
  /** Whether weapon/artifact data was fed for the focus member. */
  fed: { weapon: boolean; artifacts: number }
  /** Map of formula tag name → computed value (legacy, kept for callers). */
  values: Record<string, number>
  /** All computed formulas with tag metadata for UI grouping. */
  formulas: FormulaResult[]
  /** GO keys of every team slot that successfully fed (in slot order). */
  teamKeys: Array<string | null>
}

// =============================================================================
// Cond registry exposure — for UI to enumerate per-character conditional buffs
// =============================================================================

export type CondType = 'bool' | 'num' | 'list'
export interface CondInfo {
  sheet: string
  name: string
  type: CondType
  int_only?: boolean
  min?: number
  max?: number
}

/** GO's auto-generated stub markers — sheets that haven't had real cond wiring
 *  done. Hide these from the UI; they don't actually buff anything. */
const STUB_COND_NAMES = new Set(['someBoolConditional'])

// Compute cond metadata from the live entries graph at module-load time.
// vendor/go/gi/formula/src/meta.ts is a generator output that drifts every
// time we touch a sheet — extractCondMetadata over the actual entries is
// always in sync.
const condRegistry = extractCondMetadata(
  allEntries as Parameters<typeof extractCondMetadata>[0],
  ({ sheet, q }) => ({ sheet: String(sheet), name: String(q) }),
) as Record<string, Record<string, CondInfo>>

/** List every conditional buff a given GO sheet (character/weapon/artifact)
 *  exposes. Prefers the new src/calc/sheets/ definitions when available;
 *  falls back to the legacy GO vendor cond registry for characters not yet
 *  ported. Filters out stub-only entries that don't actually wire to a buff. */
export function listCondsForSheet(sheetKey: string): CondInfo[] {
  // 1) New src/calc/sheets/ definitions (Shenhe, Linnea, …) take priority.
  const newConds = newSheetCondsFor(sheetKey)
  if (newConds.length > 0) return newConds
  // 2) Legacy vendor/GO registry — for characters / weapons / artifact sets
  // that haven't been ported to src/calc/ yet.
  const reg = condRegistry[sheetKey]
  if (!reg) return []
  return Object.values(reg).filter((c) => !STUB_COND_NAMES.has(c.name))
}

/** Convenience: list conds for a character by their internal id. */
export function listCondsForCharacter(characterId: number | string): CondInfo[] {
  const key = goCharacterKey(characterId)
  if (!key) return []
  return listCondsForSheet(key)
}

// =============================================================================
// Team-shaped compute. condState shape:
//   { [slotIdx 0..3 as string]: { [sheet]: { [condName]: number } } }
// =============================================================================

export interface TeamMemberInput {
  config: CharacterConfig
}

export interface TeamComputeOptions {
  enemyLevel?: number
  /** Pre-mitigation resistance, 0..1. Default 0.1 (10% base res). */
  enemyPreRes?: number
  /** Cond state, nested as slotIdx → sheet → condName → value. */
  condState?: Record<string, Record<string, Record<string, number>>>
  /** For substat-margin compute: which formula's value to measure deltas
   *  against. Default is the auto-picked "main damage" formula. */
  targetFormula?: string
}

const SLOT_KEYS = ['0', '1', '2', '3'] as const

/** Build the full team's TagMapNodeEntries: per-member equipment, team-wide
 *  cond plumbing, and enemy debuffs. Returns null if the focus slot doesn't
 *  resolve to a GO-known character.
 *
 *  members: index → input; null means empty slot.
 *  focusSlotIdx: which slot's `src` view we compute against (0..3).
 */
export function computeTeamViaGo(
  members: Array<TeamMemberInput | null>,
  focusSlotIdx: number,
  opts: TeamComputeOptions = {},
): GoComputeResult | null {
  const focusSlotKey = SLOT_KEYS[focusSlotIdx]
  if (!focusSlotKey) return null

  const presentSlots: string[] = []
  const memberEntries: TagMapNodeEntries = []
  const teamKeys: Array<string | null> = [null, null, null, null]
  let focusGoKey: string | null = null
  let focusFedWeapon = false
  let focusFedArtifacts = 0

  for (let i = 0; i < 4; i++) {
    const m = members[i]
    if (!m) continue
    const goChar = configToGoCharacter(m.config)
    if (!goChar) continue
    const slotKey = SLOT_KEYS[i]
    presentSlots.push(slotKey)
    teamKeys[i] = goChar.key

    const goWep = weaponConfigToGoWeapon(m.config.weapon, goChar.key)
    const artFeed: Array<{ set: string; stats: Array<{ key: string; value: number }> }> = []
    for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const) {
      const piece = m.config.artifacts[slot]
      if (!piece) continue
      const f = pieceToFeed(piece)
      if (f) artFeed.push(f)
    }

    const ent: TagMapNodeEntries = [
      ...charData(goChar as unknown as ICharacter),
    ]
    if (goWep) ent.push(...weaponData(goWep as unknown as IWeapon))
    if (artFeed.length > 0) {
      ent.push(
        ...artifactsData(artFeed as unknown as Parameters<typeof artifactsData>[0]),
      )
    }
    memberEntries.push(...withMember(slotKey, ...ent))

    if (i === focusSlotIdx) {
      focusGoKey = goChar.key
      focusFedWeapon = !!goWep
      focusFedArtifacts = artFeed.length
    }
  }

  if (!focusGoKey || !presentSlots.includes(focusSlotKey)) return null

  // Conditional plumbing — for every dst that's present, push the entire
  // cross-product of (src, sheet, condName, value). Redundant but safe; mirrors
  // the pattern in vendor/go/gi/formula/src/example.test.ts.
  const condEntries: TagMapNodeEntries = []
  if (opts.condState && Object.keys(opts.condState).length > 0) {
    // Filter condState to only present slots, and prune zero-valued conds so
    // the calc isn't bombarded with no-op entries.
    const filtered: Record<string, Record<string, Record<string, number>>> = {}
    for (const [srcSlot, sheets] of Object.entries(opts.condState)) {
      if (!presentSlots.includes(srcSlot)) continue
      const sheetsOut: Record<string, Record<string, number>> = {}
      for (const [sheet, names] of Object.entries(sheets)) {
        const namesOut: Record<string, number> = {}
        for (const [n, v] of Object.entries(names)) {
          if (typeof v === 'number' && v !== 0) namesOut[n] = v
        }
        if (Object.keys(namesOut).length > 0) sheetsOut[sheet] = namesOut
      }
      if (Object.keys(sheetsOut).length > 0) filtered[srcSlot] = sheetsOut
    }
    for (const dst of presentSlots) {
      condEntries.push(
        ...conditionalData(
          dst as Parameters<typeof conditionalData>[0],
          filtered as Parameters<typeof conditionalData>[1],
        ),
      )
    }
  }

  const data: TagMapNodeEntries = [
    ...teamData(presentSlots as unknown as Parameters<typeof teamData>[0]),
    ...memberEntries,
    ...condEntries,
    enemyDebuff.common.lvl.add(opts.enemyLevel ?? 100),
    enemyDebuff.common.preRes.add(opts.enemyPreRes ?? 0.1),
    ownBuff.common.critMode.add('avg'),
  ]

  let calc
  try {
    calc = genshinCalculatorWithEntries(data)
  } catch (e) {
    console.warn(`[Specular] GO team calc init failed for ${focusGoKey}:`, (e as Error).message)
    return null
  }
  const mem = calc.withTag({ src: focusSlotKey })
  const formulaList = mem.listFormulas(own.listing.formulas)
  const values: Record<string, number> = {}
  const formulas: FormulaResult[] = []
  for (const f of formulaList) {
    const tag = (f as unknown as {
      tag: { name?: string; q?: string; move?: string; ele?: string; trans?: string }
    }).tag
    const name = String(tag?.name ?? tag?.q ?? 'unnamed')
    try {
      const val = mem.compute(f as unknown as Parameters<typeof mem.compute>[0]).val
      if (typeof val !== 'number' || !Number.isFinite(val)) continue
      values[name] = val
      formulas.push({
        name,
        value: val,
        move: classifyFormula(tag),
        ele: tag.ele,
        reaction: tag.trans,
      })
    } catch {
      // Some formulas need conditional buffs we haven't set — skip silently
    }
  }
  return {
    goKey: focusGoKey,
    fed: { weapon: focusFedWeapon, artifacts: focusFedArtifacts },
    values,
    formulas,
    teamKeys,
  }
}

/** Bucket a formula's tag into a UI-friendly move category. */
function classifyFormula(tag: { q?: string; move?: string; trans?: string }): FormulaMove {
  if (tag.q === 'trans') return 'reaction'
  if (tag.move === 'normal') return 'normal'
  if (tag.move === 'charged') return 'charged'
  if (tag.move === 'plunging') return 'plunging'
  if (tag.move === 'skill') return 'skill'
  if (tag.move === 'burst') return 'burst'
  // Panel stats (hp/atk/def/eleMas/cappedCritRate_/critDMG_/dmg_/heal_) have
  // qt='final' or qt='common' and no 'move', so they fall through to 'other'.
  // We tag them 'panel' so the UI can group them at the top.
  const PANEL_QS = new Set(['hp', 'atk', 'def', 'eleMas', 'enerRech_', 'cappedCritRate_', 'critDMG_', 'dmg_', 'heal_'])
  if (tag.q && PANEL_QS.has(tag.q)) return 'panel'
  return 'other'
}

/** Single-character compute — kept for backwards compat with the substat
 *  marginal-value flow. Internally delegates to computeTeamViaGo with a
 *  one-member array. */
export function computeViaGo(config: CharacterConfig): GoComputeResult | null {
  return computeTeamViaGo([{ config }, null, null, null], 0)
}

// =============================================================================
// Substat marginal value via GO Pando
// =============================================================================

/** One median-tier roll value for each substat (5★ artifact). Genshin
 *  substats roll across 4 uniform tiers (T1..T4); we use the average
 *  (T1+T4)/2 here as the "typical" roll — that's what most community
 *  calculators show for "+1 roll" marginal-value analysis, since assuming
 *  every roll lands at max overstates the gain. */
const SUBSTAT_ROLL: Record<string, number> = {
  critRate_: 0.033055,   // (2.72 + 3.89) / 2
  critDMG_: 0.06605,     // (5.44 + 7.77) / 2
  atk_: 0.04955,         // (4.08 + 5.83) / 2
  hp_: 0.04955,
  def_: 0.061945,        // (5.10 + 7.29) / 2
  eleMas: 19.815,        // (16.32 + 23.31) / 2
  enerRech_: 0.05505,    // (4.53 + 6.48) / 2
  atk: 16.535,           // (13.62 + 19.45) / 2
  hp: 253.94,            // (209.13 + 298.75) / 2
  def: 19.675,           // (16.20 + 23.15) / 2
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

interface SubstatMarginResult {
  baselineFormula: string
  baselineValue: number
  margins: SubstatMargin[]
}

/** Compute the GO baseline + perturb one substat at a time to measure margin.
 *  Returns null if the focus character isn't in GO sheets.
 *
 *  Two call shapes:
 *    1. Single character (backward-compat): pass a CharacterConfig directly.
 *    2. Full team context: pass (members, focusSlotIdx, opts) so the marginal
 *       value reflects team buffs (e.g. Bennett's ATK% boost makes flat ATK
 *       rolls worth less, %ATK rolls worth more). */
export function computeSubstatMarginsViaGo(
  config: CharacterConfig,
): SubstatMarginResult | null
export function computeSubstatMarginsViaGo(
  members: Array<TeamMemberInput | null>,
  focusSlotIdx: number,
  opts?: TeamComputeOptions,
): SubstatMarginResult | null
export function computeSubstatMarginsViaGo(
  configOrMembers: CharacterConfig | Array<TeamMemberInput | null>,
  focusSlotIdx?: number,
  opts?: TeamComputeOptions,
): SubstatMarginResult | null {
  // Normalise to the team shape.
  let members: Array<TeamMemberInput | null>
  let focus: number
  let teamOpts: TeamComputeOptions
  if (Array.isArray(configOrMembers)) {
    members = configOrMembers
    focus = focusSlotIdx ?? 0
    teamOpts = opts ?? {}
  } else {
    members = [{ config: configOrMembers }, null, null, null]
    focus = 0
    teamOpts = {}
  }
  // Get baseline
  const baseline = computeTeamViaGo(members, focus, teamOpts)
  if (!baseline) return null
  // Use the explicit target formula if the caller specified one; otherwise
  // fall back to auto-picking the "main damage" formula. Either way we need
  // a formula whose value is positive in the baseline so the delta is meaningful.
  let main: { name: string; value: number } | null = null
  if (teamOpts.targetFormula && baseline.values[teamOpts.targetFormula] != null) {
    main = { name: teamOpts.targetFormula, value: baseline.values[teamOpts.targetFormula] }
  }
  if (!main || main.value <= 0) main = pickMainFormula(baseline.values)
  if (!main) return null

  const margins: SubstatMargin[] = []
  for (const [substat, roll] of Object.entries(SUBSTAT_ROLL)) {
    const perturbed = computeTeamViaGoWithExtraStat(members, focus, substat, roll, teamOpts)
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

/** Re-run team compute with one extra stat boost on the focus member via
 *  userBuff.premod.<key>.add(v) inside that member's withMember block. */
function computeTeamViaGoWithExtraStat(
  members: Array<TeamMemberInput | null>,
  focusSlotIdx: number,
  substat: string,
  rollValue: number,
  opts: TeamComputeOptions,
): GoComputeResult | null {
  const focusSlotKey = SLOT_KEYS[focusSlotIdx]
  if (!focusSlotKey) return null
  const focusInput = members[focusSlotIdx]
  if (!focusInput) return null

  const presentSlots: string[] = []
  const memberEntries: TagMapNodeEntries = []
  const teamKeys: Array<string | null> = [null, null, null, null]
  let focusGoKey: string | null = null
  let focusFedWeapon = false
  let focusFedArtifacts = 0

  for (let i = 0; i < 4; i++) {
    const m = members[i]
    if (!m) continue
    const goChar = configToGoCharacter(m.config)
    if (!goChar) continue
    const slotKey = SLOT_KEYS[i]
    presentSlots.push(slotKey)
    teamKeys[i] = goChar.key

    const goWep = weaponConfigToGoWeapon(m.config.weapon, goChar.key)
    const artFeed: Array<{ set: string; stats: Array<{ key: string; value: number }> }> = []
    for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const) {
      const piece = m.config.artifacts[slot]
      if (!piece) continue
      const f = pieceToFeed(piece)
      if (f) artFeed.push(f)
    }

    const ent: TagMapNodeEntries = [
      ...charData(goChar as unknown as ICharacter),
    ]
    if (goWep) ent.push(...weaponData(goWep as unknown as IWeapon))
    if (artFeed.length > 0) {
      ent.push(
        ...artifactsData(artFeed as unknown as Parameters<typeof artifactsData>[0]),
      )
    }

    // Inject the extra substat ONLY on the focus member's entries.
    if (i === focusSlotIdx) {
      const userBuffEntry = (userBuff as unknown as { premod: Record<string, { add: (v: number) => unknown }> })
        .premod[substat]
        ?.add(rollValue) as unknown as TagMapNodeEntries[number]
      if (userBuffEntry) ent.push(userBuffEntry)
    }
    memberEntries.push(...withMember(slotKey, ...ent))

    if (i === focusSlotIdx) {
      focusGoKey = goChar.key
      focusFedWeapon = !!goWep
      focusFedArtifacts = artFeed.length
    }
  }
  if (!focusGoKey) return null

  const condEntries: TagMapNodeEntries = []
  if (opts.condState && Object.keys(opts.condState).length > 0) {
    const filtered: Record<string, Record<string, Record<string, number>>> = {}
    for (const [srcSlot, sheets] of Object.entries(opts.condState)) {
      if (!presentSlots.includes(srcSlot)) continue
      const sheetsOut: Record<string, Record<string, number>> = {}
      for (const [sheet, names] of Object.entries(sheets)) {
        const namesOut: Record<string, number> = {}
        for (const [n, v] of Object.entries(names)) {
          if (typeof v === 'number' && v !== 0) namesOut[n] = v
        }
        if (Object.keys(namesOut).length > 0) sheetsOut[sheet] = namesOut
      }
      if (Object.keys(sheetsOut).length > 0) filtered[srcSlot] = sheetsOut
    }
    for (const dst of presentSlots) {
      condEntries.push(
        ...conditionalData(
          dst as Parameters<typeof conditionalData>[0],
          filtered as Parameters<typeof conditionalData>[1],
        ),
      )
    }
  }

  const data: TagMapNodeEntries = [
    ...teamData(presentSlots as unknown as Parameters<typeof teamData>[0]),
    ...memberEntries,
    ...condEntries,
    enemyDebuff.common.lvl.add(opts.enemyLevel ?? 100),
    enemyDebuff.common.preRes.add(opts.enemyPreRes ?? 0.1),
    ownBuff.common.critMode.add('avg'),
  ]

  let calc
  try {
    calc = genshinCalculatorWithEntries(data)
  } catch {
    return null
  }
  const mem = calc.withTag({ src: focusSlotKey })
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
    goKey: focusGoKey,
    fed: { weapon: focusFedWeapon, artifacts: focusFedArtifacts },
    values,
    // Substat-perturbation compute doesn't need the full per-formula tag
    // metadata — pickMainFormula and the margin loop both just read .values.
    formulas: [],
    teamKeys,
  }
}

// Re-export so callers don't need to dip into good-adapter directly.
export { artifactPieceToGoArtifact }
