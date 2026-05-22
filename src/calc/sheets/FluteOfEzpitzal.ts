// 息燧之笛 / Flute of Ezpitzal — 4★ sword. R1..R5.
//
// Vendor: vendor/go/gi/sheets/src/Weapons/Sword/FluteOfEzpitzal/index.tsx
//
// Passive (cond `afterSkill` — after using elemental skill):
//   +DEF% for 15s based on refinement:
//     R1 +16%, R2 +20%, R3 +24%, R4 +28%, R5 +32%

import type { WeaponSheet } from '../sheet-types'
import { WEAPON_NAME_ZH as W } from '../data/names-zh'

const NAME = W.FluteOfEzpitzal

// Per-refinement DEF% bonus
const DEF_BONUS = [NaN, 0.16, 0.2, 0.24, 0.28, 0.32]

export const FluteOfEzpitzal: WeaponSheet = {
  key: 'FluteOfEzpitzal',
  conds: [
    { name: 'afterSkill', type: 'bool', label: 'E 后(防御力 +X%, 15s)' },
  ],
  buffs: [
    {
      source: { type: 'weapon', label: { zh: `${NAME} 被动`, en: `${NAME} passive` } },
      name: { zh: 'E 后 → 防御力 +16~32%', en: 'After E → DEF +16-32%' },
      effect: { zh: '元素战技后 15 秒内, 防御力 +16/20/24/28/32%(R1-R5)。', en: 'For 15s after Skill: DEF +16/20/24/28/32% (R1-R5).' },
      condName: 'afterSkill',
      scope: 'self',
      sheetKey: 'FluteOfEzpitzal',
    },
  ],
  apply(scope, ctx, condState) {
    const r = ctx.refinement
    if (r < 1 || r > 5) return
    if (!condState.FluteOfEzpitzal?.afterSkill) return
    const def_ = DEF_BONUS[r]!
    scope.add('premod.def_', def_, `${NAME} 被动 R${r}(E 后 +${(def_ * 100).toFixed(0)}% DEF)`)
  },
}
