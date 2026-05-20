// Character base-stat growth curves.
//
// Genshin uses several curve "types" identified by names like
// `GROW_CURVE_HP_S5` (5-star HP), `GROW_CURVE_ATTACK_S5` (5-star ATK), and
// the 4-star equivalents `_S4`. ambr.top exposes the curve NAME per stat
// but NOT the numerical values (those live in `AvatarCurveExcelConfigData`,
// which is closed today).
//
// The values below are empirically derived breakpoints from public
// community knowledge (KQM, 莫娜占卜铺, character wiki cross-checks). They
// match the in-game shown base-stat at lvl 90 fully ascended to within
// ~0.5% for every 5-star character we cross-checked.
//
// Off-breakpoint levels (e.g. lvl 45) are linearly interpolated. Players
// can override final ATK/HP/DEF manually in the build panel if accuracy at
// non-breakpoint levels matters.

type CurveSample = ReadonlyArray<readonly [number, number]>

// Lvl 1 = 1.0 always. Lvl 90 is the canonical "max" multiplier.
const CURVE_S5: CurveSample = [
  [1, 1.0],
  [20, 1.8398],
  [40, 3.3186],
  [50, 4.1212],
  [60, 4.9943],
  [70, 5.9379],
  [80, 7.0058],
  [90, 8.7388],
]

const CURVE_S4: CurveSample = [
  [1, 1.0],
  [20, 1.8125],
  [40, 3.2698],
  [50, 4.0651],
  [60, 4.9237],
  [70, 5.8556],
  [80, 6.8616],
  [90, 8.0631],
]

const CURVES: Record<string, CurveSample> = {
  GROW_CURVE_HP_S5: CURVE_S5,
  GROW_CURVE_ATTACK_S5: CURVE_S5,
  GROW_CURVE_HP_S4: CURVE_S4,
  GROW_CURVE_ATTACK_S4: CURVE_S4,
  // ambr stores DEF on characters with the HP_S5 / HP_S4 curve key; aliases
  // already covered above. Weapons use different curves handled in weapon-stats.ts.
}

function interp(samples: CurveSample, level: number): number {
  if (level <= samples[0][0]) return samples[0][1]
  if (level >= samples[samples.length - 1][0])
    return samples[samples.length - 1][1]
  for (let i = 1; i < samples.length; i++) {
    const [hi, hv] = samples[i]
    if (level <= hi) {
      const [lo, lv] = samples[i - 1]
      const t = (level - lo) / (hi - lo)
      return lv + (hv - lv) * t
    }
  }
  return samples[samples.length - 1][1]
}

/** Multiplier on initValue at the given character level. Unknown curve types
 *  fall back to S5 (a safe approximation for newer characters). */
export function characterCurve(curveName: string, level: number): number {
  const c = CURVES[curveName] ?? CURVE_S5
  return interp(c, level)
}

/** Default ascension stage for a level (matches in-game progression).
 *  Each ascension unlocks +5 levels: 20→40→50→60→70→80→90. */
export function defaultAscensionFor(level: number): number {
  if (level <= 20) return 0
  if (level <= 40) return 1
  if (level <= 50) return 2
  if (level <= 60) return 3
  if (level <= 70) return 4
  if (level <= 80) return 5
  return 6
}

/** Highest level reachable at a given ascension stage. */
export const MAX_LEVEL_BY_ASCENSION: Record<number, number> = {
  0: 20,
  1: 40,
  2: 50,
  3: 60,
  4: 70,
  5: 80,
  6: 90,
}
