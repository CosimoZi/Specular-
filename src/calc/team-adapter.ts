// Adapter — produces a `GoComputeResult`-shaped object from the new
// src/calc/ pipeline so the existing /team UI can use it with no rendering
// changes.
//
// Today: single-character (focus only). Team buff propagation across
// members is a follow-up — Shenhe's A1/A4 affect other slots, which means
// each member's scope needs to accumulate buffs sourced from teammates'
// sheets. Stub for now.

import type { CharacterConfig } from '@/data/config-types'
import { buildCharacter, MOONSIGN_KEYS } from './build'
import { goCharacterKey, goArtifactSetKey } from '@/integration/good-adapter'
import { characterSheets } from './sheets'
import type { CondState, TeamPanelSnapshot } from './sheet-types'
import { charDataRaw } from './data/curves'

export interface TeamMemberInput {
  config: CharacterConfig
}

export interface TeamComputeOptions {
  enemyLevel?: number
  enemyPreRes?: number
  condState?: Record<string, Record<string, Record<string, number>>>
  /** Per-slot front-line override. Absent slot → default (focus = frontline,
   *  others = backline). */
  slotPosition?: Record<string, 'frontline' | 'backline'>
  /** Substat-margin what-if injection (forwarded to buildCharacter for focus). */
  extraSubstats?: Record<string, number>
  /** When pinning a specific formula for substat-margin compute. */
  targetFormula?: string
}

export interface ComputedFormula {
  name: string
  value: number
  move: 'normal' | 'charged' | 'plunging' | 'skill' | 'burst' | 'panel' | 'reaction' | 'other'
  ele?: string
  reaction?: string
  /** Per-source contribution rows, attached to panel entries only. */
  contributors?: PanelContribution[]
  /** Non-crit / crit variants for damage formulas. Undefined for panel entries. */
  nonCrit?: number
  crit?: number
  /** Per-zone breakdown (base, dmgBonus, critMulti, etc.) for click-to-expand
   *  display. Only populated for damage formulas (not panel entries). */
  breakdown?: import('./formula').FormulaBreakdown
}

export interface PanelContribution {
  source: string
  value: number
  kind: 'base' | 'pct' | 'flat' | 'pure'
}

export interface ComputeResult {
  goKey: string
  fed: { weapon: boolean; artifacts: number }
  values: Record<string, number>
  formulas: ComputedFormula[]
  teamKeys: Array<string | null>
}

/** Returns true if this character is handled by the new pipeline. */
export function hasNewSheet(characterId: number | string): boolean {
  const key = goCharacterKey(characterId)
  return key != null && characterSheets[key] != null
}

