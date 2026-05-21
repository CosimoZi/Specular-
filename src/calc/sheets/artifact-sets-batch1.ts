// Batch 1 — most-used 5★ artifact sets across all damage roles.
// Each export is an ArtifactSetSheet that registers under `artifactSetSheets`.

import type { ArtifactSetSheet } from '../sheet-types'
import { ARTIFACT_SET_NAME_ZH as A } from '../data/names-zh'

const ALL_ELEMENTS = ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro'] as const

// =============================================================================
// 角斗士的终幕礼 / Gladiator's Finale
// =============================================================================
export const GladiatorsFinale: ArtifactSetSheet = {
  key: 'GladiatorsFinale',
  conds: [],
  apply(scope, count) {
    if (count >= 2) scope.add('artifact.set.atk_', 0.18, `${A.GladiatorsFinale} 2 件套`)
    if (count >= 4) {
      // Weapon-type gate not yet exposed in scope; apply unconditionally for now.
      scope.add('premod.dmg_.normal', 0.35, `${A.GladiatorsFinale} 4 件套(普攻 +35%)`)
    }
  },
}

// =============================================================================
// 绝缘之旗印 / Emblem of Severed Fate
// =============================================================================
export const EmblemOfSeveredFate: ArtifactSetSheet = {
  key: 'EmblemOfSeveredFate',
  conds: [],
  apply(scope, count) {
    if (count >= 2) scope.add('premod.enerRech_', 0.2, `${A.EmblemOfSeveredFate} 2 件套`)
    if (count >= 4) {
      // 4pc Q DMG += min(0.75, ER * 0.25). Approximate ER at this point.
      const er = (scope.get('char.asc.enerRech_') ?? 0) +
        (scope.get('weap.substat.enerRech_') ?? 0) +
        (scope.get('artifact.main.enerRech_') ?? 0) +
        (scope.get('artifact.sub.enerRech_') ?? 0) +
        (count >= 2 ? 0.2 : 0) + 1
      const bonus = Math.min(0.75, er * 0.25)
      scope.add('premod.dmg_.burst', bonus, `${A.EmblemOfSeveredFate} 4 件套(Q DMG +${(bonus * 100).toFixed(1)}%)`)
    }
  },
}

// =============================================================================
// 沉沦之心 / Heart of Depth
// =============================================================================
export const HeartOfDepth: ArtifactSetSheet = {
  key: 'HeartOfDepth',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:E 后普攻/重击 +30%' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.hydro', 0.15, `${A.HeartOfDepth} 2 件套`)
    if (count >= 4 && condState.HeartOfDepth?.set4) {
      scope.add('premod.dmg_.normal', 0.3, `${A.HeartOfDepth} 4 件套(E 后普攻)`)
      scope.add('premod.dmg_.charged', 0.3, `${A.HeartOfDepth} 4 件套(E 后重击)`)
    }
  },
}

