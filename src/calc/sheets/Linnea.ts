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
    // TODO: settle the cond model. Tentative:
    // { name: 'moonTagged', type: 'bool', label: '场上角色是月兆角色(A4 EM 转换目标)' },
    // { name: 'a1RESShred', type: 'bool', label: 'A1 露米在场:敌人 -15% 岩抗' },
    // { name: 'moonFull', type: 'bool', label: 'A1 月兆·满辉(露米召出后再 -15% 岩抗)' },
    // { name: 'c1Stacks', type: 'num', label: 'C1 历览编录 (0-18)', intOnly: true, min: 0, max: 18 },
    // { name: 'c2Resonance', type: 'bool', label: 'C2 月笼谐奏 (水/岩 CDmg +40%)' },
    // { name: 'c4StacksDef', type: 'num', label: 'C4 月笼谐奏 (DEF +25%/层)', intOnly: true, min: 0, max: 4 },
  ],
  apply(_scope, _ctx, _condState) {
    // No panel-stat buffs from Linnea's character passives — A4 / C4 do affect
    // DEF and EM but they're cond-gated; leave for the cond-model pass.
  },
}
