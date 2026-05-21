import { usedNames, usedQ } from '@genshin-optimizer/game-opt/engine'
import {
  compileTagMapKeys,
  compileTagMapValues,
} from '@genshin-optimizer/pando/engine'
import artifact from './artifact'
import character from './char'
import common from './common'
import type { TagMapNodeEntries } from './util'
import { fixedTags, queryTypes } from './util'
import weapon from './weapon'

const entries: TagMapNodeEntries = [
  ...common,
  ...artifact,
  ...character,
  ...weapon,
]
// Investigation note (task #34): CalamityQueller registers 13 entries
// correctly tagged with sheet='CalamityQueller' (2 × base.atk, 1 ×
// premod.atk_, weapon.primary/secondary, 8 × dmg_ for elements + reactions,
// plus the atk_inc cond-gated stack buff). But base.atk and premod.atk_
// reads under sheet='agg' don't fully aggregate them — base.atk lands at
// 911.83 (~608 of weapon, vs expected 740.58 from curve+ascension), and
// premod.atk_'s 16.5% weapon substat is completely absent. Difference is
// reproducible across weapons. Root cause is somewhere in compileTagMap
// or the agg.reread(weaponSheet) mechanism — direct ownBuff.base.atk
// add(literal) inside the weapon sheet doesn't propagate either, but the
// SAME literal in a character sheet does. To investigate.
const keys = compileTagMapKeys([
  { category: 'qt', values: queryTypes },
  { category: 'q', values: usedQ },
  undefined,
  ...Object.entries(fixedTags).map(([k, v]) => ({
    category: k,
    values: new Set(v),
  })),
  { category: 'name', values: usedNames },
]) // TODO: Find optimum tag order
const values = compileTagMapValues(keys, entries)

export { entries, keys, values }
