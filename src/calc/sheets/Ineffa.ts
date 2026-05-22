// 伊涅芙 / Ineffa — 5★ polearm, electro. Wired by Specular.
// Vendor: vendor/go/gi/sheets/src/Characters/Ineffa/index.tsx
//
// 月感电 (electrocharged) char. ATK-scaling.

import type { CharacterSheet } from '../sheet-types'

export const Ineffa: CharacterSheet = {
  key: 'Ineffa',
  conds: [
    { name: 'a4AfterBurst', type: 'bool', label: 'A4 Q 后 +EM(ATK × 5%)' },
    { name: 'c1AfterShield', type: 'bool', label: 'C1 护盾后 +月感电增伤' },
    { name: 'moonFull', type: 'bool', label: '月兆·满辉' },
  ],
  apply(scope, ctx, condState) {
    // A4: ATK × 5% → EM (active char only). When focus is Ineffa, applies to self.
    if (ctx.ascension >= 4 && condState.Ineffa?.a4AfterBurst) {
      const atk = scope.get('final.atk') ?? 0
      const em = atk * 0.05
      if (em > 0) scope.add('premod.eleMas', em, `A4 (ATK ${Math.round(atk)} × 5% → ${em.toFixed(0)} EM)`)
    }
    // C1: ATK/100 × constellation1[0]% → lunarcharged_dmg_, cap constellation1[1]%.
    if (ctx.constellation >= 1 && condState.Ineffa?.c1AfterShield) {
      const atk = scope.get('final.atk') ?? 0
      // constellation1[0] ≈ 0.x (per 100 ATK gives X%), cap c1[1] = 15%.
      const dmgInc = Math.min(0.15, (atk / 100) * 0.005) // placeholder coef 0.5%/100 ATK
      if (dmgInc > 0) {
        scope.add('premod.lunarchargedDmgBoost', dmgInc, `C1 (ATK ${Math.round(atk)} → +${(dmgInc * 100).toFixed(1)}% 月感电增伤)`)
      }
    }
  },
  applyAsTeammate(focusScope, condState, wearer) {
    // passive3 月兆祝赐 (TEAM per vendor `teamBuff.premod.lunarcharged_baseDmg_`):
    // per 100 ATK, +0.7% moon-reaction base (cap 14%). Always-on.
    const baseBoost = Math.min(0.14, (wearer.finalAtk / 100) * 0.007)
    if (baseBoost > 0) {
      focusScope.add(
        'premod.moonReactionBaseBoost',
        baseBoost,
        `Ineffa 月兆祝赐(ATK ${Math.round(wearer.finalAtk)} → +${(baseBoost * 100).toFixed(1)}% 月反应基础)`,
      )
    }
    // A4 (TEAM per vendor `teamBuff.total.eleMas: a4AfterBurst_eleMas`):
    // active char +ATK × 5% EM when a4AfterBurst on.
    if (wearer.ascension >= 4 && condState.Ineffa?.a4AfterBurst) {
      const em = wearer.finalAtk * 0.05
      if (em > 0) {
        focusScope.add(
          'premod.eleMas',
          em,
          `Ineffa A4(ATK ${Math.round(wearer.finalAtk)} × 5% → ${em.toFixed(0)} EM)`,
        )
      }
    }
    // C1 (TEAM per vendor `teamBuff.premod.lunarcharged_dmg_: c1AfterShield_lc_dmg_`):
    // ATK-based 月感电 dmgBoost, after shield. cap 15%.
    if (wearer.constellation >= 1 && condState.Ineffa?.c1AfterShield) {
      const dmgInc = Math.min(0.15, (wearer.finalAtk / 100) * 0.005)
      if (dmgInc > 0) {
        focusScope.add(
          'premod.lunarchargedDmgBoost',
          dmgInc,
          `Ineffa C1(ATK ${Math.round(wearer.finalAtk)} → +${(dmgInc * 100).toFixed(1)}% 月感电增伤)`,
        )
      }
    }
  },
}
