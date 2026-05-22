// 香菱 / Xiangling — 4★ polearm, pyro. Wired by Specular.
// Vendor: vendor/go/gi/sheets/src/Characters/Xiangling/index.tsx
//
// 4★ pyro polearm. ATK-scaling. Best off-field pyro DPS (Q "Pyronado").
//
// Stat-side buffs:
//   A4 cond afterChili: after triggering 满怀燃情, all team chars +X% ATK%
//     (passive2[0] = 0.1 = +10%).
//   C1 cond afterGuobaHit: after Guoba hits, -15% pyro RES enemy (15s).
//   C6 cond afterPyronado: during Pyronado, team +15% pyro_dmg_ (but vendor
//     applies `antiC6` to burst formulas to PREVENT double-counting because
//     the burst hits already include Pyronado's own boost. Subtle.

import type { CharacterSheet } from '../sheet-types'

export const Xiangling: CharacterSheet = {
  key: 'Xiangling',
  conds: [
    { name: 'afterChili', type: 'bool', label: 'A4 满怀燃情(团队 +10% ATK)' },
    { name: 'afterGuobaHit', type: 'bool', label: 'C1 锅巴命中后(-15% 火抗)' },
    { name: 'afterPyronado', type: 'bool', label: 'C6 旋火轮期间(团队 +15% 火伤)' },
  ],
  apply(scope, ctx, condState) {
    // Xiangling-as-focus also gets her own team buffs (active char IS her).
    if (ctx.ascension >= 4 && condState.Xiangling?.afterChili) {
      scope.add('premod.atk_', 0.1, 'A4 满怀燃情(+10% ATK)')
    }
    if (ctx.constellation >= 6 && condState.Xiangling?.afterPyronado) {
      scope.add('premod.dmg_.pyro', 0.15, 'C6 旋火轮期间(+15% 火伤)')
    }
  },
  applyAsTeammate(focusScope, condState, wearer) {
    // A4 满怀燃情 (TEAM per vendor `teamBuff.premod.atk_`): +10% ATK.
    if (wearer.ascension >= 4 && condState.Xiangling?.afterChili) {
      focusScope.add('premod.atk_', 0.1, 'Xiangling A4 满怀燃情(+10% ATK)')
    }
    // C6 旋火轮 (TEAM per vendor `teamBuff.premod.pyro_dmg_`): +15% pyro.
    if (wearer.constellation >= 6 && condState.Xiangling?.afterPyronado) {
      focusScope.add('premod.dmg_.pyro', 0.15, 'Xiangling C6 旋火轮(+15% 火伤)')
    }
    // C1 锅巴命中减火抗 — dispatched via CHAR_RES_SHRED in build.ts (separate path).
  },
}

/** Xiangling C1 锅巴命中后 → enemy -15% pyro RES (vendor: teamBuff). */
export const xianglingC1PyroResShred: import('../sheet-types').CharResShredFn = (ctx, condState) => {
  if (ctx.constellation < 1) return {}
  if (!condState.Xiangling?.afterGuobaHit) return {}
  return { pyro: 0.15 }
}
