// Sheet registry — sheets are looked up by GO-style key (the same string the
// good-adapter produces from internal IDs).

import type { ArtifactSetSheet, CharacterSheet, WeaponSheet } from '../sheet-types'

import { Shenhe } from './Shenhe'
import { CalamityQueller } from './CalamityQueller'
import { NoblesseOblige } from './NoblesseOblige'
import { BlizzardStrayer } from './BlizzardStrayer'
import { TenacityOfTheMillelith } from './TenacityOfTheMillelith'

export const characterSheets: Record<string, CharacterSheet> = {
  Shenhe,
}

export const weaponSheets: Record<string, WeaponSheet> = {
  CalamityQueller,
}

export const artifactSetSheets: Record<string, ArtifactSetSheet> = {
  NoblesseOblige,
  BlizzardStrayer,
  TenacityOfTheMillelith,
}

/** UI surface — what conds does this sheet expose? */
export function condsFor(sheetKey: string) {
  return (
    characterSheets[sheetKey]?.conds ??
    weaponSheets[sheetKey]?.conds ??
    artifactSetSheets[sheetKey]?.conds ??
    []
  )
}
