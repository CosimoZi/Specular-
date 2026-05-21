// Calamity Queller (息灾) — 5★ polearm. R1..R5.
//
// Passive 1 — permanent: +12/15/18/21/24% all-elemental DMG bonus.
// Passive 2 — active: after E, "Consummation" stacks +3.2/4/4.8/5.6/6.4% ATK
//   per stack, up to 6 stacks, 20s duration. When wielder is OFF-field this
//   effect is doubled (so 6.4 → 12.8% ATK%/stack at R1 off-field).

import type { WeaponSheet } from '../sheet-types'
import { WEAPON_NAME_ZH as W } from '../data/names-zh'

const NAME = W.CalamityQueller

// "All Elemental DMG Bonus" per wiki — physical is NOT included.
const ALL_ELEMENTS = ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro'] as const

// Per-refinement tables (R1..R5)
const DMG_BONUS = [NaN, 0.12, 0.15, 0.18, 0.21, 0.24]
const ATK_PER_STACK = [NaN, 0.032, 0.04, 0.048, 0.056, 0.064]

export const CalamityQueller: WeaponSheet = {
  key: 'CalamityQueller',
  conds: [
    { name: 'stack', type: 'num', label: 'Consummation 层数', intOnly: true, min: 0, max: 6 },
  ],
  apply(scope, ctx, condState) {
    const r = ctx.refinement
    if (r < 1 || r > 5) return
    // Passive 1: permanent +X% all-ele dmg.
    const dmgBonus = DMG_BONUS[r]!
    const passive1Src = `${NAME} 被动 R${r}(全元素伤害)`
    for (const ele of ALL_ELEMENTS) scope.add(`premod.dmg_.${ele}`, dmgBonus, passive1Src)

    // Passive 2: stack ATK%, doubled when off-field. On/off-field comes from
    // the team-level slot position (NOT a per-weapon cond) — read from scope.
    const stacks = condState.CalamityQueller?.stack ?? 0
    if (stacks <= 0) return
    const onField = (scope.get('onField') ?? 1) !== 0
    const mult = onField ? 1 : 2
    const atkPctPerStack = ATK_PER_STACK[r]!
    const total = stacks * atkPctPerStack * mult
    scope.add(
      'weap.passive.atk_',
      total,
      `${NAME} 被动 R${r}(${stacks} 层 × ${(atkPctPerStack * mult * 100).toFixed(1)}%${onField ? '' : ' ×2 后台'})`,
    )
  },
}
