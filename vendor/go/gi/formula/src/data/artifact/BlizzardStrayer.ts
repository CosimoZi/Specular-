import type { ArtifactSetKey } from '@genshin-optimizer/gi/consts'
import { cmpEq, cmpGE, tagVal } from '@genshin-optimizer/pando/engine'
import { allBoolConditionals, ownBuff, percent, teamBuff } from '../util'
import { artCount, registerArt } from './util'

// Blizzard Strayer (冰风迷途的勇士) — hand-wired by Specular.
//   2pc: +15% Cryo DMG Bonus (wielder).
//   4pc: When attacking enemy affected by Cryo: +20% CR. If Frozen: +20% more.
//
// Cond reads (enemyCryo, enemyFrozen) need src/dst context to match cond
// entries created by conditionalData (which always tag entries with explicit
// src + dst). teamBuff entries get that context via teamData's reread
// fan-out; ownBuff entries don't, so cond reads in ownBuff context evaluate
// to 0. The 4pc effects are wielder-only, so we route them through teamBuff
// with a src=dst self-gate (same pattern as Shenhe's C4).

const key: ArtifactSetKey = 'BlizzardStrayer'
const count = artCount(key)
const { enemyCryo, enemyFrozen } = allBoolConditionals(key)

const self = <T extends number | import('@genshin-optimizer/pando/engine').NumNode>(node: T) =>
  cmpEq(tagVal('src'), tagVal('dst'), node, 0)

export default registerArt(
  key,
  // 2pc — permanent +15% cryo DMG. No cond, so ownBuff is fine.
  ownBuff.premod.dmg_.cryo.add(cmpGE(count, 2, percent(0.15))),
  // 4pc — wielder gets +20% CR vs cryo-affected enemy.
  teamBuff.premod.critRate_.add(
    self(cmpGE(count, 4, enemyCryo.ifOn(percent(0.2)))),
  ),
  // 4pc — additional +20% CR vs frozen.
  teamBuff.premod.critRate_.add(
    self(cmpGE(count, 4, enemyFrozen.ifOn(percent(0.2)))),
  ),
)
