// Bridge from our CharacterConfig to GenshinOptimizer's Pando calculator.
//
// PoC: Mona only, no weapon/artifact integration yet. We feed bare-minimum char
// data and read out the damage formulas for verification.

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
  // TODO: fill in for the rest of the 12 UID chars and beyond
}

export interface MonaPoCConfig {
  level: number // 1..90
  ascension: number // 0..6
  constellation: number // 0..6
  talents: { auto: number; skill: number; burst: number }
}

/** Compute Mona's listed damage formulas via GO's Pando engine. Returns the
 *  formula name → expected-damage map. */
export function computeMonaPoc(cfg: MonaPoCConfig): Record<string, number> {
  const char: ICharacter = {
    key: 'Mona' as unknown as ICharacter['key'],
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
  const calc = genshinCalculatorWithEntries(data)
  const mem = calc.withTag({ src: '0' })

  const formulas = mem.listFormulas(own.listing.formulas)
  const out: Record<string, number> = {}
  for (const f of formulas) {
    const tag = (f as unknown as { tag: { name?: string; q?: string } }).tag
    const name = String(tag?.name ?? tag?.q ?? 'unnamed')
    try {
      // listFormulas returns Read<Tag_>[] — each entry is itself the NumNode
      // to compute. (Not { formula, tag }; the Read IS the formula.)
      const val = mem.compute(f as unknown as Parameters<typeof mem.compute>[0]).val
      if (typeof val === 'number') out[name] = val
    } catch (e) {
      console.log(`[Mona PoC] error computing ${name}:`, (e as Error).message)
    }
  }
  return out
}
