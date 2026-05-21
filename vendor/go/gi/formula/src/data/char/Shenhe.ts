import type { CharacterKey } from '@genshin-optimizer/gi/consts'
import { allStats } from '@genshin-optimizer/gi/stats'
import { cmpGE, prod, subscript } from '@genshin-optimizer/pando/engine'
import {
  allBoolConditionals,
  allNumConditionals,
  customDmg,
  enemyDebuff,
  own,
  ownBuff,
  percent,
  register,
  teamBuff,
} from '../util'
import { dataGenToCharInfo, dmg, entriesForChar } from './util'

// Shenhe (申鹤) — cryo polearm support. Hand-wired by Specular.
//
// References:
//   - vendor/go/gi/sheets/src/Characters/Shenhe/index.tsx (old GO sheet —
//     authoritative source of which talent-table indices map to which effect)
//   - Genshin BWiki (cross-checked talent multipliers)

const key: CharacterKey = 'Shenhe'
const data_gen = allStats.char.data[key]
const skillParam_gen = allStats.char.skillParam[key]

let a = 0,
  s = 0,
  b = 0
const dm = {
  normal: {
    // 5-hit polearm string. Hit 4 is 2 swings (`multi: 2` in old GO sheet).
    hitArr: [
      skillParam_gen.auto[a++], // 1
      skillParam_gen.auto[a++], // 2
      skillParam_gen.auto[a++], // 3
      skillParam_gen.auto[a++], // 4a (skip the 4b slot used as a duplicate row)
    ],
  },
  // The auto table has an extra row between hit-4 and hit-5 (the duplicate
  // 4b entry the old sheet skipped via the `[5]` index). Pull hit 5 directly.
  normalHit5: skillParam_gen.auto[(a = 5, a++)],
  charged: {
    dmg: skillParam_gen.auto[a++],
    stamina: skillParam_gen.auto[a++][0],
  },
  plunging: {
    dmg: skillParam_gen.auto[a++],
    low: skillParam_gen.auto[a++],
    high: skillParam_gen.auto[a++],
  },
  skill: {
    press: skillParam_gen.skill[s++],
    hold: skillParam_gen.skill[s++],
    quillAtk_: skillParam_gen.skill[s++], // Icy Quill flat damage per consumption = X% of Shenhe ATK
    quillDurationPress: skillParam_gen.skill[s++][0],
    quillDurationHold: skillParam_gen.skill[s++][0],
    pressCd: skillParam_gen.skill[s++][0],
    holdCd: skillParam_gen.skill[s++][0],
  },
  burst: {
    dmg: skillParam_gen.burst[b++],
    resShred_: skillParam_gen.burst[b++], // cryo + physical RES reduction inside field
    dot: skillParam_gen.burst[b++],
    duration: skillParam_gen.burst[b++][0],
    cd: skillParam_gen.burst[b++][0],
    enerCost: skillParam_gen.burst[b++][0],
  },
  passive1: {
    // "Deification" — active char gets +cryo_dmg_ while inside burst field.
    cryo_dmg_: skillParam_gen.passive1[0][0],
  },
  passive2: {
    // "Spirit Communion" — after tap E: team skill+burst dmg+%; after hold E:
    // team normal+charged+plunging dmg+%.
    press_dmg_: skillParam_gen.passive2[0][0],
    pressDuration: skillParam_gen.passive2[1][0],
    hold_dmg_: skillParam_gen.passive2[2][0],
    holdDuration: skillParam_gen.passive2[3][0],
  },
  constellation2: {
    durationInc: skillParam_gen.constellation2[0], // Q duration extension; no buff to wire
  },
  constellation4: {
    dmg_: skillParam_gen.constellation4[0], // per-stack DMG% boost on Shenhe's skill (matches GO interpretation)
    maxStacks: skillParam_gen.constellation4[1],
  },
  constellation6: {
    auto_: skillParam_gen.constellation6[0],
    duration: skillParam_gen.constellation6[1],
  },
} as const

const info = dataGenToCharInfo(data_gen)
const {
  final,
  char: { skill, ascension, constellation },
} = own