export function computeTeamNew(
  members: Array<TeamMemberInput | null>,
  focusSlotIdx: number,
  opts: TeamComputeOptions = {},
): ComputeResult | null {
  const focus = members[focusSlotIdx]
  if (!focus) return null
  const goCharKey = goCharacterKey(focus.config.characterId)
  if (!goCharKey) return null

  // Cond state for the focus slot only.
  const focusCondState: CondState = opts.condState?.[String(focusSlotIdx)] ?? {}

  // Resolve onField for the focus. Default: focus slot is frontline (on-field).
  const explicitPos = opts.slotPosition?.[String(focusSlotIdx)]
  const onField = explicitPos ? explicitPos === 'frontline' : true

  // Count team elements for resonance (any 2+ same-element triggers).
  const teamElementCount: Record<string, number> = {}
  // Count moon-sign team members (≥2 = 月兆·满辉 state).
  let teamMoonsignCount = 0
  for (const m of members) {
    if (!m) continue
    const mGoKey = goCharacterKey(m.config.characterId)
    if (!mGoKey) continue
    const ele = (charDataRaw(mGoKey) as { ele?: string }).ele
    if (ele) teamElementCount[ele] = (teamElementCount[ele] ?? 0) + 1
    if (MOONSIGN_KEYS.has(mGoKey)) teamMoonsignCount++
  }

  // Pass 1: build each teammate's stats independently (no team buffs).
  // Used by Phase 8.4 to compute cross-character buffs (Linnea A4, Columbina C2, etc.).
  const teamPanels: Array<TeamPanelSnapshot | null> = members.map((m, i) => {
    if (!m) return null
    const mGoKey = goCharacterKey(m.config.characterId)
    if (!mGoKey) return null
    const mCondState = opts.condState?.[String(i)] ?? {}
    const mPos = opts.slotPosition?.[String(i)]
    const mOnField = mPos ? mPos === 'frontline' : i === focusSlotIdx
    const r = buildCharacter(m.config, {
      condState: mCondState,
      onField: mOnField,
      teamElementCount,
      teamMoonsignCount,
      // intentionally NOT passing teamPanels here — first pass excludes
      // cross-char buffs so we get baseline stats.
      enemy: {
        level: opts.enemyLevel ?? 100,
        preRes: {},
      },
    })
    // Collect artifact set counts for the teammate's equipped pieces. Used
    // for cross-char artifact buff propagation (NO 4pc, Silken Moons, etc.).
    const tSetCounts: Record<string, number> = {}
    for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const) {
      const piece = m.config.artifacts[slot]
      if (!piece) continue
      const setKey = goArtifactSetKey(piece.setId)
      if (setKey) tSetCounts[setKey] = (tSetCounts[setKey] ?? 0) + 1
    }
    return {
      goKey: mGoKey,
      element: (charDataRaw(mGoKey) as { ele?: string }).ele ?? 'physical',
      level: m.config.level,
      ascension: m.config.ascensionStage,
      constellation: m.config.constellation,
      talents: m.config.talentLevels,
      baseAtk: r.scope.get('base.atk') ?? 0,
      baseHp: r.scope.get('base.hp') ?? 0,
      baseDef: r.scope.get('base.def') ?? 0,
      finalHp: r.panel.finalHp,
      finalAtk: r.panel.finalAtk,
      finalDef: r.panel.finalDef,
      finalEleMas: r.panel.eleMas,
      setCounts: tSetCounts,
    }
  })

  // Pass 2: build focus with cross-character buffs propagated.
  const r = buildCharacter(focus.config, {
    condState: focusCondState,
    onField,
    extraSubstats: opts.extraSubstats,
    teamElementCount,
    teamMoonsignCount,
    teamPanels,
    focusSlotIdx,
    enemy: {
      level: opts.enemyLevel ?? 100,
      preRes: { /* element-wise res defaults to opts.enemyPreRes for all */ },
    },
  })

  // Apply enemy preRes default across elements if the caller passed a flat value.
  if (opts.enemyPreRes !== undefined) {
    // Rebuild with the flat res applied. Cheaper than the alternative
    // (parametrising preRes per element).
    const baseRes = opts.enemyPreRes
    const r2 = buildCharacter(focus.config, {
      condState: focusCondState,
      onField,
      extraSubstats: opts.extraSubstats,
      teamElementCount,
      teamPanels,
      focusSlotIdx,
      enemy: {
        level: opts.enemyLevel ?? 100,
        preRes: {
          pyro: baseRes, hydro: baseRes, cryo: baseRes, electro: baseRes,
          anemo: baseRes, geo: baseRes, dendro: baseRes, physical: baseRes,
        },
      },
    })
    Object.assign(r, r2)
  }

  // Shape into the GO-style result.
  const teamKeys: Array<string | null> = [null, null, null, null]
  for (let i = 0; i < 4; i++) {
    const m = members[i]
    if (!m) continue
    teamKeys[i] = goCharacterKey(m.config.characterId)
  }

  const fed = {
    weapon: focus.config.weapon.weaponId != null,
    artifacts: Object.values(focus.config.artifacts).filter(Boolean).length,
  }

  // Values map — panel stats + formula damage. Keep keys aligned with the old
  // GO output where possible so the UI doesn't care which pipeline produced it.
  const values: Record<string, number> = {
    hp: r.panel.finalHp,
    atk: r.panel.finalAtk,
    def: r.panel.finalDef,
    eleMas: r.panel.eleMas,
    enerRech_: r.panel.enerRech_,
    cappedCritRate_: r.panel.cappedCritRate_,
    critDMG_: r.panel.critDMG_,
    heal_: r.panel.heal_,
    pyro_dmg_: r.panel.dmg_.pyro,
    hydro_dmg_: r.panel.dmg_.hydro,
    cryo_dmg_: r.panel.dmg_.cryo,
    electro_dmg_: r.panel.dmg_.electro,
    anemo_dmg_: r.panel.dmg_.anemo,
    geo_dmg_: r.panel.dmg_.geo,
    dendro_dmg_: r.panel.dmg_.dendro,
    physical_dmg_: r.panel.dmg_.physical,
  }
  for (const f of r.formulas) values[f.name] = f.value

  // Panel formula entries — the UI's FocusDamagePanel groups any `move:'panel'`
  // entries into a header row above the damage groups. Each panel entry
  // carries its per-source breakdown via `contributors`.
  const ct = (key: string) => r.contributions[key] ?? []
  const panel: ComputedFormula[] = [
    { name: 'hp', value: r.panel.finalHp, move: 'panel', contributors: ct('hp') },
    { name: 'atk', value: r.panel.finalAtk, move: 'panel', contributors: ct('atk') },
    { name: 'def', value: r.panel.finalDef, move: 'panel', contributors: ct('def') },
    { name: 'eleMas', value: r.panel.eleMas, move: 'panel', contributors: ct('eleMas') },
    { name: 'enerRech_', value: r.panel.enerRech_, move: 'panel', contributors: ct('enerRech_') },
    { name: 'cappedCritRate_', value: r.panel.cappedCritRate_, move: 'panel', contributors: ct('cappedCritRate_') },
    { name: 'critDMG_', value: r.panel.critDMG_, move: 'panel', contributors: ct('critDMG_') },
  ]
  // DMG bonus — only the character's own element (+ physical if non-zero, for
  // polearm/sword/claymore/bow characters whose normals are physical).
  const charEle = charDataRaw(goCharKey).ele as keyof typeof r.panel.dmg_
  panel.push({
    name: `${charEle}_dmg_`,
    value: r.panel.dmg_[charEle],
    move: 'panel',
    ele: charEle,
    contributors: ct(`${charEle}_dmg_`),
  })
  if (charEle !== 'physical' && r.panel.dmg_.physical > 0) {
    panel.push({
      name: 'physical_dmg_',
      value: r.panel.dmg_.physical,
      move: 'panel',
      ele: 'physical',
      contributors: ct('physical_dmg_'),
    })
  }

  const damage: ComputedFormula[] = r.formulas.map((f) => ({
    name: f.name,
    value: f.value,
    move: f.move,
    ele: f.element,
    nonCrit: f.nonCrit,
    crit: f.crit,
    breakdown: f.breakdown,
  }))

  return {
    goKey: goCharKey,
    fed,
    values,
    formulas: [...panel, ...damage],
    teamKeys,
  }
}

