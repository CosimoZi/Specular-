// Validate our Enka parser against a real UID's response. Run with:
//   node scripts/test-uid-parse.mjs
//
// Reports per-character: what we parsed, what's missing, sanity checks.

import { readFile } from 'node:fs/promises'

// --- inline copy of the parser's logic (kept in sync with src/data/uid-import.ts) ---
const FP = {
  BASE_HP: 1, ATTACK: 4, DEFENSE: 7,
  CRIT_RATE: 20, CRIT_DMG: 22, ENERGY_RECHARGE: 23,
  HEALING_BONUS: 26, ELEMENT_MASTERY: 28, PHYSICAL_DMG: 30,
  PYRO_DMG: 40, ELECTRO_DMG: 41, HYDRO_DMG: 42, DENDRO_DMG: 43,
  ANEMO_DMG: 44, GEO_DMG: 45, CRYO_DMG: 46,
  CUR_HP_MAX: 2000, CUR_ATTACK: 2001, CUR_DEFENSE: 2002,
}

function n(map, key, fallback = 0) {
  if (!map) return fallback
  return map[String(key)] ?? fallback
}

function ascensionFromLevel(level) {
  if (level <= 20) return 0
  if (level <= 40) return 1
  if (level <= 50) return 2
  if (level <= 60) return 3
  if (level <= 70) return 4
  if (level <= 80) return 5
  return 6
}

function parseAvatarV1(raw) {
  // === EXACT COPY of current parser logic ===
  const avatarId = raw.avatarId
  if (!avatarId) return null
  const propMap = raw.propMap
  const fightPropMap = raw.fightPropMap
  const skillLevelMap = (raw.skillLevelMap || {}).skillLevelMap   // <-- BUG: real shape may be flat
  const levelStr = propMap?.['4001']?.val ?? '1'
  const ascensionStr = propMap?.['1002']?.val ?? '0'
  const level = parseInt(levelStr, 10) || 1
  const ascensionStage = parseInt(ascensionStr, 10) || ascensionFromLevel(level)
  const skillIds = skillLevelMap ? Object.keys(skillLevelMap).sort() : []
  const talentLevels = {
    auto: skillIds[0] ? skillLevelMap[skillIds[0]] : 1,
    skill: skillIds[1] ? skillLevelMap[skillIds[1]] : 1,
    burst: skillIds[2] ? skillLevelMap[skillIds[2]] : 1,
  }
  return {
    characterId: avatarId, level, ascensionStage,
    finalAtk: n(fightPropMap, FP.CUR_ATTACK),
    talentLevels,
    constellation: 'NOT_PARSED',  // <-- BUG: missing
  }
}

