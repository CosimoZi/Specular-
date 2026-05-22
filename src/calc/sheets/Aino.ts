// 爱诺 / Aino — 5★ claymore, hydro. Wired by Specular.
// Vendor sheet: vendor/go/gi/sheets/src/Characters/Aino/index.tsx
//
// Stat-side buffs:
//   A4 (passive2): +EM × 5% → burst_dmgInc (flat add into burst damage zone).
//     We don't have a per-move flat add slot — approximated as premod.dmg_.burst (%).
//   C1 cond c1AfterSkillOrBurst: +eleMas constellation1[0] = 80 EM (self + active char).
//   C6 cond c6AfterBurst: per-reaction _dmg_ +X% (5 reactions same coefficient).

import type { CharacterSheet } from '../sheet-types'

export const Aino: CharacterSheet = {
  key: 'Aino',
  conds: [
    { name: 'c1AfterSkillOrBurst', type: 'bool', label: 'C1 E/Q 后 +EM' },
    { name: 'c6AfterBurst', type: 'bool', label: 'C6 Q 后所有反应增伤' },
    { name: 'moonFull', type: 'bool', label: '月兆·满辉(C6 加强)' },
  ],
  apply(scope, ctx, condState) {
    // A4 burst_dmgInc — passive2[0]=0.5 → EM × 50% flat to burst zone.
    if (ctx.ascension >= 4) {
      const em = scope.get('final.eleMas') ?? 0
      const flat = em * 0.5
      if (flat > 0) scope.add('premod.dmgIncMove.burst', flat, `A4 (EM ${Math.round(em)} × 50% → +${Math.round(flat)} burst flat)`)
    }
    // C1: +80 EM for self when cond active (constellation1[0] = 80).
    if (ctx.constellation >= 1 && condState.Aino?.c1AfterSkillOrBurst) {
      scope.add('premod.eleMas', 80, 'C1 卷潮自闲(E/Q 后 +80 EM)')
    }
    // C6: +X% to all 5 moon-reaction types when cond active.
    // constellation6[0] = 0.15 (base 15% per-reaction); constellation6[1] = 0.2 (gleam moon-full +20%).
    if (ctx.constellation >= 6 && condState.Aino?.c6AfterBurst) {
      let pct = 0.15
      if (condState.Aino?.moonFull) pct += 0.2
      scope.add('premod.moonReactionDmgBoost', pct, `C6 镜花水月(月反应 +${(pct * 100).toFixed(0)}%)`)
    }
  },
  applyAsTeammate(focusScope, condState, wearer) {
    // C1 (TEAM buff per vendor `teamBuff.premod.eleMas: c1AfterSkill_active_eleMas`):
    // active char +80 EM when Aino's c1 cond is on. Vendor filters out Aino-as-
    // active-char via `unequal(input.activeCharKey, key, ...)`, which the
    // applyAsTeammate dispatch naturally enforces (only called when focus ≠ wearer).
    if (wearer.constellation >= 1 && condState.Aino?.c1AfterSkillOrBurst) {
      focusScope.add('premod.eleMas', 80, 'Aino C1 卷潮自闲(队友 E/Q 后 +80 EM)')
    }
    // C6 (TEAM buff per vendor `teamBuff.premod.<reaction>_dmg_` × 5):
    // vendor writes to all 5 moon-reaction slots with same coefficient; catch-all
    // `premod.moonReactionDmgBoost` is equivalent (formula.ts sums catch-all +
    // specific). Base 15%, +20% extra when moon-full.
    if (wearer.constellation >= 6 && condState.Aino?.c6AfterBurst) {
      let pct = 0.15
      if (condState.Aino?.moonFull) pct += 0.2
      focusScope.add('premod.moonReactionDmgBoost', pct, `Aino C6 镜花水月(月反应 +${(pct * 100).toFixed(0)}%)`)
    }
  },
}
