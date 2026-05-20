// Marginal-value computation for artifact substats.
//
// Given a current build (StatBag list) + a damage calculation closure, compute
// "how much does total damage go up when I add one more substat roll".
//
// A "roll" is a single artifact substat sub-tier. Genshin's max-roll values:

import type { StatBag } from './types'

export type Substat =
  | 'critRate'
  | 'critDmg'
  | 'atkPct'
  | 'hpPct'
  | 'defPct'
  | 'em'
  | 'er'
  | 'atkFlat'
  | 'hpFlat'
  | 'defFlat'

/** One max-roll values for each substat (5-star artifact, max tier). */
export const MAX_ROLL_VALUES: Record<Substat, number> = {
  critRate: 0.0389,
  critDmg: 0.0777,
  atkPct: 0.0583,
  hpPct: 0.0583,
  defPct: 0.0729,
  em: 23.31,
  er: 0.0648,
  atkFlat: 19.45,
  hpFlat: 298.75,
  defFlat: 23.15,
}

/** Map a substat key to the StatBag key it bumps. */
export const SUBSTAT_TO_BAG: Record<Substat, keyof StatBag> = {
  critRate: 'critRate',
  critDmg: 'critDmg',
  atkPct: 'atkPct',
  hpPct: 'hpPct',
  defPct: 'defPct',
  em: 'em',
  er: 'er',
  atkFlat: 'atkFlat',
  hpFlat: 'hpFlat',
  defFlat: 'defFlat',
}

export const ALL_SUBSTATS: Substat[] = [
  'critRate',
  'critDmg',
  'atkPct',
  'hpPct',
  'defPct',
  'em',
  'er',
  'atkFlat',
  'hpFlat',
  'defFlat',
]
