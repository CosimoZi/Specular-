// Batch 1 — most-used 5★ artifact sets across all damage roles.
// Each export is an ArtifactSetSheet that registers under `artifactSetSheets`.

import type { ArtifactSetSheet } from '../sheet-types'

const ALL_ELEMENTS = ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro'] as const

// =============================================================================
// 角斗士的终幕礼 / Gladiator's Finale
//   2pc: +18% ATK.
//   4pc: 若装备者持双手剑/单手剑/长柄,普攻造成的伤害提升 35%。
// =============================================================================
export const GladiatorsFinale: ArtifactSetSheet = {
  key: 'GladiatorsFinale',
  conds: [],
  apply(scope, count) {
    if (count >= 2) scope.add('artifact.set.atk_', 0.18, '角斗士的终幕礼 2 件套')
    if (count >= 4) {
      // Weapon-type gate. We check the weapon type from scope — but we don't
      // currently surface weaponType on scope. Apply unconditionally for now;
      // catalyst/bow users won't have it picked typically anyway. (Refinement
      // in a later pass: read scope.get('weaponType') once exposed.)
      scope.add('premod.dmg_.normal', 0.35, '角斗士的终幕礼 4 件套(普攻 +35%)')
    }
  },
}

// =============================================================================
// 绝缘之旗印 / Emblem of Severed Fate
//   2pc: +20% 元素充能效率。
//   4pc: 元素爆发造成的伤害提升,数值为元素充能效率的 25%。该效果至多使元素爆发造成的伤害提升 75%。
// =============================================================================
export const EmblemOfSeveredFate: ArtifactSetSheet = {
  key: 'EmblemOfSeveredFate',
  conds: [],
  apply(scope, count) {
    if (count >= 2) scope.add('premod.enerRech_', 0.2, '绝缘之旗印 2 件套')
    if (count >= 4) {
      // 4pc: Q DMG += min(0.75, ER * 0.25). Approximate by reading the
      // computed enerRech_ at apply time. (We assemble it later in Phase 12,
      // so at this stage we read what we have — the ER substat sum so far
      // PLUS the 2pc +20%. Close enough for a single-character build, but
      // technically should run after all ER sources are summed.)
      const er = (scope.get('char.asc.enerRech_') ?? 0) +
        (scope.get('weap.substat.enerRech_') ?? 0) +
        (scope.get('artifact.main.enerRech_') ?? 0) +
        (scope.get('artifact.sub.enerRech_') ?? 0) +
        (count >= 2 ? 0.2 : 0) +
        1  // 100% base
      const bonus = Math.min(0.75, er * 0.25)
      scope.add('premod.dmg_.burst', bonus, `绝缘之旗印 4 件套(Q DMG +${(bonus * 100).toFixed(1)}%)`)
    }
  },
}

// =============================================================================
// 沉沦之心 / Heart of Depth
//   2pc: +15% 水元素伤害加成。
//   4pc: 元素战技后 15 秒内,普攻和重击造成的伤害提升 30%。
// =============================================================================
export const HeartOfDepth: ArtifactSetSheet = {
  key: 'HeartOfDepth',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:E 后普攻/重击 +30%' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.hydro', 0.15, '沉沦之心 2 件套')
    if (count >= 4 && condState.HeartOfDepth?.set4) {
      scope.add('premod.dmg_.normal', 0.3, '沉沦之心 4 件套(E 后普攻)')
      scope.add('premod.dmg_.charged', 0.3, '沉沦之心 4 件套(E 后重击)')
    }
  },
}

