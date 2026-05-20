// Game constants — sourced from public community references (KQM, AnimeGameData).
// All values reflect 5.x patch numbers as of 2026-Q2.

/** Reaction "level multiplier" — used by transformative + catalyze reactions.
 *  Values from AvatarLevelMultiplier (game data). Linearly interpolated between
 *  the tabulated breakpoints for off-key levels (game itself uses smooth curve;
 *  linear is accurate enough for damage display). */
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

/** Base multipliers for amplifying reactions (vape/melt). "Strong" = the
 *  reaction triggered when the matching aura is consumed by the multiplier
 *  element (e.g. pyro melt'ing cryo aura). "Weak" is the inverse. */
export const AMP_BASE = {
  vape_strong: 2.0, // pyro hits hydro aura
  vape_weak: 1.5, //   hydro hits pyro aura
  melt_strong: 2.0, // pyro hits cryo aura
  melt_weak: 1.5, //   cryo hits pyro aura
} as const

/** Base coefficients for transformative reactions. Final damage =
 *  base * levelMult * (1 + EM_curve + reactionBonus%) * resMult. */
export const TRANSFORMATIVE_BASE = {
  overload: 4.0,
  swirl: 0.6,
  electrocharged: 2.4,
  superconduct: 1.5,
  shatter: 3.0,
  burning: 0.25,
  bloom: 2.0,
  hyperbloom: 3.0,
  burgeon: 3.0,
} as const

/** Catalyze reactions (aggravate / spread) add flat damage to the base hit. */
export const CATALYZE_BASE = {
  aggravate: 1.15, // added to electro hit
  spread: 1.25, //   added to dendro hit
} as const

/** EM bonus curves. Each returns the multiplicative bonus to apply.
 *  - amp: multiplies final damage by `1 + curve(EM) + reactionBonus`
 *  - transformative: same shape
 *  - catalyze: same shape, but multiplies the *additive* damage component */
export const EM_CURVES = {
  amp: (em: number) => (2.78 * em) / (em + 1400),
  transformative: (em: number) => (16 * em) / (em + 2000),
  catalyze: (em: number) => (5 * em) / (em + 1200),
} as const
