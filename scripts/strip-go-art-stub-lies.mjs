// Strip poison from artifact-set stubs.
//
// Upstream GO scaffolds every unimplemented artifact set with:
//   ownBuff.premod.atk_.add(cmpGE(count, 2, percent(1)))
//   teamBuff.premod.atk_.addOnce(key, someBoolConditional.ifOn(cmpGE(count, 4, percent(1))))
//
// percent(1) means +100%. So any 2pc gives +100% ATK to self, and the 4pc
// "someBoolConditional" toggle gives +100% team ATK. We strip these to
// no-ops and leave a marker comment so the script is idempotent.
//
// Safe to re-run. Skips any file that has been replaced with a real
// implementation (no longer matches the stub pattern).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ART_DIR = 'vendor/go/gi/formula/src/data/artifact'
const MARKER = 'SPECULAR-ART-NEUTRALIZED'

const files = readdirSync(ART_DIR).filter(
  (f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'util.ts'
)

let patched = 0
let alreadyClean = 0
let skipped = []

for (const file of files) {
  const path = join(ART_DIR, file)
  const src = readFileSync(path, 'utf-8')
  if (src.includes(MARKER)) {
    alreadyClean++
    continue
  }
  // Match the exact stub pattern (TODO block + the two `percent(1)` adds).
  // We require both lines so we don't accidentally strip an honest sheet
  // that only happens to call `cmpGE(count, 2, percent(1))` with a real
  // intent (none exist today, but be conservative).
  const hasOwnLie = /ownBuff\.premod\.atk_\.add\(cmpGE\(count, 2, percent\(1\)\)\)/.test(src)
  const hasTeamLie = /teamBuff\.premod\.atk_\.addOnce\(\s*key,\s*someBoolConditional\.ifOn\(cmpGE\(count, 4, percent\(1\)\)\)\s*\)/.test(src)
  if (!hasOwnLie || !hasTeamLie) {
    skipped.push(file)
    continue
  }
  // Find the artifact key constant so we keep the file's identity (the
  // sheet still has to register, just with no effects).
  const keyMatch = src.match(/const key: ArtifactSetKey = '([^']+)'/)
  const key = keyMatch ? keyMatch[1] : file.replace(/\.ts$/, '')

  const next = `import type { ArtifactSetKey } from '@genshin-optimizer/gi/consts'
import { registerArt } from './util'

// ${MARKER}: GO upstream's stub template injected literal +100% ATK
// (ownBuff.premod.atk_.add(cmpGE(count, 2, percent(1)))) and +100% team
// ATK (teamBuff.premod.atk_.addOnce(...percent(1))) into every
// unimplemented artifact set, so any equipped 2pc silently faked +100%
// self ATK and the cond toggle faked +100% team ATK. Until this set
// gets real wiring, register it with no effects.

const key: ArtifactSetKey = '${key}'

export default registerArt(key)
`
  writeFileSync(path, next)
  patched++
}

console.log(`patched: ${patched}`)
console.log(`already-clean: ${alreadyClean}`)
console.log(`skipped (real sheets or different shape): ${skipped.length}`)
if (skipped.length > 0 && skipped.length <= 15) console.log('  ' + skipped.join('\n  '))
