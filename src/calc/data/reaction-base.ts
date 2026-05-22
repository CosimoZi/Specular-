// Standard transformative-reaction level-base damage table.
// Index = character level (1..100). Index 0 is a -1 sentinel.
//
// Source: vendor/go/gi/keymap/src/StatConstants.ts `transformativeReactionLevelMultipliers`.
// Mihoyo's ElementCoeffExcelConfigData → PlayerElementLevelCo.
// Per the lunar-reaction skill, MOON reactions share this same table.
//
// Usage: base damage at lvl 90 = TRANSFORMATIVE_REACTION_BASE[90] = 1446.8535.
// Reaction-specific coefficient (e.g. 1.8 for moon reactions, 2.0 for overload,
// 1.0 for superconduct, etc.) multiplies this base.

export const TRANSFORMATIVE_REACTION_BASE: readonly number[] = [
  -1.0, // lvl 0 (placeholder)
  17.165606, 18.535048, 19.904854, 21.274902, 22.6454,
  24.649612, 26.640642, 28.868587, 31.36768, 34.143345,
  37.201, 40.66, 44.446667, 48.56352, 53.74848,
  59.081898, 64.420044, 69.72446, 75.12314, 80.58478,
  86.11203, 91.70374, 97.24463, 102.812645, 108.40956,
  113.20169, 118.102905, 122.97932, 129.72733, 136.29291,
  142.67085, 149.02902, 155.41699, 161.8255, 169.10631,
  176.51808, 184.07274, 191.70952, 199.55692, 207.38205,
  215.3989, 224.16566, 233.50217, 243.35057, 256.06308,
  268.5435, 281.52606, 295.01364, 309.0672, 323.6016,
  336.75754, 350.5303, 364.4827, 378.61917, 398.6004,
  416.39825, 434.387, 452.95105, 472.60623, 492.8849,
  513.56854, 539.1032, 565.51056, 592.53876, 624.4434,
  651.47015, 679.4968, 707.79407, 736.67145, 765.64026,
  794.7734, 824.67737, 851.1578, 877.74207, 914.2291,
  946.74677, 979.4114, 1011.223, 1044.7917, 1077.4437,
  1109.9976, 1142.9766, 1176.3695, 1210.1844, 1253.8357,
  1288.9528, 1325.4841, 1363.4569, 1405.0974, 1446.8535,
  1462.788, 1475.6956, 1497.9644, 1516.9423, 1561.468,
  1593.5062, 1621.0258, 1643.8679, 1662.1382, 1674.8092,
]

/** Reaction-type identifier for moon reactions. */
export type MoonReactionType = 'crystallize' | 'electrocharged' | 'bloom'

/** Per-reaction coefficient. Source: 月白姬君's formula reference.
 *  - 月结晶 (crystallize): 1.6 — Linnea / Zibai
 *  - 月感电 (electrocharged): 3 — 菲林斯 / 伊涅芙
 *  - 月绽放 (bloom): 2.8 — Columbina / Lauma / Nefer (confirmed 2026-05-22)
 *
 *  This coefficient multiplies the level-base damage (for `reactionMoon`
 *  kind) OR the main-stat × multiplier expression (for `directMoon` kind).
 *  Both forms use the same per-reaction coefficient. */
export const MOON_REACTION_COEFF: Record<MoonReactionType, number> = {
  crystallize: 1.6,
  electrocharged: 3,
  bloom: 2.8,
}

/** Non-moon transformative reaction types. These deal pure reaction damage
 *  (no main-stat × multiplier), can't crit, and ignore enemy DEF — only the
 *  level-base table × reaction coefficient × (1 + EM bonus + reaction_dmg_)
 *  × RES multiplier. Source: standard genshin damage formulas.
 *
 *  Note: 'electrocharged' here is the NON-moon variant (水+雷, no moon sign in
 *  team) — distinct from MoonReactionType['electrocharged']. The formula
 *  pipeline picks which based on FormulaKind. */
export type TransformativeReactionType =
  | 'overload'        // 超载 (火+雷)
  | 'superconduct'    // 超导 (冰+雷)
  | 'electrocharged'  // 感电 (水+雷)
  | 'swirl'           // 扩散 (风+其他)
  | 'shatter'         // 碎冰 (冻结+重击)
  | 'burning'         // 燃烧 (火+草)

/** Per-reaction coefficient for transformative reactions.
 *  Source: Mihoyo's ReactionInfoExcelConfigData via community reverse-engineering.
 *  Reference: https://genshin-impact.fandom.com/wiki/Damage_Formula */
export const TRANSFORMATIVE_REACTION_COEFF: Record<TransformativeReactionType, number> = {
  overload: 2.0,
  superconduct: 0.5,
  electrocharged: 1.2,
  swirl: 0.6,
  shatter: 1.5,
  burning: 0.25,
}

/** Element each transformative reaction deals damage as. Used for resistance
 *  lookup when the formula doesn't override. */
export const TRANSFORMATIVE_REACTION_ELEMENT: Record<TransformativeReactionType, string> = {
  overload: 'pyro',
  superconduct: 'physical', // superconduct hits physical, not cryo
  electrocharged: 'electro',
  swirl: 'anemo',           // swirl: bonus damage is the swirled element; here we use a default 'anemo' tag
  shatter: 'physical',
  burning: 'pyro',
}

/** Quicken (catalyze) reactions — flat add to a direct hit. Unlike
 *  transformative reactions, these CAN crit (they piggyback on the hit's
 *  crit/DEF/RES). The flat is computed as:
 *    flat = levelBase × baseCoef × (1 + 5×EM/(EM+1200) + reaction_dmg_)
 *  Aggravate (超激化): electro direct hit on dendro-applied → +flat to electro hit.
 *  Spread (蔓激化): dendro direct hit on electro-applied → +flat to dendro hit. */
export type QuickenReactionType = 'aggravate' | 'spread'

export const QUICKEN_REACTION_COEFF: Record<QuickenReactionType, number> = {
  aggravate: 1.15,
  spread: 1.25,
}
