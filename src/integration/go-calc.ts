// Bridge from our CharacterConfig to GenshinOptimizer's Pando calculator.

import type { ICharacter } from '@genshin-optimizer/gi/good'
import {
  charData,
  teamData,
  withMember,
  ownBuff,
  enemyDebuff,
  own,
  type TagMapNodeEntries,
  genshinCalculatorWithEntries,
} from '@genshin-optimizer/gi/formula'

/** Map our numeric character id → GO's CharacterKey string. Hand-maintained;
 *  expand as we add more characters. */
export const ID_TO_GO_KEY: Record<string, string> = {
  '10000041': 'Mona',
  '10000002': 'Ayaka',          // 神里绫华
  '10000063': 'Shenhe',         // 申鹤
  '10000054': 'SangonomiyaKokomi', // 珊瑚宫心海
  '10000058': 'YaeMiko',        // 八重神子
  '10000073': 'Nahida',         // 纳西妲
  '10000089': 'Furina',         // 芙宁娜
  // TODO: rest of UID 12 (瓦雷莎、法尔伽、爱可菲、莉奈娅、兹白、哥伦比娅 — newer chars may not be in GO yet)
}

export interface GoCalcConfig {
  level: number // 1..90
  ascension: number // 0..6
  constellation: number // 0..6
  talents: { auto: number; skill: number; burst: number }
}

/** Compute GO-Pando damage / panel values for the given character. Returns
 *  formula-name → value (e.g. `hp`, `atk`, `def`, `em`, `critRate_`,
 *  `critDMG_`, plus reaction zones). Returns null if character has no GO key
 *  mapping (i.e. we haven't whitelisted it yet). */
export function computeViaGo(
  characterId: number | string,
  cfg: GoCalcConfig,
): { goKey: string; values: Record<string, number> } | null {
  const goKey = ID_TO_GO_KEY[String(characterId)]
  if (!goKey) return null

  const char: ICharacter = {
    key: goKey as unknown as ICharacter['key'],
    level: cfg.level,
    ascension: cfg.ascension,
    constellation: cfg.constellation,
    talent: {
      auto: Math.max(0, cfg.talents.auto - 1), // GO talent = display lvl - 1
      skill: Math.max(0, cfg.talents.skill - 1),
      burst: Math.max(0, cfg.talents.burst - 1),
    },
  } as ICharacter

  const data: TagMapNodeEntries = [
    ...teamData(['0']),
    ...withMember('0', ...charData(char)),
    enemyDebuff.common.lvl.add(100),
    enemyDebuff.common.preRes.add(0.1),
    ownBuff.common.critMode.add('avg'),
  ]
  let calc
  try {
    calc = genshinCalculatorWithEntries(data)
  } catch (e) {
    console.warn(`[Specular] GO calc init failed for ${goKey}:`, (e as Error).message)
    return null
  }
  const mem = calc.withTag({ src: '0' })

  const formulas = mem.listFormulas(own.listing.formulas)
  const values: Record<string, number> = {}
  for (const f of formulas) {
    const tag = (f as unknown as { tag: { name?: string; q?: string } }).tag
    const name = String(tag?.name ?? tag?.q ?? 'unnamed')
    try {
      const val = mem.compute(f as unknown as Parameters<typeof mem.compute>[0]).val
      if (typeof val === 'number') values[name] = val
    } catch {
      // Skip formulas that need weapon/artifacts (will work once we feed them)
    }
  }
  return { goKey, values }
}

/** Legacy alias for the Mona-specific test. */
export function computeMonaPoc(cfg: GoCalcConfig): Record<string, number> {
  return computeViaGo(10000041, cfg)?.values ?? {}
}
