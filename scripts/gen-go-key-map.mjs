// Build ID → GO character key map for all characters genshin-db knows about.
// GO's keys are the English name with spaces stripped: "Hu Tao" → "HuTao",
// "Sangonomiya Kokomi" → "SangonomiyaKokomi", "Raiden Shogun" → "RaidenShogun".
//
// We then cross-check against vendored GO allStat_gen.json to keep only keys
// GO actually has sheets for.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import genshindb from 'genshin-db'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function toGoKey(englishName) {
  // Remove all spaces and punctuation. "Hu Tao" → "HuTao", "Yun Jin" → "YunJin"
  return englishName.replace(/[\s'.-]/g, '')
}

async function main() {
  // Load GO's character list to verify keys exist
  const allStatPath = path.resolve(__dirname, '..', 'vendor', 'go', 'gi', 'stats', 'src', 'allStat_gen.json')
  const allStatRaw = await readFile(allStatPath, 'utf8')
  const allStat = JSON.parse(allStatRaw)
  const goCharKeys = new Set(Object.keys(allStat.char?.data ?? {}))
  console.log(`GO has ${goCharKeys.size} character sheets`)

  // Iterate genshin-db
  const names = genshindb.characters('names', { matchCategories: true })
  console.log(`genshin-db has ${names.length} character entries`)

  const map = {} // id → goKey
  const skipped = []
  for (const enName of names) {
    const ch = genshindb.characters(enName)
    if (!ch || !ch.id) continue
    const id = ch.id
    let key = toGoKey(enName)
    // Handle Traveler — GO uses keys like "TravelerAnemo", "TravelerHydro", …
    if (id === 10000005 || id === 10000007) {
      // Traveler in genshin-db is split by element
      const elKey = ch.elementType?.replace('ELEMENT_', '').toLowerCase() ?? ''
      const cap = elKey.charAt(0).toUpperCase() + elKey.slice(1)
      key = `Traveler${cap}`
    }
    if (!goCharKeys.has(key)) {
      skipped.push({ id, enName, attempted: key })
      continue
    }
    map[id] = key
  }

  const out = {
    generatedAt: new Date().toISOString(),
    counts: {
      mapped: Object.keys(map).length,
      goSheets: goCharKeys.size,
      gdbCharacters: names.length,
      skipped: skipped.length,
    },
    map,
    skipped,
  }

  const outPath = path.resolve(__dirname, '..', 'src', 'integration', 'go-id-map.json')
  await writeFile(outPath, JSON.stringify(out, null, 2), 'utf8')
  console.log(`✓ wrote ${outPath}`)
  console.log(`  mapped ${out.counts.mapped} characters`)
  console.log(`  skipped ${out.counts.skipped} (not in GO sheets):`)
  for (const s of skipped.slice(0, 20)) {
    console.log(`    - ${s.enName} (id ${s.id}) → tried "${s.attempted}"`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
