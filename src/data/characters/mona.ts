// 莫娜 Mona (10000041) — engine semantics + buff declarations.
//
// All numeric values and description text come from `src/data/gdb/10000041.json`,
// which is auto-extracted from genshin-db at build time. This file ONLY adds
// engine semantics (which zone each effect lands in, which conditions apply).
//
// Reference (5.x current):
//   - Q "星辰天宇的命运预言 / Stellaris Phantasm" param10 = Omen DMG bonus
//     [42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 60, 60, 60, 60, 60] %
//   - C1 "沉没的预言 / Prophecy of Submersion": +15% to Hydro-related reactions
//   - C4 "灭绝的预言 / Prophecy of Oblivion": +15% CR to team vs Omen'd enemies
//   - C6 "厄运的修辞 / Rhetorics of Calamitas": self charged-attack DMG buff

import gdbData from '../gdb/10000041.json'
import type { CharacterDefinition, GdbCharacter, BuffMethod } from './types'

const gdb = gdbData as unknown as GdbCharacter

/** Read a per-level parameter from the talent's attributes.parameters table. */
function param(talent: 'combat1' | 'combat2' | 'combat3', key: string, lvl: number): number {
  const arr = gdb.talents?.[talent]?.attributes?.parameters?.[key]
  if (!arr) return 0
  const i = Math.max(0, Math.min(arr.length - 1, lvl - 1))
  return arr[i]
}

const QOmen: BuffMethod = {
  id: 'mona-q-omen',
  labelFromTalent: 'combat3',
  stage: 'non-panel',
  defaultOn: true,
  compute(self) {
    // param10 = Omen DMG bonus per burst talent level (verbatim from genshin-db)
    const v = param('combat3', 'param10', self.config.talentLevels.burst)
    return [{ zone: 'dmgBonusAll', value: v }]
  },
}

const C1HydroReactions: BuffMethod = {
  id: 'mona-c1-hydro-reactions',
  labelFromConstellation: 'c1',
  stage: 'non-panel',
  defaultOn: true,
  requires: { minConstellation: 1 },
  compute() {
    // C1 grants +15% DMG to several Hydro-related reaction types when the target
    // is Omen'd. We model each as a reactionBonus on the respective reaction
    // kind. The 0.15 value is verbatim from in-game description.
    return [
      { zone: 'reactionBonus', value: 0.15, reactionKind: ['electrocharged'] },
      { zone: 'reactionBonus', value: 0.15, reactionKind: ['vape'] },
      { zone: 'reactionBonus', value: 0.15, reactionKind: ['swirl'], swirlElement: 'Hydro' },
      { zone: 'reactionBonus', value: 0.15, reactionKind: ['lunarcharged'] },
      { zone: 'reactionBonus', value: 0.15, reactionKind: ['lunarcrystallize'] },
    ]
  },
}

const C4OmenCritRate: BuffMethod = {
  id: 'mona-c4-omen-cr',
  labelFromConstellation: 'c4',
  stage: 'non-panel',
  defaultOn: true,
  requires: { minConstellation: 4 },
  compute() {
    // +15% CR for any party member attacking an Omen'd target.
    return [{ zone: 'critRate', value: 0.15 }]
  },
}

// C2 / C3 / C5 / C6 are either self-only or talent-level bumps, not team buffs.
// C3/C5 raise Q/E levels by 3 — that's data-layer (config.talentLevels) not buff.

export const Mona: CharacterDefinition = {
  id: 10000041,
  gdb,
  buffs: [QOmen, C1HydroReactions, C4OmenCritRate],
}
