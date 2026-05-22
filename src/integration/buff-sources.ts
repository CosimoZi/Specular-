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
  /** Whether this buff affects only the buffer character's own stats/damage
   *  ('self') or propagates to teammates / enemies ('team'). Self-scoped
   *  buffs are hidden from the cond panel when the user focuses a different
   *  character — they have no effect on the focused character's calculation.
   *  Default 'team' for backwards-compat with un-tagged entries. */
  scope?: 'self' | 'team'
  /** Override the condState namespace for this buff's toggle. Used by
   *  artifact-set buffs (which need to write to `condState[slot].<setKey>`
   *  instead of `condState[slot].<charKey>`). Omit for character buffs. */
  sheetKey?: string
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
      type: 'passive3',
      label: { zh: '固有天赋 · 月兆祝赐·栖地考察', en: 'Passive — Moon-Sign Blessing' },
    },
    name: { zh: '基于 DEF 的月反应基础伤害提升', en: 'Moon-reaction base DMG up (DEF-scaling)' },
    effect: {
      zh: '每 100 点防御力,月结晶反应的基础伤害提升 0.7%,至多 +14%。常驻被动,不需要突破解锁。',
      en: 'Per 100 DEF, moon-crystallize base damage +0.7% (cap +14%). Utility passive — always on, no ascension gate.',
    },
    valueAt: (_c) => ({ zh: '常驻(随 DEF 自动)', en: 'Always-on (auto from DEF)' }),
  },
  {
    source: {
      type: 'constellation',
      ordinal: 1,
      label: { zh: '命之座 1 · 未完成的分类', en: 'C1 — Unfinished Classification' },
    },
    name: { zh: '月结晶 +DEF×75%(每次消耗 1 层 历览编录, 团队)', en: 'Moon-crystallize +DEF×75% (per-hit, team)' },
    effect: {
      zh: '队伍中任意角色触发月结晶反应时, 消耗一层历览编录, 基础伤害区 +莉奈娅 DEF × 75%。C6 后追加 +DEF×75%, 合计 +DEF×150%。常驻, 无需输入。',
      en: "Any team member's moon-crystallize hit consumes 1 stack: base + Linnea's DEF × 75%. C6 adds +DEF×75% → total +DEF×150%. Passive, no toggle.",
    },
    valueAt: (_c) => ({ zh: '常驻 · 自动按 DEF 计算(团队)', en: 'Always-on · auto-scaled by Linnea DEF (team)' }),
    // Vendor: teamBuff.premod.lunarcrystallize_dmgInc.
    // Wired via Linnea.applyAsTeammate → premod.dmgIncReaction.crystallize
    // (shared slot read by formula.ts for all moon-crystallize formulas on
    // the focus side). Self case kept via Linnea-formulas.ts inline `flat:`
    // field so focus-Linnea isn't double-counted.
    scope: 'team',
  },
  {
    source: {
      type: 'passive2',
      label: { zh: '固有天赋 2 · 缤纷采撷', en: 'Passive 2 — Sundry Foraging' },
    },
    name: { zh: 'A4 → 场上角色 +EM(基于 Linnea DEF × 5%, 上限 60)', en: 'A4 → active char +EM (Linnea DEF × 5%, cap 60)' },
    effect: {
      zh: '激活后, 当前场上角色获得 +Linnea.DEF × 5% 元素精通(上限 60)。若场上角色为月相角色, 该 EM 来自 Linnea (跨角色); 否则只 Linnea 自己吃。',
      en: 'When active: active char gains EM = Linnea.DEF × 5% (cap 60). If active char is moon-tagged → cross-char donate from Linnea; otherwise Linnea self.',
    },
    valueAt: (_c) => ({ zh: '当前: 见跨角色 buff 行 (按 Linnea DEF)', en: 'Now: see cross-char buff row (per Linnea DEF)' }),
    condName: 'a4Active',
    scope: 'team',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 1,
      label: { zh: '命之座 1 · 未完成的分类', en: 'C1 — Unfinished Classification' },
    },
    name: { zh: '百万吨重锤 消耗层数(每层 +DEF×150%)', en: 'Million-Ton Hammer stacks (each +DEF×150%)' },
    effect: {
      zh: '究极厉害形态的百万吨重锤,可一次消耗至多 5 层历览编录,每层使本次伤害 +DEF×150%。C6 后消耗层数翻倍(实际可达 10 层,本面板软上限仍为 5)。',
      en: 'Lumi\'s Million-Ton Hammer can consume up to 5 stacks at once; each adds +DEF×150% to the hit. C6 doubles consumption (effective max 10 stacks; panel soft cap stays at 5).',
    },
    condName: 'c1UltraStacks',
    // 百万吨重锤 = Linnea's own skill. Hide when focused on another teammate.
    scope: 'self',
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
    // Our model only applies the self DEF portion (the "active char" portion
    // requires cross-character propagation we don't have). Marked self.
    scope: 'self',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 6,
      label: { zh: '命之座 6 · 黄金猎犬之梦', en: 'C6 — Dream of the Golden Hound' },
    },
    name: { zh: '月结晶 擢升 +25%(月兆·满辉)', en: 'Moon-crystallize Elevation +25% (Moon-full)' },
    effect: {
      zh: '月兆·满辉状态下,队伍中附近的角色造成的月结晶反应伤害擢升 25%(独立最终乘区)。需勾选「月兆·满辉」。',
      en: 'When Moon-full state is active, nearby team members deal +25% moon-crystallize damage (independent final multiplier). Requires the Moon-full toggle.',
    },
    condName: 'moonFull',
  },
]

