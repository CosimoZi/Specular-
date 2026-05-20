// Character buff database (zone-based).
//
// Each entry describes a buff one character provides. The numeric value lives
// in a specific damage-formula "zone" (base stat / DMG bonus / crit / reaction /
// target shred / additive flat) and can be gated by conditions (hit element,
// hit type, receiver position, source's constellation / talent level).
//
// For talent-level-scaled buffs (Mona Q, Bennett Q, Sara Q etc.) we provide a
// 15-entry table; the receiver picks values at the source's current talent
// level. Values < 1 are decimals (0.4 = +40%); flat values use raw numbers.
//
// Source-stat scaling (buff value = X × source's ATK / HP / EM) is approximated
// for v1 with typical values; future work threads source's computed stats.

import type { BuffSpec } from '@/engine/buff-zones'

// =============================================================================
// 班尼特 Bennett (10000032) — Q ATK buff (scales on Bennett's base ATK + level)
// =============================================================================
const BENNETT_Q: BuffSpec = {
  id: 'bennett-q-atk',
  sourceCharacterId: 10000032,
  label: { zh: '班尼特 Q · 攻击力提升', en: 'Bennett Q · ATK Buff' },
  description: {
    zh: '美妙旋律范围内的角色获得相当于班尼特基础攻击 X% 的固定攻击力提升。这里以典型 5* 武器 + 满突班尼特 ≈ 600 基础攻击近似。',
    en: 'Allies in the Q field gain flat ATK = X% of Bennett\'s Base ATK. Typical 5* + maxed Bennett ≈ 600 Base ATK, so values shown are direct flat ATK.',
  },
  parts: [
    { zone: 'baseAtkFlat', value: 633.6 }, // = 600 × 1.056 (Q lvl 10)
  ],
  scaling: {
    role: 'burst',
    // Bennett Q ATK% scaling × 600 (typical base) — at burst lvl 1..15
    // Bennett Q multiplier: 56%/60.2%/64.4%/70%/74.2%/78.4%/84%/89.6%/95.2%/100.8%/105.6%/110.4%/115.2%/120.6%/126%
    table: [336, 361, 386, 420, 445, 470, 504, 538, 571, 605, 634, 662, 691, 724, 756],
    appliesToParts: [0],
  },
  defaultOn: true,
}

// =============================================================================
// 莫娜 Mona (10000041) — Q omen DMG taken + C6 CD on omen'd
// =============================================================================
const MONA_Q: BuffSpec = {
  id: 'mona-q-omen',
  sourceCharacterId: 10000041,
  label: { zh: '莫娜 Q · 增伤 (占咒疫)', en: 'Mona Q · Omen DMG Bonus' },
  description: {
    zh: '莫娜元素爆发施加水占咒疫：敌人受到的所有伤害提高 Y%（按爆发等级缩放）。',
    en: "Mona Q applies Omen: enemy takes +Y% DMG (scales with burst level).",
  },
  parts: [
    { zone: 'dmgBonusAll', value: 0.42 }, // placeholder; replaced by scaling
  ],
  scaling: {
    role: 'burst',
    // Approximate burst lvl 1..15
    table: [0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.58, 0.62, 0.66, 0.70, 0.74, 0.78, 0.82, 0.86],
    appliesToParts: [0],
  },
  defaultOn: false,
}

const MONA_C1: BuffSpec = {
  id: 'mona-c1-hydro-res-shred',
  sourceCharacterId: 10000041,
  label: { zh: '莫娜 C1 · 水抗减免 -40%', en: 'Mona C1 · -40% Hydro RES' },
  description: {
    zh: '莫娜 1 命：水占咒疫还会使敌人水元素抗性 -40%（持续时间内）。',
    en: 'Mona C1: Omen also shreds 40% Hydro RES while active.',
  },
  parts: [
    { zone: 'resShred', value: 0.4, cond: { element: 'Hydro' } },
  ],
  requires: { minConstellation: 1 },
  defaultOn: false,
}