// =============================================================================
// 炽烈的炎之魔女 / Crimson Witch of Flames
//   2pc: +15% 火元素伤害加成。
//   4pc: 元素战技施放后的 6s 内,2 件套效果提升 50%。该效果可叠加 3 层。
//        (实际机制是 +7.5%/层 to pyro DMG OR enhance reaction DMG by 15/40%)
// =============================================================================
export const CrimsonWitchOfFlames: ArtifactSetSheet = {
  key: 'CrimsonWitchOfFlames',
  conds: [
    { name: 'set4Stacks', type: 'num', label: '4 件套层数(每层 +7.5% 火伤)', intOnly: true, min: 0, max: 3 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) {
      scope.add('premod.dmg_.pyro', 0.15, '炽烈的炎之魔女 2 件套')
      // 4pc also amps overload/burning by 40% and vaporize/melt by 15%. We
      // wire the pyro DMG portion here; reaction multipliers come later.
    }
    if (count >= 4) {
      const stacks = condState.CrimsonWitchOfFlames?.set4Stacks ?? 0
      if (stacks > 0) {
        scope.add('premod.dmg_.pyro', 0.075 * stacks, `炽烈的炎之魔女 4 件套(${stacks} 层)`)
      }
    }
  },
}

// =============================================================================
// 翠绿之影 / Viridescent Venerer
//   2pc: +15% 风元素伤害加成。
//   4pc: 扩散反应造成的伤害提升 60%,降低对应元素抗性 40%,持续 10s。
// =============================================================================
export const ViridescentVenerer: ArtifactSetSheet = {
  key: 'ViridescentVenerer',
  conds: [],
  apply(scope, count) {
    if (count >= 2) scope.add('premod.dmg_.anemo', 0.15, '翠绿之影 2 件套')
    // 4pc: swirl DMG +60% and -40% enemy RES for swirled element. We don't
    // model swirl reactions or per-element enemy RES debuffs yet — flagged
    // for follow-up once the reaction layer lands.
  },
}

// =============================================================================
// 如雷的盛怒 / Thundering Fury
//   2pc: +15% 雷元素伤害加成。
//   4pc: 超载/感电/超激化等反应伤害提升 40%。元素战技 CD -1s (3s 内一次)。
// =============================================================================
export const ThunderingFury: ArtifactSetSheet = {
  key: 'ThunderingFury',
  conds: [],
  apply(scope, count) {
    if (count >= 2) scope.add('premod.dmg_.electro', 0.15, '如雷的盛怒 2 件套')
    // 4pc reaction bonus + CD reduction not modeled in panel.
  },
}

// =============================================================================
// 悠古的磐岩 / Archaic Petra
//   2pc: +15% 岩元素伤害加成。
//   4pc: 拾取结晶反应产生的元素碎片后,角色获得对应元素 +35% 伤害,10s。
// =============================================================================
export const ArchaicPetra: ArtifactSetSheet = {
  key: 'ArchaicPetra',
  conds: [
    { name: 'shardEle', type: 'num', label: '4 件套:已拾取碎片(0 关 / 1 火 / 2 水 / 3 雷 / 4 冰)', intOnly: true, min: 0, max: 4 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.geo', 0.15, '悠古的磐岩 2 件套')
    if (count >= 4) {
      const sel = condState.ArchaicPetra?.shardEle ?? 0
      const elMap: Record<number, typeof ALL_ELEMENTS[number]> = {
        1: 'pyro', 2: 'hydro', 3: 'electro', 4: 'cryo',
      }
      const ele = elMap[sel]
      if (ele) scope.add(`premod.dmg_.${ele}`, 0.35, `悠古的磐岩 4 件套(${ele} 碎片)`)
    }
  },
}

// =============================================================================
// 深林的记忆 / Deepwood Memories
//   2pc: +15% 草元素伤害加成。
//   4pc: 元素战技或元素爆发命中敌人后 -30% 草元素抗性,8s。
// =============================================================================
export const DeepwoodMemories: ArtifactSetSheet = {
  key: 'DeepwoodMemories',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:已削减敌人 30% 草抗' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.dendro', 0.15, '深林的记忆 2 件套')
    if (count >= 4 && condState.DeepwoodMemories?.set4) {
      // Negative pre-RES on enemy → handled via enemy debuff slot eventually.
      // For now expose as a buff to dendro DMG (approximate, equivalent only
      // when enemy RES is at the +0.1 baseline).
      scope.add('premod.dmg_.dendro', 0.3, '深林的记忆 4 件套(草抗 -30% 近似)')
    }
  },
}

