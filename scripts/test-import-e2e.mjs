// End-to-end test: simulate UidImport.tsx parsing.
import { readFile } from 'node:fs/promises'

const SLOT_FROM_EQUIP = {
  EQUIP_BRACER: 'flower', EQUIP_NECKLACE: 'plume', EQUIP_SHOES: 'sands',
  EQUIP_RING: 'goblet', EQUIP_DRESS: 'circlet',
}

function statKeyFromFightProp(prop) {
  const m = {
    FIGHT_PROP_HP: ['hpFlat', false], FIGHT_PROP_ATTACK: ['atkFlat', false],
    FIGHT_PROP_DEFENSE: ['defFlat', false],
    FIGHT_PROP_HP_PERCENT: ['hpPct', true], FIGHT_PROP_ATTACK_PERCENT: ['atkPct', true],
    FIGHT_PROP_DEFENSE_PERCENT: ['defPct', true], FIGHT_PROP_ELEMENT_MASTERY: ['em', false],
    FIGHT_PROP_CHARGE_EFFICIENCY: ['er', true],
    FIGHT_PROP_CRITICAL: ['critRate', true], FIGHT_PROP_CRITICAL_HURT: ['critDmg', true],
    FIGHT_PROP_HEAL_ADD: ['healingBonus', true],
    FIGHT_PROP_FIRE_ADD_HURT: ['pyroDmg', true], FIGHT_PROP_WATER_ADD_HURT: ['hydroDmg', true],
    FIGHT_PROP_ICE_ADD_HURT: ['cryoDmg', true], FIGHT_PROP_ELEC_ADD_HURT: ['electroDmg', true],
    FIGHT_PROP_WIND_ADD_HURT: ['anemoDmg', true], FIGHT_PROP_ROCK_ADD_HURT: ['geoDmg', true],
    FIGHT_PROP_GRASS_ADD_HURT: ['dendroDmg', true], FIGHT_PROP_PHYSICAL_ADD_HURT: ['physicalDmg', true],
  }
  if (!m[prop]) return null
  return { key: m[prop][0], isPercent: m[prop][1] }
}

function parseAvatar(raw) {
  const aid = raw.avatarId
  if (!aid) return null
  const pm = raw.propMap || {}, fp = raw.fightPropMap || {}
  const skill = raw.skillLevelMap || {}, tid = raw.talentIdList || []
  const eq = raw.equipList || []
  const level = parseInt(pm['4001']?.val || '1', 10)
  const asc = parseInt(pm['1002']?.val || '0', 10)
  // FIX: take last 3 skills by numeric id (drops sprint at lowest id)
  const skillIdsAsc = Object.keys(skill).map(Number).sort((a, b) => a - b).map(String)
  const last3 = skillIdsAsc.slice(-3)
  const t = {
    auto: last3[0] != null ? skill[last3[0]] : 1,
    skill: last3[1] != null ? skill[last3[1]] : 1,
    burst: last3[2] != null ? skill[last3[2]] : 1,
  }
  let weapon = { weaponId: null, level: 90, refinement: 1 }
  const artifacts = {}
  for (const e of eq) {
    const flat = e.flat
    if (!flat) continue
    if (flat.itemType === 'ITEM_WEAPON') {
      const w = e.weapon || {}
      const refinement = w.affixMap ? Math.max(...Object.values(w.affixMap)) + 1 : 1
      weapon = { weaponId: e.itemId, level: w.level || 1, refinement }
    } else if (flat.itemType === 'ITEM_RELIQUARY') {
      const slot = SLOT_FROM_EQUIP[flat.equipType]
      if (!slot) continue
      const ms = flat.reliquaryMainstat
      if (!ms) continue
      const mainInfo = statKeyFromFightProp(ms.mainPropId)
      if (!mainInfo) continue
      const subs = (flat.reliquarySubstats || []).map((s) => {
        const i = statKeyFromFightProp(s.appendPropId)
        if (!i) return null
        return { key: i.key, value: i.isPercent ? s.statValue / 100 : s.statValue }
      }).filter(Boolean)
      artifacts[slot] = {
        setId: flat.setId,
        slot, rarity: flat.rankLevel,
        level: e.reliquary?.level ? e.reliquary.level - 1 : 0,
        mainStat: mainInfo.key,
        substats: subs,
      }
    }
  }
  return {
    characterId: aid, level, ascensionStage: asc, constellation: tid.length,
    talentLevels: t, weapon, artifacts,
    finalAtk: fp['2001'] || 0, finalHp: fp['2000'] || 0, finalDef: fp['2002'] || 0,
  }
}

async function main() {
  const raw = JSON.parse(await readFile('/tmp/uid.json', 'utf8'))
  const ambr = JSON.parse(await readFile('/home/cosimo/specular/src/data/index/characters.json', 'utf8')).items
  const idMap = JSON.parse(await readFile('/home/cosimo/specular/src/integration/go-id-map.json', 'utf8'))

  console.log(`Player: ${raw.playerInfo.nickname} | AR ${raw.playerInfo.level} | ${raw.avatarInfoList.length} chars\n`)

  for (const a of raw.avatarInfoList) {
    const p = parseAvatar(a)
    const name = ambr[String(p.characterId)]?.name || `?${p.characterId}`
    const goKey = idMap.map.characters[String(p.characterId)] ?? '—'
    const wOk = p.weapon.weaponId && idMap.map.weapons[String(p.weapon.weaponId)]
    const artUnmapped = Object.values(p.artifacts).filter((pp) => !idMap.map.artifacts[String(pp.setId)]).length

    console.log(`${name.padEnd(8)} (GO=${goKey}) Lv${p.level}/asc${p.ascensionStage} C${p.constellation}`)
    console.log(`    talents=${p.talentLevels.auto}/${p.talentLevels.skill}/${p.talentLevels.burst} (was buggy before fix)`)
    console.log(`    weapon ${p.weapon.weaponId}${wOk ? ' ✓' : ' ⚠ unmapped'} L${p.weapon.level} R${p.weapon.refinement}`)
    console.log(`    artifacts ${Object.keys(p.artifacts).length}/5 ${artUnmapped > 0 ? `(${artUnmapped} sets unmapped ⚠)` : '✓'}`)
    console.log(`    real: ATK=${Math.round(p.finalAtk)} HP=${Math.round(p.finalHp)} DEF=${Math.round(p.finalDef)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
