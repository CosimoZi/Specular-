// Batch 1 — most-used 5★ artifact sets across all damage roles.
// Each export is an ArtifactSetSheet that registers under `artifactSetSheets`.

import type { ArtifactSetSheet } from '../sheet-types'
import type { BuffEntry } from '../../integration/buff-sources'
import { ARTIFACT_SET_NAME_ZH as A } from '../data/names-zh'

const ALL_ELEMENTS = ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro'] as const

// Helpers for compact buff descriptors. Defaults: self scope, no cond.
const af2pc = (
  setKey: string,
  name: { zh: string; en: string },
  effect: { zh: string; en: string },
  opts: { scope?: 'self' | 'team'; condName?: string } = {},
): BuffEntry => ({
  source: { type: 'artifact', ordinal: 2, label: { zh: `${A[setKey]} 2 件套`, en: `${setKey} 2pc` } },
  name, effect,
  scope: opts.scope ?? 'self',
  condName: opts.condName,
  sheetKey: setKey,
})

const af4pc = (
  setKey: string,
  name: { zh: string; en: string },
  effect: { zh: string; en: string },
  opts: { scope?: 'self' | 'team'; condName?: string } = {},
): BuffEntry => ({
  source: { type: 'artifact', ordinal: 4, label: { zh: `${A[setKey]} 4 件套`, en: `${setKey} 4pc` } },
  name, effect,
  scope: opts.scope ?? 'self',
  condName: opts.condName,
  sheetKey: setKey,
})