// =============================================================================
// 炽烈的炎之魔女 / Crimson Witch of Flames
// =============================================================================
export const CrimsonWitchOfFlames: ArtifactSetSheet = {
  key: 'CrimsonWitchOfFlames',
  conds: [
    { name: 'set4Stacks', type: 'num', label: '4 件套层数(每层 +7.5% 火伤)', intOnly: true, min: 0, max: 3 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.pyro', 0.15, `${A.CrimsonWitchOfFlames} 2 件套`)
    if (count >= 4) {
      const stacks = condState.CrimsonWitchOfFlames?.set4Stacks ?? 0
      if (stacks > 0) {
        scope.add('premod.dmg_.pyro', 0.075 * stacks, `${A.CrimsonWitchOfFlames} 4 件套(${stacks} 层)`)
      }
    }
  },
}

// =============================================================================
// 翠绿之影 / Viridescent Venerer
// =============================================================================
export const ViridescentVenerer: ArtifactSetSheet = {
  key: 'ViridescentVenerer',
  conds: [],
  apply(scope, count) {
    if (count >= 2) scope.add('premod.dmg_.anemo', 0.15, `${A.ViridescentVenerer} 2 件套`)
    // 4pc swirl reaction bonus + RES shred not modeled (no reaction layer yet).
  },
}

// =============================================================================
// 如雷的盛怒 / Thundering Fury
// =============================================================================
export const ThunderingFury: ArtifactSetSheet = {
  key: 'ThunderingFury',
  conds: [],
  apply(scope, count) {
    if (count >= 2) scope.add('premod.dmg_.electro', 0.15, `${A.ThunderingFury} 2 件套`)
  },
}

// =============================================================================
// 悠古的磐岩 / Archaic Petra
// =============================================================================
export const ArchaicPetra: ArtifactSetSheet = {
  key: 'ArchaicPetra',
  conds: [
    { name: 'shardEle', type: 'num', label: '4 件套:已拾取碎片(0 关 / 1 火 / 2 水 / 3 雷 / 4 冰)', intOnly: true, min: 0, max: 4 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.geo', 0.15, `${A.ArchaicPetra} 2 件套`)
    if (count >= 4) {
      const sel = condState.ArchaicPetra?.shardEle ?? 0
      const elMap: Record<number, typeof ALL_ELEMENTS[number]> = {
        1: 'pyro', 2: 'hydro', 3: 'electro', 4: 'cryo',
      }
      const ele = elMap[sel]
      if (ele) scope.add(`premod.dmg_.${ele}`, 0.35, `${A.ArchaicPetra} 4 件套(${ele} 碎片)`)
    }
  },
}

// =============================================================================
// 深林的记忆 / Deepwood Memories
// =============================================================================
export const DeepwoodMemories: ArtifactSetSheet = {
  key: 'DeepwoodMemories',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:已削减敌人 30% 草抗' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.dendro', 0.15, `${A.DeepwoodMemories} 2 件套`)
    if (count >= 4 && condState.DeepwoodMemories?.set4) {
      scope.add('premod.dmg_.dendro', 0.3, `${A.DeepwoodMemories} 4 件套(草抗 -30% 近似)`)
    }
  },
}

// =============================================================================
// 华馆梦醒形骸记 / Husk of Opulent Dreams
// =============================================================================
export const HuskOfOpulentDreams: ArtifactSetSheet = {
  key: 'HuskOfOpulentDreams',
  conds: [
    { name: 'stacks', type: 'num', label: '4 件套层数(每层 +6% DEF / +6% 岩伤)', intOnly: true, min: 0, max: 4 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.def_', 0.3, `${A.HuskOfOpulentDreams} 2 件套`)
    if (count >= 4) {
      const s = condState.HuskOfOpulentDreams?.stacks ?? 0
      if (s > 0) {
        scope.add('premod.def_', 0.06 * s, `${A.HuskOfOpulentDreams} 4 件套(${s} 层 DEF)`)
        scope.add('premod.dmg_.geo', 0.06 * s, `${A.HuskOfOpulentDreams} 4 件套(${s} 层 岩伤)`)
      }
    }
  },
}

// =============================================================================
// 追忆之注连 / Shimenawa's Reminiscence
// =============================================================================
export const ShimenawasReminiscence: ArtifactSetSheet = {
  key: 'ShimenawasReminiscence',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:E 后普攻/重击/下落 +50%' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('artifact.set.atk_', 0.18, `${A.ShimenawasReminiscence} 2 件套`)
    if (count >= 4 && condState.ShimenawasReminiscence?.set4) {
      scope.add('premod.dmg_.normal', 0.5, `${A.ShimenawasReminiscence} 4 件套(普攻)`)
      scope.add('premod.dmg_.charged', 0.5, `${A.ShimenawasReminiscence} 4 件套(重击)`)
      scope.add('premod.dmg_.plunging', 0.5, `${A.ShimenawasReminiscence} 4 件套(下落)`)
    }
  },
}

