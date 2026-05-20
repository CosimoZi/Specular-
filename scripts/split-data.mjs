// Post-process raw ambr dumps:
//   1. Write slim index files into src/data/index/  (imported by main bundle)
//   2. Split per-id detail files into public/data/{characters,weapons,artifacts}/<id>.json
//      so the browser fetches one detail at a time.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const RAW = resolve(root, 'src', 'data', 'raw')
const INDEX_OUT = resolve(root, 'src', 'data', 'index')
const PUBLIC_OUT = resolve(root, 'public', 'data')

async function loadJson(p) {
  return JSON.parse(await readFile(p, 'utf8'))
}

async function writeJson(p, data, pretty = false) {
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(data, null, pretty ? 2 : 0), 'utf8')
}

async function splitKind(kind, indexFile, detailsFile, indexSlim) {
  console.log(`[${kind}] reading raw...`)
  const indexRaw = await loadJson(resolve(RAW, indexFile))
  const details = await loadJson(resolve(RAW, detailsFile))

  const slimItems = {}
  for (const [id, item] of Object.entries(indexRaw.items)) {
    slimItems[id] = indexSlim(item)
  }
  await writeJson(resolve(INDEX_OUT, `${kind}.json`), {
    props: indexRaw.props ?? {},
    types: indexRaw.types ?? {},
    items: slimItems,
  })

  const detailDir = resolve(PUBLIC_OUT, kind)
  await rm(detailDir, { recursive: true, force: true })
  await mkdir(detailDir, { recursive: true })
  let count = 0
  for (const [id, detail] of Object.entries(details)) {
    await writeJson(resolve(detailDir, `${id}.json`), detail)
    count++
  }
  console.log(`        ✓ ${count} detail files, slim index ${Object.keys(slimItems).length} entries`)
}

await splitKind('characters', 'characters-index.json', 'characters.json', (c) => ({
  id: c.id,
  name: c.name,
  rank: c.rank,
  element: c.element,
  weaponType: c.weaponType,
  region: c.region,
  specialProp: c.specialProp,
  icon: c.icon,
  release: c.release,
  route: c.route,
}))

await splitKind('weapons', 'weapons-index.json', 'weapons.json', (w) => ({
  id: w.id,
  name: w.name,
  rank: w.rank,
  type: w.type,
  specialProp: w.specialProp,
  icon: w.icon,
  route: w.route,
}))

await splitKind('artifacts', 'artifacts-index.json', 'artifacts.json', (a) => ({
  id: a.id,
  name: a.name,
  levelList: a.levelList,
  affixList: a.affixList,
  icon: a.icon,
  sortOrder: a.sortOrder,
  route: a.route,
}))

console.log('\nDONE.')
console.log('  index    →', INDEX_OUT)
console.log('  details  →', PUBLIC_OUT)
