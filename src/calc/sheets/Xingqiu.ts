// 行秋 / Xingqiu — 4★ sword, hydro. Wired by Specular.
// Vendor: vendor/go/gi/sheets/src/Characters/Xingqiu/index.tsx
//
// 4★ off-field hydro applier. Burst rain swords apply hydro on team hits.
//
// Stat-side buffs:
//   A4: +20% hydro_dmg_ self always-on after ascension 4.
//   C2 cond c2: -15% hydro RES enemy during burst.
//   C4 cond burst: skill press dmg ×1.5 during burst.

import type { CharacterSheet } from '../sheet-types'

export const Xingqiu: CharacterSheet = {
  key: 'Xingqiu',
  conds: [
    { name: 'c2', type: 'bool', label: 'C2 Q 期间 -15% 水抗' },
    { name: 'burst', type: 'bool', label: 'C4 Q 期间 → E 伤害 ×1.5' },
  ],
  apply(scope, ctx, _condState) {
    // A4: +20% hydro_dmg_ self.
    if (ctx.ascension >= 4) {
      scope.add('premod.dmg_.hydro', 0.2, 'A4 + 20% 水伤')
    }
  },
}
