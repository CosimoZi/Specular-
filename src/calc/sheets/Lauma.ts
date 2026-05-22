// 菈乌玛 / Lauma — 5★ catalyst, dendro. Wired by Specular.
// Vendor: vendor/go/gi/sheets/src/Characters/Lauma/index.tsx
//
// 月绽放 (bloom) char. EM-scaling on key hits.
//
// Conds:
//   - verdantDew (1-3): hold2Dmg multiplier (consumed stacks)
//   - a1AfterSkill: bloom critRate/critDMG buff (EM, scoped to bloom dmg; approximated globally)
//   - burstPaleHymn: burst-domain cond enabling EM-based bloom_dmgInc team buff
//   - moonFull: C2/C6 gating

import type { CharacterSheet } from '../sheet-types'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Lauma as {
  burst: number[][]
  constellation2: number[]
  constellation6: number[]
}

export const Lauma: CharacterSheet = {
  key: 'Lauma',
  conds: [
    { name: 'verdantDew', type: 'num', label: 'hold2 草露消耗层数(1-3)', intOnly: true, min: 0, max: 3 },
    { name: 'a1AfterSkill', type: 'bool', label: 'A1 E 后 +bloom CR/CD' },
    { name: 'skillAfterHit', type: 'bool', label: 'E 命中 → 团队 敌人水/草抗 -X%(随 E 等级)' },
    { name: 'burstPaleHymn', type: 'bool', label: 'Q 月域(月绽放增伤 EM-based)' },
    { name: 'moonFull', type: 'bool', label: '月兆·满辉(A1/C2/C6 加强)' },
  ],
  apply(scope, ctx, condState) {
    // A1: After E + moonsign>=1: bloom_critRate_ +15%, bloom_critDMG_ +100%.
    // Moon-full (moonsign>=2): lunarBloom_critRate_ +10%, lunarBloom_critDMG_ +20%.
    // Now using per-reaction CR/CD slots (since engine supports it).
    // Note: "bloom" here covers vanilla bloom; "lunarbloom" = moonReaction bloom.
    // Our MOON_REACTION_COEFF uses 'bloom' for the moon variant — both bloom
    // CR/CD bonuses apply to it. We map both to 'bloom' reaction key.
    if (ctx.ascension >= 1 && condState.Lauma?.a1AfterSkill) {
      scope.add('premod.critRate_.bloom', 0.15, 'A1 (月绽放 +15% CR)')
      scope.add('premod.critDMG_.bloom', 1.0, 'A1 (月绽放 +100% CD)')
      if (condState.Lauma?.moonFull) {
        scope.add('premod.critRate_.bloom', 0.1, 'A1 月兆·满辉 (月绽放再 +10% CR)')
        scope.add('premod.critDMG_.bloom', 0.2, 'A1 月兆·满辉 (月绽放再 +20% CD)')
      }
    }
  },
  applyAsTeammate(focusScope, condState, wearer) {
    // A6 (TEAM per vendor `teamBuff.premod.lunarbloom_baseDmg_`):
    // EM × 0.000175 → moon-reaction base boost, cap 14%. Always-on.
    const em = wearer.finalEleMas
    const baseBoost = Math.min(0.14, em * 0.000175)
    if (baseBoost > 0) {
      focusScope.add(
        'premod.moonReactionBaseBoost',
        baseBoost,
        `Lauma 月兆祝赐(EM ${Math.round(em)} → +${(baseBoost * 100).toFixed(1)}% 月反应基础)`,
      )
    }
    // A1 lunarbloom CR/CD (TEAM per vendor `teamBuff.premod.lunarbloom_critRate_/_critDMG_`):
    // After E (a1AfterSkill cond), the moon variant gets CR/CD too. Per-reaction
    // slots, only bloom-kind formulas pick up.
    if (wearer.ascension >= 1 && condState.Lauma?.a1AfterSkill) {
      focusScope.add('premod.critRate_.bloom', 0.15, 'Lauma A1 (月绽放 +15% CR)')
      focusScope.add('premod.critDMG_.bloom', 1.0, 'Lauma A1 (月绽放 +100% CD)')
      if (condState.Lauma?.moonFull) {
        focusScope.add('premod.critRate_.bloom', 0.1, 'Lauma A1 月兆·满辉 (月绽放再 +10% CR)')
        focusScope.add('premod.critDMG_.bloom', 0.2, 'Lauma A1 月兆·满辉 (月绽放再 +20% CD)')
      }
    }
    // C2 + burstPaleHymn: lunarbloom_dmgInc EM flat (TEAM per vendor
    // `teamBuff.premod.lunarbloom_dmgInc: sum(burstPaleHymn..., c2PaleHymn_lunarbloom_dmgInc)`).
    if (wearer.constellation >= 2 && condState.Lauma?.burstPaleHymn) {
      const c2lb = skillParam.constellation2[1] ?? 0
      if (c2lb > 0) {
        const flat = em * c2lb * 0.01
        focusScope.add(
          'premod.dmgIncReaction.bloom',
          flat,
          `Lauma C2 (月绽放 +EM ${Math.round(em)} × ${(c2lb * 0.01 * 100).toFixed(1)}% = ${Math.round(flat)} flat)`,
        )
      }
      // C2 lunarbloom_dmg_ +40% (moonFull-gated): TEAM
      if (condState.Lauma?.moonFull) {
        const c2dmg = skillParam.constellation2[2] ?? 0
        if (c2dmg > 0) {
          focusScope.add(
            'premod.lunarbloomDmgBoost',
            c2dmg,
            `Lauma C2 月兆·满辉(+${(c2dmg * 100).toFixed(0)}% 月绽放增伤)`,
          )
        }
      }
    }
    // Q burstPaleHymn lunarbloom_dmgInc (TEAM, same slot as C2's): burst[3]
    // table per Q talent level.
    if (condState.Lauma?.burstPaleHymn) {
      const lvl = wearer.talents.burst
      const idx = Math.max(0, Math.min(lvl - 1, (skillParam.burst[3]?.length ?? 1) - 1))
      const burstLBCoef = skillParam.burst[3]![idx] ?? 0
      if (burstLBCoef > 0) {
        const flat = em * burstLBCoef * 0.01
        focusScope.add(
          'premod.dmgIncReaction.bloom',
          flat,
          `Lauma Q 月域(月绽放 +EM × ${(burstLBCoef * 0.01 * 100).toFixed(1)}% = ${Math.round(flat)} flat)`,
        )
      }
    }
    // C6 lunarbloom elevation (TEAM via teamBuff for moonsign>=2 chars):
    // moonFull-gated.
    if (wearer.constellation >= 6 && condState.Lauma?.moonFull) {
      const c6elev = skillParam.constellation6[5] ?? 0
      if (c6elev > 0) {
        focusScope.add(
          'premod.moonReactionElevation',
          c6elev,
          `Lauma C6 月兆·满辉(+${(c6elev * 100).toFixed(0)}% 月绽放擢升)`,
        )
      }
    }
    // NOTE — DEFERRED:
    //   * vanilla bloom/hyperbloom/burgeon variants (dmgInc + per-reaction CR/CD):
    //     transformative reactions not yet modeled — wait for queue item
    //     `transformative-reactions`.
    //   * hydro/dendro_enemyRes_ (skillAfterHit RES shred): needs a build.ts
    //     dispatcher like flinsC2ElectroResShred. Tracked separately —
    //     queue item `lauma-skill-res-shred` (auto-added below).
  },
}
