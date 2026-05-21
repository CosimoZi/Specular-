import type { CharacterKey } from '@genshin-optimizer/gi/consts'
import { allStats } from '@genshin-optimizer/gi/stats'
import { cmpGE } from '@genshin-optimizer/pando/engine'
import {
  allBoolConditionals,
  allListConditionals,
  allNumConditionals,
  enemyDebuff,
  own,
  ownBuff,
  register,
  team,
  teamBuff,
} from '../util'
import { dataGenToCharInfo, dmg, entriesForChar } from './util'

const key: CharacterKey = 'Navia'
const data_gen = allStats.char.data[key]
const skillParam_gen = allStats.char.skillParam[key]

// TODO: Fill data-mine values here
const _dm = {
  normal: {
    dmg1: skillParam_gen.auto[0],
  },
  charged: {},
  plunging: {},
  skill: {},
  burst: {},
} as const

const info = dataGenToCharInfo(data_gen)
const {
  final: _final,
  char: { ascension: _ascension, constellation },
} = own
// TODO: Conditionals
const { _someBoolConditional } = allBoolConditionals(info.key)
const { _someListConditional } = allListConditionals(info.key, [])
const { _someNumConditional } = allNumConditionals(info.key)

const _count = team.common.count

export default register(
  info.key,
  entriesForChar(info, data_gen),
  // TODO: Double check these
  ownBuff.char.burst.add(cmpGE(constellation, 3, 3)),
  ownBuff.char.skill.add(cmpGE(constellation, 5, 3)),

  // SPECULAR-NEUTRALIZED: GO upstream's stub template injected literal
  // ownBuff.premod.atk.add(1), teamBuff.premod.atk.add(1), and
  // enemyDebuff.common.defRed_.add(1) — i.e. +100% self ATK, +100% team
  // ATK, -100% enemy DEF — into every unimplemented character sheet. We
  // strip them here so /team analysis isn't poisoned. When this character
  // gets real buff wiring, remove this block and replace with real entries.
  //
  // <buff value> uses `own.*`, `team.*`, `target.*` (target of team buff), and `enemy.*`

  // Formulas
  // TODO: Add dmg/heal/shield formulas using `dmg`, `customDmg`, `shield`, `customShield`, `fixedShield`, or `customHeal`
  dmg('normal1', info, 'atk', _dm.normal.dmg1, 'normal')
)