// =============================================================================
// 兹白 (Zibai)
// =============================================================================
export const ZIBAI_BUFFS: CharacterBuffDescriptor = [
  {
    source: {
      type: 'passive1',
      label: { zh: '突破天赋 · 月下素娥降仙', en: 'A1' },
    },
    name: { zh: '灵驹飞踏 +DEF×60%', en: 'Stride hits +DEF×60%' },
    effect: {
      zh: '触发月下素娥降仙后, 灵驹飞踏的伤害基础区 +DEF × 60%。',
      en: 'When A1 cond active, stride hits get +DEF×60% flat.',
    },
    condName: 'a1Moonfall',
    scope: 'self',
  },
  {
    source: {
      type: 'passive3',
      label: { zh: '固有天赋 · 月兆祝赐·浮明若流', en: 'Passive — Moon-Sign Blessing' },
    },
    name: { zh: '基于 DEF 的月反应基础伤害提升', en: 'Moon-reaction base DMG up (DEF)' },
    effect: {
      zh: '每 100 点防御力,月结晶反应的基础伤害 +0.7%,至多 +14%。常驻。',
      en: 'Per 100 DEF, moon-crystallize base damage +0.7% (cap +14%). Always-on.',
    },
    valueAt: (_c) => ({ zh: '常驻(随 DEF 自动)', en: 'Always-on (auto from DEF)' }),
  },
  {
    source: {
      type: 'constellation',
      ordinal: 1,
      label: { zh: '命之座 1 · 出勃然而入寥然', en: 'C1' },
    },
    name: { zh: '首次灵驹飞踏 → 月结晶 +220%', en: 'First stride → MC +220%' },
    effect: {
      zh: '首次施放灵驹飞踏的第二段月结晶伤害 +220%(per-formula 增伤)。',
      en: 'First stride second-hit moon-crystallize damage +220% (per-formula boost).',
    },
    condName: 'c1FirstStride',
    scope: 'self',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 2,
      label: { zh: '命之座 2 · 化于生而死于尸', en: 'C2' },
    },
    name: { zh: '月转时隙 → 月结晶 +30%(团队)', en: 'Lunar Mode → MC +30% team' },
    effect: {
      zh: '处于月转时隙模式下, 队伍中附近角色造成的月结晶反应伤害 +30%。',
      en: 'In Lunar Mode, team\'s moon-crystallize damage +30%.',
    },
    condName: 'c2ShiftMode',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 2,
      label: { zh: '命之座 2 · 化于生而死于尸', en: 'C2' },
    },
    name: { zh: '月兆·满辉 → 灵驹飞踏 +DEF×490%', en: 'Moon-full → stride +DEF×490%' },
    effect: {
      zh: '月兆·满辉 + A1 同时激活, 灵驹飞踏的伤害基础区额外 +DEF × 490%(与 A1 的 60% 相加合计 +DEF×550%)。',
      en: 'When Moon-full + A1 cond active, stride hits get an extra +DEF×490% (total +DEF×550%).',
    },
    condName: 'moonFull',
    scope: 'self',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 4,
      label: { zh: '命之座 4 · 明见无值至不论', en: 'C4' },
    },
    name: { zh: 'shift4_gleam +150% MC dmg', en: 'shift4_gleam +150% MC dmg' },
    effect: {
      zh: '月转时隙模式的 shift4_gleam 命中, 月结晶伤害 +150%(per-formula 增伤)。',
      en: 'shift4_gleam hit gets +150% per-formula MC damage boost.',
    },
    condName: 'c4Splendor',
    scope: 'self',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 6,
      label: { zh: '命之座 6 · 天地忽如一远行', en: 'C6' },
    },
    name: { zh: '消耗浮光点数 → 月结晶擢升', en: '浮光 consumed → MC elevation' },
    effect: {
      zh: '消耗的浮光点数 × 1.6% 月结晶擢升。最多 30 点。',
      en: 'Per consumed 浮光 point, +1.6% moon-crystallize elevation. Max 30 points.',
    },
    condName: 'c6Point',
    scope: 'team',
  },
]

