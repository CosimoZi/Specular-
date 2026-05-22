// 班尼特 / Bennett — 4★ sword, pyro. Wired by Specular.
// Vendor: vendor/go/gi/sheets/src/Characters/Bennett/index.tsx
//
// The most-used team support in Genshin. Q field provides huge ATK buff to
// the active char in the field. C6 adds pyro infusion + pyro DMG.
//
// Stat-side buffs (vendor):
//   Q field (cond activeInArea): +base_atk × burstAtkRatio (per-talent-level)
//     to active char's ATK flat. C1: +20% extra to the ratio.
//   C2 cond underHP: +30% ER when HP <= 70%.
//   C6 cond activeInArea + sword/claymore/polearm wielder: +15% pyro_dmg_,
//     pyro infusion.

import type { CharacterSheet } from '../sheet-types'

export const Bennett: CharacterSheet = {
  key: 'Bennett',
  conds: [
    { name: 'activeInArea', type: 'bool', label: 'Q 鼓舞领域(场上角色 +Q ATK 加成)' },
    { name: 'underHP', type: 'bool', label: 'C2 HP <= 70% → +30% ER' },
  ],
  apply(scope, ctx, condState) {
    // C2 ER bonus when underHP.
    if (ctx.constellation >= 2 && condState.Bennett?.underHP) {
      scope.add('premod.enerRech_', 0.3, 'C2 HP ≤ 70% → +30% ER')
    }
    // Bennett-as-focus: still gets her own Q ATK if standing in her own field
    // (cond activeInArea on). Same formula as teammate path.
    if (condState.Bennett?.activeInArea) {
      const ratio = bennettBurstAtkRatio(ctx.talents.burst, ctx.constellation)
      const baseAtk = (scope.get('char.curve.atk') ?? 0) + (scope.get('char.asc.atk') ?? 0) +
        (scope.get('weap.curve.atk') ?? 0) + (scope.get('weap.asc.atk') ?? 0)
      const flatAtk = baseAtk * ratio
      if (flatAtk > 0) {
        scope.add('premod.atk.flat', flatAtk, `Bennett Q 鼓舞领域(base ATK ${Math.round(baseAtk)} × ${(ratio * 100).toFixed(0)}% = +${Math.round(flatAtk)} 攻击)`)
      }
      // C6 +15% pyro DMG (sword/claymore/polearm wielder; we apply unconditionally
      // since most C6 Bennett team users have the right weapon).
      if (ctx.constellation >= 6) {
        scope.add('premod.dmg_.pyro', 0.15, 'Bennett C6 (Q 场内 +15% 火伤)')
      }
    }
  },
  applyAsTeammate(focusScope, condState, wearer) {
    // Q 鼓舞领域 (TEAM per vendor `teamBuff.total.atk`): active char gets
    // base_atk(Bennett) × burstAtkRatio[talent-1] × (1 + C1 +20%) as flat ATK.
    if (!condState.Bennett?.activeInArea) return
    const ratio = bennettBurstAtkRatio(wearer.talents.burst, wearer.constellation)
    const flatAtk = wearer.baseAtk * ratio
    if (flatAtk > 0) {
      focusScope.add(
        'premod.atk.flat',
        flatAtk,
        `Bennett Q (其 base ATK ${Math.round(wearer.baseAtk)} × ${(ratio * 100).toFixed(0)}% = +${Math.round(flatAtk)} 攻击)`,
      )
    }
    // C6 +15% pyro DMG. Weapon-type gate not enforced (would need focus
    // weapon-type access; approximation matches the common case).
    if (wearer.constellation >= 6) {
      focusScope.add('premod.dmg_.pyro', 0.15, 'Bennett C6 (Q 场内 +15% 火伤)')
    }
  },
}

/** Vendor burst[3] burstAtkRatio table per talent level. C1 adds +20% on top. */
function bennettBurstAtkRatio(burstTalent: number, constellation: number): number {
  const table = [
    0.56, 0.602, 0.644, 0.7, 0.742, 0.784, 0.84, 0.896, 0.952, 1.008,
    1.064, 1.12, 1.19, 1.26, 1.33,
  ]
  const idx = Math.max(0, Math.min(burstTalent - 1, table.length - 1))
  let ratio = table[idx] ?? 0
  if (constellation >= 1) ratio += 0.2
  return ratio
}
