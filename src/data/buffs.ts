// Character buff database. Each entry describes a numeric buff that ONE
// character (the source) provides to teammates / themselves when on the team.
//
// Scope for v1:
//   • Hand-curated for high-impact support characters
//   • Buff values are flat additions to a StatBag (no source-stat scaling).
//     Where the in-game effect scales on the source's stat (e.g. Bennett ATK,
//     Kazuha EM → elem DMG), we encode a TYPICAL value and document it.
//     Future: a `scaling` field for source-stat-derived effects.
//   • Conditions (constellation level, talent level) gate visibility.
//   • Players toggle each buff on/off in the team page.
//
// Adding more: keep entries small + descriptive; the comment IS the doc.

import type { StatKey } from '@/engine/types'

export interface BuffSpec {
  /** Stable id used as the toggle key (combined with source id in the store). */
  id: string
  sourceCharacterId: number
  /** Bilingual labels. */
  label: { zh: string; en: string }
  description: { zh: string; en: string }
  /** Who receives. 'team' = everyone (incl. self). 'self' = source only.
   *  'active' = whoever is on-field (we treat as team for v1). */
  target: 'team' | 'self' | 'active'
  /** Effect — keys are StatBag keys, values are additive. Percent stats use
   *  decimals (0.2 = +20% ATK). */
  bag: Partial<Record<StatKey, number>>
  /** Conditions that must be met for the buff to appear in UI. */
  requires?: {
    minConstellation?: number
    minTalent?: { role: 'auto' | 'skill' | 'burst'; lvl: number }
  }
  defaultOn: boolean
}

// =============================================================================
// CURATED BUFFS (v1 starter set)
//
// The numeric values are typical assumptions, NOT exhaustive simulations of
// each buff. Players who want precision can disable a buff and add a custom
// one with their measured value. Future work: per-source-stat scaling.
// =============================================================================