// =============================================================================
// 哥伦比娅 (Columbina)
// =============================================================================
export const COLUMBINA_BUFFS: CharacterBuffDescriptor = [
  {
    source: {
      type: 'passive1',
      label: { zh: '突破天赋 · 月亮诱发的疯狂', en: 'A1' },
    },
    name: { zh: '月诱 → 暴击率 +5%/层(最多 3)', en: 'Lunatic +5% CR/stack' },
    effect: {
      zh: '触发引力干涉后获得月诱效果, 暴击率 +5%/层, 最多 3 层, 持续 10 秒。',
      en: 'After Gravity Interference, +5% CR/stack (max 3, 10s).',
    },
    condName: 'a1Stacks',
    scope: 'self',
  },
  {
    source: {
      type: 'passive3',
      label: { zh: '固有天赋 · 月兆祝赐·借汝月光', en: 'Passive — Moon-Sign Blessing' },
    },
    name: { zh: '基于 HP 的月反应基础伤害提升', en: 'Moon-reaction base DMG up (HP)' },
    effect: {
      zh: '每 1000 点生命值上限, 月感电/月绽放/月结晶反应的基础伤害 +0.2%, 至多 +7%。',
      en: 'Per 1000 HP, moon-reaction base damage +0.2% (cap +7%). Always-on.',
    },
    valueAt: (_c) => ({ zh: '常驻(随 HP 自动)', en: 'Always-on (auto from HP)' }),
  },
  {
    source: {
      type: 'burst',
      label: { zh: '元素爆发 · 她的乡愁', en: 'Q' },
    },
    name: { zh: '月之领域 → 月反应增伤', en: 'Moon Domain → moon-reaction +X%' },
    effect: {
      zh: '处于月之领域中, 月反应伤害增伤 +X%(随 talent.burst 等级 ~13-55%)。',
      en: 'In Moon Domain, moon-reaction damage boost (per Q talent level).',
    },
    condName: 'burstDomain',
    scope: 'team',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 2,
      label: { zh: '命之座 2 · 为夜增辉,与君遥伴', en: 'C2' },
    },
    name: { zh: '引力干涉 → HP +40%', en: 'Gravity Interference → +40% HP' },
    effect: {
      zh: '触发引力干涉时, 自身生命值上限 +40%, 持续 8 秒。',
      en: 'When Gravity Interference triggers, +40% HP for 8s.',
    },
    condName: 'c2Brilliance',
    scope: 'self',
  },
  {
    source: {
      type: 'constellation',
      ordinal: 4,
      label: { zh: '命之座 4 · 花岚云翳,山岩树影', en: 'C4' },
    },
    name: { zh: '引力干涉 → 月反应 HP-based 加成', en: 'C4 → moon-reaction HP flat add' },
    effect: {
      zh: '引力干涉触发后, 对应月反应伤害基础区 +HP × 12.5% (月感电 / 月结晶) 或 +HP × 2.5% (月绽放)。',
      en: 'After Gravity Interference, moon-reaction base + HP × 12.5%/2.5% (per reaction).',
    },
    condName: 'c4Buff',
    scope: 'self',
  },
]

