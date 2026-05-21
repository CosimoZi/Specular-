// 莉奈娅 / Linnea — 5★ bow, geo. Wired by Specular (skeleton).
//
// kit (per ambr.top talent text):
//   Normal: up to 3-stage bow string (physical).
//   Charged: aimed shot. Hold to charge — fully-charged shot becomes geo.
//   Plunging: standard 3-arrow plunge.
//   Skill (露米呀吼吼!): summons "Lumi" companion with multiple form modes
//     (普通/超厉害/究极厉害) chosen by tap-vs-hold. Lumi does autonomous geo
//     attacks; some attacks count as 月结晶 reaction DMG.
//   Burst (绝境生存指南): heal team based on Linnea's DEF.
//   A1: enemies near Lumi → -15% geo RES (and an additional -15% during 月兆·满辉).
//   A4: based on Linnea's DEF, buff EM (15%/30% based on whether active char is moon-tagged).
//   A6: hydro crystallize → 月结晶 instead. Base DMG of 月结晶 += 0.7%/100 DEF, cap +14%.
//   C1: 历览编录 stacks (max 18) gained on E or 月笼谐奏; Lumi's hits consume
//       a stack and gain +75% DEF as bonus DMG.
//   C2: 月笼谐奏 → hydro/geo CDmg +40%; Lumi's heavy hammer CDmg +150%.
//   C3: E +3 talent levels.
//   C4: 月笼谐奏 → self + active char DEF +25% (stacks for Linnea).
//   C5: Q +3 talent levels.
//   C6: 历览编录 max stacks; consume 2× per trigger; 月结晶 +25% DMG.
//
// Most of this kit centers on Lumi (companion damage) and 月结晶 (a new
// reaction). Neither is modeled in our calc yet. This sheet only wires the
// player-character-side stat buffs (A4 EM, C4 DEF) and exposes the conds.
// Lumi formulas + 月结晶 reaction are TODO.

import type { CharacterSheet } from '../sheet-types'

export const Linnea: CharacterSheet = {
  key: 'Linnea',
  conds: [
    { name: 'lumiActive', type: 'bool', label: 'A1 露米在场(敌人岩抗 -15%)' },
    { name: 'moonFull', type: 'bool', label: 'A1 月兆·满辉(露米召出后岩抗再 -15%)' },
    { name: 'c2Resonance', type: 'bool', label: 'C2 月笼谐奏(水/岩 暴击伤害 +40%)' },
    { name: 'c4DefStacks', type: 'num', label: 'C4 月笼谐奏(DEF +25%/层 最多 2)', intOnly: true, min: 0, max: 2 },
    { name: 'c1StacksConsumed', type: 'num', label: 'C1 历览编录消耗层数(每层月结晶 +DEF×75% flat)', intOnly: true, min: 0, max: 18 },
    // TODO (still needs engine extension):
    // - A4: DEF×5% → 场上角色 EM (cross-character buff propagation needed)
    // - Burst heal (DEF-scaling) — not a damage formula
    // - Skill: Lumi 形态切换 + 攻击 (companion-damage layer needed)
  ],
  apply(scope, ctx, condState) {
    // C2: 月笼谐奏 → hydro/geo CDmg +40%. We don't have per-element CDmg slots,
    // so this fires only when the focus character's outgoing damage is hydro/geo.
    // For Linnea (geo) her own outgoing is geo, so apply directly to critDMG_.
    if (ctx.constellation >= 2 && condState.Linnea?.c2Resonance) {
      scope.add('premod.critDMG_', 0.4, '月笼谐奏(C2)')
    }
    // C4: per-stack DEF +25%, max 2 stacks (self only, since "active char" coincides
    // with focus in our single-character build pipeline).
    if (ctx.constellation >= 4) {
      const s = condState.Linnea?.c4DefStacks ?? 0
      if (s > 0) scope.add('premod.def_', 0.25 * s, `月笼谐奏(C4, ${s} 层)`)
    }
  },
}
