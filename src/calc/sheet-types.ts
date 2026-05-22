// Shared sheet interfaces. A "sheet" is anything that can contribute buffs:
// character, weapon, artifact set. Each sheet declares:
//   * Conds — toggles the UI surfaces (bool / num).
//   * apply(scope, params, condState) — mutates scope with the sheet's
//     stat contributions. Damage-formula contributions are added separately
//     (see src/calc/formula.ts when that lands).
//
// The buff system is intentionally not AST-everywhere: numeric stat
// contributions are pure-scope mutation (fast, readable). AST is reserved
// for damage-formula expressions where introspection matters.

import type { Scope } from './scope'

export type CondType = 'bool' | 'num'
export interface CondDef {
  /** Local name within the sheet (e.g. 'quillActive', 'set4', 'stack'). */
  name: string
  type: CondType
  /** Display label — Chinese preferred for our UI. */
  label?: string
  /** For 'num' conds: integer-only by default. */
  intOnly?: boolean
  min?: number
  max?: number
}

/** Cond state, flattened per-sheet:
 *    { ShenheConds: { quillActive: 1, c4Stacks: 12, ... }, NoblesseOblige: { set4: 1 } } */
export type CondState = Record<string, Record<string, number>>

export interface CharacterSheet {
  key: string
  conds: CondDef[]
  /** Apply character ascension passives, constellation buffs, etc. */
  apply: (scope: Scope, ctx: CharacterApplyCtx, condState: CondState) => void
  /** Apply TEAM-buff effects to a TEAMMATE's scope. Called for each non-focus
   *  team member whose character has team-propagating buffs. Mirrors
   *  ArtifactSetSheet.applyAsTeammate. Use this for any
   *  `teamBuff.premod.<X>.add(donor_stat × ratio)` from the vendor sheet —
   *  the hook receives the donor's TeamPanelSnapshot so you can read their
   *  finalDef/finalAtk/finalHp/etc. and write the resulting buff into focus
   *  scope.
   *
   *  Concrete example (Linnea C1): when Linnea is a teammate, her
   *  `applyAsTeammate` writes `focusScope.add('premod.dmgIncReaction.crystallize',
   *  wearer.finalDef × 0.75, ...)`. All moon-crystallize formulas on the focus
   *  side then automatically include this flat via formula.ts's shared slot read.
   *
   *  Omit for chars whose effects are entirely self-side. */
  applyAsTeammate?: (
    focusScope: Scope,
    condState: CondState,
    wearer: TeamPanelSnapshot,
  ) => void
}

/** Inputs a per-character RES-shred function needs. Used both for focus (self
 *  config) and teammates (via TeamPanelSnapshot). No `scope` — RES shreds
 *  shouldn't depend on derived stats, only character/talent levels and conds. */
export interface ResShredCtx {
  constellation: number
  ascension: number
  talents: { auto: number; skill: number; burst: number }
}

/** Returns a map of `<element-or-physical> → shred amount` (positive,
 *  subtract from enemy.preRes). Empty map means no shred. */
export type CharResShredFn = (ctx: ResShredCtx, condState: CondState) => Record<string, number>

export interface CharacterApplyCtx {
  level: number
  ascension: number
  constellation: number
  talents: { auto: number; skill: number; burst: number }
  /** Team panels from a prior "pass 1" build (without team buffs propagated).
   *  Available in the focus character's apply() when team-adapter does a
   *  two-pass build. Use this to compute cross-character buffs (e.g. Linnea
   *  A4 reads her DEF and writes EM to active char's scope).
   *
   *  Each slot has the buffer character's `goKey`, its element, level, and
   *  panel stats — all from before team buffs were applied (so reading these
   *  for Type 1 conversions doesn't double-count). */
  teamPanels?: Array<TeamPanelSnapshot | null>
  /** Index of THIS character in `teamPanels`. */
  focusSlotIdx?: number
}

export interface TeamPanelSnapshot {
  goKey: string
  element: string
  level: number
  ascension: number
  constellation: number
  talents: { auto: number; skill: number; burst: number }
  /** Base ATK (char curve + ascension + weapon curve + weapon ascension) BEFORE
   *  any % multiplier. Required for Bennett-style "base.atk × ratio" buffs. */
  baseAtk: number
  /** Base HP/DEF (char curve + ascension), pre-multiplier. */
  baseHp: number
  baseDef: number
  /** Post-multiplier final stats. */
  finalHp: number
  finalAtk: number
  finalDef: number
  finalEleMas: number
  /** Equipped artifact set → count map. Used by cross-char artifact-set
   *  propagation (e.g. teammate wearing NO 4pc → focus gets +20% ATK%). */
  setCounts: Record<string, number>
}

export interface WeaponSheet {
  key: string
  conds: CondDef[]
  /** Apply weapon passive at the given refinement. base stats (curves +
   *  ascension flats + substat) are handled by the generic pipeline; this
   *  is for the passive only. */
  apply: (scope: Scope, ctx: WeaponApplyCtx, condState: CondState) => void
  /** Rich buff descriptors for the UI panel. Each entry describes the weapon
   *  passive (often a single buff, sometimes split per cond). Renders at the
   *  TOP of the wearer's section in the cond panel — alongside the artifact
   *  buffs — so the user sees their equipped weapon's effects clearly.
   *
   *  Use BuffEntry shape from buff-sources.ts. Set each entry's `sheetKey`
   *  to this weapon's key so cond toggles write to the right namespace.
   *  Most weapon passives are SELF-only (the wielder gets the buff) — mark
   *  with `scope: 'self'` so they're hidden when focus ≠ wearer. */
  buffs?: ReadonlyArray<import('../integration/buff-sources').BuffEntry>
}

export interface WeaponApplyCtx {
  level: number
  ascension: number
  refinement: number  // 1..5
}

export interface ArtifactSetSheet {
  key: string
  conds: CondDef[]
  /** Apply SELF effects (2pc/4pc on wearer's own stats) to wearer's scope. */
  apply: (scope: Scope, count: number, condState: CondState) => void
  /** Apply TEAM-buff effects to a TEAMMATE's scope. Called when a non-focus
   *  team member wears this set and focus is somebody else. Sets like
   *  NoblesseOblige 4pc (`teamBuff.premod.atk_`) implement this. Omit for
   *  sets whose effects are entirely self-side (Husk, Vermillion, etc.).
   *  `wearer` is the team member who has the set (pass-1 snapshot). */
  applyAsTeammate?: (
    focusScope: Scope,
    count: number,
    condState: CondState,
    wearer: TeamPanelSnapshot,
  ) => void
  /** Rich buff descriptors for the UI panel. Each entry describes a 2pc or
   *  4pc effect with name, effect text, optional condName, and scope. These
   *  show up at the TOP of the wearer's section in the cond panel — before
   *  character buffs — so the user sees their equipped artifacts' effects
   *  clearly.
   *
   *  Use BuffEntry shape from buff-sources.ts. Set each entry's `sheetKey`
   *  to this set's key so cond toggles write to the right namespace. */
  buffs?: ReadonlyArray<import('../integration/buff-sources').BuffEntry>
}