// =============================================================================
// 叶洛亚 (Illuga)
// =============================================================================
export const ILLUGA_BUFFS: CharacterBuffDescriptor = [
  {
    source: {
      type: 'passive1',
      label: { zh: '突破天赋 · 铸灯者的盟约', en: 'A1' },
    },
    name: { zh: '执灯之誓(岩元素 +CR/+CD)', en: 'Oath (geo CR/CD)' },
    effect: {
      zh: 'E 或 Q 后, 队伍中附近的其他角色获得执灯之誓 20 秒: 岩元素伤害 +5% CR / +10% CD(C6: +10/+30)。月兆·满辉额外 +50 EM(C6: +80)。',
      en: 'After E/Q, team Oath 20s: geo +5%/+10% CR/CD (C6: +10/+30). Moon-full: +50 EM (C6: +80).',
    },
    condName: 'a1AfterSkillBurst',
    scope: 'team',
  },
  {
    source: {
      type: 'burst',
      label: { zh: '元素爆发 · 鉴照无影', en: 'Q' },
    },
    name: { zh: '魇夜的莺歌(夜莺之歌层数被消耗)', en: 'Burst song' },
    effect: {
      zh: 'Q 后获得魇夜的莺歌 20 秒, 队伍中附近的当前场上角色的岩元素伤害消耗夜莺之歌层数, 由 Illuga 的 EM 提升伤害(配合 A4 与队伍水+岩数量)。本面板将 A4 增伤近似为 geo_dmg_。',
      en: 'During burst, team\'s geo damage consumes 夜莺之歌 layers; A4 + hydro/geo count → EM-based geo_dmgInc.',
    },
    condName: 'burstSong',
    scope: 'team',
  },
  {
    source: {
      type: 'passive2',
      label: { zh: '突破天赋 · 狩魔者的黄昏', en: 'A4' },
    },
    name: { zh: '队伍 水+岩 角色数(决定 EM 增伤系数)', en: 'Hydro+Geo team count' },
    effect: {
      zh: '1/2/3 名水或岩元素角色 → 岩伤 +EM × 7%/14%/24%, 月结晶 +EM × 48%/96%/160%。在 burstSong 激活时生效。',
      en: 'With 1/2/3 hydro/geo teammates: geo_dmgInc EM × 7/14/24%; lunarcrystallize_dmgInc EM × 48/96/160%. Requires burstSong.',
    },
    condName: 'hydroGeoCount',
    scope: 'team',
  },
  {
    source: { type: 'constellation', ordinal: 4, label: { zh: 'C4', en: 'C4' } },
    name: { zh: 'C4 Q 状态 → 场上角色 +200 DEF', en: 'C4 Burst → active char +200 DEF' },
    effect: {
      zh: 'Q 持续期间, 当前场上角色防御力 +200(团队)。',
      en: 'During Burst, active char gains +200 DEF (team).',
    },
    condName: 'c4BurstActive',
    scope: 'team',
  },
]

// =============================================================================
// 爱诺 (Aino) — minimal descriptors
// =============================================================================
export const AINO_BUFFS: CharacterBuffDescriptor = [
  {
    source: { type: 'constellation', ordinal: 1, label: { zh: 'C1', en: 'C1' } },
    name: { zh: 'C1 E/Q 后 +80 EM', en: 'C1 +80 EM after E/Q' },
    effect: { zh: '触发 E/Q 后, 自身和场上角色获得 +80 EM。', en: 'After E/Q, self + active char +80 EM.' },
    condName: 'c1AfterSkillOrBurst',
    scope: 'self',
  },
  {
    source: { type: 'constellation', ordinal: 6, label: { zh: 'C6', en: 'C6' } },
    name: { zh: 'C6 Q 后所有反应增伤', en: 'C6 all-reaction +X% after Q' },
    effect: { zh: '触发 Q 后, 所有月反应伤害 +40%。月兆·满辉再 +40%。', en: 'After Q, all moon-reactions +40% (Moon-full: another +40%).' },
    condName: 'c6AfterBurst',
    scope: 'team',
  },
]