// =============================================================================
// 万叶 Kazuha (10000047) — A4 EM → swirled element DMG bonus
// =============================================================================
const KAZUHA_A4: BuffSpec = {
  id: 'kazuha-a4-em-elem',
  sourceCharacterId: 10000047,
  label: { zh: '万叶 A4 · 元素精通 → 元素增伤', en: 'Kazuha A4 · EM → Elem DMG' },
  description: {
    zh: '万叶施放战技/爆发后队伍中的角色获得（万叶元素精通 × 0.04%）的扩散元素增伤，持续 8s。典型 1000 EM → +40%。这里默认 +40% 全 4 个可扩散元素。',
    en: "After Kazuha's E/Q, team gets +EM × 0.04% DMG of the swirled element for 8s. Typical 1000 EM → +40%. Default +40% to all 4 swirlable elements.",
  },
  parts: [
    { zone: 'dmgBonusElement', value: 0.4, cond: { element: 'Pyro' } },
    { zone: 'dmgBonusElement', value: 0.4, cond: { element: 'Hydro' } },
    { zone: 'dmgBonusElement', value: 0.4, cond: { element: 'Cryo' } },
    { zone: 'dmgBonusElement', value: 0.4, cond: { element: 'Electro' } },
  ],
  defaultOn: false,
}

// =============================================================================
// 法鲁扎 Faruzan (10000076) — anemo DMG bonus + anemo RES shred during Q
// =============================================================================
const FARUZAN_E: BuffSpec = {
  id: 'faruzan-e-anemo-dmg',
  sourceCharacterId: 10000076,
  label: { zh: '法鲁扎 E + A4 · 风元素伤害 +32%', en: 'Faruzan E + A4 · +32% Anemo DMG' },
  description: {
    zh: '法鲁扎 E 给附近角色 +32% 风元素增伤。',
    en: "Faruzan E gives +32% Anemo DMG to nearby allies.",
  },
  parts: [
    { zone: 'dmgBonusElement', value: 0.32, cond: { element: 'Anemo' } },
  ],
  defaultOn: true,
}

const FARUZAN_Q: BuffSpec = {
  id: 'faruzan-q-anemo-res',
  sourceCharacterId: 10000076,
  label: { zh: '法鲁扎 Q · 风元素抗性 -X%（按等级）', en: 'Faruzan Q · Anemo RES Shred' },
  description: {
    zh: '法鲁扎元素爆发后敌人风元素抗性下降 30% (lvl 10)，按爆发等级缩放。',
    en: 'Faruzan Q shreds 30% Anemo RES (at burst lvl 10), scales with level.',
  },
  parts: [
    { zone: 'resShred', value: 0.3, cond: { element: 'Anemo' } },
  ],
  scaling: {
    role: 'burst',
    table: [0.24, 0.255, 0.27, 0.285, 0.30, 0.315, 0.33, 0.345, 0.36, 0.375, 0.39, 0.405, 0.42, 0.435, 0.45],
    appliesToParts: [0],
  },
  defaultOn: true,
}

// =============================================================================
// 希诺宁 Xilonen (10000103) — Q full element + physical RES shred
// =============================================================================
const XILONEN_Q: BuffSpec = {
  id: 'xilonen-q-res-shred',
  sourceCharacterId: 10000103,
  label: { zh: '希诺宁 Q · 减抗 -30% (全元素 + 物理)', en: 'Xilonen Q · -30% all RES' },
  description: {
    zh: '希诺宁元素爆发"地动山摇·猎手之舞"为附近角色减目标全元素 + 物理抗性 30%。值随爆发等级 +1 略升，这里取 lvl 10 值。',
    en: "Xilonen Q shreds 30% multi-elem + physical RES on nearby enemies. Lvl 10 value.",
  },
  parts: [
    { zone: 'resShred', value: 0.3, cond: { element: 'Pyro' } },
    { zone: 'resShred', value: 0.3, cond: { element: 'Hydro' } },
    { zone: 'resShred', value: 0.3, cond: { element: 'Cryo' } },
    { zone: 'resShred', value: 0.3, cond: { element: 'Electro' } },
    { zone: 'resShred', value: 0.3, cond: { element: 'Anemo' } },
    { zone: 'resShred', value: 0.3, cond: { element: 'Geo' } },
    { zone: 'resShred', value: 0.3, cond: { element: 'Dendro' } },
    { zone: 'resShred', value: 0.3, cond: { element: 'Physical' } },
  ],
  defaultOn: true,
}