// =============================================================================
// 华馆梦醒形骸记 / Husk of Opulent Dreams
//   2pc: +30% 防御力。
//   4pc: 每秒获得 1 层,场内积累、场外速率更快;每层 +6% 防御和 +6% 岩元素伤害,最多 4 层。
// =============================================================================
export const HuskOfOpulentDreams: ArtifactSetSheet = {
  key: 'HuskOfOpulentDreams',
  conds: [
    { name: 'stacks', type: 'num', label: '4 件套层数(每层 +6% DEF / +6% 岩伤)', intOnly: true, min: 0, max: 4 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.def_', 0.3, '华馆梦醒形骸记 2 件套')
    if (count >= 4) {
      const s = condState.HuskOfOpulentDreams?.stacks ?? 0
      if (s > 0) {
        scope.add('premod.def_', 0.06 * s, `华馆梦醒形骸记 4 件套(${s} 层 DEF)`)
        scope.add('premod.dmg_.geo', 0.06 * s, `华馆梦醒形骸记 4 件套(${s} 层 岩伤)`)
      }
    }
  },
}

// =============================================================================
// 追忆之注连 / Shimenawa's Reminiscence
//   2pc: +18% 攻击力。
//   4pc: 元素战技后 10s 内若有 15 点元素能量,损失 15 点能量,普通/重击/下落伤害 +50%(10s)。
// =============================================================================
export const ShimenawasReminiscence: ArtifactSetSheet = {
  key: 'ShimenawasReminiscence',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:E 后普攻/重击/下落 +50%' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('artifact.set.atk_', 0.18, '追忆之注连 2 件套')
    if (count >= 4 && condState.ShimenawasReminiscence?.set4) {
      scope.add('premod.dmg_.normal', 0.5, '追忆之注连 4 件套(普攻)')
      scope.add('premod.dmg_.charged', 0.5, '追忆之注连 4 件套(重击)')
      scope.add('premod.dmg_.plunging', 0.5, '追忆之注连 4 件套(下落)')
    }
  },
}