// =============================================================================
// 菲林斯 (Flins) — minimal descriptors
// =============================================================================
export const FLINS_BUFFS: CharacterBuffDescriptor = [
  {
    source: { type: 'passive1', label: { zh: 'A1', en: 'A1' } },
    name: { zh: 'A1 月兆·满辉 → +60% 月感电', en: 'A1 Moon-full → +60% electrocharged' },
    effect: { zh: '月兆·满辉激活, 月感电反应伤害 +60%。', en: 'Under Moon-full, electrocharged damage +60%.' },
    condName: 'moonFull',
    scope: 'team',
  },
  {
    source: { type: 'constellation', ordinal: 2, label: { zh: 'C2', en: 'C2' } },
    name: { zh: 'C2 触发月感电 → -30% 雷抗', en: 'C2 → -30% electro RES' },
    effect: { zh: '月兆·满辉下触发月感电后, 敌人雷元素抗性 -30%。', en: 'Under Moon-full, electrocharged trigger → enemy -30% electro RES.' },
    condName: 'c2AfterElectro',
    scope: 'team',
  },
]

// =============================================================================
// 伊涅芙 (Ineffa) — minimal descriptors
// =============================================================================
export const INEFFA_BUFFS: CharacterBuffDescriptor = [
  {
    source: { type: 'passive2', label: { zh: 'A4', en: 'A4' } },
    name: { zh: 'A4 Q 后 +EM(ATK × 5%)', en: 'A4 +EM after Q' },
    effect: { zh: 'Q 后, 队伍中场上角色 +EM = ATK × 5%(最多 60)。', en: 'After Q, active char gains EM = ATK × 5% (max 60).' },
    condName: 'a4AfterBurst',
    scope: 'team',
  },
  {
    source: { type: 'constellation', ordinal: 1, label: { zh: 'C1', en: 'C1' } },
    name: { zh: 'C1 护盾后 +月感电增伤', en: 'C1 After shield → +EC dmg' },
    effect: { zh: '触发护盾后, +月感电反应伤害(基于 ATK)。', en: 'After shield, +electrocharged damage (ATK-based, cap 15%).' },
    condName: 'c1AfterShield',
    scope: 'self',
  },
]

// =============================================================================
// 雅珂达 (Jahoda) — minimal descriptors
// =============================================================================
export const JAHODA_BUFFS: CharacterBuffDescriptor = [
  // Most mechanics not modeled — placeholder.
]

// =============================================================================
// 菈乌玛 (Lauma) — minimal descriptors
// =============================================================================
export const LAUMA_BUFFS: CharacterBuffDescriptor = [
  {
    source: { type: 'skill', label: { zh: '元素战技 · 鹿苑奏', en: 'Skill' } },
    name: { zh: 'E 命中 → 敌人水/草抗 -X%(随 E 等级)', en: 'Skill hit → enemy hydro/dendro RES -X%' },
    effect: {
      zh: 'E 命中敌人后, 敌人水元素抗性和草元素抗性各 -X%(随 E 等级 lv1 2.5% → lv15 40%; C5 +3 skill 等级)。团队 buff。',
      en: 'After Skill hits: enemy hydro & dendro RES -X% (per Skill talent lv1 2.5% → lv15 40%; C5 grants +3 skill levels). Team buff.',
    },
    condName: 'skillAfterHit',
    scope: 'team',
  },
]

// =============================================================================
// 奈芙尔 (Nefer) — minimal descriptors
// =============================================================================
export const NEFER_BUFFS: CharacterBuffDescriptor = []

// =============================================================================
// 香菱 (Xiangling)
// =============================================================================
export const XIANGLING_BUFFS: CharacterBuffDescriptor = [
  {
    source: { type: 'passive2', label: { zh: 'A4 满怀燃情', en: 'A4' } },
    name: { zh: 'A4 团队 +10% ATK', en: 'A4 team +10% ATK' },
    effect: {
      zh: '锅巴使用结束后, 团队所有角色 +10% ATK 持续 10 秒。',
      en: 'After Guoba ends, team +10% ATK for 10s.',
    },
    condName: 'afterChili',
    scope: 'team',
  },
  {
    source: { type: 'constellation', ordinal: 1, label: { zh: 'C1', en: 'C1' } },
    name: { zh: 'C1 锅巴命中 → -15% 火抗', en: 'C1 Guoba hit → -15% pyro RES' },
    effect: {
      zh: '锅巴命中后, 敌人火元素抗性 -15% 持续 6 秒。',
      en: 'After Guoba hits, enemy -15% pyro RES for 6s.',
    },
    condName: 'afterGuobaHit',
    scope: 'team',
  },
  {
    source: { type: 'constellation', ordinal: 6, label: { zh: 'C6', en: 'C6' } },
    name: { zh: 'C6 旋火轮期间 → 团队 +15% 火伤', en: 'C6 Pyronado → team +15% pyro DMG' },
    effect: {
      zh: '元素爆发旋火轮持续期间, 团队全角色 +15% 火元素伤害。',
      en: 'During Pyronado, team +15% pyro DMG.',
    },
    condName: 'afterPyronado',
    scope: 'team',
  },
]