// Conditionals exposed to the UI (toggled in /team conditional buffs section).
//
// quillActive    — Shenhe's E has applied Icy Quill to the team within window
// a1Field        — active character is currently inside Shenhe's Q field
// burstField     — enemies are currently inside Shenhe's Q field (RES shred)
// a4Press        — A4 buff window after a tap-E (team skill+burst dmg%)
// a4Hold         — A4 buff window after a hold-E (team N/C/P dmg%)
const {
  quillActive,
  a1Field,
  burstField,
  a4Press,
  a4Hold,
} = allBoolConditionals(info.key)
// C4 stack count, integer 0..maxStacks
const { c4Stacks } = allNumConditionals(
  info.key,
  true,
  0,
  dm.constellation4.maxStacks,
)

// --- Derived nodes -----------------------------------------------------------

// Icy Quill per-hit cryo damage (custom formula): when quillActive on, deals
// (Shenhe ATK) * (skill table value at her skill talent level).
const quill_baseDmg = quillActive.ifOn(
  prod(percent(subscript(skill, dm.skill.quillAtk_)), final.atk),
)

// A1 — +cryo_dmg_ to active char while in field, gated on a1Field cond.
const a1_cryo_dmg_ = cmpGE(
  ascension,
  1,
  a1Field.ifOn(percent(dm.passive1.cryo_dmg_)),
)

// A4 — two parallel windows. Press: skill+burst dmg+%. Hold: N/C/P dmg+%.
const a4_press_dmg_ = cmpGE(
  ascension,
  4,
  a4Press.ifOn(percent(dm.passive2.press_dmg_)),
)
const a4_hold_dmg_ = cmpGE(
  ascension,
  4,
  a4Hold.ifOn(percent(dm.passive2.hold_dmg_)),
)

// Q field cryo + physical RES shred on enemies inside the field.
const burst_resShred_ = burstField.ifOn(percent(dm.burst.resShred_))

// C4 — every Icy Quill consumption stacks +dmg_% to Shenhe's own skill damage.
//      Matches the old GO sheet's interpretation (in-game text is broader but
//      the consensus theorycrafting application is to her skill DMG%).
const c4_skill_dmg_ = cmpGE(
  constellation,
  4,
  prod(c4Stacks, percent(dm.constellation4.dmg_)),
)

export default register(
  info.key,
  entriesForChar(info, data_gen),

  // C3: +3 to E (skill); C5: +3 to Q (burst). [in-game order]
  ownBuff.char.skill.add(cmpGE(constellation, 3, 3)),
  ownBuff.char.burst.add(cmpGE(constellation, 5, 3)),

  // Self buffs ----
  ownBuff.premod.dmg_.skill.add(c4_skill_dmg_),

  // Team buffs ----
  // A1 — active char inside the field gets +15% cryo DMG.
  teamBuff.premod.dmg_.cryo.add(a1_cryo_dmg_),
  // A4 — team-wide attack-type DMG% windows.
  teamBuff.premod.dmg_.skill.add(a4_press_dmg_),
  teamBuff.premod.dmg_.burst.add(a4_press_dmg_),
  teamBuff.premod.dmg_.normal.add(a4_hold_dmg_),
  teamBuff.premod.dmg_.charged.add(a4_hold_dmg_),
  teamBuff.premod.dmg_.plunging.add(a4_hold_dmg_),

  // Enemy debuffs ----
  enemyDebuff.common.preRes.cryo.add(burst_resShred_),
  enemyDebuff.common.preRes.physical.add(burst_resShred_),

  // Formulas ----
  dm.normal.hitArr.flatMap((arr, i) =>
    dmg(`normal_${i}`, info, 'atk', arr, 'normal'),
  ),
  dmg('normal_4', info, 'atk', dm.normalHit5, 'normal'),
  dmg('charged', info, 'atk', dm.charged.dmg, 'charged'),
  Object.entries(dm.plunging).flatMap(([k, v]) =>
    dmg(`plunging_${k}`, info, 'atk', v, 'plunging'),
  ),
  dmg('skill_press', info, 'atk', dm.skill.press, 'skill'),
  dmg('skill_hold', info, 'atk', dm.skill.hold, 'skill'),
  dmg('burst', info, 'atk', dm.burst.dmg, 'burst'),
  dmg('burst_dot', info, 'atk', dm.burst.dot, 'burst'),

  // Icy Quill per-consumption flat cryo damage. Custom formula because the
  // damage rides on whatever ally hit triggered the consumption; in the
  // single-character damage panel we surface Shenhe's own number to make the
  // value of her skill talent level visible.
  customDmg('icy_quill', 'cryo', 'skill', quill_baseDmg),
)