// =============================================================================
// 辰砂往生录 / Vermillion Hereafter
//   2pc: +18% 攻击力。
//   4pc: 释放元素爆发后获得"潜光"效果 +8% 攻击;受伤时每层 +10% 攻击,最多 4 层;持续 16s。
// =============================================================================
export const VermillionHereafter: ArtifactSetSheet = {
  key: 'VermillionHereafter',
  conds: [
    { name: 'set4Stacks', type: 'num', label: '4 件套层数(0 = 关 / 1 = Q 后 +8% / 2-5 = 再 +10%/层)', intOnly: true, min: 0, max: 5 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('artifact.set.atk_', 0.18, '辰砂往生录 2 件套')
    if (count >= 4) {
      const lvl = condState.VermillionHereafter?.set4Stacks ?? 0
      if (lvl >= 1) {
        const base = 0.08
        const stacks = Math.max(0, lvl - 1)
        const total = base + stacks * 0.1
        scope.add('artifact.set.atk_', total, `辰砂往生录 4 件套(${stacks} 层受伤 +${(total * 100).toFixed(0)}%)`)
      }
    }
  },
}

// =============================================================================
// 黄金剧团 / Golden Troupe
//   2pc: +20% 元素战技伤害。
//   4pc: E DMG +25%;若不在场则再 +25%(共 +50%)持续 2s。
// =============================================================================
export const GoldenTroupe: ArtifactSetSheet = {
  key: 'GoldenTroupe',
  conds: [
    { name: 'offField', type: 'bool', label: '4 件套:角色不在场(E +25% → +50%)' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.skill', 0.2, '黄金剧团 2 件套')
    if (count >= 4) {
      const off = condState.GoldenTroupe?.offField
      scope.add('premod.dmg_.skill', 0.25, '黄金剧团 4 件套(在场)')
      if (off) scope.add('premod.dmg_.skill', 0.25, '黄金剧团 4 件套(不在场再 +25%)')
    }
  },
}

// =============================================================================
// 逐影猎人 / Marechaussee Hunter
//   2pc: +15% 普通/重击伤害。
//   4pc: HP 上升或下降后获得 1 层 +12% CR,5s,最多 3 层。
// =============================================================================
export const MarechausseeHunter: ArtifactSetSheet = {
  key: 'MarechausseeHunter',
  conds: [
    { name: 'stacks', type: 'num', label: '4 件套层数(每层 +12% CR)', intOnly: true, min: 0, max: 3 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) {
      scope.add('premod.dmg_.normal', 0.15, '逐影猎人 2 件套')
      scope.add('premod.dmg_.charged', 0.15, '逐影猎人 2 件套')
    }
    if (count >= 4) {
      const s = condState.MarechausseeHunter?.stacks ?? 0
      if (s > 0) scope.add('premod.critRate_', 0.12 * s, `逐影猎人 4 件套(${s} 层)`)
    }
  },
}

// =============================================================================
// 苍白之火 / Pale Flame
//   2pc: +25% 物理伤害。
//   4pc: E 命中后获得 +9% 攻击,2 层后再 +25% 物理伤害。
// =============================================================================
export const PaleFlame: ArtifactSetSheet = {
  key: 'PaleFlame',
  conds: [
    { name: 'stacks', type: 'num', label: '4 件套层数(每层 +9% ATK,2 层再 +25% 物伤)', intOnly: true, min: 0, max: 2 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.physical', 0.25, '苍白之火 2 件套')
    if (count >= 4) {
      const s = condState.PaleFlame?.stacks ?? 0
      if (s > 0) scope.add('artifact.set.atk_', 0.09 * s, `苍白之火 4 件套(${s} 层 ATK)`)
      if (s >= 2) scope.add('premod.dmg_.physical', 0.25, '苍白之火 4 件套(2 层 物伤)')
    }
  },
}

// =============================================================================
// 染血的骑士道 / Bloodstained Chivalry
//   2pc: +25% 物理伤害。
//   4pc: 击败敌人后 10s 内重击 +50% 且不消耗体力。
// =============================================================================
export const BloodstainedChivalry: ArtifactSetSheet = {
  key: 'BloodstainedChivalry',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:击败后窗口期(重击 +50%)' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.physical', 0.25, '染血的骑士道 2 件套')
    if (count >= 4 && condState.BloodstainedChivalry?.set4) {
      scope.add('premod.dmg_.charged', 0.5, '染血的骑士道 4 件套')
    }
  },
}

// =============================================================================
// 沙上楼阁史话 / Desert Pavilion Chronicle
//   2pc: +15% 风元素伤害加成。
//   4pc: 重击命中敌人后 +10% 重击速度 +40% 普通伤害 +40% 重击伤害 +40% 下落伤害,15s。
// =============================================================================
export const DesertPavilionChronicle: ArtifactSetSheet = {
  key: 'DesertPavilionChronicle',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:重击后窗口期(N/C/P +40%)' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.anemo', 0.15, '沙上楼阁史话 2 件套')
    if (count >= 4 && condState.DesertPavilionChronicle?.set4) {
      scope.add('premod.dmg_.normal', 0.4, '沙上楼阁史话 4 件套')
      scope.add('premod.dmg_.charged', 0.4, '沙上楼阁史话 4 件套')
      scope.add('premod.dmg_.plunging', 0.4, '沙上楼阁史话 4 件套')
    }
  },
}

