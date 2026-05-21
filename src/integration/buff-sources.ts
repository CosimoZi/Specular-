// Buff descriptors — per-character mapping from each Pando cond to its
// in-game source (talent / constellation / weapon / artifact), localized
// label, and effect description. Drives the structured /team UI so users
// see "this checkbox toggles 申鹤 C2's +15% cryo CRIT DMG (Q 场内触发)"
// instead of a cryptic `burstField` checkbox.
//
// Schema:
//   one character → many buff entries
//   one buff entry has:
//     - source       (skill / burst / passive1 / passive2 / constellation / weapon / artifact)
//     - sourceLabel  (full localized name of the talent or constellation)
//     - effect       (text description of what the buff does)
//     - valueAt?     (function returning the *numeric* value at the user's
//                     current build — e.g. Q RES shred is 6% at lv 1 and
//                     10% at lv 13. The UI calls this with the source
//                     character's CharacterConfig so the displayed number
//                     matches what the engine actually computes.)
//     - condName     (which Pando cond gates this buff; multiple buffs may share)
//
// Multiple buffs can share a condName (e.g. Shenhe A1 + C2 + Q RES shred all
// fire when burstField=1). The UI renders one cond toggle and groups the
// shared buffs under it.

import type { CharacterConfig } from '@/data/config-types'
import {
  consBoostActive,
  effectiveTalentLevel,
  talentValue,
} from './talent-values'

export type BuffSourceType =
  | 'normal'
  | 'skill'
  | 'burst'
  | 'passive1'
  | 'passive2'
  | 'passive3'
  | 'constellation'
  | 'weapon'
  | 'artifact'

export interface BuffSource {
  type: BuffSourceType
  /** Display label for the source (zh/en). Should match the in-game name
   *  for talents/constellations so user can map back to the gacha screen. */
  label: { zh: string; en: string }
  /** For constellations: which C number (1..6). For artifacts: 2pc/4pc. */
  ordinal?: 1 | 2 | 3 | 4 | 5 | 6
}

export interface BuffEntry {
  /** Source the buff originates from. */
  source: BuffSource
  /** Short name of the buff itself (e.g. "冰翎附加冰伤"). */
  name: { zh: string; en: string }
  /** What it does, in plain text — no specific numbers if the value is
   *  talent-leveled. The actual number gets injected via valueAt when
   *  present. */
  effect: { zh: string; en: string }
  /** Compute the buff's numeric value at the user's current build for
   *  display. Returns a localized formatted string (e.g. "-10.0%" or
   *  "+97.0% × ATK"). Omit for buffs with no value to display, or for
   *  constants where the effect text already contains the number. */
  valueAt?: (cfg: CharacterConfig) => { zh: string; en: string }
  /** Pando cond name that gates this buff. Omit for always-on buffs. */
  condName?: string
}

/** All buffs a character contributes, in source-ordered display order. */
export type CharacterBuffDescriptor = ReadonlyArray<BuffEntry>

