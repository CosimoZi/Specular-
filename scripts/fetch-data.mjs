// Pulls characters / weapons / artifacts from gi.yatta.moe (Project Amber, the
// ambr.top API). Writes static JSON into src/data/raw/ so the SPA can ship
// without a runtime network dependency.
//
// Usage: pnpm run data
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', 'src', 'data', 'raw')
const BASE = 'https://gi.yatta.moe/api/v2/CHS'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Delay between detail requests (ms). gi.yatta.moe is CF-cached but we still
// pace ourselves to be polite.
const POLITE_DELAY_MS = 80

async function fetchJson(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (!body.data) throw new Error(`no .data in payload`)
    return body.data
  } catch (e) {
    if (attempt < 3) {
      await sleep(500 * attempt)
      return fetchJson(url, attempt + 1)
    }
    throw new Error(`GET ${url} failed after ${attempt}: ${e.message}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function writeJson(name, data) {
  const path = resolve(OUT_DIR, name)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 0), 'utf8')
  const s = await stat(path)
  return { path, bytes: s.size }
}

async function fetchAll(label, listEndpoint, detailEndpoint, outFile) {
  console.log(`[${label}] index...`)
  const list = await fetchJson(`${BASE}${listEndpoint}`)
  const ids = Object.keys(list.items)
  console.log(`        ${ids.length} entries`)

  const details = {}
  let ok = 0
  let last = 0
  const total = ids.length
  for (const id of ids) {
    try {
      details[id] = await fetchJson(`${BASE}${detailEndpoint}/${id}`)
      ok++
    } catch (e) {
      console.log(`        ✗ ${id}: ${e.message}`)
    }
    // Progress every 25 items
    if (ok - last >= 25 || ok === total) {
      console.log(`        ${ok}/${total}`)
      last = ok
    }
    await sleep(POLITE_DELAY_MS)
  }

  // Index (lite) keeps the list payload; details is one big map.
  const indexInfo = await writeJson(`${outFile}-index.json`, {
    props: list.props,
    types: list.types,
    items: list.items,
  })
  const detailInfo = await writeJson(`${outFile}.json`, details)
  console.log(
    `        ✓ ${ok}/${total} details, ` +
      `${(indexInfo.bytes / 1024).toFixed(1)} KB index, ` +
      `${(detailInfo.bytes / 1024).toFixed(1)} KB details`,
  )
  return { list, details }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  await fetchAll('characters', '/avatar', '/avatar', 'characters')
  await fetchAll('weapons', '/weapon', '/weapon', 'weapons')
  await fetchAll('artifacts', '/reliquary', '/reliquary', 'artifacts')

  console.log('\nDONE. output:', OUT_DIR)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
