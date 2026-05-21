// Adapter — produces a `GoComputeResult`-shaped object from the new
// src/calc/ pipeline so the existing /team UI can use it with no rendering
// changes.
//
// Today: single-character (focus only). Team buff propagation across
// members is a follow-up — Shenhe's A1/A4 affect other slots, which means
// each member's scope needs to accumulate buffs sourced from teammates'
// sheets. Stub for now.

import type { CharacterConfig } from '@/data/config-types'
import { buildCharacter } from './build'
import { goCharacterKey } from '@/integration/good-adapter'
import { characterSheets } from './sheets'
import type { CondState } from './sheet-types'
import { charDataRaw } from './data/curves'

export interface TeamMemberInput {
  config: CharacterConfig
}

export interface TeamComputeOptions {
  enemyLevel?: number
  enemyPreRes?: number
  condState?: Record<string, Record<string, Record<string, number>>>
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

  const r = buildCharacter(focus.config, {
    condState: focusCondState,
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
  }))

  return {
    goKey: goCharKey,
    fed,
    values,
    formulas: [...panel, ...damage],
    teamKeys,
  }
}
