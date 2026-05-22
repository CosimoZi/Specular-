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
  buffs: [
    {
      source: { type: 'weapon', label: { zh: `${NAME} 被动`, en: `${NAME} passive` } },
      name: { zh: '全元素伤害 +12~24%', en: 'All-element DMG +12-24%' },
      effect: { zh: '所有元素伤害加成 +12/15/18/21/24%(R1-R5)。常驻。', en: 'All-elemental DMG +12/15/18/21/24% (R1-R5). Always-on.' },
      scope: 'self',
      sheetKey: 'CalamityQueller',
    },
    {
      source: { type: 'weapon', label: { zh: `${NAME} 被动`, en: `${NAME} passive` } },
      name: { zh: 'E 后 → 攻击力层数(后台 ×2)', en: 'After E → ATK stacks (×2 off-field)' },
      effect: { zh: '元素战技后 20 秒内每秒获得「凶将之素」层数, +3.2/4/4.8/5.6/6.4% ATK 每层, 最多 6 层。装备者不在场时效果翻倍。', en: 'After Skill: gain Consummation stacks (1/s, 20s, max 6): +3.2/4/4.8/5.6/6.4% ATK. ×2 when off-field.' },
      condName: 'stack',
      scope: 'self',
      sheetKey: 'CalamityQueller',
    },
  ],
  apply(scope, ctx, condState) {
    const r = ctx.refinement
    if (r < 1 || r > 5) return
    // Passive 1: permanent +X% all-ele dmg.
    const dmgBonus = DMG_BONUS[r]!
    const passive1Src = `${NAME} 被动 R${r}(全元素伤害)`
    for (const ele of ALL_ELEMENTS) scope.add(`premod.dmg_.${ele}`, dmgBonus, passive1Src)

    // Passive 2: stack ATK%, doubled when off-field. On/off-field comes from
    // the team-level slot position. Default stack count is max (6) regardless
    // of position — Consummation builds up over 6 seconds on-field too; the
    // only thing the position changes is the ×1 vs ×2 multiplier. User can
    // dial it down via the cond input if they want.
    const onField = (scope.get('onField') ?? 1) !== 0
    const stacksRaw = condState.CalamityQueller?.stack
    const stacks = stacksRaw != null ? stacksRaw : 6
    if (stacks <= 0) return
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
