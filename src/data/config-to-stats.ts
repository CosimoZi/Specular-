// Convert a CharacterConfig + character meta into the list of StatBags the
// damage engine consumes.

import type { CharacterConfig, ArtifactPiece } from './config-types'
import type { CharacterMeta } from './meta'
import type { StatBag } from '@/engine/types'
import { computeBaseStats, computeAscensionBonus } from './character-stats'
import { ascensionBonusToStatBag } from './meta'
import { artifactMainValue } from './artifact-tables'
import { fetchWeaponDetail } from '.'
import { weaponStatsAtL90, fightPropToStatBagKey } from './weapon-stats'

/** Map an artifact main stat to a StatBag entry. */
function artifactMainToBag(piece: ArtifactPiece): StatBag {
  const value = artifactMainValue(piece.mainStat, piece.rarity, piece.level)
  return { [piece.mainStat]: value } as StatBag
}

function artifactSubsToBag(piece: ArtifactPiece): StatBag {
  const bag: StatBag = {}
  for (const sub of piece.substats) {
    bag[sub.key] = (bag[sub.key] ?? 0) + sub.value
  }
  return bag
}

/** Build derivation result. */
export interface DerivedStatsInput {
  // Character base (as flat values for the engine)
  baseAtk: number
  baseHp: number
  baseDef: number
  // Ordered list of bonus bags applied on top
  bonusBags: StatBag[]
  // Element matching the character (for elemental DMG application)
  // — caller decides how to map per-element bonuses
}

/** Compute the StatBag list for a character's config.
 *  Returns base stats + ordered bonus bags.
 *
 *  If `config.importMode` is set, we BYPASS the per-piece derivation and use
 *  the snapshot final stats directly. This is the lightweight UID-import path.
 */
export async function deriveConfigStats(
  config: CharacterConfig,
  meta: CharacterMeta,
  characterElement: string,
): Promise<DerivedStatsInput> {
  if (config.importMode) {
    const im = config.importMode
    const elemKey = elementToBagKey(characterElement)
    const bonusBag: StatBag = {
      em: im.em,
      critRate: im.critRate / 100 - 0.05,
      critDmg: im.critDmg / 100 - 0.5,
      er: im.er / 100 - 1.0,
    }
    if (elemKey) (bonusBag as Record<string, number>)[elemKey] = im.elementBonus / 100
    return {
      baseAtk: im.finalAtk,
      baseHp: im.finalHp,
      baseDef: im.finalDef,
      bonusBags: [bonusBag],
    }
  }

  // 1) Character base
  const base = computeBaseStats(meta, config.level, config.ascensionStage)
  const ascensionBag = computeAscensionBonusBag(meta, config.ascensionStage)

  // 2) Weapon
  let weaponBag: StatBag = {}
  let weaponBaseAtk = 0
  if (config.weapon.weaponId !== null) {
    try {
      const detail = await fetchWeaponDetail(config.weapon.weaponId)
      const stats = weaponStatsAtL90(detail)
      weaponBaseAtk = stats.baseAtk
      if (stats.secondary) {
        const key = fightPropToStatBagKey(stats.secondary.propType)
        if (key) weaponBag = { [key]: stats.secondary.value } as StatBag
      }
    } catch {
      // weapon detail fetch failed — proceed with no weapon
    }
  }

  // 3) Artifacts (5 pieces, each with main + 4 subs)
  const artifactBags: StatBag[] = []
  for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const) {
    const piece = config.artifacts[slot]
    if (!piece) continue
    artifactBags.push(artifactMainToBag(piece))
    artifactBags.push(artifactSubsToBag(piece))
  }

  // 4) Set bonuses — derived from artifact slot counts
  const setCounts: Record<number, number> = {}
  for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const) {
    const piece = config.artifacts[slot]
    if (!piece) continue
    setCounts[piece.setId] = (setCounts[piece.setId] ?? 0) + 1
  }
  const setBonusBag = await deriveSetBonusBag(setCounts, characterElement)

  // 5) Custom buffs (enabled ones)
  const buffBags = (config.customBuffs ?? [])
    .filter((b) => b.enabled)
    .map((b) => b.bag as StatBag)

  return {
    baseAtk: base.atk + weaponBaseAtk,
    baseHp: base.hp,
    baseDef: base.def,
    bonusBags: [
      ascensionBag,
      weaponBag,
      ...artifactBags,
      setBonusBag,
      ...buffBags,
    ],
  }
}

function computeAscensionBonusBag(
  meta: CharacterMeta,
  stage: number,
): StatBag {
  return computeAscensionBonus(meta, stage)
}

function elementToBagKey(element: string): string | null {
  const m: Record<string, string> = {
    Pyro: 'pyroDmg', Fire: 'pyroDmg',
    Hydro: 'hydroDmg', Water: 'hydroDmg',
    Cryo: 'cryoDmg', Ice: 'cryoDmg',
    Electric: 'electroDmg', Electro: 'electroDmg',
    Anemo: 'anemoDmg', Wind: 'anemoDmg',
    Geo: 'geoDmg', Rock: 'geoDmg',
    Grass: 'dendroDmg', Dendro: 'dendroDmg',
  }
  return m[element] ?? null
}