// =============================================================================
// Shenhe (申鹤)
// =============================================================================
// Param-table indices, copied from Shenhe.ts dm constants:
//   skill[2] = quill ATK% per consumption (talent-leveled, 15 entries)
//   burst[1] = cryo+phys RES shred magnitude (talent-leveled, 15 entries)
//   passive1[0][0] = A1 cryo dmg constant (0.15)
//   passive2[0][0] = A4 press dmg constant (0.15)
//   passive2[2][0] = A4 hold dmg constant (0.15)
//   constellation4[0] = C4 dmg per stack (0.05)
function fmtPct(decimal: number, sign: '+' | '-' | ''): { zh: string; en: string } {
  const v = (Math.abs(decimal) * 100).toFixed(1)
  return { zh: `${sign}${v}%`, en: `${sign}${v}%` }
}
export const SHENHE_BUFFS: CharacterBuffDescriptor = [
  {
    source: {
      type: 'skill',
      label: { zh: '元素战技 · 仰灵威召将役咒', en: 'Skill — Spring Spirit Summoning' },
    },
    name: { zh: '冰翎附加冰伤', en: 'Icy Quill flat cryo damage' },
    effect: {
      zh: '勾选后，焦点角色每次冰系伤害（包括申鹤自己的 E / Q）都会在基础伤害区加上 ATK × E 天赋系数。也就是说 skill_press / skill_hold / burst / burst_dot 的数字会直接跳一截。物理普攻不受影响。',
      en: "While active, every cryo hit the focus character lands gets +(Shenhe ATK × skill coef) added to its base damage — skill_press, skill_hold, burst, burst_dot all jump. Physical normals don't benefit.",
    },
    valueAt: (c) => {
      const eff = effectiveTalentLevel('Shenhe', 'skill', c)
      const note = consBoostActive('Shenhe', 'skill', c) ? `（含 C3 +3）` : ''
      const v = talentValue('Shenhe', 'skill', 2, eff)
      return {
        zh: `当前: 每次冰击 +${(v * 100).toFixed(1)}% × ATK（E lv.${eff}${note}）`,
        en: `Now: +${(v * 100).toFixed(1)}% × ATK per cryo hit (E lv.${eff}${note ? ' incl. C3 +3' : ''})`,
      }
    },
    condName: 'quillActive',
  },
  {
    source: {
      type: 'passive1',
      label: { zh: '固有天赋 1 · 大洞弥罗尊法', en: 'Passive 1 — Deification' },
    },
    name: { zh: '冰元素伤害加成', en: 'Cryo DMG bonus' },
    effect: {
      zh: 'Q 场内单挂角色 +15% 冰元素伤害。只影响冰元素伤害 —— 申鹤本人的普攻/重击/下落是物理，不吃这个 buff（除非被队友附魔成冰）。',
      en: 'Active char in Q field: +15% Cryo DMG. Cryo-only — Shenhe\'s own polearm normals/charged/plunging are physical and don\'t benefit unless infused by a teammate.',
    },
    condName: 'burstField',
  },
  {
    source: {
      type: 'passive2',
      label: { zh: '固有天赋 2 · 缚灵通真法印', en: 'Passive 2 — Mystical Abandon' },
    },
    name: { zh: 'a. 点按 E 后', en: 'a. After tap E' },
    effect: {
      zh: '全队元素战技 + 元素爆发伤害 +15%（10s，固定值）',
      en: 'Team skill + burst DMG +15% (10s, constant)',
    },
    condName: 'a4Press',
  },
  {
    source: {
      type: 'passive2',
      label: { zh: '固有天赋 2 · 缚灵通真法印', en: 'Passive 2 — Mystical Abandon' },
    },
    name: { zh: 'b. 长按 E 后', en: 'b. After hold E' },
    effect: {
      zh: '全队普通攻击 + 重击 + 下落攻击伤害 +15%（15s，固定值）',
      en: 'Team normal + charged + plunging DMG +15% (15s, constant)',
    },
    condName: 'a4Hold',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 2,
      label: { zh: '命之座 2 · 定蒙', en: 'C2 — Spotless Heart' },
    },
    name: { zh: '冰元素暴击伤害', en: 'Cryo CRIT DMG' },
    effect: {
      zh: 'Q 场内单挂角色 +15% 冰元素暴击伤害。和 A1 共用 Q 场内触发，同样只对冰元素伤害生效。',
      en: 'Active char in Q field: +15% cryo CRIT DMG. Shares burst-field trigger with A1; same cryo-only scope.',
    },
    condName: 'burstField',
  },
  {
    source: {
      type: 'burst',
      label: { zh: '元素爆发 · 神女遣灵真诀', en: 'Burst — Divine Maiden\'s Deliverance' },
    },
    name: { zh: '场内敌人冰/物抗', en: 'Enemy cryo + physical RES shred' },
    effect: {
      zh: 'Q 场内敌人冰元素抗性 + 物理抗性 同时降低（数值随 Q 天赋等级提升）',
      en: 'Enemies in Q field: cryo + physical RES shredded (scales with Q talent level)',
    },
    valueAt: (c) => {
      const eff = effectiveTalentLevel('Shenhe', 'burst', c)
      const note = consBoostActive('Shenhe', 'burst', c) ? `（含 C5 +3）` : ''
      const v = talentValue('Shenhe', 'burst', 1, eff)
      return {
        ...fmtPct(v, '-'),
        zh: `当前: -${(v * 100).toFixed(1)}% 冰抗 / -${(v * 100).toFixed(1)}% 物抗（Q lv.${eff}${note}）`,
        en: `Now: -${(v * 100).toFixed(1)}% cryo / -${(v * 100).toFixed(1)}% phys RES (Q lv.${eff}${note ? ' incl. C5 +3' : ''})`,
      }
    },
    condName: 'burstField',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 4,
      label: { zh: '命之座 4 · 偎暝', en: 'C4 — Insight on the Mountain Range' },
    },
    name: { zh: '冰翎层数', en: 'Icy Quill stack count' },
    effect: {
      zh: '冰翎每被消耗 1 次，申鹤元素战技伤害 +5%，最多 50 层（固定值）',
      en: '+5% Shenhe skill DMG per Icy Quill consumed, max 50 stacks (constant)',
    },
    condName: 'c4Stacks',
  },
]