// =============================================================================
// 辰砂往生录 / Vermillion Hereafter
// =============================================================================
export const VermillionHereafter: ArtifactSetSheet = {
  key: 'VermillionHereafter',
  conds: [
    { name: 'set4Stacks', type: 'num', label: '4 件套层数(0 = 关 / 1 = Q 后 +8% / 2-5 = 再 +10%/层)', intOnly: true, min: 0, max: 5 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('artifact.set.atk_', 0.18, `${A.VermillionHereafter} 2 件套`)
    if (count >= 4) {
      const lvl = condState.VermillionHereafter?.set4Stacks ?? 0
      if (lvl >= 1) {
        const stacks = Math.max(0, lvl - 1)
        const total = 0.08 + stacks * 0.1
        scope.add('artifact.set.atk_', total, `${A.VermillionHereafter} 4 件套(${stacks} 层受伤 +${(total * 100).toFixed(0)}%)`)
      }
    }
  },
}

// =============================================================================
// 黄金剧团 / Golden Troupe
// =============================================================================
export const GoldenTroupe: ArtifactSetSheet = {
  key: 'GoldenTroupe',
  conds: [
    { name: 'offField', type: 'bool', label: '4 件套:角色不在场(E +25% → +50%)' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.skill', 0.2, `${A.GoldenTroupe} 2 件套`)
    if (count >= 4) {
      scope.add('premod.dmg_.skill', 0.25, `${A.GoldenTroupe} 4 件套(在场)`)
      if (condState.GoldenTroupe?.offField) {
        scope.add('premod.dmg_.skill', 0.25, `${A.GoldenTroupe} 4 件套(不在场再 +25%)`)
      }
    }
  },
}

// =============================================================================
// 逐影猎人 / Marechaussee Hunter
// =============================================================================
export const MarechausseeHunter: ArtifactSetSheet = {
  key: 'MarechausseeHunter',
  conds: [
    { name: 'stacks', type: 'num', label: '4 件套层数(每层 +12% CR)', intOnly: true, min: 0, max: 3 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) {
      scope.add('premod.dmg_.normal', 0.15, `${A.MarechausseeHunter} 2 件套`)
      scope.add('premod.dmg_.charged', 0.15, `${A.MarechausseeHunter} 2 件套`)
    }
    if (count >= 4) {
      const s = condState.MarechausseeHunter?.stacks ?? 0
      if (s > 0) scope.add('premod.critRate_', 0.12 * s, `${A.MarechausseeHunter} 4 件套(${s} 层)`)
    }
  },
}

// =============================================================================
// 苍白之火 / Pale Flame
// =============================================================================
export const PaleFlame: ArtifactSetSheet = {
  key: 'PaleFlame',
  conds: [
    { name: 'stacks', type: 'num', label: '4 件套层数(每层 +9% ATK,2 层再 +25% 物伤)', intOnly: true, min: 0, max: 2 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.physical', 0.25, `${A.PaleFlame} 2 件套`)
    if (count >= 4) {
      const s = condState.PaleFlame?.stacks ?? 0
      if (s > 0) scope.add('artifact.set.atk_', 0.09 * s, `${A.PaleFlame} 4 件套(${s} 层 ATK)`)
      if (s >= 2) scope.add('premod.dmg_.physical', 0.25, `${A.PaleFlame} 4 件套(2 层 物伤)`)
    }
  },
}

// =============================================================================
// 染血的骑士道 / Bloodstained Chivalry
// =============================================================================
export const BloodstainedChivalry: ArtifactSetSheet = {
  key: 'BloodstainedChivalry',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:击败后窗口期(重击 +50%)' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.physical', 0.25, `${A.BloodstainedChivalry} 2 件套`)
    if (count >= 4 && condState.BloodstainedChivalry?.set4) {
      scope.add('premod.dmg_.charged', 0.5, `${A.BloodstainedChivalry} 4 件套`)
    }
  },
}

// =============================================================================
// 沙上楼阁史话 / Desert Pavilion Chronicle
// =============================================================================
export const DesertPavilionChronicle: ArtifactSetSheet = {
  key: 'DesertPavilionChronicle',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:重击后窗口期(N/C/P +40%)' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.anemo', 0.15, `${A.DesertPavilionChronicle} 2 件套`)
    if (count >= 4 && condState.DesertPavilionChronicle?.set4) {
      scope.add('premod.dmg_.normal', 0.4, `${A.DesertPavilionChronicle} 4 件套`)
      scope.add('premod.dmg_.charged', 0.4, `${A.DesertPavilionChronicle} 4 件套`)
      scope.add('premod.dmg_.plunging', 0.4, `${A.DesertPavilionChronicle} 4 件套`)
    }
  },
}

