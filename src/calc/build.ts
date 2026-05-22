// Top-level build pipeline: CharacterConfig → Scope with all stat slots
// filled in → AST-evaluated final stats.
//
// Phase order matters. Each phase reads scope values set by earlier phases.
//
//   Phase 1.  Character constants
//   Phase 2.  Character base stats + ascension
//   Phase 3.  Weapon curve/ascension/substat
//   Phase 4.  Artifact main + sub
//   Phase 5.  Artifact set counts
//   Phase 6.  Apply set effects via sheets/ (cond-gated)
//   Phase 7.  Apply weapon passive via sheets/ (cond-gated)
//   Phase 8.  Apply character passive via sheets/ (cond-gated; stat-only)
//   Phase 9.  Compute base.{hp,atk,def}
//   Phase 10. Sum premod.<stat> across all sources
//   Phase 11. Compute final.{hp,atk,def} = base × (1 + premod.%) + premod.flat
//   Phase 12. Compute capped CR, final CDmg, ER, EM, dmg_<ele>, etc.

import type { CharacterConfig } from '@/data/config-types'
import { evaluate, sum, prod, max, min, v } from './ast'
import { Scope } from './scope'
import { charCurve, weaponCurve, charDataRaw, weaponDataRaw } from './data/curves'
import { mainStatMaxValueL20, type ArtifactSlot } from './data/artifact-mainstat'
import { goCharacterKey, goWeaponKey, goArtifactSetKey } from '@/integration/good-adapter'
import { characterSheets, weaponSheets, artifactSetSheets } from './sheets'
import type { CondState, TeamPanelSnapshot } from './sheet-types'
import { ShenheFormulas, applyShenheFormulaBuffs, shenheQResShred } from './sheets/Shenhe-formulas'
import { LinneaFormulas, applyLinneaFormulaBuffs, linneaA1GeoResShred } from './sheets/Linnea-formulas'
import { ZibaiFormulas, applyZibaiFormulaBuffs } from './sheets/Zibai-formulas'
import { ColumbinaFormulas, applyColumbinaFormulaBuffs } from './sheets/Columbina-formulas'
import { IllugaFormulas, applyIllugaFormulaBuffs } from './sheets/Illuga-formulas'
import { AinoFormulas, applyAinoFormulaBuffs } from './sheets/Aino-formulas'
import { FlinsFormulas, applyFlinsFormulaBuffs, flinsC2ElectroResShred } from './sheets/Flins-formulas'
import { IneffaFormulas, applyIneffaFormulaBuffs } from './sheets/Ineffa-formulas'
import { JahodaFormulas, applyJahodaFormulaBuffs } from './sheets/Jahoda-formulas'
import { LaumaFormulas, applyLaumaFormulaBuffs, laumaSkillResShred } from './sheets/Lauma-formulas'
import { xianglingC1PyroResShred } from './sheets/Xiangling'
import { NeferFormulas, applyNeferFormulaBuffs, neferC4DendroResShred } from './sheets/Nefer-formulas'
import { BennettFormulas, applyBennettFormulaBuffs } from './sheets/Bennett-formulas'
import { XianglingFormulas, applyXianglingFormulaBuffs } from './sheets/Xiangling-formulas'
import { XingqiuFormulas, applyXingqiuFormulaBuffs, xingqiuC2HydroResShred } from './sheets/Xingqiu-formulas'
import { evaluateFormula, type FormulaDef, type FormulaResult, type EnemyContext } from './formula'
import { CHARACTER_NAME_ZH, WEAPON_NAME_ZH } from './data/names-zh'

/** Per-character RES-shred function registry. Used by build.ts to iterate
 *  the whole team (focus + teammates) and accumulate enemy RES debuffs.
 *  Each fn takes (ctx, condState) and returns `{ element: shred_amount }`. */
const CHAR_RES_SHRED: Record<string, import('./sheet-types').CharResShredFn> = {
  Shenhe: shenheQResShred,
  Linnea: linneaA1GeoResShred,
  Flins: flinsC2ElectroResShred,
  Nefer: neferC4DendroResShred,
  Xingqiu: xingqiuC2HydroResShred,
  Lauma: laumaSkillResShred,
  Xiangling: xianglingC1PyroResShred,
}

/** Moon-sign character GO keys. Each of these has `isMoonsign: constant(1)`
 *  in their vendor sheet, indicating they trigger/scale with moon reactions.
 *  Used to set the focus's `focus.isMoonsign` scope flag for team buffs that
 *  gate on `target.isMoonsign` (e.g. Jahoda C6 only buffs moonsign focus), and
 *  by team-adapter.ts to count moonsign team members for `tally.moonsign`. */
/** Sheet keys whose `moonFull` cond should auto-fill when the team has
 *  ≥2 moon-sign members. Includes all 10 moon-sign chars plus the 3 artifact
 *  sets (Aubade, NightOfTheSkysUnveiling, SilkenMoons) that use a moonFull-like
 *  cond. Future moon-related sheets should be added here. */
const MOON_FULL_AUTOFILL_KEYS = new Set([
  // Moon-sign characters
  'Aino', 'Columbina', 'Flins', 'Illuga', 'Ineffa',
  'Jahoda', 'Lauma', 'Linnea', 'Nefer', 'Zibai',
  // Artifact sets with a moonFull cond tier
  'AubadeOfMorningstarAndMoon',
  'SilkenMoonsSerenade',
  'NightOfTheSkysUnveiling',
])

/** Clone condState and auto-fill `moonFull = 1` for known moon-sheet keys
 *  when the team has 2+ moon-sign members. User-explicit truthy values are
 *  preserved (force-on always wins). Returns a new object so opts.condState
 *  is not mutated. */
function autoFillMoonFull(condState: CondState, teamMoonsignCount: number): CondState {
  if (teamMoonsignCount < 2) return condState
  const out: CondState = { ...condState }
  for (const key of MOON_FULL_AUTOFILL_KEYS) {
    const existing = out[key] ?? {}
    if (!existing.moonFull) {
      out[key] = { ...existing, moonFull: 1 }
    }
  }
  return out
}

export const MOONSIGN_KEYS = new Set([
  'Aino', 'Columbina', 'Flins', 'Illuga', 'Ineffa',
  'Jahoda', 'Lauma', 'Linnea', 'Nefer', 'Zibai',
])