// =============================================================================
// 饰金之梦 / Gilded Dreams
//   2pc: +80 元素精通。
//   4pc: E 后,基于队伍中同元素 / 不同元素 +14% ATK / +50 EM(各最多 3 层)。
// =============================================================================
export const GildedDreams: ArtifactSetSheet = {
  key: 'GildedDreams',
  conds: [
    { name: 'sameEleCount', type: 'num', label: '4 件套:同元素队员数 (+14% ATK/层)', intOnly: true, min: 0, max: 3 },
    { name: 'diffEleCount', type: 'num', label: '4 件套:不同元素队员数 (+50 EM/层)', intOnly: true, min: 0, max: 3 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.eleMas', 80, '饰金之梦 2 件套')
    if (count >= 4) {
      const same = condState.GildedDreams?.sameEleCount ?? 0
      const diff = condState.GildedDreams?.diffEleCount ?? 0
      if (same > 0) scope.add('artifact.set.atk_', 0.14 * same, `饰金之梦 4 件套(${same} 同元素)`)
      if (diff > 0) scope.add('premod.eleMas', 50 * diff, `饰金之梦 4 件套(${diff} 不同元素)`)
    }
  },
}

// =============================================================================
// 乐园遗落之花 / Flower of Paradise Lost
//   2pc: +80 元素精通。
//   4pc: 装备者超绽放/绽放/烈绽放 +40% 起始,每次绽放-激活后再 +25%,最多 4 层。
// =============================================================================
export const FlowerOfParadiseLost: ArtifactSetSheet = {
  key: 'FlowerOfParadiseLost',
  conds: [],
  apply(scope, count) {
    if (count >= 2) scope.add('premod.eleMas', 80, '乐园遗落之花 2 件套')
    // 4pc reaction-multiplier not modeled in panel/damage layer yet.
  },
}

// =============================================================================
// 涟漪的祝意 / Nymph's Dream
//   2pc: +15% 水元素伤害加成。
//   4pc: 命中敌人后获得"渚色清梦"层数,每层 +7% 攻击 + 3% 水元素伤害,最多 3 层。
// =============================================================================
export const NymphsDream: ArtifactSetSheet = {
  key: 'NymphsDream',
  conds: [
    { name: 'stacks', type: 'num', label: '4 件套层数(每层 +7% ATK / +3% 水伤)', intOnly: true, min: 0, max: 3 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.hydro', 0.15, '涟漪的祝意 2 件套')
    if (count >= 4) {
      const s = condState.NymphsDream?.stacks ?? 0
      if (s > 0) {
        scope.add('artifact.set.atk_', 0.07 * s, `涟漪的祝意 4 件套(${s} 层 ATK)`)
        scope.add('premod.dmg_.hydro', 0.03 * s, `涟漪的祝意 4 件套(${s} 层 水伤)`)
      }
    }
  },
}

// =============================================================================
// 渡过烈火的贤人 / Lavawalker
//   2pc: +40% 火元素抗性。
//   4pc: 对火附着敌人造成的伤害 +35%。
// =============================================================================
export const Lavawalker: ArtifactSetSheet = {
  key: 'Lavawalker',
  conds: [
    { name: 'enemyPyro', type: 'bool', label: '4 件套:敌人附着火元素 (+35% 伤害)' },
  ],
  apply(scope, count, condState) {
    if (count >= 4 && condState.Lavawalker?.enemyPyro) {
      // "+35% DMG" — applied as a flat dmg_ on all elements/moves. Since
      // dmg_<ele> are per-element, we add to each. (Approximation.)
      for (const ele of ALL_ELEMENTS) {
        scope.add(`premod.dmg_.${ele}`, 0.35, '渡过烈火的贤人 4 件套')
      }
      scope.add('premod.dmg_.physical', 0.35, '渡过烈火的贤人 4 件套')
    }
  },
}

// =============================================================================
// 千岩牢固 already in TenacityOfTheMillelith.ts.
// 昔日宗室之仪 already in NoblesseOblige.ts.
// 冰风迷途的勇士 already in BlizzardStrayer.ts.
// =============================================================================
