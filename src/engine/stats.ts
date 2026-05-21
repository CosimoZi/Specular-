import type { DamageElement, FinalStats, StatBag } from './types'

const ELEMENTS: DamageElement[] = [
  'Pyro',
  'Hydro',
  'Cryo',
  'Electro',
  'Anemo',
  'Geo',
  'Dendro',
  'Physical',
]

const ZERO_ELEMENTAL: Record<DamageElement, number> = Object.fromEntries(
  ELEMENTS.map((e) => [e, 0]),
) as Record<DamageElement, number>

/** Combine a list of stat bags (character base + ascension + weapon + artifact
 *  main/sub + buffs) into a FinalStats object the damage engine consumes.
 *
 *  Convention used by callers:
 *   - hpFlat / atkFlat / defFlat are flat additions to the BASE stat
 *   - hpPct / atkPct / defPct are multiplicative on (base + flat)
 *   - elemental DMG keys (pyroDmg, hydroDmg, …) and `allDmg` go directly
 *     into FinalStats.elementalDmg[element]
 */
export function aggregateStats(bags: StatBag[]): FinalStats {
  const sum: Required<StatBag> = {
    baseHp: 0,
    baseAtk: 0,
    baseDef: 0,
    hpFlat: 0,
    atkFlat: 0,
    defFlat: 0,
    hpPct: 0,
    atkPct: 0,
    defPct: 0,
    em: 0,
    er: 1.0, // engine baseline is 100% ER
    critRate: 0.05, // game baseline 5% (most characters)
    critDmg: 0.5, // game baseline 50%
    healingBonus: 0,
    incomingHealingBonus: 0,
    pyroDmg: 0,
    hydroDmg: 0,
    cryoDmg: 0,
    electroDmg: 0,
    anemoDmg: 0,
    geoDmg: 0,
    dendroDmg: 0,
    physicalDmg: 0,
    allDmg: 0,
    lunarDmgBonus: 0,
  }

  for (const b of bags) {
    for (const k of Object.keys(b) as (keyof StatBag)[]) {
      const v = b[k]
      if (typeof v !== 'number') continue
      if (k === 'er' || k === 'critRate' || k === 'critDmg') {
        // Replace? No — these are additive too in-game. ER baseline 1.0 is set
        // above; treat each bag's er/cr/cd as a positive bonus added to it
        // EXCEPT the baseline character ER which should be applied by setting
        // baseEr in the character bag (TODO: revisit if needed).
      }
      sum[k] += v
    }
  }

  const hp = (sum.baseHp + sum.hpFlat) * (1 + sum.hpPct) + 0
  const atk = (sum.baseAtk + sum.atkFlat) * (1 + sum.atkPct) + 0
  const def = (sum.baseDef + sum.defFlat) * (1 + sum.defPct) + 0

  const elementalDmg: Record<DamageElement, number> = { ...ZERO_ELEMENTAL }
  elementalDmg.Pyro = sum.pyroDmg + sum.allDmg
  elementalDmg.Hydro = sum.hydroDmg + sum.allDmg
  elementalDmg.Cryo = sum.cryoDmg + sum.allDmg
  elementalDmg.Electro = sum.electroDmg + sum.allDmg
  elementalDmg.Anemo = sum.anemoDmg + sum.allDmg
  elementalDmg.Geo = sum.geoDmg + sum.allDmg
  elementalDmg.Dendro = sum.dendroDmg + sum.allDmg
  elementalDmg.Physical = sum.physicalDmg + sum.allDmg

  return {
    hp,
    atk,
    def,
    em: sum.em,
    er: sum.er,
    critRate: sum.critRate,
    critDmg: sum.critDmg,
    elementalDmg,
  }
}

/** Get the scaling stat numerical value for an instance. */
export function scalingValue(
  stats: FinalStats,
  scaling: 'atk' | 'hp' | 'def' | 'em' | 'flat',
): number {
  switch (scaling) {
    case 'atk':
      return stats.atk
    case 'hp':
      return stats.hp
    case 'def':
      return stats.def
    case 'em':
      return stats.em
    case 'flat':
      return 1
  }
}