// =============================================================================
// 行秋 (Xingqiu)
// =============================================================================
export const XINGQIU_BUFFS: CharacterBuffDescriptor = [
  {
    source: { type: 'constellation', ordinal: 2, label: { zh: 'C2', en: 'C2' } },
    name: { zh: 'C2 Q 期间 → -15% 水抗', en: 'C2 Q → -15% hydro RES' },
    effect: { zh: 'Q 持续期间, 敌人水元素抗性 -15%。', en: 'During Q, enemy -15% hydro RES.' },
    condName: 'c2',
    scope: 'team',
  },
  {
    source: { type: 'constellation', ordinal: 4, label: { zh: 'C4', en: 'C4' } },
    name: { zh: 'C4 Q 期间 → E 伤害 ×1.5', en: 'C4 During Q, E ×1.5' },
    effect: { zh: 'Q 期间, 元素战技伤害提升 50% (×1.5 倍率)。', en: 'During Q, skill dmg ×1.5.' },
    condName: 'burst',
    scope: 'self',
  },
]

// =============================================================================
// 班尼特 (Bennett)
// =============================================================================
export const BENNETT_BUFFS: CharacterBuffDescriptor = [
  {
    source: { type: 'burst', label: { zh: '元素爆发 · 美妙旅程', en: 'Q' } },
    name: { zh: 'Q 鼓舞领域 → 场上角色 +基础攻击力 × 系数', en: 'Q field → active char +base ATK × ratio' },
    effect: {
      zh: '场上角色获得攻击力加成 = 班尼特基础攻击力 × X%(随 Q 等级)。C1 额外 +20%。最重要的团队 buff。',
      en: 'Active char gets +ATK = Bennett base ATK × X% (per Q lv). C1: +20% extra. The most-used team buff.',
    },
    condName: 'activeInArea',
    scope: 'team',
  },
  {
    source: { type: 'constellation', ordinal: 2, label: { zh: 'C2', en: 'C2' } },
    name: { zh: 'C2 HP ≤ 70% → +30% 元素充能', en: 'C2 HP ≤ 70% → +30% ER' },
    effect: {
      zh: '生命值低于或等于 70% 时,元素充能效率提升 30%。',
      en: 'When HP <= 70%, +30% Energy Recharge.',
    },
    condName: 'underHP',
    scope: 'self',
  },
  {
    source: { type: 'constellation', ordinal: 6, label: { zh: 'C6', en: 'C6' } },
    name: { zh: 'C6 Q 场内 +15% 火伤(剑/双手剑/长柄)', en: 'C6 Q field +15% pyro DMG' },
    effect: {
      zh: '在 Q 鼓舞领域中的剑/双手剑/长柄角色,获得 +15% 火元素伤害加成,且普攻附加火元素附魔。',
      en: 'In Q field, sword/claymore/polearm users get +15% pyro DMG + pyro infusion.',
    },
    condName: 'activeInArea',
    scope: 'team',
  },
]

/** Map from GO character key → buff descriptor. */
export const CHARACTER_BUFF_DESCRIPTORS: Record<string, CharacterBuffDescriptor> = {
  Shenhe: SHENHE_BUFFS,
  Linnea: LINNEA_BUFFS,
  Zibai: ZIBAI_BUFFS,
  Columbina: COLUMBINA_BUFFS,
  Illuga: ILLUGA_BUFFS,
  Aino: AINO_BUFFS,
  Flins: FLINS_BUFFS,
  Ineffa: INEFFA_BUFFS,
  Jahoda: JAHODA_BUFFS,
  Lauma: LAUMA_BUFFS,
  Nefer: NEFER_BUFFS,
  Bennett: BENNETT_BUFFS,
  Xiangling: XIANGLING_BUFFS,
  Xingqiu: XINGQIU_BUFFS,
}

export function buffsForCharacter(goKey: string | null): CharacterBuffDescriptor {
  if (!goKey) return []
  return CHARACTER_BUFF_DESCRIPTORS[goKey] ?? []
}
