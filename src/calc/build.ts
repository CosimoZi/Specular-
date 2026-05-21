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
import type { CondState } from './sheet-types'
import { ShenheFormulas, applyShenheFormulaBuffs, shenheQResShred } from './sheets/Shenhe-formulas'
import { evaluateFormula, type FormulaDef, type FormulaResult, type EnemyContext } from './formula'

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
}

export function buildCharacter(
  config: CharacterConfig,
  optsOrCondState: BuildOpts | CondState = {},
): BuildResult {
  const opts: BuildOpts = isCondStateOnly(optsOrCondState)
    ? { condState: optsOrCondState as CondState }
    : (optsOrCondState as BuildOpts)
  const condState = opts.condState ?? {}
  const enemy: EnemyContext = opts.enemy ?? { level: 100 }
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
  const charSheet = characterSheets[goCharKey]
  if (charSheet) {
    charSheet.apply(
      scope,
      { level: config.level, ascension: config.ascensionStage, constellation: config.constellation, talents: config.talentLevels },
      condState,
    )
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
  scope.set('final.atk', evaluate(
    sum(prod(v('base.atk'), sum(1, v('premod.atk_'))), v('premod.atk.flat')),
    scope,
  ))
  scope.set('final.hp', evaluate(
    sum(prod(v('base.hp'), sum(1, v('premod.hp_'))), v('premod.hp.flat')),
    scope,
  ))
  scope.set('final.def', evaluate(
    sum(prod(v('base.def'), sum(1, v('premod.def_'))), v('premod.def.flat')),
    scope,
  ))

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

  // ---- Phase 13: damage-side cond buffs + formula evaluation ----
  // These mutate the final.dmg_.* / final.dmgMove_.* slots, so they have to
  // run AFTER phase 12 (which initialised them) and BEFORE formulas read.
  // Per-character buff hook: today, only Shenhe.
  if (goCharKey === 'Shenhe') applyShenheFormulaBuffs(scope, condState)

  const formulas: FormulaResult[] = []
  const formulaDefs: FormulaDef[] = goCharKey === 'Shenhe' ? ShenheFormulas : []
  if (formulaDefs.length) {
    // Apply Q-field RES shred (cryo + phys) to enemy context, if any.
    const resShred = goCharKey === 'Shenhe' ? shenheQResShred(scope, condState) : 0
    const enemyForEval: EnemyContext = resShred > 0
      ? {
          ...enemy,
          preRes: {
            ...enemy.preRes,
            cryo: (enemy.preRes?.cryo ?? 0.1) - resShred,
            physical: (enemy.preRes?.physical ?? 0.1) - resShred,
          },
        }
      : enemy
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
  const charName = charKey
  const weaponName = weaponKey ?? '武器'
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
      // CR / CD have a fixed base (5% / 50%) baked into the formula.
      rows.push({ source: `角色基础 ${label}`, value: key === 'cappedCritRate_' ? 0.05 : 0.5, kind: 'pure' })
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