// =============================================================================
// Registry
// =============================================================================

// =============================================================================
// Linnea (莉奈娅)
// =============================================================================
export const LINNEA_BUFFS: CharacterBuffDescriptor = [
  {
    source: {
      type: 'passive1',
      label: { zh: '固有天赋 1 · 野外观察手记', en: 'Passive 1 — Field Notes' },
    },
    name: { zh: '露米在场 → 敌人岩抗 -15%', en: 'Lumi out → enemy geo RES -15%' },
    effect: {
      zh: '露米在场时,附近敌人的岩元素抗性 -15%。',
      en: 'While Lumi is out, nearby enemies have -15% geo RES.',
    },
    condName: 'lumiActive',
  },
  {
    source: {
      type: 'passive1',
      label: { zh: '固有天赋 1 · 野外观察手记', en: 'Passive 1 — Field Notes' },
    },
    name: { zh: '月兆·满辉 → 敌人岩抗再 -15%', en: 'Moon-full → enemy geo RES additional -15%' },
    effect: {
      zh: '月兆·满辉:呼唤露米上场后,露米附近敌人的岩元素抗性进一步 -15%(与上一条相加 -30%)。',
      en: 'During Moon-full state, after summoning Lumi, nearby enemies have an additional -15% geo RES (stacks with the above to -30%).',
    },
    condName: 'moonFull',
  },
  {
    source: {
      type: 'passive2',
      label: { zh: '固有天赋 2 · 月兆祝赐·栖地考察', en: 'Passive 2 — Moon-Sign Blessing' },
    },
    name: { zh: '基于 DEF 的月反应基础伤害提升', en: 'Moon-reaction base DMG up (DEF-scaling)' },
    effect: {
      zh: '每 100 点防御力,月结晶反应的基础伤害提升 0.7%,至多 +14%。常驻,不需要勾选。',
      en: 'Per 100 DEF, moon-crystallize base damage +0.7% (cap +14%). Passive, no toggle.',
    },
    valueAt: (_c) => ({ zh: '常驻(随 DEF 自动)', en: 'Always-on (auto from DEF)' }),
  },
  {
    source: {
      type: 'constellation',
      ordinal: 1,
      label: { zh: '命之座 1 · 未完成的分类', en: 'C1 — Unfinished Classification' },
    },
    name: { zh: '历览编录消耗层数', en: '"Comprehensive Index" stacks consumed' },
    effect: {
      zh: '每消耗一层历览编录,月结晶反应伤害额外增加 DEF × 75%(基础伤害区)。这里填的是"已消耗"的总层数。',
      en: 'Each consumed stack adds DEF × 75% to the moon-crystallize base damage. Enter the total stacks consumed.',
    },
    condName: 'c1StacksConsumed',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 2,
      label: { zh: '命之座 2 · 喜或悲的谕告', en: 'C2 — Tidings of Joy and Sorrow' },
    },
    name: { zh: '月笼谐奏 → 水/岩 暴击伤害 +40%', en: 'Resonance → Hydro/Geo CDmg +40%' },
    effect: {
      zh: '触发月笼谐奏后的 8 秒内,所有水/岩元素类型的角色的暴击伤害 +40%。',
      en: 'For 8s after Resonance triggers, hydro/geo characters gain +40% CRIT DMG.',
    },
    condName: 'c2Resonance',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 4,
      label: { zh: '命之座 4 · 专家的直感觉', en: 'C4 — Expert Intuition' },
    },
    name: { zh: '月笼谐奏 → DEF +25%/层', en: 'Resonance → DEF +25% / stack' },
    effect: {
      zh: '触发月笼谐奏后的 5 秒内,莉奈娅与队伍中当前场上角色的防御力分别 +25%。莉奈娅在场时此效果可叠加(最多 2 层)。',
      en: '5s after Resonance, Linnea and the active character each gain +25% DEF. On Linnea this stacks (max 2).',
    },
    condName: 'c4DefStacks',
  },
]

/** Map from GO character key → buff descriptor. */
export const CHARACTER_BUFF_DESCRIPTORS: Record<string, CharacterBuffDescriptor> = {
  Shenhe: SHENHE_BUFFS,
  Linnea: LINNEA_BUFFS,
  // TODO: Nahida, Nilou, Candace, then Bennett / Furina / Xiangling / Xingqiu / etc.
}

export function buffsForCharacter(goKey: string | null): CharacterBuffDescriptor {
  if (!goKey) return []
  return CHARACTER_BUFF_DESCRIPTORS[goKey] ?? []
}
