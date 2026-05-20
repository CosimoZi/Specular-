// Reads raw character details from src/data/raw/characters.json and emits
// calc-ready metadata into src/data/meta/<id>.json.
//
// Per character we extract:
//   - base stat curve descriptors
//   - per-ascension stat bonuses (and the resolved "ascension stat" type/value)
//   - per-talent damage instances: {label, paramIndex, scaling, element, hitType}
//
// The trick: ambr describes each talent-level's stats as a parallel array of
//   description templates ("<label>|{param<N>:<format>}") and concrete params.
// We parse templates whose label contains "伤害" (damage) and treat the referenced
// param as the multiplier. Scaling and element are derived from the talent's
// prose description (with sensible defaults: ATK, talent's main element).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const IN = resolve(root, 'src', 'data', 'raw', 'characters.json')
const OUT_DIR = resolve(root, 'public', 'data', 'meta')

// Match e.g. "一段伤害|{param1:F1P}" or "技能伤害|{param1:F1P}" or
// "低空/高空坠地冲击伤害|{param7:F1P}/{param8:F1P}".
const TEMPLATE_RE = /\{param(\d+):([^}]+)\}/g

// Skill description includes color-tagged element labels. Map them to engine elements.
const ELEMENT_FROM_PROSE = [
  [/火元素/, 'Pyro'],
  [/水元素/, 'Hydro'],
  [/冰元素/, 'Cryo'],
  [/雷元素/, 'Electro'],
  [/风元素/, 'Anemo'],
  [/岩元素/, 'Geo'],
  [/草元素/, 'Dendro'],
  [/物理/, 'Physical'],
]

// Scaling stat overrides from labels.
const SCALING_FROM_LABEL = [
  [/生命值上限|HP上限|生命值/, 'hp'],
  [/防御力/, 'def'],
  [/元素精通/, 'em'],
  [/攻击力/, 'atk'],
]

function inferElement(description) {
  for (const [re, el] of ELEMENT_FROM_PROSE) {
    if (re.test(description)) return el
  }
  return null
}

function inferScaling(label) {
  for (const [re, s] of SCALING_FROM_LABEL) {
    if (re.test(label)) return s
  }
  return 'atk'
}

// Determine if a description row is a damage multiplier.
// Heuristic: label contains "伤害" / "DMG" / "Damage".
function isDamageLabel(label) {
  return /伤害|Damage|DMG/i.test(label)
}

// Parse "<label>|{param1:F1P}" → { label, paramIndices: [0] }
// Multi-param rows like "{param7:F1P}/{param8:F1P}" return multiple indices.
function parseRow(desc) {
  if (!desc || !desc.includes('|')) return null
  const [label, tail] = desc.split('|', 2)
  const indices = []
  let m
  TEMPLATE_RE.lastIndex = 0
  while ((m = TEMPLATE_RE.exec(tail))) {
    const n = parseInt(m[1], 10) - 1 // {param1} → params[0]
    const fmt = m[2]
    indices.push({ index: n, fmt })
  }
  return indices.length ? { label, indices } : null
}

function extractTalent(talentEntry, characterElement, talentRoleHint) {
  // Identify which is auto / skill / burst based on type + position handled by caller.
  const promote = talentEntry.promote || {}
  const levels = Object.keys(promote)
    .map((k) => parseInt(k, 10))
    .sort((a, b) => a - b)
  if (!levels.length) return null

  // Use lvl 1 row labels as the canonical layout — labels don't change across levels.
  const lvl1 = promote[String(levels[0])]
  const rows = (lvl1?.description ?? [])
    .map(parseRow)
    .filter(Boolean)

  const ourElement =
    inferElement(talentEntry.description ?? '') || characterElement

  // For each damage row, build a hit definition.
  const hits = []
  for (const row of rows) {
    if (!isDamageLabel(row.label)) continue
    const scaling = inferScaling(row.label)
    for (const { index, fmt } of row.indices) {
      // Skip param indices that are flat / integer markers (rare for damage rows)
      if (!/P/.test(fmt)) continue
      hits.push({
        label: row.label,
        paramIndex: index,
        scaling,
        element: ourElement,
        hitType: talentRoleHint,
      })
    }
  }

  // Build the per-level multiplier table for the params we care about.
  const usedIndices = [...new Set(hits.map((h) => h.paramIndex))].sort((a, b) => a - b)
  const multByLevel = {}
  for (const lvl of levels) {
    const params = promote[String(lvl)]?.params ?? []
    multByLevel[lvl] = Object.fromEntries(
      usedIndices.map((i) => [i, params[i] ?? null]),
    )
  }

  return {
    name: talentEntry.name,
    skillId: talentEntry.skillId,
    type: talentEntry.type,
    role: talentRoleHint,
    cooldown: talentEntry.cooldown ?? null,
    cost: talentEntry.cost ?? null,
    levels,
    hits,
    multByLevel,
  }
}