// =============================================================================
// 芙宁娜 Furina (10000089) — Q team DMG bonus (max stack ≈ 75%)
// =============================================================================
const FURINA_Q: BuffSpec = {
  id: 'furina-q-dmg',
  sourceCharacterId: 10000089,
  label: { zh: '芙宁娜 Q · 全队增伤（满档 ≈+75%）', en: 'Furina Q · Team DMG (max ≈+75%)' },
  description: {
    zh: '芙宁娜爆发期间根据 HP 涨跌累积"气氛值"，每点提供 +X% 全队增伤至多 +75%。这里取满档近似。',
    en: 'During Furina Q, fanfare stacks from HP swings give up to +75% team DMG. Modeled as max stack.',
  },
  parts: [
    { zone: 'dmgBonusAll', value: 0.75 },
  ],
  defaultOn: true,
}

// =============================================================================
// 申鹤 Shenhe (10000063) — E provides flat cryo damage (per-hit), Q shreds cryo RES
// =============================================================================
const SHENHE_E: BuffSpec = {
  id: 'shenhe-e-cryo-flat',
  sourceCharacterId: 10000063,
  label: { zh: '申鹤 E · 冰加伤近似', en: 'Shenhe E · Cryo Bonus (approx)' },
  description: {
    zh: '申鹤 E 短按为附近角色提供"冰元素加伤"（基于申鹤攻击力）。这里用 +15% 冰增伤粗略近似。',
    en: "Shenhe E adds Cryo damage based on her ATK. Approximated as +15% Cryo DMG.",
  },
  parts: [
    { zone: 'dmgBonusElement', value: 0.15, cond: { element: 'Cryo' } },
  ],
  defaultOn: false,
}

const SHENHE_Q: BuffSpec = {
  id: 'shenhe-q-cryo-res',
  sourceCharacterId: 10000063,
  label: { zh: '申鹤 Q · 冰元素抗性 -15%', en: 'Shenhe Q · -15% Cryo RES' },
  description: {
    zh: '申鹤元素爆发为冰花范围内角色减目标冰元素抗性 15%（lvl 10 值）。',
    en: 'Shenhe Q shreds 15% Cryo RES (lvl 10).',
  },
  parts: [
    { zone: 'resShred', value: 0.15, cond: { element: 'Cryo' } },
  ],
  defaultOn: false,
}

// =============================================================================
// 钟离 Zhongli (10000030) — shield -20% all RES
// =============================================================================
const ZHONGLI_SHIELD: BuffSpec = {
  id: 'zhongli-shield-res-shred',
  sourceCharacterId: 10000030,
  label: { zh: '钟离玉璋 · 全元素 + 物理抗性 -20%', en: 'Zhongli Shield · -20% all RES' },
  description: {
    zh: '玉璋护盾覆盖范围内敌人全元素 + 物理抗性 -20%。常驻 buff（只要钟离在场维持盾）。',
    en: "Within Zhongli's Jade Shield, enemies get -20% all elem + physical RES.",
  },
  parts: [
    { zone: 'resShred', value: 0.2, cond: { element: 'Pyro' } },
    { zone: 'resShred', value: 0.2, cond: { element: 'Hydro' } },
    { zone: 'resShred', value: 0.2, cond: { element: 'Cryo' } },
    { zone: 'resShred', value: 0.2, cond: { element: 'Electro' } },
    { zone: 'resShred', value: 0.2, cond: { element: 'Anemo' } },
    { zone: 'resShred', value: 0.2, cond: { element: 'Geo' } },
    { zone: 'resShred', value: 0.2, cond: { element: 'Dendro' } },
    { zone: 'resShred', value: 0.2, cond: { element: 'Physical' } },
  ],
  defaultOn: true,
}

// =============================================================================
// 九条裟罗 Sara (10000056) — C6 +60% Electro CD
// =============================================================================
const SARA_C6: BuffSpec = {
  id: 'sara-c6-crit-dmg',
  sourceCharacterId: 10000056,
  label: { zh: '裟罗 C6 · 雷暴击伤 +60%', en: 'Sara C6 · +60% Electro CD' },
  description: {
    zh: '九条裟罗 C6：天狗咒雷使敌人受到的雷元素暴击伤害 +60%。',
    en: "Sara C6: Tengu Stormcalls give +60% CD on Electro hits.",
  },
  parts: [
    { zone: 'critDmg', value: 0.6, cond: { element: 'Electro' } },
  ],
  requires: { minConstellation: 6 },
  defaultOn: false,
}