// =============================================================================
// Substat margin (new pipeline)
// =============================================================================

/** Median substat roll (T1+T4)/2 — kept identical to the GO-side table in
 *  src/integration/go-calc.ts so users see consistent margin rankings if we
 *  flip the pipeline route. */
const SUBSTAT_ROLL: Record<string, number> = {
  critRate_: 0.033055,
  critDMG_: 0.06605,
  atk_: 0.04955,
  hp_: 0.04955,
  def_: 0.062,
  eleMas: 19.815,
  enerRech_: 0.05505,
  atk: 16.535,
  hp: 253.94,
  def: 19.675,
}

export interface SubstatMargin {
  substat: string
  absoluteDelta: number
  pctDelta: number
}
export interface SubstatMarginResult {
  baselineFormula: string
  baselineValue: number
  margins: SubstatMargin[]
}

/** Pick "main damage" formula from a result's formula list — burst first,
 *  then skill, then any positive damage formula. */
function pickMainFormulaFromResult(r: ComputeResult): { name: string; value: number } | null {
  // Prefer named damage moves
  const priority = ['burst', 'skill']
  for (const move of priority) {
    const candidates = r.formulas.filter((f) => f.move === move && f.value > 0)
    if (candidates.length > 0) {
      // pick the highest-value formula in the move group
      candidates.sort((a, b) => b.value - a.value)
      return { name: candidates[0]!.name, value: candidates[0]!.value }
    }
  }
  // Fallback: largest positive damage formula
  let best: { name: string; value: number } | null = null
  for (const f of r.formulas) {
    if (f.move === 'panel') continue
    if (f.value <= 0) continue
    if (!best || f.value > best.value) best = { name: f.name, value: f.value }
  }
  return best
}

/** Compute substat margins for a focus character via the new pipeline.
 *  Mirrors `computeSubstatMarginsViaGo` for new-sheet characters whose
 *  scaling/buffs are properly modeled here (e.g. Linnea, where GO would
 *  return ATK-scaling defaults instead of her actual DEF scaling). */
export function computeSubstatMarginsNew(
  members: Array<TeamMemberInput | null>,
  focusSlotIdx: number,
  opts: TeamComputeOptions = {},
): SubstatMarginResult | null {
  const baseline = computeTeamNew(members, focusSlotIdx, opts)
  if (!baseline) return null

  let main: { name: string; value: number } | null = null
  if (opts.targetFormula && baseline.values[opts.targetFormula] != null) {
    const v = baseline.values[opts.targetFormula]!
    if (v > 0) main = { name: opts.targetFormula, value: v }
  }
  if (!main) main = pickMainFormulaFromResult(baseline)
  if (!main) return null

  const margins: SubstatMargin[] = []
  for (const [substat, roll] of Object.entries(SUBSTAT_ROLL)) {
    const perturbed = computeTeamNew(members, focusSlotIdx, {
      ...opts,
      extraSubstats: { ...(opts.extraSubstats ?? {}), [substat]: roll },
    })
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
