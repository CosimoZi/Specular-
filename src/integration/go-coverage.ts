// Which characters in the vendored GenshinOptimizer sheets have REAL buff /
// damage wiring vs which are still upstream stubs. A stub character was
// silently fake-buffing every team it appeared in (literal +100% ATK to
// self + team, -100% enemy DEF) until we patched it out in
// scripts/strip-go-stub-lies.mjs. After that patch they're "honest empty" —
// no buff, no lie, but no full damage breakdown either (only the auto
// attack first hit is wired).
//
// This list drives the badge in /team so the user knows which slots'
// numbers can be trusted vs which are equipment-only estimates.
//
// When we manually fill in a character's real talent / buff wiring (matching
// what Nahida/Nilou/Candace already have), add their GO key here.

/** Characters with fully-wired talent formulas + buffs in the vendored
 *  upstream GO sheets. Their /team damage analysis numbers are authoritative
 *  for that character's role + propagated team buffs. */
export const FULLY_WIRED_CHARACTERS: ReadonlySet<string> = new Set<string>([
  'Candace',
  'Nahida',
  'Nilou',
])

export type WiringTier = 'wired' | 'stub'

export function wiringTierForGoKey(goKey: string | null): WiringTier {
  if (!goKey) return 'stub'
  return FULLY_WIRED_CHARACTERS.has(goKey) ? 'wired' : 'stub'
}
