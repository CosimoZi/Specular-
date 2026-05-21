// Read a talent-level-indexed value from GO's skillParam tables.
//
// Most character buff magnitudes scale with talent level — e.g. Shenhe's Q
// RES shred is 6% at Q lv.1 and 10% at Q lv.13. The actual numbers live in
// allStats.char.skillParam.<key>.<area>[paramIdx][level-1], an array indexed
// by talent level (0..14 = lv 1..15).
//
// This helper just wraps the lookup with bounds-checking so buff
// descriptors can compute a displayable value at the user's current build.

import { allStats } from '@genshin-optimizer/gi/stats'

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