// =============================================================================
// 饰金之梦 / Gilded Dreams
// =============================================================================
export const GildedDreams: ArtifactSetSheet = {
  key: 'GildedDreams',
  conds: [
    { name: 'sameEleCount', type: 'num', label: '4 件套:同元素队员数 (+14% ATK/层)', intOnly: true, min: 0, max: 3 },
    { name: 'diffEleCount', type: 'num', label: '4 件套:不同元素队员数 (+50 EM/层)', intOnly: true, min: 0, max: 3 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.eleMas', 80, `${A.GildedDreams} 2 件套`)
    if (count >= 4) {
      const same = condState.GildedDreams?.sameEleCount ?? 0
      const diff = condState.GildedDreams?.diffEleCount ?? 0
      if (same > 0) scope.add('artifact.set.atk_', 0.14 * same, `${A.GildedDreams} 4 件套(${same} 同元素)`)
      if (diff > 0) scope.add('premod.eleMas', 50 * diff, `${A.GildedDreams} 4 件套(${diff} 不同元素)`)
    }
  },
}

// =============================================================================
// 乐园遗落之花 / Flower of Paradise Lost
// =============================================================================
export const FlowerOfParadiseLost: ArtifactSetSheet = {
  key: 'FlowerOfParadiseLost',
  conds: [],
  apply(scope, count) {
    if (count >= 2) scope.add('premod.eleMas', 80, `${A.FlowerOfParadiseLost} 2 件套`)
    // 4pc reaction-multiplier not modeled in panel/damage layer yet.
  },
}

// =============================================================================
// 水仙之梦 / Nymph's Dream
// =============================================================================
export const NymphsDream: ArtifactSetSheet = {
  key: 'NymphsDream',
  conds: [
    { name: 'stacks', type: 'num', label: '4 件套层数(每层 +7% ATK / +3% 水伤)', intOnly: true, min: 0, max: 3 },
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.hydro', 0.15, `${A.NymphsDream} 2 件套`)
    if (count >= 4) {
      const s = condState.NymphsDream?.stacks ?? 0
      if (s > 0) {
        scope.add('artifact.set.atk_', 0.07 * s, `${A.NymphsDream} 4 件套(${s} 层 ATK)`)
        scope.add('premod.dmg_.hydro', 0.03 * s, `${A.NymphsDream} 4 件套(${s} 层 水伤)`)
      }
    }
  },
}

// =============================================================================
// 渡过烈火的贤人 / Lavawalker
// =============================================================================
export const Lavawalker: ArtifactSetSheet = {
  key: 'Lavawalker',
  conds: [
    { name: 'enemyPyro', type: 'bool', label: '4 件套:敌人附着火元素 (+35% 伤害)' },
  ],
  apply(scope, count, condState) {
    if (count >= 4 && condState.Lavawalker?.enemyPyro) {
      for (const ele of ALL_ELEMENTS) {
        scope.add(`premod.dmg_.${ele}`, 0.35, `${A.Lavawalker} 4 件套`)
      }
      scope.add('premod.dmg_.physical', 0.35, `${A.Lavawalker} 4 件套`)
    }
  },
}