export interface BuildResult {
  scope: Scope
  panel: PanelStats
  breakdown: AtkBreakdown
  /** Damage formulas — present only when the character sheet has formulas
   *  wired (Shenhe today). */
  formulas: FormulaResult[]
  /** Per-panel-stat breakdown for the UI to render on click. Keyed by the
   *  same name the panel uses ('atk', 'hp', 'def', 'cryo_dmg_', etc.). */
  contributions: Record<string, ContribRow[]>
}

/** One row in a stat's breakdown. */
export interface ContribRow {
  /** Where the contribution came from, in Chinese (UI-ready). */
  source: string
  /** The raw delta this source added. For percent stats this is a decimal
   *  (0.466 = +46.6%). For flat stats it's the absolute value. */
  value: number
  /** Which bucket the value lives in.
   *    'base'   — adds to the base zone (char/weapon stats, no % multiplier)
   *    'pct'    — adds to the %-multiplier
   *    'flat'   — flat addition outside the % multiplier
   *    'pure'   — single-bucket stat (CR, CD, dmg_<ele>, etc.); just sum
   */
  kind: 'base' | 'pct' | 'flat' | 'pure'
}

export interface PanelStats {
  baseHp: number
  baseAtk: number
  baseDef: number
  /** Final = base × (1 + %) + flat. */
  finalHp: number
  finalAtk: number
  finalDef: number
  /** Element-mastery, sum of all sources (no base modifier). */
  eleMas: number
  /** Multiplicative energy recharge — 1.0 base + sum of all %. */
  enerRech_: number
  /** Crit rate capped at [0, 1]. Display as percentage. */
  cappedCritRate_: number
  /** Crit damage — 0.5 base + sum. */
  critDMG_: number
  /** Healing bonus — sum. */
  heal_: number
  /** Per-element damage bonus aggregate (decimal: 0.466 = +46.6%). */
  dmg_: {
    pyro: number
    hydro: number
    cryo: number
    electro: number
    anemo: number
    geo: number
    dendro: number
    physical: number
  }
  /** Per-move damage bonus aggregate. */
  dmgMove_: {
    normal: number
    charged: number
    plunging: number
    skill: number
    burst: number
  }
  /** premod accumulators — useful for UI breakdown. */
  premodAtkPct: number
  premodAtkFlat: number
  premodHpPct: number
  premodHpFlat: number
  premodDefPct: number
  premodDefFlat: number
}

export interface AtkBreakdown {
  charCurve: number
  charAscFlat: number
  weaponCurve: number
  weaponAscFlat: number
  charAscPct: number
  weaponSubstatPct: number
  weaponPassivePct: number
  artifactMainPct: number
  artifactSubPct: number
  artifactSetPct: number
  artifactMainFlat: number
  artifactSubFlat: number
}

export interface BuildOpts {
  condState?: CondState
  /** Enemy state for damage formulas. Default: lvl 100, 10% RES across the board. */
  enemy?: EnemyContext
  /** Whether this character is currently on-field. Several weapon passives
   *  (Calamity Queller, etc.) and artifact effects key off this. Default
   *  true (treat as on-field) so existing callers stay backwards-compatible. */
  onField?: boolean
  /** Substat-margin what-if injection: map from GO substat key (e.g. 'critRate_',
   *  'atk_', 'def_', 'eleMas', 'atk' [flat], 'def' [flat]) to a numeric value
   *  to add into the corresponding `artifact.sub.<key>` slot. Used by the
   *  substat-margin computer to perturb one substat at a time. */
  extraSubstats?: Record<string, number>
  /** Team-element count for elemental resonance. Map element key → number of
   *  team members with that element. e.g. `{ hydro: 2, pyro: 1, geo: 1 }`.
   *  Resonance fires when count >= 2 for the same element. */
  teamElementCount?: Record<string, number>
  /** Number of moon-sign team members. Exposed as `tally.moonsign` for sheets
   *  that gate on `tally.moonsign >= 2` (月兆·满辉 / moon-full state). */
  teamMoonsignCount?: number
  /** Pass-1 panel snapshots for cross-character buffs (Linnea A4, Columbina
   *  C2 active-char propagation, etc.). When provided, the focus character's
   *  apply() can read any teammate's final stats. */
  teamPanels?: Array<import('./sheet-types').TeamPanelSnapshot | null>
  /** Index of focus character in `teamPanels`. */
  focusSlotIdx?: number
}