// Re-export so callers can use the same fn
export { ascensionBonusToStatBag }

// --- Set bonus derivation -------------------------------------------------
//
// We pull each set's `affixList` from public/data/artifacts/<id>.json and
// parse the description for the most common numeric effects (X% Y).
// Coverage is rough — for v1 we just apply the simplest 2pc bonuses:
//   - "+X% HP"  → hpPct += X
//   - "+X% ATK" → atkPct += X
//   - "+X% DEF" → defPct += X
//   - "+X% <element> DMG" → element-matched dmg += X
//   - "+X EM"   → em += X
//   - "+X% ER"  → er += X
// The 4pc effects are usually conditional (on E hit, when off-field, etc.)
// and are NOT auto-applied — users layer them in via customBuffs.

import { fetchArtifactDetail } from '.'

const PCT_RE = (kw: RegExp) => new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%[^。\\n]*?${kw.source}|${kw.source}[^。\\n]*?(\\d+(?:\\.\\d+)?)\\s*%`)

async function deriveSetBonusBag(
  setCounts: Record<number, number>,
  characterElement: string,
): Promise<StatBag> {
  const bag: StatBag = {}
  for (const [idStr, count] of Object.entries(setCounts)) {
    if (count < 2) continue
    try {
      const detail = await fetchArtifactDetail(idStr)
      const affixes = (detail as unknown as { affixList?: Array<{ name?: string; description?: string; needCount?: number }> })
        .affixList ?? []
      // 2pc bonus
      const twoPc = affixes.find((a) => (a.needCount ?? 2) === 2)
      if (twoPc?.description) parsePctEffect(twoPc.description, bag, characterElement)
    } catch {
      // Ignore set-detail load failures.
    }
  }
  return bag
}

function parsePctEffect(desc: string, bag: StatBag, element: string): void {
  // Strip color tags
  const text = desc.replace(/<color[^>]*>/g, '').replace(/<\/color>/g, '')
  // Look for "+X% Y" or "Y +X%" patterns
  const patterns: Array<[RegExp, keyof StatBag]> = [
    [PCT_RE(/生命值/), 'hpPct'],
    [PCT_RE(/攻击力/), 'atkPct'],
    [PCT_RE(/防御力/), 'defPct'],
    [PCT_RE(/充能效率/), 'er'],
    [PCT_RE(/暴击率/), 'critRate'],
    [PCT_RE(/暴击伤害/), 'critDmg'],
    [PCT_RE(/治疗加成/), 'healingBonus'],
  ]
  for (const [re, key] of patterns) {
    const m = re.exec(text)
    if (m) {
      const val = parseFloat(m[1] ?? m[2] ?? '0') / 100
      bag[key] = (bag[key] ?? 0) + val
    }
  }
  // EM is flat
  const emRe = /(\d+(?:\.\d+)?)\s*点[^。\n]*?元素精通|元素精通[^。\n]*?(\d+(?:\.\d+)?)\s*点/
  const m = emRe.exec(text)
  if (m) {
    const val = parseFloat(m[1] ?? m[2] ?? '0')
    bag.em = (bag.em ?? 0) + val
  }
  // Element-matched DMG
  const elemMap: Record<string, [RegExp, keyof StatBag]> = {
    Pyro: [PCT_RE(/火元素伤害/), 'pyroDmg'],
    Fire: [PCT_RE(/火元素伤害/), 'pyroDmg'],
    Hydro: [PCT_RE(/水元素伤害/), 'hydroDmg'],
    Water: [PCT_RE(/水元素伤害/), 'hydroDmg'],
    Cryo: [PCT_RE(/冰元素伤害/), 'cryoDmg'],
    Ice: [PCT_RE(/冰元素伤害/), 'cryoDmg'],
    Electric: [PCT_RE(/雷元素伤害/), 'electroDmg'],
    Electro: [PCT_RE(/雷元素伤害/), 'electroDmg'],
    Anemo: [PCT_RE(/风元素伤害/), 'anemoDmg'],
    Wind: [PCT_RE(/风元素伤害/), 'anemoDmg'],
    Geo: [PCT_RE(/岩元素伤害/), 'geoDmg'],
    Rock: [PCT_RE(/岩元素伤害/), 'geoDmg'],
    Grass: [PCT_RE(/草元素伤害/), 'dendroDmg'],
    Dendro: [PCT_RE(/草元素伤害/), 'dendroDmg'],
  }
  const elemEntry = elemMap[element]
  if (elemEntry) {
    const [re, key] = elemEntry
    const m2 = re.exec(text)
    if (m2) {
      const val = parseFloat(m2[1] ?? m2[2] ?? '0') / 100
      bag[key] = (bag[key] ?? 0) + val
    }
  }
}
