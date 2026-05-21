// Extract authoritative game data from genshin-db (MIT-licensed npm package
// maintained by theBowja, kept up-to-date with the current patch).
//
// Outputs one JSON per character into src/data/gdb/<characterId>.json
// containing:
//   • character info (name zh+en, weaponType, rarity, element)
//   • talents (combat1/combat2/combat3 + passives) with full per-level
//     scaling parameters
//   • constellations c1..c6 with raw description text in both languages
//
// We DON'T copy genshin-db wholesale — its package is ~50 MB and we only need
// a slice. The extractor produces a slim subset we can ship in the bundle.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import genshindb from 'genshin-db'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '..', 'src', 'data', 'gdb')

const REQUESTED_LANGUAGES = ['English', 'ChineseSimplified']

/** Trim the genshin-db raw object to the bits we need. */
function trimTalents(raw, rawZH) {
  if (!raw) return null
  const out = {}
  for (const key of ['combat1', 'combat2', 'combat3', 'combatsp', 'passive1', 'passive2', 'passive3', 'passive4']) {
    const en = raw[key]
    if (!en) continue
    const zh = rawZH?.[key]
    out[key] = {
      name: { en: en.name, zh: zh?.name ?? null },
      description: { en: en.description, zh: zh?.description ?? null },
      attributes: en.attributes ?? null, // params are language-invariant; one copy is enough
    }
  }
  return out
}

function trimConsts(raw, rawZH) {
  if (!raw) return null
  const out = {}
  for (const key of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) {
    const en = raw[key]
    if (!en) continue
    const zh = rawZH?.[key]
    out[key] = {
      name: { en: en.name, zh: zh?.name ?? null },
      description: { en: en.description, zh: zh?.description ?? null },
    }
  }
  return out
}

async function extractCharacter(name) {
  // genshindb is case-insensitive and accepts aliases
  const ch = genshindb.characters(name, { resultLanguage: 'English' })
  if (!ch) return null
  const chZH = genshindb.characters(name, { resultLanguage: 'ChineseSimplified' })
  const talentsEN = genshindb.talents(name, { resultLanguage: 'English' })
  const talentsZH = genshindb.talents(name, { resultLanguage: 'ChineseSimplified' })
  const constsEN = genshindb.constellations(name, { resultLanguage: 'English' })
  const constsZH = genshindb.constellations(name, { resultLanguage: 'ChineseSimplified' })

  return {
    id: ch.id,
    name: { en: ch.name, zh: chZH?.name ?? null },
    title: { en: ch.title, zh: chZH?.title ?? null },
    element: ch.elementType, // e.g. "Hydro"
    weaponType: ch.weaponType, // e.g. "Catalyst"
    rarity: ch.rarity, // "5"
    substatType: ch.substatType, // e.g. "FIGHT_PROP_CHARGE_EFFICIENCY"
    version: ch.version,
    talents: trimTalents(talentsEN, talentsZH),
    constellations: trimConsts(constsEN, constsZH),
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  // For now, only Mona. Later: iterate over all characters from genshindb.characters('names').
  const targets = ['mona']
  for (const name of targets) {
    const data = await extractCharacter(name)
    if (!data) {
      console.error(`  ⚠ ${name}: not found`)
      continue
    }
    const file = path.join(OUT_DIR, `${data.id}.json`)
    await writeFile(file, JSON.stringify(data, null, 2), 'utf8')
    console.log(`  ✓ ${name} → ${path.relative(process.cwd(), file)} (id ${data.id})`)
  }
  // Also dump the character name list for future iteration.
  const names = genshindb.characters('names', { matchCategories: true })
  await writeFile(
    path.join(OUT_DIR, '_index.json'),
    JSON.stringify({ characters: names, generated: new Date().toISOString() }, null, 2),
    'utf8',
  )
  console.log(`  ✓ _index.json (${names.length} characters total in genshin-db)`)
  void REQUESTED_LANGUAGES // tag for grepping later
}

main().catch((e) => { console.error(e); process.exit(1) })