export function buildCharacter(
  config: CharacterConfig,
  optsOrCondState: BuildOpts | CondState = {},
): BuildResult {
  const opts: BuildOpts = isCondStateOnly(optsOrCondState)
    ? { condState: optsOrCondState as CondState }
    : (optsOrCondState as BuildOpts)
  const rawCondState = opts.condState ?? {}
  // Auto-fill `moonFull` cond when tally.moonsign >= 2 (vendor: 月兆·满辉 state
  // fires when 2+ moon-sign team members). Each sheet that gates on its own
  // `moonFull` cond now picks it up automatically — user still has a force-on
  // override (any explicit truthy value short-circuits the check).
  const condState = autoFillMoonFull(rawCondState, opts.teamMoonsignCount ?? 0)
  const enemy: EnemyContext = opts.enemy ?? { level: 100 }
  const onField = opts.onField ?? true
  const scope = new Scope()
  const goCharKey = goCharacterKey(config.characterId)
  if (!goCharKey) throw new Error(`Unknown character id: ${config.characterId}`)

  // ---- Phase 1: character constants ----
  scope.set('level', config.level)
  scope.set('ascension', config.ascensionStage)
  scope.set('constellation', config.constellation)
  scope.set('talent.auto', config.talentLevels.auto)
  scope.set('talent.skill', config.talentLevels.skill)
  scope.set('talent.burst', config.talentLevels.burst)
  scope.set('onField', onField ? 1 : 0)
  // Moon-sign indicator for the focus character (vendor sets `isMoonsign: 1`
  // on each moon-sign character's sheet). Used by team buffs that gate on
  // `target.isMoonsign` (e.g. Jahoda C6 香水瓶满 — only buffs moonsign focus).
  scope.set('focus.isMoonsign', MOONSIGN_KEYS.has(goCharKey) ? 1 : 0)
  // Focus character's element (looked up from vendor char data). Used by
  // sheets that need to know "is this the wearer's element" — e.g. GildedDreams
  // 4pc compares teammate elements to wearer's to count same-vs-diff.
  // String keys aren't scope-friendly; we set per-element flag instead:
  //   `focus.element.<ele>` = 1 if focus IS that element, else 0/unset.
  const focusEle = (charDataRaw(goCharKey) as { ele?: string }).ele
  if (focusEle) scope.set(`focus.element.${focusEle}`, 1)

  // ---- Phase 2: character base + ascension ----
  const charRaw = charDataRaw(goCharKey)
  for (const { key, base, curve } of charRaw.lvlCurves) {
    scope.set(`char.curve.${key}`, base * charCurve(curve as never, config.level))
  }
  for (const [statKey, asc] of Object.entries(charRaw.ascensionBonus)) {
    scope.set(`char.asc.${statKey}`, asc[config.ascensionStage] ?? 0)
  }

  // ---- Phase 3: weapon ----
  scope.set('weap.curve.atk', 0)
  scope.set('weap.asc.atk', 0)
  scope.set('weap.refinement', 0)
  let weaponGoKey: string | null = null
  if (config.weapon.weaponId != null) {
    weaponGoKey = goWeaponKey(config.weapon.weaponId)
    if (!weaponGoKey) throw new Error(`Unknown weapon id: ${config.weapon.weaponId}`)
    const wepRaw = weaponDataRaw(weaponGoKey)
    scope.set('weap.refinement', config.weapon.refinement)
    for (const { key, base, curve } of wepRaw.lvlCurves) {
      const value = base * weaponCurve(curve as never, config.weapon.level)
      if (key === 'atk') scope.set('weap.curve.atk', value)
      else scope.set(`weap.substat.${key}`, value)
    }
    for (const [statKey, asc] of Object.entries(wepRaw.ascensionBonus)) {
      const value = asc[config.weapon.ascensionStage] ?? 0
      if (statKey === 'atk') scope.set('weap.asc.atk', value)
      else scope.set(`weap.asc.${statKey}`, value)
    }
  }

  // ---- Phase 4-5: artifact main, sub, set counts ----
  const setCount: Record<string, number> = {}
  for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const) {
    const piece = config.artifacts[slot]
    if (!piece) continue
    const setKey = goArtifactSetKey(piece.setId)
    if (setKey) setCount[setKey] = (setCount[setKey] ?? 0) + 1

    const mainGoKey = MAIN_STAT_TO_GO[piece.mainStat]
    if (mainGoKey) {
      const mainVal = mainStatMaxValueL20(slot as ArtifactSlot, mainGoKey)
      if (mainVal !== undefined) {
        scope.add(`artifact.main.${mainGoKey}`, mainVal, `${SLOT_LABEL[slot]}主词条`)
      }
    }
    for (const s of piece.substats) {
      const goKey = SUB_KEY_TO_GO[s.key]
      if (!goKey) continue
      scope.add(`artifact.sub.${goKey}`, s.value, `${SLOT_LABEL[slot]}副词条`)
    }
  }
  for (const [setKey, count] of Object.entries(setCount)) {
    scope.set(`artifact.set.${setKey}.count`, count)
  }

  // ---- Phase 5.5: substat what-if perturbation (substat-margin compute) ----
  // Inject extra sub-stat boosts as if the character had one more roll of
  // the given substat. Use the same `artifact.sub.<key>` slot the real
  // substats land in so downstream summation in Phase 10 picks them up.
  if (opts.extraSubstats) {
    for (const [goKey, value] of Object.entries(opts.extraSubstats)) {
      if (value !== 0) scope.add(`artifact.sub.${goKey}`, value, '副词条 perturbation')
    }
  }

  // Expose team element tally as scope keys (`team.tally.<ele>`) for chars
  // whose passives gate on teammate counts (Jahoda, Zibai A4, etc.).
  if (opts.teamElementCount) {
    for (const [ele, n] of Object.entries(opts.teamElementCount)) {
      scope.set(`team.tally.${ele}`, n)
    }
  }
  // Moon-sign tally (vendor: `tally.moonsign`). 0/1/2+ — sheets check `>= 2`
  // for 月兆·满辉 (moon-full) state. Used as auto-fallback for the per-char
  // `moonFull` user cond (see `isMoonFull` helper in src/calc/utils/moon-full.ts).
  scope.set('tally.moonsign', opts.teamMoonsignCount ?? 0)

  // ---- Phase 5.7: elemental resonance (2+ same-element teammates → buffs) ----
  // Genshin 4-member team resonances. We apply the panel-stat-affecting ones.
  // 元素共鸣 — fires when 2 or more team members share an element. Effects
  // apply to ALL team members, including the focus we're building.
  if (opts.teamElementCount) {
    for (const [ele, n] of Object.entries(opts.teamElementCount)) {
      if (n < 2) continue
      switch (ele) {
        case 'pyro':
          // 热诚之火: +25% ATK
          scope.add('premod.atk_', 0.25, '元素共鸣 · 热诚之火(+25% ATK)')
          break
        case 'hydro':
          // 愈疗之水: +25% HP
          scope.add('premod.hp_', 0.25, '元素共鸣 · 愈疗之水(+25% HP)')
          break
        case 'cryo':
          // 粉碎之冰: 对处于冰元素附着或冻结的敌人 CR +15%. We don't track
          // enemy state here — apply unconditionally as approximation
          // (matches how BlizzardStrayer 2pc is often used).
          scope.add('premod.critRate_', 0.15, '元素共鸣 · 粉碎之冰(+15% CR, 假设敌人冰附着)')
          break
        case 'dendro':
          // 蔓生之草: +50 EM (constant). Reaction-trigger +30 EM bonuses
          // are conditional, not modeled here.
          scope.add('premod.eleMas', 50, '元素共鸣 · 蔓生之草(+50 EM)')
          break
        case 'electro':
          // 强能之雷: energy on reactions — not a panel-stat effect, skipped.
          break
        case 'anemo':
          // 迅捷之风: stamina/movement — no damage effect.
          break
        case 'geo':
          // 坚定之岩: shield-conditional. +15% damage when shielded + enemy
          // -20% RES. Not modeled (requires shield-active state).
          break
      }
    }
    // 4-element team (all 4 different): protective canopy +15% all incoming
    // RES — doesn't affect outgoing damage, so no panel effect.
  }

  // ---- Phase 6: apply set effects ----
  for (const [setKey, count] of Object.entries(setCount)) {
    const sheet = artifactSetSheets[setKey]
    if (sheet) sheet.apply(scope, count, condState)
  }

  // ---- Phase 7: apply weapon passive ----
  if (weaponGoKey) {
    const wepSheet = weaponSheets[weaponGoKey]
    if (wepSheet) {
      wepSheet.apply(
        scope,
        { level: config.weapon.level, ascension: config.weapon.ascensionStage, refinement: config.weapon.refinement },
        condState,
      )
    }
  }

  // ---- Phase 8: apply character passive ----
  // Includes teamPanels (pass-1 snapshots of all team members' stats) so the
  // focus char's apply() can read teammates' stats for cross-char buffs.
  const charSheet = characterSheets[goCharKey]
  if (charSheet) {
    charSheet.apply(
      scope,
      {
        level: config.level,
        ascension: config.ascensionStage,
        constellation: config.constellation,
        talents: config.talentLevels,
        teamPanels: opts.teamPanels,
        focusSlotIdx: opts.focusSlotIdx,
      },
      condState,
    )
  }

  // ---- Phase 8.4: apply OTHER team members' team-buffs onto focus ----
  // For each non-focus slot:
  //   1. Char-side cross-char buffs (Bennett Q, Linnea A4, etc.) via applyTeammateBuff().
  //   2. Artifact-set team buffs via the set sheet's applyAsTeammate().
  // Non-stacking rule: each artifact set with team buffs only applies once
  // across the team (per vendor's `nonStackBuff` mechanic). We track set keys
  // already applied — focus's own equipped sets (handled in Phase 6) count too.
  if (opts.teamPanels && opts.focusSlotIdx != null) {
    const appliedTeamSets = new Set<string>()
    // Mark focus's own team-buff sets — they already added their share in Phase 6.
    for (const [setKey, count] of Object.entries(setCount)) {
      if (count >= 4 && artifactSetSheets[setKey]?.applyAsTeammate) {
        appliedTeamSets.add(setKey)
      }
    }
    for (let i = 0; i < opts.teamPanels.length; i++) {
      if (i === opts.focusSlotIdx) continue
      const teammate = opts.teamPanels[i]
      if (!teammate) continue
      // Cross-char character-side team buffs via the generic
      // CharacterSheet.applyAsTeammate hook. Sheets read their own panel stats
      // (wearer.finalDef etc.) and write the resulting buff to focus scope.
      // (Legacy applyTeammateBuff if-else chain removed 2026-05-22; all char
      // team buffs now flow through applyAsTeammate exclusively.)
      const teammateCharSheet = characterSheets[teammate.goKey]
      teammateCharSheet?.applyAsTeammate?.(scope, condState, teammate)
      // Cross-char artifact set buffs (dedup by set key)
      for (const [setKey, count] of Object.entries(teammate.setCounts)) {
        if (appliedTeamSets.has(setKey)) continue
        const sheet = artifactSetSheets[setKey]
        if (sheet?.applyAsTeammate) {
          sheet.applyAsTeammate(scope, count, condState, teammate)
          if (count >= 4) appliedTeamSets.add(setKey)
        }
      }
    }
  }

  // ---- Phase 8.5: copy condState into scope under `cond.<sheet>.<name>` ----
  // Formula ASTs reference cond values directly via `v('cond.Shenhe.quillActive')`.
  // Pushing them into scope here means buffs that AREN'T cond-gated stay
  // declarative in the sheet's apply() (which mutates scope directly), while
  // formula-level conditional contributions can stay in the AST tree.
  for (const [sheetKey, names] of Object.entries(condState)) {
    for (const [condName, value] of Object.entries(names)) {
      scope.set(`cond.${sheetKey}.${condName}`, value)
    }
  }

  // ---- Phase 9: base.{hp,atk,def} via AST ----
  // base = char.curve + char.asc + weap.curve + weap.asc  (atk has weapon; hp/def don't)
  scope.set('base.atk', evaluate(
    sum(v('char.curve.atk'), v('char.asc.atk'), v('weap.curve.atk'), v('weap.asc.atk')),
    scope,
  ))
  scope.set('base.hp', evaluate(
    sum(v('char.curve.hp'), v('char.asc.hp')),
    scope,
  ))
  scope.set('base.def', evaluate(
    sum(v('char.curve.def'), v('char.asc.def')),
    scope,
  ))

  // ---- Phase 10: sum premod.<stat> from every source ----
  // premod.atk_ is the canonical one (most contributors).
  scope.set('premod.atk_', evaluate(
    sum(
      v('char.asc.atk_', 0),
      v('weap.substat.atk_', 0),
      v('weap.asc.atk_', 0),       // some weapons ascend atk_, not flat atk
      v('weap.passive.atk_', 0),   // CQ / similar
      v('artifact.main.atk_', 0),
      v('artifact.sub.atk_', 0),
      v('artifact.set.atk_', 0),
      v('premod.atk_', 0),          // some sheets add directly (none today, but support)
    ),
    scope,
  ))
  scope.set('premod.atk.flat', evaluate(
    sum(v('artifact.main.atk', 0), v('artifact.sub.atk', 0)),
    scope,
  ))
  scope.set('premod.hp_', evaluate(
    sum(
      v('char.asc.hp_', 0),
      v('weap.substat.hp_', 0),
      v('artifact.main.hp_', 0),
      v('artifact.sub.hp_', 0),
      v('premod.hp_', 0),
    ),
    scope,
  ))
  scope.set('premod.hp.flat', evaluate(
    sum(v('artifact.main.hp', 0), v('artifact.sub.hp', 0)),
    scope,
  ))
  scope.set('premod.def_', evaluate(
    sum(
      v('char.asc.def_', 0),
      v('weap.substat.def_', 0),
      v('artifact.main.def_', 0),
      v('artifact.sub.def_', 0),
      v('premod.def_', 0),
    ),
    scope,
  ))
  scope.set('premod.def.flat', evaluate(
    sum(v('artifact.sub.def', 0)),
    scope,
  ))

  // ---- Phase 11: final.{hp,atk,def} ----
  //
  // 二次转模 Type 1 vs Type 2 partition (engine MVP — see queue item
  // `type1-type2-conversion-partition`). Each writable stat has TWO logical
  // partitions, both currently summed into the same `premod.X` slot:
  //   - Type 2 (default, "每点 X → Y" pattern): regular `scope.add('premod.X')`
  //     calls. Re-chainable.
  //   - Type 1 ("基于 X 的 N%" pattern, e.g. 莉奈娅 A4 DEF → EM): the source
  //     ALSO writes the value to `premod.X.converted` (the same amount, NOT
  //     additional). When a downstream Type 1 source needs to read its input
  //     stat, it reads `final.X.preconverted` (= base + Type 2 only).
  //
  // Backwards-compat: existing sheets that only add to `premod.X` still work
  // exactly as before — `premod.X.converted` is 0, so `preconverted` == `final`.
  // New Type 1 sources should add to BOTH `premod.X` (for final calc) AND
  // `premod.X.converted` (so the converted portion is excluded from
  // preconverted).
  //
  // This is the MVP — sheet-level migration of existing Type 1 sources (e.g.
  // Linnea A4 DEF → EM) is deferred; with no second converter in the team
  // their behavior is unchanged either way.
  const atkConverted = scope.get('premod.atk_.converted') ?? 0
  const atkFlatConverted = scope.get('premod.atk.flat.converted') ?? 0
  const hpConverted = scope.get('premod.hp_.converted') ?? 0
  const hpFlatConverted = scope.get('premod.hp.flat.converted') ?? 0
  const defConverted = scope.get('premod.def_.converted') ?? 0
  const defFlatConverted = scope.get('premod.def.flat.converted') ?? 0
  scope.set('final.atk', evaluate(
    sum(prod(v('base.atk'), sum(1, v('premod.atk_'))), v('premod.atk.flat')),
    scope,
  ))
  scope.set('final.atk.preconverted',
    (scope.get('base.atk') ?? 0) * (1 + ((scope.get('premod.atk_') ?? 0) - atkConverted))
    + ((scope.get('premod.atk.flat') ?? 0) - atkFlatConverted),
  )
  scope.set('final.hp', evaluate(
    sum(prod(v('base.hp'), sum(1, v('premod.hp_'))), v('premod.hp.flat')),
    scope,
  ))
  scope.set('final.hp.preconverted',
    (scope.get('base.hp') ?? 0) * (1 + ((scope.get('premod.hp_') ?? 0) - hpConverted))
    + ((scope.get('premod.hp.flat') ?? 0) - hpFlatConverted),
  )
  scope.set('final.def', evaluate(
    sum(prod(v('base.def'), sum(1, v('premod.def_'))), v('premod.def.flat')),
    scope,
  ))
  scope.set('final.def.preconverted',
    (scope.get('base.def') ?? 0) * (1 + ((scope.get('premod.def_') ?? 0) - defConverted))
    + ((scope.get('premod.def.flat') ?? 0) - defFlatConverted),
  )

  // ---- Phase 12: rest of panel stats ----
  scope.set('final.eleMas', evaluate(
    sum(
      v('char.asc.eleMas', 0),
      v('weap.substat.eleMas', 0),
      v('artifact.main.eleMas', 0),
      v('artifact.sub.eleMas', 0),
      v('premod.eleMas', 0),
    ),
    scope,
  ))
  // Type 1 preconverted EM (excludes Type 1-converted contributions).
  // See Phase 11 comment for the convention. Linnea A4 reads `final.def.preconverted`
  // (not implemented yet but available); future EM-conversion sources read this.
  const emConverted = scope.get('premod.eleMas.converted') ?? 0
  scope.set('final.eleMas.preconverted',
    (scope.get('final.eleMas') ?? 0) - emConverted,
  )
  scope.set('final.enerRech_', evaluate(
    sum(
      1,
      v('char.asc.enerRech_', 0),
      v('weap.substat.enerRech_', 0),
      v('artifact.main.enerRech_', 0),
      v('artifact.sub.enerRech_', 0),
      v('premod.enerRech_', 0),
    ),
    scope,
  ))
  // CR: 0.05 base + everything else, clamped to [0, 1].
  scope.set('cappedCritRate_', evaluate(
    max(0, min(1, sum(
      0.05,
      v('char.asc.critRate_', 0),
      v('weap.substat.critRate_', 0),
      v('artifact.main.critRate_', 0),
      v('artifact.sub.critRate_', 0),
      v('premod.critRate_', 0),
    ))),
    scope,
  ))
  scope.set('final.critDMG_', evaluate(
    sum(
      0.5,
      v('char.asc.critDMG_', 0),
      v('weap.substat.critDMG_', 0),
      v('artifact.main.critDMG_', 0),
      v('artifact.sub.critDMG_', 0),
      v('premod.critDMG_', 0),
    ),
    scope,
  ))
  scope.set('final.heal_', evaluate(
    sum(
      v('artifact.main.heal_', 0),
      v('artifact.sub.heal_', 0),
      v('premod.heal_', 0),
    ),
    scope,
  ))

  // Per-element dmg bonus aggregates
  const dmg_: PanelStats['dmg_'] = {} as never
  for (const ele of ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro', 'physical'] as const) {
    dmg_[ele] = evaluate(
      sum(
        v(`artifact.main.${ele}_dmg_`, 0),
        v(`artifact.sub.${ele}_dmg_`, 0),
        v(`premod.dmg_.${ele}`, 0),
      ),
      scope,
    )
    scope.set(`final.dmg_.${ele}`, dmg_[ele])
  }
  // Per-move dmg bonus aggregates
  const dmgMove_: PanelStats['dmgMove_'] = {} as never
  for (const move of ['normal', 'charged', 'plunging', 'skill', 'burst'] as const) {
    dmgMove_[move] = evaluate(
      sum(v(`premod.dmg_.${move}`, 0)),
      scope,
    )
    scope.set(`final.dmgMove_.${move}`, dmgMove_[move])
  }

  // Per-element / per-reaction CR + CDmg aggregates (Columbina C6, Lauma A1)
  for (const ele of ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro', 'physical'] as const) {
    scope.set(`final.critRate_.${ele}`, evaluate(sum(v(`premod.critRate_.${ele}`, 0)), scope))
    scope.set(`final.critDMG_.${ele}`, evaluate(sum(v(`premod.critDMG_.${ele}`, 0)), scope))
  }
  for (const reaction of ['crystallize', 'electrocharged', 'bloom'] as const) {
    scope.set(`final.critRate_.${reaction}`, evaluate(sum(v(`premod.critRate_.${reaction}`, 0)), scope))
    scope.set(`final.critDMG_.${reaction}`, evaluate(sum(v(`premod.critDMG_.${reaction}`, 0)), scope))
  }
  // Per-element + per-move + per-reaction flat-add slots — exposed to the
  // formula evaluator directly as `premod.dmgInc.<ele>`, `premod.dmgIncMove.<move>`,
  // `premod.dmgIncReaction.<reaction>`. These are scope.get() at evaluation
  // time, no final-sum needed (the sheets write straight into the slot).

  // ---- Phase 13: damage-side cond buffs + formula evaluation ----
  // These mutate the final.dmg_.* / final.dmgMove_.* slots, so they have to
  // run AFTER phase 12 (which initialised them) and BEFORE formulas read.
  // Per-character buff hook. Extend with each new wired character; once we
  // hit 3+ refactor to a registry map.
  if (goCharKey === 'Shenhe') applyShenheFormulaBuffs(scope, condState)
  else if (goCharKey === 'Linnea') applyLinneaFormulaBuffs(scope, condState)
  else if (goCharKey === 'Zibai') applyZibaiFormulaBuffs(scope, condState)
  else if (goCharKey === 'Columbina') applyColumbinaFormulaBuffs(scope, condState)
  else if (goCharKey === 'Illuga') applyIllugaFormulaBuffs(scope, condState)
  else if (goCharKey === 'Aino') applyAinoFormulaBuffs(scope, condState)
  else if (goCharKey === 'Flins') applyFlinsFormulaBuffs(scope, condState)
  else if (goCharKey === 'Ineffa') applyIneffaFormulaBuffs(scope, condState)
  else if (goCharKey === 'Jahoda') applyJahodaFormulaBuffs(scope, condState)
  else if (goCharKey === 'Lauma') applyLaumaFormulaBuffs(scope, condState)
  else if (goCharKey === 'Nefer') applyNeferFormulaBuffs(scope, condState)
  else if (goCharKey === 'Bennett') applyBennettFormulaBuffs(scope, condState)
  else if (goCharKey === 'Xiangling') applyXianglingFormulaBuffs(scope, condState)
  else if (goCharKey === 'Xingqiu') applyXingqiuFormulaBuffs(scope, condState)

  const formulas: FormulaResult[] = []
  const formulaDefs: FormulaDef[] =
    goCharKey === 'Shenhe' ? ShenheFormulas :
    goCharKey === 'Linnea' ? LinneaFormulas :
    goCharKey === 'Zibai' ? ZibaiFormulas :
    goCharKey === 'Columbina' ? ColumbinaFormulas :
    goCharKey === 'Illuga' ? IllugaFormulas :
    goCharKey === 'Aino' ? AinoFormulas :
    goCharKey === 'Flins' ? FlinsFormulas :
    goCharKey === 'Ineffa' ? IneffaFormulas :
    goCharKey === 'Jahoda' ? JahodaFormulas :
    goCharKey === 'Lauma' ? LaumaFormulas :
    goCharKey === 'Nefer' ? NeferFormulas :
    goCharKey === 'Bennett' ? BennettFormulas :
    goCharKey === 'Xiangling' ? XianglingFormulas :
    goCharKey === 'Xingqiu' ? XingqiuFormulas :
    []
  if (formulaDefs.length) {
    // Enemy debuff layer — collect per-element RES shreds from FOCUS + every
    // TEAMMATE that has a shred fn. Vendor scopes each as `teamBuff.premod.
    // <ele>_enemyRes_` (any active char benefits), so we iterate all team
    // members, not just focus. Shreds from multiple chars on the same element
    // accumulate (e.g. Shenhe cryo + Cryo resonance shred).
    const preResAdj: Partial<Record<string, number>> = {}
    const accumulateShreds = (shreds: Record<string, number>) => {
      for (const [ele, amt] of Object.entries(shreds)) {
        if (amt > 0) preResAdj[ele] = (preResAdj[ele] ?? 0) + amt
      }
    }
    // Focus's own shred
    const focusShredFn = CHAR_RES_SHRED[goCharKey]
    if (focusShredFn) {
      accumulateShreds(focusShredFn({
        constellation: config.constellation,
        ascension: config.ascensionStage,
        talents: config.talentLevels,
      }, condState))
    }
    // Teammates' shreds (cross-char propagation)
    if (opts.teamPanels && opts.focusSlotIdx != null) {
      for (let i = 0; i < opts.teamPanels.length; i++) {
        if (i === opts.focusSlotIdx) continue
        const t = opts.teamPanels[i]
        if (!t) continue
        const fn = CHAR_RES_SHRED[t.goKey]
        if (!fn) continue
        accumulateShreds(fn({
          constellation: t.constellation,
          ascension: t.ascension,
          talents: t.talents,
        }, condState))
      }
    }
    // Build enemyForEval with accumulated shreds applied.
    let enemyForEval: EnemyContext = enemy
    if (Object.keys(preResAdj).length > 0) {
      const newPreRes = { ...enemy.preRes } as Record<string, number>
      for (const [ele, amt] of Object.entries(preResAdj)) {
        newPreRes[ele] = (enemy.preRes?.[ele as keyof typeof enemy.preRes] ?? 0.1) - amt
      }
      enemyForEval = { ...enemy, preRes: newPreRes as EnemyContext['preRes'] }
    }
    for (const def of formulaDefs) {
      formulas.push(
        evaluateFormula(def, {
          scope,
          charLevel: config.level,
          enemy: enemyForEval,
          critMode: 'avg',
        }),
      )
    }
  }

  // ---- Assemble per-stat breakdown for UI ----
  const contributions = assembleContributions(scope, goCharKey, weaponGoKey)

  return {
    scope,
    formulas,
    contributions,
    panel: {
      baseHp: scope.get('base.hp')!,
      baseAtk: scope.get('base.atk')!,
      baseDef: scope.get('base.def')!,
      finalHp: scope.get('final.hp')!,
      finalAtk: scope.get('final.atk')!,
      finalDef: scope.get('final.def')!,
      eleMas: scope.get('final.eleMas')!,
      enerRech_: scope.get('final.enerRech_')!,
      cappedCritRate_: scope.get('cappedCritRate_')!,
      critDMG_: scope.get('final.critDMG_')!,
      heal_: scope.get('final.heal_')!,
      dmg_,
      dmgMove_,
      premodAtkPct: scope.get('premod.atk_')!,
      premodAtkFlat: scope.get('premod.atk.flat')!,
      premodHpPct: scope.get('premod.hp_')!,
      premodHpFlat: scope.get('premod.hp.flat')!,
      premodDefPct: scope.get('premod.def_')!,
      premodDefFlat: scope.get('premod.def.flat')!,
    },
    breakdown: {
      charCurve: scope.get('char.curve.atk') ?? 0,
      charAscFlat: scope.get('char.asc.atk') ?? 0,
      weaponCurve: scope.get('weap.curve.atk') ?? 0,
      weaponAscFlat: scope.get('weap.asc.atk') ?? 0,
      charAscPct: scope.get('char.asc.atk_') ?? 0,
      weaponSubstatPct: scope.get('weap.substat.atk_') ?? 0,
      weaponPassivePct: scope.get('weap.passive.atk_') ?? 0,
      artifactMainPct: scope.get('artifact.main.atk_') ?? 0,
      artifactSubPct: scope.get('artifact.sub.atk_') ?? 0,
      artifactSetPct: scope.get('artifact.set.atk_') ?? 0,
      artifactMainFlat: scope.get('artifact.main.atk') ?? 0,
      artifactSubFlat: scope.get('artifact.sub.atk') ?? 0,
    },
  }
}

