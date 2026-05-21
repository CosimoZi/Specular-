// 5★ artifact main-stat values at level 20 (max).
//
// Genshin's mainstat tables are deterministic given (rarity, slot, statKey,
// level). We hardcode the level-20 5★ values since that's the default in our
// UI; intermediate-level support is a follow-up.
//
// Source: cross-referenced with Hoyolab + ambr.top + KeqingMains. These match
// what GO's `getMainStatValue` returns for level=20, rarity=5.
//
// All percent stats are stored as decimals (0.466 = 46.6%). Flat stats (hp,
// atk, def, eleMas) are absolute numbers.

export type ArtifactSlot = 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet'

/** Maps the in-game main-stat key to its 5★ L20 value, per slot. Not every
 *  (slot, statKey) is legal — e.g. flower is always hp flat, plume always
 *  atk flat. The lookup returns undefined for illegal combos. */
export function mainStatMaxValueL20(slot: ArtifactSlot, statKey: string): number | undefined {
  return MAIN_STAT_L20[slot]?.[statKey]
}

const MAIN_STAT_L20: Record<ArtifactSlot, Record<string, number>> = {
  flower: {
    hp: 4780,
  },
  plume: {
    atk: 311,
  },
  sands: {
    hp_: 0.466,
    atk_: 0.466,
    def_: 0.583,
    eleMas: 187,
    enerRech_: 0.518,
  },
  goblet: {
    hp_: 0.466,
    atk_: 0.466,
    def_: 0.583,
    eleMas: 187,
    pyro_dmg_: 0.466,
    hydro_dmg_: 0.466,
    cryo_dmg_: 0.466,
    electro_dmg_: 0.466,
    anemo_dmg_: 0.466,
    geo_dmg_: 0.466,
    dendro_dmg_: 0.466,
    physical_dmg_: 0.583,
  },
  circlet: {
    hp_: 0.466,
    atk_: 0.466,
    def_: 0.583,
    eleMas: 187,
    critRate_: 0.311,
    critDMG_: 0.622,
    heal_: 0.359,
  },
}