// =============================================================================
// 角斗士的终幕礼 / Gladiator's Finale
// =============================================================================
export const GladiatorsFinale: ArtifactSetSheet = {
  key: 'GladiatorsFinale',
  conds: [],
  buffs: [
    af2pc('GladiatorsFinale', { zh: 'ATK +18%', en: '+18% ATK' }, { zh: '攻击力 +18%。', en: '+18% ATK.' }),
    af4pc('GladiatorsFinale', { zh: '普通攻击 +35%(剑/双手剑/长柄)', en: '+35% normal (sword/claymore/polearm)' }, { zh: '若装备者为剑/双手剑/长柄武器, 普通攻击伤害 +35%。', en: 'If sword/claymore/polearm: +35% normal.' }),
  ],
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
  buffs: [
    af2pc('EmblemOfSeveredFate', { zh: '元素充能 +20%', en: '+20% ER' }, { zh: '元素充能效率 +20%。', en: '+20% Energy Recharge.' }),
    af4pc('EmblemOfSeveredFate', { zh: 'Q 伤害 +ER×25%(上限 +75%)', en: 'Burst DMG +ER×25% (cap +75%)' }, { zh: '元素爆发伤害 +元素充能效率 × 25%(上限 +75%)。', en: 'Burst DMG bonus = ER × 25% (capped at +75%).' }),
  ],
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
  buffs: [
    af2pc('HeartOfDepth', { zh: '水元素伤害 +15%', en: '+15% Hydro DMG' }, { zh: '水元素伤害加成 +15%。', en: '+15% Hydro DMG.' }),
    af4pc('HeartOfDepth', { zh: 'E 后 普攻/重击 +30%', en: 'After E: normal/charged +30%' }, { zh: '元素战技后的 15 秒内, 普通攻击 / 重击伤害 +30%。', en: 'For 15s after Skill, normal/charged DMG +30%.' }, { condName: 'set4' }),
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
  buffs: [
    af2pc('CrimsonWitchOfFlames', { zh: '火元素伤害 +15%', en: '+15% Pyro DMG' }, { zh: '火元素伤害加成 +15%。', en: '+15% Pyro DMG.' }),
    af4pc('CrimsonWitchOfFlames', { zh: '过载 +40%, 燃烧 +40%, 蒸发 +15%, 融化 +15%', en: '+40% overload, +40% burning, +15% vape, +15% melt' }, { zh: '过载与燃烧反应伤害 +40%; 蒸发与融化反应增伤 +15%。', en: 'Overload/Burning DMG +40%; Vaporize/Melt DMG +15%.' }),
    af4pc('CrimsonWitchOfFlames', { zh: '火伤层数(+7.5%/层)', en: 'Pyro stacks (+7.5%/stack)' }, { zh: '元素战技命中后, 火元素伤害 +7.5%/层, 最多 3 层。', en: 'After Skill hit: +7.5% Pyro DMG per stack, max 3.' }, { condName: 'set4Stacks' }),
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.pyro', 0.15, `${A.CrimsonWitchOfFlames} 2 件套`)
    if (count >= 4) {
      // 4pc always-on: +40% overload, +40% burning, +15% vaporize, +15% melt
      // (amplifying + transformative reaction boosts).
      scope.add('premod.overloadDmgBoost', 0.4, `${A.CrimsonWitchOfFlames} 4 件套(过载 +40%)`)
      scope.add('premod.burningDmgBoost', 0.4, `${A.CrimsonWitchOfFlames} 4 件套(燃烧 +40%)`)
      scope.add('premod.vaporizeDmgBoost', 0.15, `${A.CrimsonWitchOfFlames} 4 件套(蒸发 +15%)`)
      scope.add('premod.meltDmgBoost', 0.15, `${A.CrimsonWitchOfFlames} 4 件套(融化 +15%)`)
      // Pyro DMG stacks
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
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:扩散后 减抗 -40%(对应元素)' },
  ],
  buffs: [
    af2pc('ViridescentVenerer', { zh: '风元素伤害 +15%', en: '+15% Anemo DMG' }, { zh: '风元素伤害加成 +15%。', en: '+15% Anemo DMG.' }),
    af4pc('ViridescentVenerer', { zh: '扩散反应伤害 +60%', en: 'Swirl DMG +60%' }, { zh: '扩散反应造成的伤害 +60%。引擎已建模, 数字直接生效于 swirl formula.', en: 'Swirl reaction DMG +60%. Engine modeled — applies directly to swirl formulas.' }),
    af4pc('ViridescentVenerer', { zh: '扩散后 → 敌人对应元素抗性 -40%(10s, 团队)', en: 'After swirl → enemy element RES -40% (10s, team)' }, { zh: '扩散反应后, 敌人对应元素抗性 -40% 持续 10 秒。需要手动指定哪个元素被扩散(暂未自动追踪).', en: 'After swirl, target element RES -40% (10s). User must indicate which element was swirled (auto-tracking TODO).' }, { scope: 'team', condName: 'set4' }),
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.anemo', 0.15, `${A.ViridescentVenerer} 2 件套`)
    // 4pc swirl-reaction +60% — write to specific transformative slot.
    if (count >= 4) {
      scope.add('premod.swirlDmgBoost', 0.6, `${A.ViridescentVenerer} 4 件套(扩散 +60%)`)
    }
    // 4pc RES shred — applied via build.ts (not yet wired; needs a "swirled
    // element" indicator. Skipped for now; cond exists for future wire-up).
    void condState
  },
}

// =============================================================================
// 如雷的盛怒 / Thundering Fury
// =============================================================================
export const ThunderingFury: ArtifactSetSheet = {
  key: 'ThunderingFury',
  conds: [],
  buffs: [
    af2pc('ThunderingFury', { zh: '雷元素伤害 +15%', en: '+15% Electro DMG' }, { zh: '雷元素伤害加成 +15%。', en: '+15% Electro DMG.' }),
    af4pc('ThunderingFury', { zh: '雷反应伤害 +40%', en: 'Electro reaction +40%' }, { zh: '超载/感电/超导/激化的伤害 +40%, 触发反应时 E CD -1s。本面板未建模。', en: 'Overload/EC/Superconduct/Quicken DMG +40%; -1s skill CD on reactions. Not yet modeled.' }),
  ],
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
  buffs: [
    af2pc('ArchaicPetra', { zh: '岩元素伤害 +15%', en: '+15% Geo DMG' }, { zh: '岩元素伤害加成 +15%。', en: '+15% Geo DMG.' }),
    af4pc('ArchaicPetra', { zh: '拾取元素碎片 → +35% 对应元素伤害', en: 'Shard pickup → +35% element DMG' }, { zh: '拾取结晶反应产生的碎片后, 队伍 +35% 对应元素伤害加成 10s。', en: 'Picking up crystallize shard: team +35% DMG of that element (10s).' }, { condName: 'shardEle' }),
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
  buffs: [
    af2pc('DeepwoodMemories', { zh: '草元素伤害 +15%', en: '+15% Dendro DMG' }, { zh: '草元素伤害加成 +15%。', en: '+15% Dendro DMG.' }),
    af4pc('DeepwoodMemories', { zh: 'E/Q 命中 → 敌人草抗 -30%(团队)', en: 'E/Q hit → enemy dendro RES -30%' }, { zh: '元素战技/爆发命中敌人后, 敌人草元素抗性 -30% 持续 8 秒。', en: 'Skill/Burst hits enemy: enemy Dendro RES -30% for 8s.' }, { scope: 'team', condName: 'set4' }),
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
  // Self-only buff that the wearer naturally maxes during their rotation.
  // No user toggle — assume 4 stacks fully maintained and bake into the
  // character panel (per Specular's "self-only artifact buffs default to 吃满"
  // policy). User CAN'T turn this off; if the slot wearer isn't using their
  // rotation properly the artifact is wasted anyway.
  conds: [],
  buffs: [
    af2pc('HuskOfOpulentDreams', { zh: '防御力 +30%', en: '+30% DEF' }, { zh: '防御力 +30%。', en: '+30% DEF.' }),
    af4pc('HuskOfOpulentDreams', { zh: '4 层堆满(DEF +24%, 岩伤 +24%)', en: 'Max stacks: DEF +24%, Geo DMG +24%' }, { zh: '场外或命中敌人后获得金石之名层数, 最多 4 层, 每层 DEF +6% / 岩伤 +6%。默认吃满。', en: 'On-field hits or off-field generate Curiosity stacks (max 4): DEF +6%/Geo DMG +6% per stack. Defaults to max.' }),
  ],
  apply(scope, count, _condState) {
    if (count >= 2) scope.add('premod.def_', 0.3, `${A.HuskOfOpulentDreams} 2 件套`)
    if (count >= 4) {
      scope.add('premod.def_', 0.24, `${A.HuskOfOpulentDreams} 4 件套(4 层 DEF, 默认吃满)`)
      scope.add('premod.dmg_.geo', 0.24, `${A.HuskOfOpulentDreams} 4 件套(4 层 岩伤, 默认吃满)`)
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
  buffs: [
    af2pc('ShimenawasReminiscence', { zh: '攻击力 +18%', en: '+18% ATK' }, { zh: '攻击力 +18%。', en: '+18% ATK.' }),
    af4pc('ShimenawasReminiscence', { zh: 'E 时扣 15 能量 → +50% 普攻/重击/下落', en: 'E spends 15 energy → N/C/P +50%' }, { zh: '元素战技时扣除 15 点能量, 之后 10s 内普通/重击/下落伤害 +50%(此期间不产生能量)。', en: 'Skill costs 15 energy → +50% N/C/P DMG for 10s (no energy gen).' }, { condName: 'set4' }),
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
  buffs: [
    af2pc('VermillionHereafter', { zh: '攻击力 +18%', en: '+18% ATK' }, { zh: '攻击力 +18%。', en: '+18% ATK.' }),
    af4pc('VermillionHereafter', { zh: 'Q 后 +8% ATK, 受伤再 +10%/层(最多 4)', en: 'After Q: +8% ATK, +10%/stack on hit (max 4)' }, { zh: 'Q 后获得「潜光」: 攻击力 +8% 持续 16 秒; 角色失去 HP 后再 +10% ATK, 每秒可叠加最多 4 层。', en: 'After Burst: ATK +8% (16s). On HP loss: +10% ATK/stack, max 4.' }, { condName: 'set4Stacks' }),
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
  buffs: [
    af2pc('GoldenTroupe', { zh: '元素战技伤害 +20%', en: '+20% Skill DMG' }, { zh: '元素战技伤害 +20%。', en: '+20% Skill DMG.' }),
    af4pc('GoldenTroupe', { zh: '元素战技 +25%(在场), 不在场再 +25%', en: '+25% Skill DMG (+25% more off-field)' }, { zh: '元素战技伤害 +25%; 角色不在场时再 +25%, 上场 2 秒后失效。', en: 'Skill DMG +25%; off-field: additional +25% (lost 2s after returning on-field).' }, { condName: 'offField' }),
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
  buffs: [
    af2pc('MarechausseeHunter', { zh: '普攻/重击 +15%', en: '+15% Normal/Charged' }, { zh: '普通攻击与重击伤害 +15%。', en: '+15% Normal/Charged DMG.' }),
    af4pc('MarechausseeHunter', { zh: 'HP 变化 → 暴击率 +12%/层(最多 3)', en: 'HP change → +12% CR/stack (max 3)' }, { zh: '角色 HP 增减时, 暴击率 +12%, 持续 5 秒, 最多 3 层。', en: 'On HP change: CR +12% for 5s, max 3 stacks.' }, { condName: 'stacks' }),
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
  buffs: [
    af2pc('PaleFlame', { zh: '物理伤害 +25%', en: '+25% Physical DMG' }, { zh: '物理伤害加成 +25%。', en: '+25% Physical DMG.' }),
    af4pc('PaleFlame', { zh: 'E 命中 → +9% ATK/层, 2 层再 +25% 物伤', en: 'Skill hit → +9% ATK/stack, 2-stack: +25% Physical' }, { zh: '元素战技命中, +9% ATK/层 7 秒, 最多 2 层(0.3s 触发间隔)。 2 层时 2 件套效果再 +100%(总 +50% 物伤)。', en: 'Skill hit: +9% ATK/stack (max 2), 7s. 2 stacks: doubles 2pc Physical DMG bonus (effective +50%).' }, { condName: 'stacks' }),
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
  buffs: [
    af2pc('BloodstainedChivalry', { zh: '物理伤害 +25%', en: '+25% Physical DMG' }, { zh: '物理伤害加成 +25%。', en: '+25% Physical DMG.' }),
    af4pc('BloodstainedChivalry', { zh: '击败敌人 → 重击 +50%(10s)', en: 'After kill: charged +50% (10s)' }, { zh: '击败敌人后, 重击伤害 +50% 持续 10 秒。', en: 'On enemy kill: Charged Atk DMG +50% for 10s.' }, { condName: 'set4' }),
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
  buffs: [
    af2pc('DesertPavilionChronicle', { zh: '风元素伤害 +15%', en: '+15% Anemo DMG' }, { zh: '风元素伤害加成 +15%。', en: '+15% Anemo DMG.' }),
    af4pc('DesertPavilionChronicle', { zh: '重击命中 → 普攻 / 重击 / 下落 +40%(15s)', en: 'Charged hit → N/C/P +40% (15s)' }, { zh: '重击命中敌人后, 普通/重击/下落伤害 +40% 持续 15 秒(攻速 +10%)。', en: 'Charged hit on enemy: N/C/P DMG +40%, ATK Spd +10% for 15s.' }, { condName: 'set4' }),
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
    // User overrides — fall back to auto-computed counts from team composition.
    { name: 'sameEleCount', type: 'num', label: '4 件套:同元素队员数 (空 → 自动, +14% ATK/层)', intOnly: true, min: 0, max: 3 },
    { name: 'diffEleCount', type: 'num', label: '4 件套:不同元素队员数 (空 → 自动, +50 EM/层)', intOnly: true, min: 0, max: 3 },
  ],
  buffs: [
    af2pc('GildedDreams', { zh: '元素精通 +80', en: '+80 EM' }, { zh: '元素精通 +80。', en: '+80 Elemental Mastery.' }),
    af4pc('GildedDreams', { zh: '触发反应 → 同元素 +14% ATK/人, 异元素 +50 EM/人(自动)', en: 'Reaction → +14% ATK / same-ele, +50 EM / diff-ele (auto)' }, { zh: '触发元素反应后 8s: 同元素队员每人 +14% ATK, 不同元素队员每人 +50 EM(各最多 3 层)。引擎自动从队伍配置算同/异元素人数, 也可手动覆盖.', en: 'After reaction: per same-ele teammate +14% ATK; per diff-ele teammate +50 EM (8s, max 3 each). Engine auto-counts from team; manual override supported.' }, { condName: 'sameEleCount' }),
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.eleMas', 80, `${A.GildedDreams} 2 件套`)
    if (count >= 4) {
      // Auto-compute from team.tally.<ele> + focus.element.<ele>. User cond
      // overrides the auto count when set (>0).
      const ELEMENTS = ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro']
      const focusEle = ELEMENTS.find((e) => (scope.get(`focus.element.${e}`) ?? 0) > 0)
      let autoSame = 0
      let autoDiff = 0
      if (focusEle) {
        const sameTotal = scope.get(`team.tally.${focusEle}`) ?? 0
        // tally includes focus herself — subtract 1 to get "other same-ele teammates".
        autoSame = Math.max(0, sameTotal - 1)
        for (const ele of ELEMENTS) {
          if (ele === focusEle) continue
          autoDiff += scope.get(`team.tally.${ele}`) ?? 0
        }
      }
      const userSame = condState.GildedDreams?.sameEleCount ?? 0
      const userDiff = condState.GildedDreams?.diffEleCount ?? 0
      const same = Math.min(3, userSame > 0 ? userSame : autoSame)
      const diff = Math.min(3, userDiff > 0 ? userDiff : autoDiff)
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
  buffs: [
    af2pc('FlowerOfParadiseLost', { zh: '元素精通 +80', en: '+80 EM' }, { zh: '元素精通 +80。', en: '+80 Elemental Mastery.' }),
    af4pc('FlowerOfParadiseLost', { zh: '绽放反应增伤(每层 +10%, 最多 4)', en: 'Bloom-react +10%/stack (max 4)' }, { zh: '装备者绽放/超绽放/烈绽放伤害 +40%; 触发反应后再 +25%/层(最多 4 层)。本面板未建模。', en: "Wearer's Bloom/Hyperbloom/Burgeon DMG +40%; +25%/stack after triggering (max 4). Not yet modeled." }),
  ],
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
  buffs: [
    af2pc('NymphsDream', { zh: '水元素伤害 +15%', en: '+15% Hydro DMG' }, { zh: '水元素伤害加成 +15%。', en: '+15% Hydro DMG.' }),
    af4pc('NymphsDream', { zh: '普攻/E/Q 命中 → +7% ATK / +3% 水伤(每层)', en: 'N/E/Q hit → +7% ATK / +3% Hydro per stack' }, { zh: '普通/E/Q 命中敌人后, 获得「漫沿水迹」, 各最多 3 层, 每层 +7% ATK / +3% 水伤。', en: 'N/E/Q hit: gain stacks (max 3 each): +7% ATK / +3% Hydro per stack.' }, { condName: 'stacks' }),
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
  buffs: [
    af2pc('Lavawalker', { zh: '火元素抗性 +40%', en: '+40% Pyro RES' }, { zh: '火元素抗性 +40%(自身)。', en: '+40% Pyro RES.' }),
    af4pc('Lavawalker', { zh: '对附着火元素的敌人 +35% 伤害', en: 'Vs pyro-affected enemy: +35% DMG' }, { zh: '对处于火元素状态下的敌人, 造成的所有伤害 +35%。', en: 'Vs pyro-affected enemies: all DMG +35%.' }, { condName: 'enemyPyro' }),
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

// =============================================================================
// 晨星与月的晓歌 / Aubade of Morningstar and Moon — moon-reaction set
// =============================================================================
// 2pc: +80 EM
// 4pc cond 'set4' (off-field): +20% all 5 moon-reaction dmgs.
//      moon-full additional: +40% (total +60% off-field moon-full).
export const AubadeOfMorningstarAndMoon: ArtifactSetSheet = {
  key: 'AubadeOfMorningstarAndMoon',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:角色不在场(月反应 +20%, 月兆·满辉再 +40%)' },
    { name: 'moonFull', type: 'bool', label: '月兆·满辉(4 件套追加 +40%)' },
  ],
  buffs: [
    af2pc('AubadeOfMorningstarAndMoon', { zh: '元素精通 +80', en: '+80 EM' }, { zh: '元素精通 +80。', en: '+80 Elemental Mastery.' }),
    af4pc('AubadeOfMorningstarAndMoon', { zh: '角色不在场 → 月反应 +20%(满辉再 +40%)', en: 'Off-field: moon-react +20% (Moon-full: +40% more)' }, { zh: '角色不在场时, 月感电/月绽放/月结晶反应伤害 +20%; 月兆·满辉激活时再额外 +40%。', en: 'While off-field: moon-electrocharged/bloom/crystallize DMG +20%; under Moon-full, additional +40%.' }, { condName: 'set4' }),
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.eleMas', 80, `${A.AubadeOfMorningstarAndMoon} 2 件套`)
    if (count >= 4 && condState.AubadeOfMorningstarAndMoon?.set4) {
      scope.add('premod.moonReactionDmgBoost', 0.2, `${A.AubadeOfMorningstarAndMoon} 4 件套(月反应 +20%)`)
      if (condState.AubadeOfMorningstarAndMoon?.moonFull) {
        scope.add('premod.moonReactionDmgBoost', 0.4, `${A.AubadeOfMorningstarAndMoon} 4 件套·满辉追加 +40%`)
      }
    }
  },
}

// =============================================================================
// 纺月的夜歌 / Silken Moons Serenade — moon-reaction team buff
// =============================================================================
// Vendor: 2pc +20% ER; 4pc cond '4GleamingMoon' (圆月加持触发, in-game term —
//   simplified to "触发月反应" since the exact trigger is char-specific):
//   active char +60 EM (tally.moonsign>=1, i.e. any moon char in team) or
//   +120 EM (tally.moonsign>=2 = 月兆·满辉) + +10% all moon-reaction dmgs (8s).
export const SilkenMoonsSerenade: ArtifactSetSheet = {
  key: 'SilkenMoonsSerenade',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:触发圆月加持(团队 +EM, +10% 月反应)' },
    { name: 'moonFull', type: 'bool', label: '月兆·满辉(4 件套 EM 加成 60→120)' },
  ],
  buffs: [
    af2pc('SilkenMoonsSerenade', { zh: '元素充能 +20%', en: '+20% ER' }, { zh: '元素充能效率 +20%。', en: '+20% Energy Recharge.' }),
    af4pc('SilkenMoonsSerenade', { zh: '触发圆月加持 → 团队 +60/120 EM + 10% 月反应', en: 'Gleaming Moon → team +60/120 EM + 10% moon-react' }, { zh: '触发圆月加持后, 队伍中当前场上角色 +60 EM(月兆·满辉时 +120 EM), 且月反应伤害 +10%(8s, 同套不叠加)。', en: 'On Gleaming Moon trigger: active char +60 EM (Moon-full: 120 EM) + 10% moon-reaction DMG (8s; non-stacking).' }, { scope: 'team', condName: 'set4' }),
  ],
  apply(scope, count, condState) {
    // 2pc — self-only ER
    if (count >= 2) scope.add('premod.enerRech_', 0.2, `${A.SilkenMoonsSerenade} 2 件套(自身)`)
    // 4pc — wearer is also in the team that gets the buff
    if (count >= 4 && condState.SilkenMoonsSerenade?.set4) {
      const em = condState.SilkenMoonsSerenade?.moonFull ? 120 : 60
      scope.add('premod.eleMas', em, `${A.SilkenMoonsSerenade} 4 件套(自身 +${em} EM)`)
      scope.add('premod.moonReactionDmgBoost', 0.1, `${A.SilkenMoonsSerenade} 4 件套(自身 月反应 +10%)`)
    }
  },
  applyAsTeammate(focusScope, count, condState, wearer) {
    // 4pc: team-wide +EM + +10% moon-reactions when wearer's cond fires.
    if (count >= 4 && condState.SilkenMoonsSerenade?.set4) {
      const em = condState.SilkenMoonsSerenade?.moonFull ? 120 : 60
      focusScope.add('premod.eleMas', em, `${wearer.goKey} ${A.SilkenMoonsSerenade} 4 件套(+${em} EM)`)
      focusScope.add('premod.moonReactionDmgBoost', 0.1, `${wearer.goKey} ${A.SilkenMoonsSerenade} 4 件套(月反应 +10%)`)
    }
  },
}

// =============================================================================
// 穹境示现之夜 / Night of the Sky's Unveiling — moon-reaction CR/EM
// =============================================================================
// Vendor: 2pc +80 EM; 4pc cond '4GleamingMoon' (team triggers moon reaction):
//   - CR: +15% (moonsign>=1, ie. any moon-sign team member, auto-on)
//         +30% (moonsign>=2 / 月兆·满辉)
//   - +10% all 5 moon-reaction dmgs to team (8s)
// We expose `moonFull` cond to flip CR between 15/30.
export const NightOfTheSkysUnveiling: ArtifactSetSheet = {
  key: 'NightOfTheSkysUnveiling',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:触发月反应 → 团队 +CR + 月反应增伤' },
    { name: 'moonFull', type: 'bool', label: '月兆·满辉(CR 加成 +15% → +30%)' },
  ],
  buffs: [
    af2pc('NightOfTheSkysUnveiling', { zh: '元素精通 +80', en: '+80 EM' }, { zh: '元素精通 +80。', en: '+80 Elemental Mastery.' }),
    af4pc('NightOfTheSkysUnveiling', { zh: '触发月反应 → 自身 +15/30% CR', en: 'Moon-react trigger → +15/30% CR (self)' }, { zh: '触发月反应后, 装备者暴击率 +15%(月兆·满辉时 +30%), 持续 8 秒。', en: 'On moon-reaction: wearer CR +15% (Moon-full: +30%) for 8s.' }, { condName: 'set4' }),
    af4pc('NightOfTheSkysUnveiling', { zh: '触发月反应 → 团队月反应 +10%', en: 'Moon-react trigger → team moon-react +10%' }, { zh: '触发月反应后, 队伍中当前场上角色月反应伤害 +10%(8s, 同套不叠加)。', en: 'On moon-reaction: active char moon-reaction DMG +10% (8s, non-stacking).' }, { scope: 'team', condName: 'set4' }),
  ],
  apply(scope, count, condState) {
    // 2pc — self-only EM
    if (count >= 2) scope.add('premod.eleMas', 80, `${A.NightOfTheSkysUnveiling} 2 件套(自身)`)
    // 4pc — wearer is part of team that gets the buff
    if (count >= 4 && condState.NightOfTheSkysUnveiling?.set4) {
      const cr = condState.NightOfTheSkysUnveiling?.moonFull ? 0.3 : 0.15
      scope.add('premod.critRate_', cr, `${A.NightOfTheSkysUnveiling} 4 件套(自身 +${(cr * 100).toFixed(0)}% CR)`)
      scope.add('premod.moonReactionDmgBoost', 0.1, `${A.NightOfTheSkysUnveiling} 4 件套(自身 月反应 +10%)`)
    }
  },
  applyAsTeammate(focusScope, count, condState, wearer) {
    // Per vendor: +CR is in `premod` (SELF only). +10% moon-reaction is in
    // `teamBuff.premod` with `nonStackBuff('gleamingmoonintent', ...)` — team
    // but non-stacking by set key. Dedup happens in build.ts Phase 8.4.
    if (count >= 4 && condState.NightOfTheSkysUnveiling?.set4) {
      focusScope.add('premod.moonReactionDmgBoost', 0.1, `${wearer.goKey} ${A.NightOfTheSkysUnveiling} 4 件套(月反应 +10%)`)
    }
  },
}

// =============================================================================
// 黑曜秘典 / Obsidian Codex — Nightsoul-themed
// =============================================================================
// Vendor:
//   2pc cond '2NightsoulBlessing' (角色处于夜魂加持下): +15% all-element DMG.
//   4pc cond '4NightsoulConsume' (角色消耗夜魂值时): +40% CR (NOT all-element).
export const ObsidianCodex: ArtifactSetSheet = {
  key: 'ObsidianCodex',
  conds: [
    { name: 'nightsoulBlessing', type: 'bool', label: '2 件套:角色处于夜魂加持(+15% 全元素伤害)' },
    { name: 'nightsoulConsume', type: 'bool', label: '4 件套:角色消耗夜魂值(+40% CR, 6s)' },
  ],
  buffs: [
    af2pc('ObsidianCodex', { zh: '夜魂加持 → +15% 全元素伤害', en: 'Nightsoul → +15% all-element DMG' }, { zh: '装备者处于夜魂加持下, 所有元素伤害 +15%。', en: 'While Nightsoul Blessing is active: all-element DMG +15%.' }, { condName: 'nightsoulBlessing' }),
    af4pc('ObsidianCodex', { zh: '消耗夜魂值 → +40% 暴击率(6s)', en: 'Consume Nightsoul → +40% CR (6s)' }, { zh: '装备者消耗夜魂值时, 暴击率 +40% 持续 6 秒。', en: 'On consuming Nightsoul: CR +40% for 6s.' }, { condName: 'nightsoulConsume' }),
  ],
  apply(scope, count, condState) {
    if (count >= 2 && condState.ObsidianCodex?.nightsoulBlessing) {
      for (const ele of ALL_ELEMENTS) {
        scope.add(`premod.dmg_.${ele}`, 0.15, `${A.ObsidianCodex} 2 件套(夜魂加持)`)
      }
      scope.add('premod.dmg_.physical', 0.15, `${A.ObsidianCodex} 2 件套(夜魂加持)`)
    }
    if (count >= 4 && condState.ObsidianCodex?.nightsoulConsume) {
      scope.add('premod.critRate_', 0.4, `${A.ObsidianCodex} 4 件套(夜魂消耗 +40% CR)`)
    }
  },
}

// =============================================================================
// 烬城勇者绘卷 / Scroll of the Hero of Cinder City
// =============================================================================
// Vendor:
//   2pc: NO panel-stat effect (in-game text gives energy on E based on lost HP;
//        non-damage utility). Wired with no buffs.
//   4pc: per-element conditional. When team triggers a reaction involving an
//        element, that element gets +12% dmg (team-wide, 15s). If the element
//        is also a Nightsoul-tagged trigger, +28% additional (20s, total +40%).
//        Vendor uses per-element bool conds 'react_<ele>' + 'nightsoul_<ele>'.
//   We expose 8 element toggles for the reaction trigger + 8 for nightsoul
//   trigger. Each grants +12% (or +28%) to that element's dmg.
export const ScrollOfTheHeroOfCinderCity: ArtifactSetSheet = {
  key: 'ScrollOfTheHeroOfCinderCity',
  conds: [
    { name: 'reactPyro', type: 'bool', label: '4 件套:触发火反应(团队 +12% 火伤)' },
    { name: 'reactHydro', type: 'bool', label: '4 件套:触发水反应(团队 +12% 水伤)' },
    { name: 'reactCryo', type: 'bool', label: '4 件套:触发冰反应(团队 +12% 冰伤)' },
    { name: 'reactElectro', type: 'bool', label: '4 件套:触发雷反应(团队 +12% 雷伤)' },
    { name: 'reactDendro', type: 'bool', label: '4 件套:触发草反应(团队 +12% 草伤)' },
    { name: 'reactAnemo', type: 'bool', label: '4 件套:触发风反应(团队 +12% 风伤)' },
    { name: 'reactGeo', type: 'bool', label: '4 件套:触发岩反应(团队 +12% 岩伤)' },
    { name: 'nightsoulAny', type: 'bool', label: '4 件套:触发夜魂相关反应(每个已勾选元素再 +28%)' },
  ],
  buffs: [
    af2pc('ScrollOfTheHeroOfCinderCity', { zh: '元素战技后 → 获得能量(无面板效果)', en: 'After E: gain energy (no panel effect)' }, { zh: '使用元素战技后获得能量(基于已减少 HP), 不影响面板属性。', en: 'After E: gain energy (based on HP lost); no panel stat effect.' }),
    af4pc('ScrollOfTheHeroOfCinderCity', { zh: '触发各元素反应 → 团队 +12% 对应元素伤害', en: 'Reaction → team +12% element DMG' }, { zh: '触发元素反应后, 队伍中当前场上角色 +12% 对应元素伤害, 15s。', en: 'After reaction: active char +12% DMG of that element (15s).' }, { scope: 'team', condName: 'reactPyro' }),
    af4pc('ScrollOfTheHeroOfCinderCity', { zh: '夜魂相关反应 → 已勾选元素再 +28%', en: 'Nightsoul-related reaction → +28% to selected element' }, { zh: '若触发涉及夜魂的反应, 已勾选的元素伤害再 +28%(20s, 总 +40%)。', en: 'If reaction involves a Nightsoul source: selected element gets additional +28% (20s, total +40%).' }, { scope: 'team', condName: 'nightsoulAny' }),
  ],
  apply(scope, count, condState) {
    // 2pc has no damage stat — skipped.
    // 4pc — wearer is part of team that gets the buff
    if (count >= 4) {
      applyScrollTeam(scope, condState, `${A.ScrollOfTheHeroOfCinderCity} 4 件套(自身)`)
    }
  },
  applyAsTeammate(focusScope, count, condState, wearer) {
    if (count >= 4) {
      applyScrollTeam(focusScope, condState, `${wearer.goKey} ${A.ScrollOfTheHeroOfCinderCity} 4 件套`)
    }
  },
}

function applyScrollTeam(
  scope: import('../scope').Scope,
  condState: Record<string, Record<string, number>>,
  prefix: string,
) {
  const cs = condState.ScrollOfTheHeroOfCinderCity
  if (!cs) return
  const elemMap: Array<[string, keyof typeof cs]> = [
    ['pyro', 'reactPyro'],
    ['hydro', 'reactHydro'],
    ['cryo', 'reactCryo'],
    ['electro', 'reactElectro'],
    ['dendro', 'reactDendro'],
    ['anemo', 'reactAnemo'],
    ['geo', 'reactGeo'],
  ]
  for (const [ele, condName] of elemMap) {
    if (cs[condName]) {
      scope.add(`premod.dmg_.${ele}`, 0.12, `${prefix} ${ele} 反应 +12%`)
      if (cs.nightsoulAny) {
        scope.add(`premod.dmg_.${ele}`, 0.28, `${prefix} ${ele} 夜魂 +28%`)
      }
    }
  }
}

// =============================================================================
// 长夜之誓 / Long Night's Oath — plunging-focused
// =============================================================================
// 2pc: +25% plunging dmg
// 4pc cond 'set4Stacks' (1-4): +N × 15% plunging dmg per stack (max +60%).
export const LongNightsOath: ArtifactSetSheet = {
  key: 'LongNightsOath',
  conds: [
    { name: 'set4Stacks', type: 'num', label: '4 件套层数(+15% 下落伤害 / 层, 最多 4)', intOnly: true, min: 0, max: 4 },
  ],
  buffs: [
    af2pc('LongNightsOath', { zh: '下落攻击伤害 +25%', en: '+25% Plunging DMG' }, { zh: '下落攻击伤害 +25%。', en: '+25% Plunging DMG.' }),
    af4pc('LongNightsOath', { zh: '蓄能层数(下落 +15%/层, 最多 4)', en: 'Plunging +15%/stack (max 4)' }, { zh: '使用下落/E/Q 后获得层数, 每层下落攻击伤害 +15%, 最多 4 层。', en: 'After plunging/E/Q: stacks (max 4); +15% Plunging DMG per stack.' }, { condName: 'set4Stacks' }),
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.plunging', 0.25, `${A.LongNightsOath} 2 件套`)
    if (count >= 4) {
      const stacks = condState.LongNightsOath?.set4Stacks ?? 0
      if (stacks > 0) {
        scope.add('premod.dmg_.plunging', 0.15 * stacks, `${A.LongNightsOath} 4 件套(${stacks} 层)`)
      }
    }
  },
}

// =============================================================================
// 深廊终曲 / Finale of the Deep Galleries — cryo set
// =============================================================================
// Vendor:
//   2pc: +15% cryo DMG (always-on).
//   4pc: two distinct cond toggles:
//     - '0EnergyNoBurst' (能量为 0 且未释放 Q): +60% normal_dmg_
//     - '0EnergyNoNormal' (能量为 0 且未普攻): +60% burst_dmg_
//   Cond names reflect the actual in-game trigger (energy-0 + recent action).
export const FinaleOfTheDeepGalleries: ArtifactSetSheet = {
  key: 'FinaleOfTheDeepGalleries',
  conds: [
    { name: 'energy0NoBurst', type: 'bool', label: '4 件套:能量 0 且未释放 Q(+60% 普攻)' },
    { name: 'energy0NoNormal', type: 'bool', label: '4 件套:能量 0 且未使用普攻(+60% Q)' },
  ],
  buffs: [
    af2pc('FinaleOfTheDeepGalleries', { zh: '冰元素伤害 +15%', en: '+15% Cryo DMG' }, { zh: '冰元素伤害加成 +15%。', en: '+15% Cryo DMG.' }),
    af4pc('FinaleOfTheDeepGalleries', { zh: '能量 0 且未 Q → 普攻 +60%', en: 'Energy 0 + no Q → Normal +60%' }, { zh: '元素能量为 0 且未释放过元素爆发时, 普通攻击伤害 +60%。', en: 'When energy is 0 and Burst not yet used: Normal Atk DMG +60%.' }, { condName: 'energy0NoBurst' }),
    af4pc('FinaleOfTheDeepGalleries', { zh: '能量 0 且未普攻 → Q +60%', en: 'Energy 0 + no Normal → Burst +60%' }, { zh: '元素能量为 0 且未使用过普通攻击时, 元素爆发伤害 +60%。', en: 'When energy is 0 and no Normal yet: Burst DMG +60%.' }, { condName: 'energy0NoNormal' }),
  ],
  apply(scope, count, condState) {
    if (count >= 2) scope.add('premod.dmg_.cryo', 0.15, `${A.FinaleOfTheDeepGalleries} 2 件套`)
    if (count >= 4) {
      if (condState.FinaleOfTheDeepGalleries?.energy0NoBurst) {
        scope.add('premod.dmg_.normal', 0.6, `${A.FinaleOfTheDeepGalleries} 4 件套(能量 0/未 Q → +60% 普攻)`)
      }
      if (condState.FinaleOfTheDeepGalleries?.energy0NoNormal) {
        scope.add('premod.dmg_.burst', 0.6, `${A.FinaleOfTheDeepGalleries} 4 件套(能量 0/未普攻 → +60% Q)`)
      }
    }
  },
}
