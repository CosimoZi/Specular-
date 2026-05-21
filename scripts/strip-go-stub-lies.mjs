// Strip the placeholder "+100% ATK / +100% team ATK / -100% enemy DEF" lines
// from GenshinOptimizer's stub character sheets.
//
// Upstream GO ships scaffold templates that include literal `add(1)` calls as
// placeholders for future buff implementation. They aren't meant to actually
// run, but they're in the bundle, so until each character is filled in, every
// stub silently fakes +100% ATK to the team and shreds 100% enemy DEF.
//
// This script rewrites those three lines in-place to no-op'd comments and
// adds a SPECULAR-NEUTRALIZED marker so we can find / un-do the patch later
// when a character gets a real implementation.
//
// Safe to re-run.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CHAR_DIR = 'vendor/go/gi/formula/src/data/char'

// Each is the EXACT line content (no leading whitespace, no trailing comma)
// the stub template emits. We match the full pattern incl. surrounding
// comments to avoid false positives in real sheets.
const STUB_BLOCK = `  // TODO:
  // - Add member's own formulas using \`ownBuff.<buff target>.add(<buff value>)\`
  ownBuff.premod.atk.add(1),
  // - Add teambuff formulas using \`teamBuff.<buff target>.add(<buff value>)
  teamBuff.premod.atk.add(1),
  // - Add enemy debuff using \`enemyDebuff.<debuff target>.add(<debuff value>)\`
  enemyDebuff.common.defRed_.add(1),`

const NEUTRALIZED_BLOCK = `  // SPECULAR-NEUTRALIZED: GO upstream's stub template injected literal
  // ownBuff.premod.atk.add(1), teamBuff.premod.atk.add(1), and
  // enemyDebuff.common.defRed_.add(1) — i.e. +100% self ATK, +100% team
  // ATK, -100% enemy DEF — into every unimplemented character sheet. We
  // strip them here so /team analysis isn't poisoned. When this character
  // gets real buff wiring, remove this block and replace with real entries.`

const files = readdirSync(CHAR_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'util.ts')

let patched = 0
let alreadyClean = 0
let skipped = []

for (const file of files) {
  const path = join(CHAR_DIR, file)
  const src = readFileSync(path, 'utf-8')
  if (src.includes('SPECULAR-NEUTRALIZED')) {
    alreadyClean++
    continue
  }
  if (!src.includes(STUB_BLOCK)) {
    skipped.push(file)
    continue
  }
  const next = src.replace(STUB_BLOCK, NEUTRALIZED_BLOCK)
  writeFileSync(path, next)
  patched++
}

console.log(`patched: ${patched}`)
console.log(`already-clean: ${alreadyClean}`)
console.log(`skipped (not stub or real sheets): ${skipped.length}`)
if (skipped.length > 0 && skipped.length <= 10) console.log('  ' + skipped.join('\n  '))
