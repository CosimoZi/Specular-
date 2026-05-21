import type { CharacterKey } from '@genshin-optimizer/gi/consts'
import { allStats } from '@genshin-optimizer/gi/stats'
import { cmpEq, cmpGE, prod, subscript, tagVal } from '@genshin-optimizer/pando/engine'
import {
  allBoolConditionals,
  allNumConditionals,
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
  char: { skill, burst, ascension, constellation },
} = own

// Conditionals exposed to the UI (toggled in /team conditional buffs section).
//
// quillActive    — Shenhe's E has applied Icy Quill to the team within window
// burstField     — Shenhe's Q field is currently up. This single cond drives
//                  three physically-inseparable effects:
//                    A1: active char in field → +15% cryo DMG
//                    C2: active char in field → +15% cryo CRIT DMG
//                    Q  : enemies in field   → -10% cryo + physical RES
// a4Press        — A4 buff window after a tap-E (team skill+burst dmg%)
// a4Hold         — A4 buff window after a hold-E (team N/C/P dmg%)
const {
  quillActive,
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

// Icy Quill per-consumption flat cryo damage:
//   (Shenhe ATK) × (E talent-table coefficient at her current skill level)
//
// In-game this is a flat additive on the BASE damage zone for any
// cryo-elemental hit the active character lands. Each cryo hit consumes
// one quill and adds this flat to that hit's pre-mitigation damage.
//
// In Pando: formula.base is an `agg` (sum) bucket per formula, and the
// engine reads each formula's `prep.ele` in that formula's own tag
// context. So a single `ownBuff.formula.base.add(...)` entry whose value
// is gated on `prep.ele === 'cryo'` automatically applies to every cryo
// formula (skill_press, skill_hold, burst, burst_dot) and silently zeros
// for physical formulas (normal_*, charged, plunging). No per-formula
// enumeration; the engine fans out for us.
const quillFlat = quillActive.ifOn(
  prod(percent(subscript(skill, dm.skill.quillAtk_)), final.atk),
)
// Read the CURRENT formula's element directly from the cache via tagVal('ele').
// vendor/go/gi/formula/src/data/common/prep.ts wires `formula.dmg`'s evaluation
// inside a dynTag that injects prep.ele into the tag cache before evaluating
// dmg.out (which reads formula.base). So at the moment our base.add value is
// computed, cache.ele is the formula's resolved element. tagVal('ele') reads
// it cheaply and accurately, independent of any sheet/name scoping issues
// `own.prep.ele` would introduce here.
const quillFlatForCryoOnly = cmpEq(tagVal('ele'), 'cryo', quillFlat)

// A1 — +cryo_dmg_ to active char while inside Shenhe's Q field.
const a1_cryo_dmg_ = cmpGE(
  ascension,
  1,
  burstField.ifOn(percent(dm.passive1.cryo_dmg_)),
)

// C2 — +cryo_critDMG_ to active char while inside Shenhe's Q field. Same
// trigger and same magnitude (15%) as A1, just a different stat. The skill
// param table for C2 contains only `durationInc`; the 15% magnitude is the
// game's hardcoded value, matching dm.passive1.cryo_dmg_.
const c2_cryo_critDMG_ = cmpGE(
  constellation,
  2,
  burstField.ifOn(percent(dm.passive1.cryo_dmg_)),
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

// Q field cryo + physical RES shred on enemies inside the field. The shred
// magnitude is a function of Q talent level (~6% at lv 1, ~10% at lv 13).
// Subscript into the burst-talent table at the receiver's current Q level.
const burst_resShred_ = burstField.ifOn(
  percent(subscript(burst, dm.burst.resShred_)),
)

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
  // Icy Quill — flat cryo damage on every cryo-elemental hit's base zone.
  // One entry, engine fans out to every cryo formula via prep.ele resolution.
  ownBuff.formula.base.add(quillFlatForCryoOnly),

  // Team buffs ----
  // A1 — active char inside the field gets +15% cryo DMG.
  teamBuff.premod.dmg_.cryo.add(a1_cryo_dmg_),
  // C2 — active char inside the field gets +15% cryo CRIT DMG.
  teamBuff.premod.critDMG_.cryo.add(c2_cryo_critDMG_),
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
)
