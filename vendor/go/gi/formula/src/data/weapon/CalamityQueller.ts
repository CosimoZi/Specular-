import type { WeaponKey } from '@genshin-optimizer/gi/consts'
import { allElementKeys } from '@genshin-optimizer/gi/consts'
import { cmpEq, prod, subscript, tagVal } from '@genshin-optimizer/pando/engine'
import {
  allBoolConditionals,
  allNumConditionals,
  own,
  ownBuff,
  register,
  teamBuff,
} from '../util'
import { entriesForWeapon } from './util'

// Calamity Queller (破魔之弓的... wait, 息灾) — R1..R5
//   Permanent: +12/15/18/21/24% All-Elemental DMG Bonus.
//   Active: after using E, gain Consummation for 20s → ATK +3.2/4/4.8/5.6/6.4%
//   per second, stacks up to 6. When wielder is off-field, this effect is
//   doubled.
//
// Cond-gated entries (atkInc) read `isActive` + `stack` conds, which need
// (src, dst) context. ownBuff doesn't provide it; teamBuff + src=dst gate
// does (same pattern as Shenhe's C4).

const key: WeaponKey = 'CalamityQueller'
const dmg_ = [NaN, 0.12, 0.15, 0.18, 0.21, 0.24]
const atk_ = [NaN, 0.032, 0.04, 0.048, 0.056, 0.064]

const {
  weapon: { refinement },
} = own
const { stack } = allNumConditionals(key, true, 0, 6)
const { isActive } = allBoolConditionals(key)

// isActive=on → wielder on field, normal effect (×1). off → off-field (×2).
const atkInc = prod(isActive.ifOn(1, 2), stack, subscript(refinement, atk_))
const atkIncSelf = cmpEq(tagVal('src'), tagVal('dst'), atkInc, 0)

export default register(
  key,
  entriesForWeapon(key),
  // +12% (R1) all-ele DMG, permanent — no cond, ownBuff is fine.
  allElementKeys.map((ele) =>
    ownBuff.premod.dmg_[ele].add(subscript(refinement, dmg_)),
  ),
  // Stacking ATK% — gated by stack cond + isActive cond. Route via teamBuff
  // with self-gate so cond reads pick up (src, dst) from team fan-out.
  teamBuff.premod.atk_.add(atkIncSelf),
)
