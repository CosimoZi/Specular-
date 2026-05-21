// Game constants. Values sourced from GenshinOptimizer's
// `libs/gi/formula/src/data/common/reaction.ts` — the most-vetted open-source
// reference for current-patch coefficients. Previously we'd seen conflicting
// numbers in BWiki / KQM-cited / Honey Hunter; cross-checked against in-game
// damage values and GO matches.

/** Reaction "level multiplier" — used by transformative + catalyze reactions.
 *  Table from AvatarLevelMultiplier (game data). Linear interpolation between
 *  breakpoints is accurate enough for damage display. */
const LEVEL_MULT_TABLE: Array<[number, number]> = [
  [1, 17.1648],
  [10, 49.0928],
  [20, 116.3514],
  [30, 199.5556],
  [40, 281.5152],
  [50, 410.7150],
  [60, 569.4729],
  [70, 762.8729],
  [80, 994.1242],
  [90, 1077.4434],
]

export function levelMultiplier(level: number): number {
  if (level <= 1) return LEVEL_MULT_TABLE[0][1]
  if (level >= 90) return LEVEL_MULT_TABLE[LEVEL_MULT_TABLE.length - 1][1]
  for (let i = 1; i < LEVEL_MULT_TABLE.length; i++) {
    const [hi, hv] = LEVEL_MULT_TABLE[i]
    if (level <= hi) {
      const [lo, lv] = LEVEL_MULT_TABLE[i - 1]
      const t = (level - lo) / (hi - lo)
      return lv + (hv - lv) * t
    }
  }
  return LEVEL_MULT_TABLE[LEVEL_MULT_TABLE.length - 1][1]
}

/** Base multipliers for amplifying reactions (vape/melt).
 *  "Strong" = receiving aura matches multiplier element (e.g. pyro melt'ing cryo aura).
 *  "Weak" = the inverse. */
export const AMP_BASE = {
  vape_strong: 2.0, // pyro hits hydro aura
  vape_weak: 1.5, //   hydro hits pyro aura
  melt_strong: 2.0, // pyro hits cryo aura
  melt_weak: 1.5, //   cryo hits pyro aura
} as const

/** Base coefficients for transformative reactions, sourced verbatim from
 *  GenshinOptimizer's `transInfo` table. */
export const TRANSFORMATIVE_BASE = {
  overload: 2,
  swirl: 0.6,
  electrocharged: 1.2,
  superconduct: 0.5,
  shatter: 1.5,
  burning: 0.25,
  bloom: 2,
  hyperbloom: 3,
  burgeon: 3,
  // Lunar reactions (5.x). lunarcharged is the only one that's a normal
  // transformative-like damage instance; lunarbloom + lunarcrystallize have
  // their own paths handled in lunar.ts.
  lunarcharged: 1.8,
} as const

/** Which transformative reactions can crit. As of 5.x, bloom-family and
 *  burning gained crit support; classic reactions (overload/swirl/EC/SC/shatter)
 *  still cannot crit. Sourced from GO's `canCrit` flags. */
export const TRANSFORMATIVE_CAN_CRIT: Record<keyof typeof TRANSFORMATIVE_BASE, boolean> = {
  overload: false,
  swirl: false,
  electrocharged: false,
  superconduct: false,
  shatter: false,
  burning: true,
  bloom: true,
  hyperbloom: true,
  burgeon: true,
  lunarcharged: true,
}

/** Catalyze reactions (aggravate / spread) add flat damage INSIDE the base
 *  multiplier zone — i.e. `(ATK × talentMul + catalyzeAdd) × (1 + dmgBonus)`. */
export const CATALYZE_BASE = {
  aggravate: 1.15, // added to electro hit
  spread: 1.25, //   added to dendro hit
} as const

/** EM bonus curves. Each returns the multiplicative bonus to apply.
 *  - amp:         `(1 + curve(EM) + reactionBonus)` × base
 *  - transformative: same shape
 *  - catalyze:    same shape, on the *additive* damage component
 *  - lunar:       lunar reactions use a gentler curve */
export const EM_CURVES = {
  amp: (em: number) => (2.78 * em) / (em + 1400),
  transformative: (em: number) => (16 * em) / (em + 2000),
  catalyze: (em: number) => (5 * em) / (em + 1200),
  /** Lunar curve. Coefficient denominator pair sourced from GO's lunar
   *  formula; should be verified against in-game numbers. */
  lunar: (em: number) => (6 * em) / (em + 2000),
} as const