// =============================================================================
// 罗莎莉亚 Rosaria (10000045) — A4 CR share
// =============================================================================
const ROSARIA_A4: BuffSpec = {
  id: 'rosaria-a4-crit-rate',
  sourceCharacterId: 10000045,
  label: { zh: '罗莎莉亚 A4 · 暴击率 +10%', en: 'Rosaria A4 · CR +10%' },
  description: {
    zh: '罗莎莉亚 A4：施放元素爆发后队伍其他角色获得罗莎莉亚 15% 暴击率（上限 15%）。典型 +10%。',
    en: "Rosaria A4: after Q, allies gain 15% of her CR (cap 15%). Modeled as +10%.",
  },
  parts: [
    { zone: 'critRate', value: 0.1 },
  ],
  defaultOn: false,
}

// =============================================================================
// 玛薇卡 Mavuika (10000110) — fighting-spirit ATK%
// =============================================================================
const MAVUIKA_TEAM: BuffSpec = {
  id: 'mavuika-team-atk',
  sourceCharacterId: 10000110,
  label: { zh: '玛薇卡 · 战意系 +30% ATK', en: 'Mavuika · Fighting Spirit +30% ATK%' },
  description: {
    zh: '玛薇卡战意系机制为附近队员提供 +ATK%（典型 +30%）。',
    en: 'Mavuika Fighting Spirit provides team +ATK% (approx +30%).',
  },
  parts: [
    { zone: 'baseAtkPct', value: 0.3 },
  ],
  defaultOn: false,
}

// =============================================================================
// 温迪 Venti (10000022) — VV 4pc-style swirl RES shred (model swirl RES shred only)
// =============================================================================
const VENTI_VV: BuffSpec = {
  id: 'venti-vv-res-shred',
  sourceCharacterId: 10000022,
  label: { zh: '温迪 + 风套 4pc · 扩散元素 -40% 抗', en: 'Venti + VV 4pc · Swirled -40% RES' },
  description: {
    zh: '温迪 Q 触发扩散，配合"翠绿之影 4pc"使被扩散元素抗性 -40%。需要温迪本人/或其他风套角色装风套；本 buff 算作温迪自带，玩家可自行 toggle。',
    en: 'Venti Q swirl + Viridescent Venerer 4pc gives -40% RES of swirled element.',
  },
  parts: [
    { zone: 'resShred', value: 0.4, cond: { element: 'Pyro' } },
    { zone: 'resShred', value: 0.4, cond: { element: 'Hydro' } },
    { zone: 'resShred', value: 0.4, cond: { element: 'Cryo' } },
    { zone: 'resShred', value: 0.4, cond: { element: 'Electro' } },
  ],
  defaultOn: false,
}

// =============================================================================
// 砂糖 Sucrose (10000043) — A4 EM share
// =============================================================================
const SUCROSE_EM: BuffSpec = {
  id: 'sucrose-em-share',
  sourceCharacterId: 10000043,
  label: { zh: '砂糖 A4 · 元素精通 +200', en: 'Sucrose A4 · +200 EM' },
  description: {
    zh: '砂糖触发扩散反应后，扩散元素的角色获得砂糖 EM 的 20%（典型 +200）。',
    en: "After Sucrose triggers swirl, allies of the swirled element get 20% of her EM (~+200).",
  },
  parts: [
    { zone: 'em', value: 200 },
  ],
  defaultOn: false,
}

// =============================================================================
// 五郎 Gorou (10000055) — Q geo DMG + DEF
// =============================================================================
const GOROU_Q: BuffSpec = {
  id: 'gorou-q-geo-dmg',
  sourceCharacterId: 10000055,
  label: { zh: '五郎 Q · 岩元素伤害 +25%', en: 'Gorou Q · +25% Geo DMG' },
  description: {
    zh: '五郎 Q「犬坂吠吠方圆阵」按队伍岩元素角色数提供 +DEF 与 +岩增伤。3 岩典型 +25%。仅对岩元素伤害生效。',
    en: "Gorou Q stacks Geo DMG based on Geo allies. 3-Geo team ≈ +25% Geo DMG.",
  },
  parts: [
    { zone: 'dmgBonusElement', value: 0.25, cond: { element: 'Geo' } },
    { zone: 'baseDefFlat', value: 200 },
  ],
  defaultOn: false,
}

