import type { ArtifactSetKey } from '@genshin-optimizer/gi/consts'
import { registerArt } from './util'

// SPECULAR-ART-NEUTRALIZED: GO upstream's stub template injected literal +100% ATK
// (ownBuff.premod.atk_.add(cmpGE(count, 2, percent(1)))) and +100% team
// ATK (teamBuff.premod.atk_.addOnce(...percent(1))) into every
// unimplemented artifact set, so any equipped 2pc silently faked +100%
// self ATK and the cond toggle faked +100% team ATK. Until this set
// gets real wiring, register it with no effects.

const key: ArtifactSetKey = 'RetracingBolide'

export default registerArt(key)