// --- V2: corrected parser ---
function parseAvatarV2(raw) {
  const avatarId = raw.avatarId
  if (!avatarId) return null
  const propMap = raw.propMap
  const fightPropMap = raw.fightPropMap

  // skillLevelMap in Enka response IS the flat dict, not wrapped
  const skillLevelMap = raw.skillLevelMap || {}
  // Skill order in Enka follows definition: auto/skill/(maybe alternate sprint)/burst
  // skillDepotId data tells us the order. For most chars: 3 entries in order
  // For travelers there are sometimes more
  const skillIds = Object.keys(skillLevelMap).sort()
  const talentLevels = {
    auto: skillIds[0] ? skillLevelMap[skillIds[0]] : 1,
    skill: skillIds[1] ? skillLevelMap[skillIds[1]] : 1,
    burst: skillIds[skillIds.length - 1] ? skillLevelMap[skillIds[skillIds.length - 1]] : 1,
  }

  // talentIdList length = unlocked constellation count
  const talentIdList = raw.talentIdList || []
  const constellation = talentIdList.length

  const levelStr = propMap?.['4001']?.val ?? '1'
  const ascensionStr = propMap?.['1002']?.val ?? '0'
  const level = parseInt(levelStr, 10) || 1
  const ascensionStage = parseInt(ascensionStr, 10) || ascensionFromLevel(level)

  // Equipment parse
  const equips = raw.equipList || []
  const weapon = equips.find((e) => e.flat?.itemType === 'ITEM_WEAPON')
  const artifacts = equips.filter((e) => e.flat?.itemType === 'ITEM_RELIQUARY')

  return {
    characterId: avatarId,
    level, ascensionStage, constellation,
    talentLevels,
    skillCount: skillIds.length,
    finalAtk: n(fightPropMap, FP.CUR_ATTACK),
    finalHp: n(fightPropMap, FP.CUR_HP_MAX),
    finalDef: n(fightPropMap, FP.CUR_DEFENSE),
    em: n(fightPropMap, FP.ELEMENT_MASTERY),
    critRate: n(fightPropMap, FP.CRIT_RATE) * 100,
    critDmg: n(fightPropMap, FP.CRIT_DMG) * 100,
    er: n(fightPropMap, FP.ENERGY_RECHARGE) * 100,
    weaponId: weapon?.itemId,
    weaponLevel: weapon?.weapon?.level,
    weaponRefinement: weapon?.weapon?.affixMap ? Math.max(...Object.values(weapon.weapon.affixMap)) + 1 : 1,
    weaponBaseAtk: weapon?.flat?.weaponStats?.find((s) => s.appendPropId === 'FIGHT_PROP_BASE_ATTACK')?.statValue,
    weaponSecondary: weapon?.flat?.weaponStats?.find((s) => s.appendPropId !== 'FIGHT_PROP_BASE_ATTACK'),
    artifactCount: artifacts.length,
    artifactSets: [...new Set(artifacts.map((a) => a.flat?.setNameTextMapHash))].filter(Boolean),
    artifactPieces: artifacts.map((a) => ({
      slot: a.flat?.equipType,
      rarity: a.flat?.rankLevel,
      level: a.reliquary?.level ? a.reliquary.level - 1 : 0, // Enka stores level+1
      mainStat: a.flat?.reliquaryMainstat,
      subStats: a.flat?.reliquarySubstats,
      setHash: a.flat?.setNameTextMapHash,
    })),
  }
}

async function main() {
  // Load the real response we fetched earlier
  const raw = JSON.parse(await readFile('/tmp/uid.json', 'utf8'))
  const ambr = JSON.parse(await readFile('/home/cosimo/specular/src/data/index/characters.json', 'utf8')).items

  console.log('=== Player ===')
  console.log(`  ${raw.playerInfo.nickname} (AR ${raw.playerInfo.level}, WL ${raw.playerInfo.worldLevel})`)
  console.log(`  Showcased: ${raw.avatarInfoList?.length ?? 0}`)
  console.log()

  for (const a of raw.avatarInfoList || []) {
    const v1 = parseAvatarV1(a)
    const v2 = parseAvatarV2(a)
    const name = ambr[String(a.avatarId)]?.name || `?${a.avatarId}`
    console.log(`--- ${name} (id ${a.avatarId}) ---`)
    console.log(`  V1 (current parser):`)
    console.log(`    talent levels: auto=${v1.talentLevels.auto} skill=${v1.talentLevels.skill} burst=${v1.talentLevels.burst} <-- ${v1.talentLevels.auto === 1 && v1.talentLevels.skill === 1 ? '⚠ all 1 (broken)' : 'ok'}`)
    console.log(`    constellation: ${v1.constellation}`)
    console.log(`  V2 (fixed parser):`)
    console.log(`    talent levels: auto=${v2.talentLevels.auto} skill=${v2.talentLevels.skill} burst=${v2.talentLevels.burst} (${v2.skillCount} skills total)`)
    console.log(`    constellation: C${v2.constellation}`)
    console.log(`    lvl/asc: ${v2.level}/${v2.ascensionStage}`)
    console.log(`    finalATK: ${Math.round(v2.finalAtk)}`)
    console.log(`    weapon: id=${v2.weaponId} L${v2.weaponLevel} R${v2.weaponRefinement} baseATK=${v2.weaponBaseAtk}`)
    console.log(`    artifacts: ${v2.artifactCount} pieces, sets=${v2.artifactSets.length}`)
    console.log()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