function classifyTalents(talent) {
  // Genshin convention: talents map to roles by ambr's position + type field.
  // type=0 holds auto+skill (two of them); type=1 holds burst.
  // We use first type=0 → auto, second type=0 → skill, type=1 → burst.
  const entries = Object.entries(talent).map(([k, t]) => ({ k, t }))
  const autoIdx = entries.findIndex((e) => e.t.type === 0)
  const skillIdx = entries.findIndex(
    (e, i) => e.t.type === 0 && i > autoIdx,
  )
  const burstIdx = entries.findIndex((e) => e.t.type === 1)
  return {
    auto: autoIdx >= 0 ? entries[autoIdx] : null,
    skill: skillIdx >= 0 ? entries[skillIdx] : null,
    burst: burstIdx >= 0 ? entries[burstIdx] : null,
  }
}

function extractAscensionStat(promote) {
  // The last promote stage's addProps contains the final values. The "special"
  // (non-base) prop is the ascension stat.
  const last = promote[promote.length - 1]
  if (!last?.addProps) return null
  const baseKeys = new Set(['FIGHT_PROP_BASE_HP', 'FIGHT_PROP_BASE_ATTACK', 'FIGHT_PROP_BASE_DEFENSE'])
  for (const [k, v] of Object.entries(last.addProps)) {
    if (!baseKeys.has(k)) return { propType: k, value: v }
  }
  return null
}

function extractCharacter(detail) {
  const { id, name, rank, element, weaponType, specialProp, icon } = detail
  const upgrade = detail.upgrade || {}
  const curve = (upgrade.prop || []).reduce((acc, p) => {
    acc[p.propType] = { initValue: p.initValue, curve: p.type }
    return acc
  }, {})
  const promote = upgrade.promote || []
  const ascensionStat = extractAscensionStat(promote)
  const ascensionStages = promote.map((p) => ({
    stage: p.promoteLevel,
    unlockMaxLevel: p.unlockMaxLevel,
    addProps: p.addProps ?? {},
  }))

  const cls = classifyTalents(detail.talent || {})
  const talents = {}
  if (cls.auto) {
    talents.auto = extractTalent(cls.auto.t, element, 'normal')
  }
  if (cls.skill) {
    talents.skill = extractTalent(cls.skill.t, element, 'skill')
  }
  if (cls.burst) {
    talents.burst = extractTalent(cls.burst.t, element, 'burst')
  }

  return {
    id,
    name,
    rank,
    element,
    weaponType,
    specialProp,
    icon,
    curve,
    ascensionStat,
    ascensionStages,
    talents,
  }
}

async function main() {
  const all = JSON.parse(await readFile(IN, 'utf8'))
  await mkdir(OUT_DIR, { recursive: true })

  const ids = Object.keys(all)
  let ok = 0
  let withAllThree = 0
  for (const id of ids) {
    const meta = extractCharacter(all[id])
    const t = meta.talents
    if (t.auto && t.skill && t.burst) withAllThree++
    const allHits = [
      ...(t.auto?.hits ?? []),
      ...(t.skill?.hits ?? []),
      ...(t.burst?.hits ?? []),
    ]
    meta._stats = {
      autoHits: t.auto?.hits?.length ?? 0,
      skillHits: t.skill?.hits?.length ?? 0,
      burstHits: t.burst?.hits?.length ?? 0,
      totalHits: allHits.length,
    }
    await writeFile(
      resolve(OUT_DIR, `${id}.json`),
      JSON.stringify(meta, null, 0),
    )
    ok++
  }

  // Also write a meta-summary index for the UI to know which chars are extractable.
  const summary = {}
  for (const id of ids) {
    const meta = JSON.parse(
      await readFile(resolve(OUT_DIR, `${id}.json`), 'utf8'),
    )
    summary[id] = {
      id: meta.id,
      name: meta.name,
      stats: meta._stats,
      has: {
        auto: !!meta.talents.auto,
        skill: !!meta.talents.skill,
        burst: !!meta.talents.burst,
      },
    }
  }
  await writeFile(
    resolve(root, 'src', 'data', 'index', 'meta-summary.json'),
    JSON.stringify(summary, null, 0),
  )

  console.log(
    `extracted ${ok}/${ids.length} characters, ${withAllThree} have all three talent slots`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
