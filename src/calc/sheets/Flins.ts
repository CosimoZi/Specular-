// 菲林斯 / Flins — 5★ polearm, electro. Wired by Specular.
// Vendor: vendor/go/gi/sheets/src/Characters/Flins/index.tsx
//
// 月感电 (electrocharged) char. ATK-scaling.
// Vendor passive/cons constants:
//   passive1[0] = 0.2  (A1 lunarcharged_dmg_ = +20% when moon-full)
//   passive2[0] = 0.08 (A4 ATK × 8% → EM)
//   passive2[1] = 160  (A4 EM cap)
//   passive3[0] = 0.007 (A6 ATK/100 × 0.7% → moon-base)
//   passive3[1] = 0.14  (A6 cap 14%)
//   constellation2[0] = 0.5  (C2 extra MC dmg ATK × 50%)
//   constellation2[2] = 0.25 (C2 -25% enemy electro RES)
//   constellation4[0] = 0.2  (C4 +20% ATK always)
//   constellation4[1] = 0.1  (C4 raises A4 to ATK × 10% → EM, cap 220)
//   constellation4[2] = 220  (C4 new EM cap)
//   constellation6[0] = 0.35 (C6 self +35% lunarcharged elevation)
//   constellation6[1] = 0.1  (C6 team +10% lunarcharged elevation, moon-full)

import type { CharacterSheet } from '../sheet-types'

export const Flins: CharacterSheet = {
  key: 'Flins',
  conds: [
    { name: 'moonFull', type: 'bool', label: '月兆·满辉(A1/C2/C6 加强)' },
    { name: 'c2AfterElectro', type: 'bool', label: 'C2 触发月感电(-25% 雷抗)' },
  ],
  apply(scope, ctx, condState) {
    // A4: ATK × 8% → EM, cap 160. C4 raises to ATK × 10%, cap 220.
    if (ctx.ascension >= 4) {
      const atk = scope.get('final.atk') ?? 0
      const isC4 = ctx.constellation >= 4
      const pct = isC4 ? 0.1 : 0.08
      const cap = isC4 ? 220 : 160
      const em = Math.min(cap, atk * pct)
      if (em > 0) {
        scope.add('premod.eleMas', em, `A4 (${isC4 ? '+C4 ' : ''}ATK ${Math.round(atk)} × ${(pct * 100).toFixed(0)}% → ${em.toFixed(0)} EM)`)
      }
    }
    // C4: +20% ATK% always-on.
    if (ctx.constellation >= 4) {
      scope.add('premod.atk_', 0.2, 'C4 始终生效 +20% ATK')
    }
    // A1 + moonFull: +20% lunarcharged_dmg_.
    if (ctx.ascension >= 1 && condState.Flins?.moonFull) {
      scope.add('premod.lunarchargedDmgBoost', 0.2, 'A1 月兆·满辉(+20% 月感电增伤)')
    }
    // C6: +35% lunarcharged_specialDmg_ self always (after C6).
    //     +10% team lunarcharged_specialDmg_ moon-full gated.
    if (ctx.constellation >= 6) {
      scope.add('premod.moonReactionElevation', 0.35, 'C6 自身 月感电擢升 +35%')
      if (condState.Flins?.moonFull) {
        scope.add('premod.moonReactionElevation', 0.1, 'C6 月兆·满辉 团队 月感电擢升 +10%')
      }
    }
  },
  applyAsTeammate(focusScope, condState, wearer) {
    // passive3 月兆祝赐 (TEAM per vendor `teamBuff.premod.lunarcharged_baseDmg_`):
    // per 100 ATK, +0.7% moon-reaction base (cap 14%). Always-on. Lands in
    // catch-all `moonReactionBaseBoost` (vendor scopes to lunarcharged_baseDmg_
    // specifically, but Flins only triggers 月感电 so same effect).
    const baseBoost = Math.min(0.14, (wearer.finalAtk / 100) * 0.007)
    if (baseBoost > 0) {
      focusScope.add(
        'premod.moonReactionBaseBoost',
        baseBoost,
        `Flins 月兆祝赐(ATK ${Math.round(wearer.finalAtk)} → +${(baseBoost * 100).toFixed(1)}% 月反应基础)`,
      )
    }
    // C6 team elevation +10% (TEAM per vendor
    // `teamBuff.premod.lunarcharged_specialDmg_: c6_team_lunarcharged_specialDmg_`):
    // moon-full gated. Self portion (+35%) stays in apply() above.
    if (wearer.constellation >= 6 && condState.Flins?.moonFull) {
      focusScope.add(
        'premod.moonReactionElevation',
        0.1,
        'Flins C6 月兆·满辉 团队 月感电擢升 +10%',
      )
    }
  },
}
