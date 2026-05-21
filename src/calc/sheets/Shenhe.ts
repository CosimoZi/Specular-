// Shenhe (申鹤) — hand-wired by Specular.
//
// Per-talent-level tables. Talent index is 0-indexed (lvl 10 → index 9).
//
// Note on conds vs panel ATK:
//   None of Shenhe's character buffs (A1, A4, C2, C4, C6) affect her panel
//   ATK. Her contributions are to damage formulas (cryo DMG bonus, RES shred,
//   N/C/P DMG, skill DMG stacks, flat add to cryo base). The conds are
//   declared here so the UI surfaces them, but `apply` is a no-op for panel
//   stats. Damage-formula buffs land in src/calc/formula-buffs.ts.

import type { CharacterSheet } from '../sheet-types'

export const Shenhe: CharacterSheet = {
  key: 'Shenhe',
  conds: [
    { name: 'quillActive', type: 'bool', label: '冰翎(A1):在场角色获得冰翎附加伤害' },
    { name: 'burstField', type: 'bool', label: '神女遣灵真君(Q 场内):队伍 +cryo DMG / +cryo CDmg(C2) / 敌人 −cryo+phys RES' },
    { name: 'a4Press', type: 'bool', label: 'A4 点按:队伍 skill+burst DMG +%' },
    { name: 'a4Hold', type: 'bool', label: 'A4 长按:队伍 N/C/P DMG +%' },
    { name: 'c4Stacks', type: 'num', label: 'C4 层数(申鹤自身 skill DMG +5%/层)', intOnly: true, min: 0, max: 50 },
  ],
  apply(_scope, _ctx, _condState) {
    // Intentional no-op for panel stats. All Shenhe buffs are damage-side.
  },
}
