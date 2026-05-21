/** Damage element. Matches in-game element names, plus 'Physical' for
 *  non-elemental hits and 'Lunar*' families for the 5.x reaction system. */
export type DamageElement =
  | 'Pyro'
  | 'Hydro'
  | 'Cryo'
  | 'Electro'
  | 'Anemo'
  | 'Geo'
  | 'Dendro'
  | 'Physical'

/** Stat key in normalised form (engine-internal). */
export type StatKey =
  | 'baseHp'
  | 'baseAtk'
  | 'baseDef'
  | 'hpFlat'
  | 'atkFlat'
  | 'defFlat'
  | 'hpPct'
  | 'atkPct'
  | 'defPct'
  | 'em'
  | 'er'
  | 'critRate'
  | 'critDmg'
  | 'healingBonus'
  | 'incomingHealingBonus'
  | 'pyroDmg'
  | 'hydroDmg'
  | 'cryoDmg'
  | 'electroDmg'
  | 'anemoDmg'
  | 'geoDmg'
  | 'dendroDmg'
  | 'physicalDmg'
  | 'allDmg' // generic "DMG bonus" applied to every hit (rare)
  | 'lunarDmgBonus' // NEW (5.x): separate DMG-bonus stat that applies ONLY to lunar reactions

export type StatBag = Partial<Record<StatKey, number>>

/** Final aggregated stats with no flat/percent distinction — what the damage
 *  formula consumes. */
export interface FinalStats {
  hp: number
  atk: number
  def: number
  em: number
  er: number
  critRate: number // 0..1+ (engine clamps)
  critDmg: number // 0..n
  /** elementalDmg[e] = multiplicative bonus for that element, 0..n.
   *  e.g. 0.466 means +46.6%. Includes any "all DMG" bonus. */
  elementalDmg: Record<DamageElement, number>
}

/** Per-character context: who is hitting. */
export interface AttackerContext {
  level: number // 1..90 (engine clamps)
  stats: FinalStats
}

/** Per-target context: who is being hit. */
export interface TargetContext {
  level: number
  /** Base elemental resistance 0..n. 0.10 = 10%. Most enemies are 10%. */
  resistance: Record<DamageElement, number>
  /** Stacking resistance reduction the team applies. Same shape as resistance. */
  resReduction?: Partial<Record<DamageElement, number>>
  /** Defense reduction (e.g. Zhongli E -20% def). 0..1. */
  defReduction?: number
  /** Defense ignore (e.g. Klee A4). 0..1. */
  defIgnore?: number
}

/** Reaction the hit triggers. */
export type Reaction =
  | { kind: 'none' }
  | { kind: 'vape'; trigger: 'pyro_on_hydro' | 'hydro_on_pyro' }
  | { kind: 'melt'; trigger: 'pyro_on_cryo' | 'cryo_on_pyro' }
  | { kind: 'aggravate' }
  | { kind: 'spread' }
  | {
      kind: 'transformative'
      type:
        | 'overload'
        | 'swirl'
        | 'electrocharged'
        | 'superconduct'
        | 'shatter'
        | 'burning'
        | 'bloom'
        | 'hyperbloom'
        | 'burgeon'
        | 'lunarcharged'
      /** Swirl propagates an element — set this when kind=transformative type=swirl. */
      swirlElement?: 'Pyro' | 'Hydro' | 'Cryo' | 'Electro'
    }

/** Skill multiplier and where it scales from. */
export interface DamageInstance {
  label: string
  scaling: 'atk' | 'hp' | 'def' | 'em' | 'flat'
  /** Multiplier on the scaling stat, in percent (1.32 = 132%). For flat, the
   *  value is the literal damage number (rarely used). */
  multiplier: number
  /** Additional flat damage added to base (e.g. some talents add %HP on top). */
  flatBonus?: {
    scaling: 'atk' | 'hp' | 'def' | 'em'
    multiplier: number
  }
  element: DamageElement
  /** Reaction-bonus% for this hit (Crimson Witch 4pc, dragonstrike, etc.).
   *  Applied INSIDE the reaction bracket: `1 + EM_curve + reactionBonus`. */
  reactionBonus?: number
  /** Damage-bonus% specific to this hit, e.g. Vape +15% from skill talent.
   *  Stacks additively with stats.elementalDmg[element]. */
  hitDmgBonus?: number
  /** Hit-type, used to scope buffs. */
  hitType?: 'normal' | 'charged' | 'plunge' | 'skill' | 'burst'
}

export interface DamageOutput {
  /** Damage if the hit does not crit. */
  nonCrit: number
  /** Damage if the hit crits. */
  crit: number
  /** Probability-weighted average (using critRate). */
  avg: number
  /** Diagnostic breakdown — what each multiplier contributed. */
  trace: Record<string, number>
}
