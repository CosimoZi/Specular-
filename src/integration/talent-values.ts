// Read a talent-level-indexed value from GO's skillParam tables, optionally
// adjusted for constellation talent boosts.
//
// Two flavors of "talent level":
//   - base: what the user sets in the config (1..10 in-game, 1..15 in the data).
//     The user controls this directly via the talent-level number inputs.
//   - effective: base + any constellation-driven boost. Genshin's convention
//     is +3 from one constellation each to skill and burst (typically C3 and
//     C5, sometimes swapped). The Pando engine's damage compute reads
//     `own.char.skill` / `own.char.burst` which already include this boost,
//     so internal numbers are correct. But for UI display we need the
//     effective level to match what the engine uses.
//
// The actual numbers live in
//   allStats.char.skillParam.<key>.<area>[paramIdx][level-1]
// an array indexed by effective talent level (0..14 = lv 1..15).

import { allStats } from '@genshin-optimizer/gi/stats'
import type { CharacterConfig } from '@/data/config-types'

type TalentArea =
  | 'auto'
  | 'skill'
  | 'burst'
  | 'passive1'
  | 'passive2'
  | 'passive3'
  | 'constellation1'
  | 'constellation2'
  | 'constellation3'
  | 'constellation4'
  | 'constellation5'
  | 'constellation6'

/** Read a single value from the character's talent param table.
 *  @param level 1..15. Clamped to the table's actual length. */
export function talentValue(
  charKey: string,
  area: TalentArea,
  paramIdx: number,
  level: number,
): number {
  const params = (allStats.char.skillParam as Record<string, Record<string, unknown>>)[charKey]
  if (!params) return 0
  const block = params[area]
  if (!Array.isArray(block)) return 0
  const row = block[paramIdx]
  // Passives / constellations sometimes use [paramIdx][0] for scalar values.
  if (typeof row === 'number') return row
  if (!Array.isArray(row)) return 0
  if (row.length === 0) return 0
  const i = Math.min(Math.max(level - 1, 0), row.length - 1)
  const v = row[i]
  return typeof v === 'number' ? v : 0
}

// ----- Constellation → talent-level boost map -----
//
// Per-character record of which constellation grants +3 to which talent.
// Mirrors what each Pando sheet declares via
//   ownBuff.char.<role>.add(cmpGE(constellation, N, 3))
// We duplicate it here because the Pando declaration is opaque from outside
// the engine; auto-extraction would require running the sheet against a
// probe build. Cheaper to maintain a small table by hand and audit when we
// wire a new character.
//
// NO DEFAULT — new characters give NO talent boost in the UI display until
// they're explicitly added to this table. This is intentional: the
// majority convention is C3→skill, C5→burst, but enough characters invert
// it (some even put boosts on different talents) that a default would
// silently produce wrong-looking display values for those edge cases.
//
// **When adding a new character's buff descriptor, you MUST also**:
//   1. Read the character's constellation list (zh/en wiki or BWiki)
//   2. Find which constellation says "elemental skill talent level +3"
//      and which says "elemental burst talent level +3"
//   3. Add an entry here. If they don't follow C3:skill/C5:burst, double-
//      check the Pando sheet's `ownBuff.char.<role>.add(cmpGE(...))` lines
//      to confirm.
//   4. Leave the boost slot undefined if a constellation doesn't grant a
//      talent boost at all (some characters get a stat buff instead, etc).
type Role = 'auto' | 'skill' | 'burst'
const CONSTELLATION_TALENT_BOOSTS: Record<string, { c3?: Role; c5?: Role }> = {
  Shenhe:  { c3: 'skill', c5: 'burst' },  // verified against vendor Shenhe.ts
  Nahida:  { c3: 'skill', c5: 'burst' },  // verified against vendor Nahida.ts
  Nilou:   { c3: 'skill', c5: 'burst' },  // verified against vendor Nilou.ts
  Candace: { c3: 'skill', c5: 'burst' },  // verified against vendor Candace.ts
}

/** Effective talent level for display, including constellation +3 boosts.
 *  Use this whenever you're reading from talentValue() for UI purposes —
 *  it ensures the displayed magnitude matches what the Pando engine uses.
 *  Characters not in the constellation-boost map fall through to base. */
export function effectiveTalentLevel(
  goKey: string | null,
  role: Role,
  config: CharacterConfig,
): number {
  const base = config.talentLevels[role]
  if (role === 'auto') return base // C3/C5 never boost auto
  const map = goKey ? CONSTELLATION_TALENT_BOOSTS[goKey] : undefined
  if (!map) return base
  let bonus = 0
  if (config.constellation >= 3 && map.c3 === role) bonus += 3
  if (config.constellation >= 5 && map.c5 === role) bonus += 3
  return base + bonus
}

/** True if a +3 from a constellation is currently applied to the given role. */
export function consBoostActive(
  goKey: string | null,
  role: Role,
  config: CharacterConfig,
): boolean {
  if (role === 'auto') return false
  const map = goKey ? CONSTELLATION_TALENT_BOOSTS[goKey] : undefined
  if (!map) return false
  if (config.constellation >= 3 && map.c3 === role) return true
  if (config.constellation >= 5 && map.c5 === role) return true
  return false
}
