// 奈芙尔 / Nefer — 5★ catalyst, dendro. Wired by Specular.
// Vendor: vendor/go/gi/sheets/src/Characters/Nefer/index.tsx
//
// 月绽放 (bloom) char. Split-scale ATK + EM on most skill/burst hits.
// Core: 神纱 (Veil) stacks 1-5 → multiplier on all skill hits; veils 4-5 require C2.

import type { CharacterSheet } from '../sheet-types'

export const Nefer: CharacterSheet = {
  key: 'Nefer',
  conds: [
    { name: 'a1VeilStacks', type: 'num', label: 'A1 神纱层数(1-5, 默认 5)', intOnly: true, min: 0, max: 5 },
    { name: 'burstVeilsAbsorbed', type: 'num', label: 'Q 吸收神纱层数(1-5, 决定 Q 增伤)', intOnly: true, min: 0, max: 5 },
    { name: 'c4ShadowDance', type: 'bool', label: 'C4 触发 → 敌人草抗 -20%' },
    { name: 'moonFull', type: 'bool', label: '月兆·满辉(A1 EM 等加强条件)' },
  ],
  apply(_scope, _ctx, _condState) {
    // All Nefer's stat-side buffs are gated by moonFull/veils and applied
    // in applyNeferFormulaBuffs (formulas side). Nothing here.
  },
  applyAsTeammate(focusScope, _condState, wearer) {
    // A6 月兆祝赐 (TEAM per vendor `teamBuff.premod.lunarbloom_baseDmg_`):
    // EM-based moon-reaction base boost. Coef: passive3[0] (per-EM ratio),
    // cap passive3[1]. Numbers in current self path are placeholder — using
    // 0.0014 per EM with cap 14% (mirrors other moon chars). C6 elevation is
    // SELF only per vendor (in `premod`, not teamBuff), so don't propagate.
    const em = wearer.finalEleMas
    const baseBoost = Math.min(0.14, em * 0.0014)
    if (baseBoost > 0) {
      focusScope.add(
        'premod.moonReactionBaseBoost',
        baseBoost,
        `Nefer 月兆祝赐(EM ${Math.round(em)} → +${(baseBoost * 100).toFixed(1)}% 月反应基础)`,
      )
    }
    // C4 dendro RES shred is wired separately via build.ts neferC4DendroResShred.
  },
}
