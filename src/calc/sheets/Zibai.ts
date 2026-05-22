// 兹白 / Zibai — 5★ sword, geo. Wired by Specular.
//
// Vendor sheet: vendor/go/gi/sheets/src/Characters/Zibai/index.tsx
//
// Stat-side buffs (vendor: `ownBuff.premod.*` and `teamBuff.premod.*`):
//   A4: own/team — geo_def_ per (geo teammate - 1); hydro_eleMas per hydro teammate.
//       (Not modeled — needs cross-char tally we don't have.)
//   A1 cond (a1Moonfall): stride hits +DEF×60% flat (handled in formulas, not here).
//   C1 cond (c1FirstStride): stride hits +220% lunarcrystallize_dmg_ (per-formula).
//   C2 cond (c2ShiftMode): team +30% lunarcrystallize_dmg_ (in formula buffs).
//   C2 + moon-full + a1Moonfall: stride hits +DEF×4.9 additional (in formulas).
//   C4 cond (c4Splendor): shift4_gleam_crystal +50% MC dmg (per-formula, in formulas).
//   C6 cond (c6Point 1-30): per stack +1.6% lunar_specialDmg_ 擢升 (in formula buffs).

import type { CharacterSheet } from '../sheet-types'

export const Zibai: CharacterSheet = {
  key: 'Zibai',
  conds: [
    { name: 'a1Moonfall', type: 'bool', label: 'A1 月下素娥降仙(stride 命中 +DEF×60%)' },
    { name: 'c1FirstStride', type: 'bool', label: 'C1 首次灵驹飞踏(stride +220% 月结晶)' },
    { name: 'c2ShiftMode', type: 'bool', label: 'C2 月转时隙模式(团队 +30% 月结晶)' },
    { name: 'c4Splendor', type: 'bool', label: 'C4 shift4_gleam +50% 月结晶' },
    { name: 'moonFull', type: 'bool', label: '月兆·满辉(C2/C4/C6 强化条件)' },
    { name: 'c6Point', type: 'num', label: 'C6 消耗浮光点数(+1.6% 擢升/点, max 30)', intOnly: true, min: 0, max: 30 },
  ],
  apply(scope, ctx, _condState) {
    // A4 叠嶂峦岫出云: per (geo teammate - 1) × 15% DEF + per hydro teammate × 60 EM.
    // Uses `team.tally.<ele>` scope keys set by build.ts Phase 5.6.
    // (tally.geo - 1 excludes Zibai herself since she's also geo.)
    if (ctx.ascension >= 4) {
      const geoCount = scope.get('team.tally.geo') ?? 0
      const geoOthers = Math.max(0, geoCount - 1)
      if (geoOthers > 0) {
        scope.add('premod.def_', 0.15 * geoOthers, `A4 (${geoOthers} 其它岩元素 → +${(15 * geoOthers).toFixed(0)}% DEF)`)
      }
      const hydroCount = scope.get('team.tally.hydro') ?? 0
      if (hydroCount > 0) {
        scope.add('premod.eleMas', 60 * hydroCount, `A4 (${hydroCount} 水元素 → +${60 * hydroCount} EM)`)
      }
    }
  },
  applyAsTeammate(focusScope, condState, wearer) {
    // passive3 月兆祝赐·浮明若流 (TEAM per vendor
    // `teamBuff.premod.lunarcrystallize_baseDmg_`):
    // per 100 DEF, +0.7% moon-reaction base (cap 14%). Always-on.
    const baseBoost = Math.min(0.14, (wearer.finalDef / 100) * 0.007)
    if (baseBoost > 0) {
      focusScope.add(
        'premod.moonReactionBaseBoost',
        baseBoost,
        `Zibai 月兆祝赐·浮明若流(DEF ${Math.round(wearer.finalDef)} → +${(baseBoost * 100).toFixed(1)}% 月反应基础)`,
      )
    }
    // C2 (TEAM per vendor `teamBuff.premod.lunarcrystallize_dmg_:
    // c2ShiftMode_lunarcrystallize_dmg_`): +30% 月结晶 dmgBoost when c2ShiftMode on.
    if (wearer.constellation >= 2 && condState.Zibai?.c2ShiftMode) {
      focusScope.add(
        'premod.lunarcrystallizeDmgBoost',
        0.3,
        'Zibai C2 化于生而死于尸(月转时隙 → 月结晶 +30% 团队)',
      )
    }
    // C6: vendor has Zibai's _specialDmg_ in `premod` (SELF), not teamBuff —
    // so the 浮光点 elevation stays in Zibai-formulas.ts apply path. Don't
    // propagate from here.
  },
}