export const BUFFS: BuffSpec[] = [
  // 班尼特 Bennett
  {
    id: 'bennett-q-atk',
    sourceCharacterId: 10000032,
    label: { zh: '班尼特 Q · 攻击加成', en: 'Bennett Q · ATK Buff' },
    description: {
      zh: '美妙旋律范围内队伍获得相当于班尼特基础攻击力 ~110% 的攻击力提升。这里取典型值 +800 ATK。精确值取决于班尼特自身基础攻击。',
      en: "Inside Bennett's Q field, allies gain ~110% of his Base ATK as flat ATK. Approximated as +800 flat ATK.",
    },
    target: 'team',
    bag: { atkFlat: 800 },
    defaultOn: true,
  },

  // 万叶 Kazuha
  {
    id: 'kazuha-a4-em-elem',
    sourceCharacterId: 10000047,
    label: { zh: '万叶 A4 · 元素增伤', en: 'Kazuha A4 · Elem DMG' },
    description: {
      zh: '万叶施放战技/爆发后，队伍中的角色获得 EM × 0.04% 的扩散元素增伤。1000 EM ≈ +40%。这里默认 +40%，覆盖所有元素（不含物理）。',
      en: "After Kazuha's skill/burst, team gets +0.04% elem DMG per EM of the swirled element. 1000 EM ≈ +40%. Default applied to all elements.",
    },
    target: 'team',
    bag: {
      pyroDmg: 0.4, hydroDmg: 0.4, cryoDmg: 0.4, electroDmg: 0.4, anemoDmg: 0.4,
    },
    defaultOn: false,
  },

  // 法鲁扎 Faruzan
  {
    id: 'faruzan-anemo-dmg',
    sourceCharacterId: 10000076,
    label: { zh: '法鲁扎 · 风元素伤害 +32%', en: 'Faruzan · +32% Anemo DMG' },
    description: {
      zh: '法鲁扎元素战技 + A4 配合，对附近角色赋予 +32% 风元素伤害加成；爆发后还会附加 -X% 风抗，这里另算。',
      en: 'Faruzan E + A4 grants +32% Anemo DMG to nearby allies. Anemo RES shred during Q is separate.',
    },
    target: 'team',
    bag: { anemoDmg: 0.32 },
    defaultOn: true,
  },

  // 希诺宁 Xilonen
  {
    id: 'xilonen-q-res-shred',
    sourceCharacterId: 10000103,
    label: { zh: '希诺宁 Q · 减抗（近似 +30% 增伤）', en: 'Xilonen Q · RES Shred (≈+30% DMG)' },
    description: {
      zh: '希诺宁元素爆发为附近角色减目标全元素 + 物理抗 30%。当敌人 10% 基础抗性时，等价 +30% 增伤近似。',
      en: 'Xilonen Q shreds 30% multi-element + physical RES on nearby targets. At base 10% RES this approximates +30% DMG.',
    },
    target: 'team',
    bag: {
      pyroDmg: 0.3, hydroDmg: 0.3, cryoDmg: 0.3, electroDmg: 0.3,
      anemoDmg: 0.3, geoDmg: 0.3, dendroDmg: 0.3, physicalDmg: 0.3,
    },
    defaultOn: true,
  },

  // 芙宁娜 Furina
  {
    id: 'furina-q-dmg',
    sourceCharacterId: 10000089,
    label: { zh: '芙宁娜 Q · 全队增伤（满档 +75%）', en: 'Furina Q · Team DMG (max +75%)' },
    description: {
      zh: '芙宁娜爆发期间，气氛值满档时队伍获得 +75% 伤害加成。期间消耗自身生命。这里取满档近似。',
      en: 'During Furina Q at max fanfare, team gains +75% DMG. HP is drained over time. Modeled as max-stack approximation.',
    },
    target: 'team',
    bag: { allDmg: 0.75 },
    defaultOn: true,
  },

  // 申鹤 Shenhe
  {
    id: 'shenhe-skill-cryo-flat',
    sourceCharacterId: 10000063,
    label: { zh: '申鹤 E · 冰加伤近似', en: 'Shenhe E · Cryo Buff (approx)' },
    description: {
      zh: '申鹤短按 E 为附近角色提供"冰元素加伤"buff（基于申鹤攻击力的固定值）。这里取典型 +200 全队伤增（按冰）。Cryo 单一元素。',
      en: "Shenhe E provides a Cryo damage boost based on Shenhe's ATK. Approximated as +0.15 cryoDmg.",
    },
    target: 'team',
    bag: { cryoDmg: 0.15 },
    defaultOn: false,
  },

  // 莫娜 Mona
  {
    id: 'mona-q-omen',
    sourceCharacterId: 10000041,
    label: { zh: '莫娜 Q · 增伤 +44%', en: 'Mona Q · Omen +44%' },
    description: {
      zh: '莫娜元素爆发施加水占咒疫：受到的伤害增加 +44%（10 级）。',
      en: "Mona Q applies Omen: +44% DMG taken at burst lvl 10.",
    },
    target: 'team',
    bag: { allDmg: 0.44 },
    defaultOn: false,
  },

  // 钟离 Zhongli
  {
    id: 'zhongli-shield-res-shred',
    sourceCharacterId: 10000030,
    label: { zh: '钟离玉璋 · -20% 抗性', en: 'Zhongli Shield · -20% RES' },
    description: {
      zh: '玉璋护盾覆盖范围内，敌人全元素 + 物理抗性 -20%。',
      en: "Within Zhongli's Jade Shield, enemies get -20% all elem + physical RES.",
    },
    target: 'team',
    bag: {
      pyroDmg: 0.2, hydroDmg: 0.2, cryoDmg: 0.2, electroDmg: 0.2,
      anemoDmg: 0.2, geoDmg: 0.2, dendroDmg: 0.2, physicalDmg: 0.2,
    },
    defaultOn: true,
  },

  // 九条裟罗 Sara
  {
    id: 'sara-c6-crit-dmg',
    sourceCharacterId: 10000056,
    label: { zh: '裟罗 C6 · 雷暴击伤 +60%', en: 'Sara C6 · Electro CD +60%' },
    description: {
      zh: '九条裟罗 C6：天狗咒雷使敌人雷元素暴击伤害 +60%。需要 6 命。',
      en: "Sara C6: Tengu Stormcalls give +60% Electro CD on hit. Requires C6.",
    },
    target: 'team',
    bag: { critDmg: 0.6 },
    requires: { minConstellation: 6 },
    defaultOn: false,
  },

  // 罗莎莉亚 Rosaria
  {
    id: 'rosaria-a4-crit-rate',
    sourceCharacterId: 10000045,
    label: { zh: '罗莎莉亚 A4 · 暴击率', en: 'Rosaria A4 · CR' },
    description: {
      zh: '罗莎莉亚 A4：施放元素爆发后队伍中其他角色获得罗莎莉亚自身暴击率 15% 的暴击率提升（最多 15%）。这里近似 +10% CR。',
      en: "Rosaria A4: after Q, allies gain 15% of her CR (cap 15%). Approximated +10% CR.",
    },
    target: 'team',
    bag: { critRate: 0.1 },
    defaultOn: false,
  },

  // 玛薇卡 Mavuika
  {
    id: 'mavuika-team-atk',
    sourceCharacterId: 10000110,
    label: { zh: '玛薇卡 战意 · 攻击/速度 buff', en: 'Mavuika Fighting Spirit · ATK' },
    description: {
      zh: '玛薇卡作为纳塔火主 C 提供基于战意值的 ATK% 加成。典型 +30% ATK%。',
      en: 'Mavuika provides ATK% scaling on Fighting Spirit. Approximated +30% ATK%.',
    },
    target: 'team',
    bag: { atkPct: 0.3 },
    defaultOn: false,
  },
]

export function buffsBySource(): Map<number, BuffSpec[]> {
  const m = new Map<number, BuffSpec[]>()
  for (const b of BUFFS) {
    const arr = m.get(b.sourceCharacterId) ?? []
    arr.push(b)
    m.set(b.sourceCharacterId, arr)
  }
  return m
}

/** Collect all eligible buffs from a team of source character ids, filtered by
 *  per-character config requirements. */
export function eligibleBuffsForTeam(
  sourceIds: Array<number | string>,
  configs: Record<
    string,
    {
      constellation?: number
      talentLevels?: { auto: number; skill: number; burst: number }
    }
  >,
): BuffSpec[] {
  const ids = new Set(sourceIds.map((s) => parseInt(String(s), 10)))
  return BUFFS.filter((b) => {
    if (!ids.has(b.sourceCharacterId)) return false
    if (b.requires) {
      const cfg = configs[String(b.sourceCharacterId)]
      if (b.requires.minConstellation != null) {
        if ((cfg?.constellation ?? 0) < b.requires.minConstellation) return false
      }
      if (b.requires.minTalent) {
        const role = b.requires.minTalent.role
        if ((cfg?.talentLevels?.[role] ?? 1) < b.requires.minTalent.lvl) return false
      }
    }
    return true
  })
}