// =============================================================================
// Stat-key translation
// =============================================================================

// Legacy `applyTeammateBuff` switch-dispatch was deleted on 2026-05-22. All
// cross-char team buffs now flow through CharacterSheet.applyAsTeammate
// (Linnea / Columbina / Bennett / Xiangling) which is dispatched in
// Phase 8.4 above. Xiangling C1 pyro RES shred → CHAR_RES_SHRED.Xiangling.

// Heuristic: a bare condState object has slot keys that look like sheet
// names ("Shenhe", "NoblesseOblige"). A BuildOpts has top-level "condState"
// or "enemy".
function isCondStateOnly(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false
  const keys = Object.keys(x as object)
  if (keys.length === 0) return false
  return !keys.includes('condState') && !keys.includes('enemy')
}

const SLOT_LABEL: Record<string, string> = {
  flower: '生之花', plume: '死之羽', sands: '时之沙', goblet: '空之杯', circlet: '理之冠',
}

/** Build the breakdown map for every panel stat the UI shows. Pulls from
 *  scope's recorded contributions (via `scope.contributionsFor(key)`) PLUS
 *  the singleton-set slots that the build pipeline writes directly. */
function assembleContributions(
  scope: Scope,
  charKey: string,
  weaponKey: string | null,
): Record<string, ContribRow[]> {
  const charName = CHARACTER_NAME_ZH[charKey] ?? charKey
  const weaponName = weaponKey ? (WEAPON_NAME_ZH[weaponKey] ?? weaponKey) : '武器'
  const nz = (v: number | undefined) => v !== undefined && v !== 0
  const out: Record<string, ContribRow[]> = {}

  // ---- ATK ----
  const atkRows: ContribRow[] = []
  // Base zone (char + weapon, summed before %)
  if (nz(scope.get('char.curve.atk'))) {
    atkRows.push({ source: `${charName} 基础攻击力曲线`, value: scope.get('char.curve.atk')!, kind: 'base' })
  }
  if (nz(scope.get('char.asc.atk'))) {
    atkRows.push({ source: `${charName} 突破固定攻击力`, value: scope.get('char.asc.atk')!, kind: 'base' })
  }
  if (nz(scope.get('weap.curve.atk'))) {
    atkRows.push({ source: `${weaponName} 武器白值`, value: scope.get('weap.curve.atk')!, kind: 'base' })
  }
  if (nz(scope.get('weap.asc.atk'))) {
    atkRows.push({ source: `${weaponName} 突破固定攻击力`, value: scope.get('weap.asc.atk')!, kind: 'base' })
  }
  // %-sources
  if (nz(scope.get('char.asc.atk_'))) {
    atkRows.push({ source: `${charName} 突破百分比攻击力`, value: scope.get('char.asc.atk_')!, kind: 'pct' })
  }
  if (nz(scope.get('weap.substat.atk_'))) {
    atkRows.push({ source: `${weaponName} 副词条 攻击力 %`, value: scope.get('weap.substat.atk_')!, kind: 'pct' })
  }
  if (nz(scope.get('weap.asc.atk_'))) {
    atkRows.push({ source: `${weaponName} 突破百分比攻击力`, value: scope.get('weap.asc.atk_')!, kind: 'pct' })
  }
  for (const c of scope.contributionsFor('weap.passive.atk_')) atkRows.push({ ...c, kind: 'pct' })
  for (const c of scope.contributionsFor('artifact.main.atk_')) atkRows.push({ source: `${c.source} 攻击力 %`, value: c.value, kind: 'pct' })
  for (const c of scope.contributionsFor('artifact.sub.atk_')) atkRows.push({ source: `${c.source} 攻击力 %`, value: c.value, kind: 'pct' })
  for (const c of scope.contributionsFor('artifact.set.atk_')) atkRows.push({ ...c, kind: 'pct' })
  // Char passives that buff ATK% land in premod.atk_ via scope.add. Surface
  // them here for parity with HP/DEF breakdown behavior.
  for (const c of scope.contributionsFor('premod.atk_')) atkRows.push({ ...c, kind: 'pct' })
  // Flat sources (plume main + atkFlat subs)
  for (const c of scope.contributionsFor('artifact.main.atk')) atkRows.push({ source: `${c.source} 固定攻击力`, value: c.value, kind: 'flat' })
  for (const c of scope.contributionsFor('artifact.sub.atk')) atkRows.push({ source: `${c.source} 固定攻击力`, value: c.value, kind: 'flat' })
  out.atk = atkRows

  // ---- HP ----
  const hpRows: ContribRow[] = []
  if (nz(scope.get('char.curve.hp'))) {
    hpRows.push({ source: `${charName} 基础生命值曲线`, value: scope.get('char.curve.hp')!, kind: 'base' })
  }
  if (nz(scope.get('char.asc.hp'))) {
    hpRows.push({ source: `${charName} 突破固定生命值`, value: scope.get('char.asc.hp')!, kind: 'base' })
  }
  if (nz(scope.get('char.asc.hp_'))) {
    hpRows.push({ source: `${charName} 突破百分比生命值`, value: scope.get('char.asc.hp_')!, kind: 'pct' })
  }
  if (nz(scope.get('weap.substat.hp_'))) {
    hpRows.push({ source: `${weaponName} 副词条 生命值 %`, value: scope.get('weap.substat.hp_')!, kind: 'pct' })
  }
  for (const c of scope.contributionsFor('artifact.main.hp_')) hpRows.push({ source: `${c.source} 生命值 %`, value: c.value, kind: 'pct' })
  for (const c of scope.contributionsFor('artifact.sub.hp_')) hpRows.push({ source: `${c.source} 生命值 %`, value: c.value, kind: 'pct' })
  for (const c of scope.contributionsFor('premod.hp_')) hpRows.push({ ...c, kind: 'pct' })
  for (const c of scope.contributionsFor('artifact.main.hp')) hpRows.push({ source: `${c.source} 固定生命值`, value: c.value, kind: 'flat' })
  for (const c of scope.contributionsFor('artifact.sub.hp')) hpRows.push({ source: `${c.source} 固定生命值`, value: c.value, kind: 'flat' })
  out.hp = hpRows

  // ---- DEF ----
  const defRows: ContribRow[] = []
  if (nz(scope.get('char.curve.def'))) {
    defRows.push({ source: `${charName} 基础防御力曲线`, value: scope.get('char.curve.def')!, kind: 'base' })
  }
  if (nz(scope.get('char.asc.def'))) {
    defRows.push({ source: `${charName} 突破固定防御力`, value: scope.get('char.asc.def')!, kind: 'base' })
  }
  if (nz(scope.get('char.asc.def_'))) {
    defRows.push({ source: `${charName} 突破百分比防御力`, value: scope.get('char.asc.def_')!, kind: 'pct' })
  }
  if (nz(scope.get('weap.substat.def_'))) {
    defRows.push({ source: `${weaponName} 副词条 防御力 %`, value: scope.get('weap.substat.def_')!, kind: 'pct' })
  }
  for (const c of scope.contributionsFor('artifact.main.def_')) defRows.push({ source: `${c.source} 防御力 %`, value: c.value, kind: 'pct' })
  for (const c of scope.contributionsFor('artifact.sub.def_')) defRows.push({ source: `${c.source} 防御力 %`, value: c.value, kind: 'pct' })
  // Sheet contributions (artifact set effects like Husk 2pc/4pc, weapon
  // passives, char passives) all push into premod.def_ — surface those here
  // so the breakdown panel reflects them.
  for (const c of scope.contributionsFor('premod.def_')) defRows.push({ ...c, kind: 'pct' })
  for (const c of scope.contributionsFor('artifact.sub.def')) defRows.push({ source: `${c.source} 固定防御力`, value: c.value, kind: 'flat' })
  out.def = defRows

  // ---- "Pure" stats — single bucket, no base/% split ----
  const pureStat = (
    key: string,
    label: string,
    baseFromChar = false,
  ): ContribRow[] => {
    const rows: ContribRow[] = []
    if (baseFromChar) {
      // CR has a 5% base baked into the formula. (CD has 50% but we don't
      // show it — that constant is just noise in the breakdown.)
      rows.push({ source: `角色基础 ${label}`, value: key === 'critRate_' ? 0.05 : 0, kind: 'pure' })
    }
    if (nz(scope.get(`char.asc.${key}`))) rows.push({ source: `${charName} 突破 ${label}`, value: scope.get(`char.asc.${key}`)!, kind: 'pure' })
    if (nz(scope.get(`weap.substat.${key}`))) rows.push({ source: `${weaponName} 副词条 ${label}`, value: scope.get(`weap.substat.${key}`)!, kind: 'pure' })
    for (const c of scope.contributionsFor(`artifact.main.${key}`)) rows.push({ source: `${c.source} ${label}`, value: c.value, kind: 'pure' })
    for (const c of scope.contributionsFor(`artifact.sub.${key}`)) rows.push({ source: `${c.source} ${label}`, value: c.value, kind: 'pure' })
    for (const c of scope.contributionsFor(`premod.${key}`)) rows.push({ ...c, kind: 'pure' })
    return rows
  }

  out.eleMas = pureStat('eleMas', '元素精通')
  // ER has a hidden +1.0 baseline.
  const erRows = pureStat('enerRech_', '元素充能效率')
  erRows.unshift({ source: '角色基础充能效率', value: 1, kind: 'pure' })
  out.enerRech_ = erRows
  out.cappedCritRate_ = pureStat('critRate_', '暴击率', /*baseFromChar*/ true)
  out.critDMG_ = pureStat('critDMG_', '暴击伤害', /*baseFromChar*/ true)
  out.heal_ = pureStat('heal_', '治疗加成')

  // Per-element DMG bonus (only the ones we actually display in panel; the
  // adapter filters down to char's own element + physical).
  const ELE_KEYS = ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro', 'physical'] as const
  for (const ele of ELE_KEYS) {
    const eleZh = ELEMENT_LABEL_ZH[ele]
    const rows: ContribRow[] = []
    for (const c of scope.contributionsFor(`artifact.main.${ele}_dmg_`)) rows.push({ source: `${c.source} ${eleZh}元素伤害`, value: c.value, kind: 'pure' })
    for (const c of scope.contributionsFor(`artifact.sub.${ele}_dmg_`)) rows.push({ source: `${c.source} ${eleZh}元素伤害`, value: c.value, kind: 'pure' })
    for (const c of scope.contributionsFor(`premod.dmg_.${ele}`)) rows.push({ ...c, kind: 'pure' })
    out[`${ele}_dmg_`] = rows
  }

  return out
}

const ELEMENT_LABEL_ZH: Record<string, string> = {
  pyro: '火', hydro: '水', cryo: '冰', electro: '雷',
  anemo: '风', geo: '岩', dendro: '草', physical: '物',
}

const MAIN_STAT_TO_GO: Record<string, string> = {
  hpFlat: 'hp', atkFlat: 'atk',
  hpPct: 'hp_', atkPct: 'atk_', defPct: 'def_',
  em: 'eleMas', er: 'enerRech_',
  critRate: 'critRate_', critDmg: 'critDMG_', healingBonus: 'heal_',
  pyroDmg: 'pyro_dmg_', hydroDmg: 'hydro_dmg_', cryoDmg: 'cryo_dmg_',
  electroDmg: 'electro_dmg_', anemoDmg: 'anemo_dmg_', geoDmg: 'geo_dmg_',
  dendroDmg: 'dendro_dmg_', physicalDmg: 'physical_dmg_',
}
const SUB_KEY_TO_GO: Record<string, string> = { ...MAIN_STAT_TO_GO, defFlat: 'def' }
