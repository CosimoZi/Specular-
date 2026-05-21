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
import { talentValue } from './talent-values'

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
      zh: '每次队友冰伤触发，追加 = 申鹤 ATK × E 天赋表系数',
      en: 'Each ally cryo hit consumes one quill: +(Shenhe ATK × skill coef)',
    },
    valueAt: (c) => {
      const v = talentValue('Shenhe', 'skill', 2, c.talentLevels.skill)
      return {
        zh: `当前: 每次 +${(v * 100).toFixed(1)}% × ATK（E lv.${c.talentLevels.skill}）`,
        en: `Now: +${(v * 100).toFixed(1)}% × ATK per quill (E lv.${c.talentLevels.skill})`,
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
      zh: 'Q 场内单挂角色 +15% 冰元素伤害（固定值）',
      en: 'Active char in Q field: +15% Cryo DMG (constant)',
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
      zh: 'Q 场内单挂角色 +15% 冰元素暴击伤害（与 A1 共用 Q 场内触发，固定值）',
      en: 'Active char in Q field: +15% cryo CRIT DMG (shares burst-field trigger; constant)',
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
      const v = talentValue('Shenhe', 'burst', 1, c.talentLevels.burst)
      return {
        ...fmtPct(v, '-'),
        zh: `当前: -${(v * 100).toFixed(1)}% 冰抗 / -${(v * 100).toFixed(1)}% 物抗（Q lv.${c.talentLevels.burst}）`,
        en: `Now: -${(v * 100).toFixed(1)}% cryo / -${(v * 100).toFixed(1)}% phys RES (Q lv.${c.talentLevels.burst})`,
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

/** Map from GO character key → buff descriptor. */
export const CHARACTER_BUFF_DESCRIPTORS: Record<string, CharacterBuffDescriptor> = {
  Shenhe: SHENHE_BUFFS,
  // TODO: Nahida, Nilou, Candace, then Bennett / Furina / Xiangling / Xingqiu / etc.
}

export function buffsForCharacter(goKey: string | null): CharacterBuffDescriptor {
  if (!goKey) return []
  return CHARACTER_BUFF_DESCRIPTORS[goKey] ?? []
}
