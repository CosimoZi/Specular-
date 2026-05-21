// Bridge from our CharacterConfig to GenshinOptimizer's Pando calculator.
// Feeds full equipment (character + weapon + 5 artifacts) so damage numbers
// are real, not just panel-baseline.

import type { ICharacter, IWeapon, IArtifact } from '@genshin-optimizer/gi/good'
import {
  charData,
  teamData,
  withMember,
  ownBuff,
  enemyDebuff,
  own,
  weaponData,
  artifactsData,
  type TagMapNodeEntries,
  genshinCalculatorWithEntries,
} from '@genshin-optimizer/gi/formula'
import type { CharacterConfig } from '@/data/config-types'
import {
  configToGoCharacter,
  weaponConfigToGoWeapon,
  artifactPieceToGoArtifact,
  goCharacterKey,
} from './good-adapter'

/** Returns the GO character key (e.g. "Mona", "TravelerAnemo") if we have a
 *  mapping for the given internal id; null if unmapped (e.g. brand-new 5.x
 *  characters not yet in GO sheets). */
export function getGoKey(characterId: number | string): string | null {
  return goCharacterKey(characterId)
}

export interface GoComputeResult {
  goKey: string
  /** Whether weapon/artifact data was fed (vs panel-only). */
  fed: { weapon: boolean; artifacts: number }
  /** Map of formula tag name → computed value. */
  values: Record<string, number>
}

/** Compute via GO Pando with the character's full equipment.
 *  Returns null if character isn't in GO sheets. */
export function computeViaGo(config: CharacterConfig): GoComputeResult | null {
  const goChar = configToGoCharacter(config)
  if (!goChar) return null

  const goWep = weaponConfigToGoWeapon(config.weapon, goChar.key)

  const goArts: IArtifact[] = []
  for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const) {
    const piece = config.artifacts[slot]
    if (!piece) continue
    const art = artifactPieceToGoArtifact(piece, goChar.key)
    if (art) goArts.push(art as unknown as IArtifact)
  }

  const memberEntries: TagMapNodeEntries = [
    ...charData(goChar as unknown as ICharacter),
  ]
  if (goWep) memberEntries.push(...weaponData(goWep as unknown as IWeapon))
  if (goArts.length > 0) memberEntries.push(...artifactsData(goArts))

  const data: TagMapNodeEntries = [
    ...teamData(['0']),
    ...withMember('0', ...memberEntries),
    enemyDebuff.common.lvl.add(100),
    enemyDebuff.common.preRes.add(0.1),
    ownBuff.common.critMode.add('avg'),
  ]

  let calc
  try {
    calc = genshinCalculatorWithEntries(data)
  } catch (e) {
    console.warn(`[Specular] GO calc init failed for ${goChar.key}:`, (e as Error).message)
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
      if (typeof val === 'number' && Number.isFinite(val)) values[name] = val
    } catch {
      // Some formulas need conditional buffs we haven't set — skip silently
    }
  }
  return {
    goKey: goChar.key,
    fed: { weapon: !!goWep, artifacts: goArts.length },
    values,
  }
}
