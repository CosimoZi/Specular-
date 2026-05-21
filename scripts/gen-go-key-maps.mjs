// Generate all three ID → GO key maps: characters, weapons, artifact sets.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import genshindb from 'genshin-db'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function toGoKey(englishName) {
  return englishName.replace(/[\s'.\-:,!?]/g, '')
}

async function loadAllStat() {
  const raw = await readFile(path.join(ROOT, 'vendor/go/gi/stats/src/allStat_gen.json'), 'utf8')
  return JSON.parse(raw)
}

async function genCharMap(allStat) {
  const goKeys = new Set(Object.keys(allStat.char?.data ?? {}))
  const names = genshindb.characters('names', { matchCategories: true })
  const map = {}, skipped = []
  for (const enName of names) {
    const ch = genshindb.characters(enName)
    if (!ch?.id) continue
    let key = toGoKey(enName)
    // Traveler is special: GO has TravelerAnemo / TravelerHydro etc. Specular's
    // Traveler comes as id "10000005-anemo" — we synthesize this at import time.
    // Here we map the base id to a placeholder; element variants resolved in adapter.
    if (ch.id === 10000005 || ch.id === 10000007) {
      // skip — handled specially
      continue
    }
    if (!goKeys.has(key)) {
      skipped.push({ id: ch.id, enName, attempted: key })
      continue
    }
    map[ch.id] = key
  }
  return { map, skipped, total: goKeys.size }
}

async function genWeaponMap(allStat) {
  const goKeys = new Set(Object.keys(allStat.weapon?.data ?? {}))
  const names = genshindb.weapons('names', { matchCategories: true })
  const map = {}, skipped = []
  for (const enName of names) {
    const w = genshindb.weapons(enName)
    if (!w?.id) continue
    const key = toGoKey(enName)
    if (!goKeys.has(key)) {
      skipped.push({ id: w.id, enName, attempted: key })
      continue
    }
    map[w.id] = key
  }
  return { map, skipped, total: goKeys.size }
}

async function genArtifactMap(allStat) {
  const goKeys = new Set(Object.keys(allStat.art?.data ?? {}))
  const names = genshindb.artifacts('names', { matchCategories: true })
  const map = {}, skipped = []
  for (const enName of names) {
    const a = genshindb.artifacts(enName)
    if (!a?.id) continue
    const key = toGoKey(enName)
    if (!goKeys.has(key)) {
      skipped.push({ id: a.id, enName, attempted: key })
      continue
    }
    map[a.id] = key
  }
  return { map, skipped, total: goKeys.size }
}

async function main() {
  const allStat = await loadAllStat()

  const ch = await genCharMap(allStat)
  const wp = await genWeaponMap(allStat)
  const ar = await genArtifactMap(allStat)

  const out = {
    generatedAt: new Date().toISOString(),
    characters: { mapped: Object.keys(ch.map).length, goTotal: ch.total, skipped: ch.skipped.length },
    weapons:    { mapped: Object.keys(wp.map).length, goTotal: wp.total, skipped: wp.skipped.length },
    artifacts:  { mapped: Object.keys(ar.map).length, goTotal: ar.total, skipped: ar.skipped.length },
    map: {
      characters: ch.map,
      weapons: wp.map,
      artifacts: ar.map,
    },
    debug: {
      skippedCharacters: ch.skipped,
      skippedWeapons: wp.skipped.slice(0, 30),
      skippedArtifacts: ar.skipped,
    },
  }

  const outPath = path.join(ROOT, 'src/integration/go-id-map.json')
  await writeFile(outPath, JSON.stringify(out, null, 2), 'utf8')
  console.log(`✓ ${outPath}`)
  console.log(`  characters: ${out.characters.mapped}/${out.characters.goTotal} (${out.characters.skipped} skipped)`)
  console.log(`  weapons:    ${out.weapons.mapped}/${out.weapons.goTotal} (${out.weapons.skipped} skipped)`)
  console.log(`  artifacts:  ${out.artifacts.mapped}/${out.artifacts.goTotal} (${out.artifacts.skipped} skipped)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