// =============================================================================
// 闲云 Xianyun (10000093) — Q plunge bonus (we approximate as +allDmg for plunge teams)
// =============================================================================
const XIANYUN_Q: BuffSpec = {
  id: 'xianyun-q-plunge',
  sourceCharacterId: 10000093,
  label: { zh: '闲云 Q · 下落伤害加成', en: 'Xianyun Q · Plunge DMG' },
  description: {
    zh: '闲云 Q 期间下落攻击附加伤害（基于闲云攻击力）。本 buff 仅作用于下落攻击 hit type。这里取近似 +200% 下落（典型熟练度）。',
    en: 'Xianyun Q boosts plunge based on her ATK. Approximated as +200% plunge DMG.',
  },
  parts: [
    { zone: 'dmgBonusHitType', value: 2.0, cond: { hitType: ['plunge'] } },
  ],
  defaultOn: false,
}

// =============================================================================
// 卡齐娜 Kachina (10000100) — DEF buff via co-op nightsoul
// =============================================================================
const KACHINA_TEAM: BuffSpec = {
  id: 'kachina-team-def',
  sourceCharacterId: 10000100,
  label: { zh: '卡齐娜 · +100 防御', en: 'Kachina · +100 DEF' },
  description: {
    zh: '卡齐娜钻头协同附岩元素，1 命 + 提供少量队伍防御。粗略 +100 固定防御。',
    en: 'Kachina co-op + C1 grants team a bit of DEF. Modeled as +100 flat DEF.',
  },
  parts: [
    { zone: 'baseDefFlat', value: 100 },
  ],
  defaultOn: false,
}

// =============================================================================
// 行秋 Xingqiu (10000025) — C6 self hydro DMG approx
// =============================================================================
const XINGQIU_C6_SELF: BuffSpec = {
  id: 'xingqiu-c6-self-hydro',
  sourceCharacterId: 10000025,
  label: { zh: '行秋 C6 · 自身水增伤 +25%（近似）', en: 'Xingqiu C6 · Self Hydro +25% (approx)' },
  description: {
    zh: '行秋 C6 增伤效果，仅对行秋自身。',
    en: 'Xingqiu C6 self-only Hydro DMG approximation.',
  },
  parts: [
    { zone: 'dmgBonusElement', value: 0.25, cond: { element: 'Hydro', selfOnly: true } },
  ],
  requires: { minConstellation: 6 },
  defaultOn: false,
}

// =============================================================================
export const BUFFS: BuffSpec[] = [
  BENNETT_Q,
  MONA_Q, MONA_C1,
  KAZUHA_A4,
  FARUZAN_E, FARUZAN_Q,
  XILONEN_Q,
  FURINA_Q,
  SHENHE_E, SHENHE_Q,
  ZHONGLI_SHIELD,
  SARA_C6,
  ROSARIA_A4,
  MAVUIKA_TEAM,
  VENTI_VV,
  SUCROSE_EM,
  GOROU_Q,
  XIANYUN_Q,
  KACHINA_TEAM,
  XINGQIU_C6_SELF,
]

/** Eligible buffs from the given team source ids, filtered by per-character requirements. */
export function eligibleBuffsForTeam(
  sourceIds: Array<number | string>,
  configs: Record<string, { constellation?: number; talentLevels?: { auto: number; skill: number; burst: number } }>,
): BuffSpec[] {
  const ids = new Set(sourceIds.map((s) => parseInt(String(s), 10)))
  return BUFFS.filter((b) => {
    if (!ids.has(b.sourceCharacterId)) return false
    if (b.requires) {
      const cfg = configs[String(b.sourceCharacterId)]
      if (b.requires.minConstellation != null && (cfg?.constellation ?? 0) < b.requires.minConstellation) return false
      if (b.requires.minTalent) {
        const r = b.requires.minTalent
        if ((cfg?.talentLevels?.[r.role] ?? 1) < r.lvl) return false
      }
    }
    return true
  })
}

export type { BuffSpec } from '@/engine/buff-zones'
