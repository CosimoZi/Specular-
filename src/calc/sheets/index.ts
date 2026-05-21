// Sheet registry — sheets are looked up by GO-style key (the same string the
// good-adapter produces from internal IDs).

import type { ArtifactSetSheet, CharacterSheet, WeaponSheet } from '../sheet-types'

import { Shenhe } from './Shenhe'
import { Linnea } from './Linnea'
import { CalamityQueller } from './CalamityQueller'
import { NoblesseOblige } from './NoblesseOblige'
import { BlizzardStrayer } from './BlizzardStrayer'
import { TenacityOfTheMillelith } from './TenacityOfTheMillelith'
import {
  GladiatorsFinale,
  EmblemOfSeveredFate,
  HeartOfDepth,
  CrimsonWitchOfFlames,
  ViridescentVenerer,
  ThunderingFury,
  ArchaicPetra,
  DeepwoodMemories,
  HuskOfOpulentDreams,
  ShimenawasReminiscence,
  VermillionHereafter,
  GoldenTroupe,
  MarechausseeHunter,
  PaleFlame,
  BloodstainedChivalry,
  DesertPavilionChronicle,
  GildedDreams,
  FlowerOfParadiseLost,
  NymphsDream,
  Lavawalker,
} from './artifact-sets-batch1'
import {
  StaffOfHoma,
  PrimordialJadeWingedSpear,
  SkywardSpine,
  EngulfingLightning,
  StaffOfTheScarletSands,
  DragonsBane,
  WhiteTassel,
  BlackTassel,
  Deathmatch,
  LithicSpear,
  VortexVanquisher,
} from './polearms-batch1'

export const characterSheets: Record<string, CharacterSheet> = {
  Shenhe,
  Linnea,
}

export const weaponSheets: Record<string, WeaponSheet> = {
  CalamityQueller,
  StaffOfHoma,
  PrimordialJadeWingedSpear,
  SkywardSpine,
  EngulfingLightning,
  StaffOfTheScarletSands,
  DragonsBane,
  WhiteTassel,
  BlackTassel,
  Deathmatch,
  LithicSpear,
  VortexVanquisher,
}

export const artifactSetSheets: Record<string, ArtifactSetSheet> = {
  NoblesseOblige,
  BlizzardStrayer,
  TenacityOfTheMillelith,
  GladiatorsFinale,
  EmblemOfSeveredFate,
  HeartOfDepth,
  CrimsonWitchOfFlames,
  ViridescentVenerer,
  ThunderingFury,
  ArchaicPetra,
  DeepwoodMemories,
  HuskOfOpulentDreams,
  ShimenawasReminiscence,
  VermillionHereafter,
  GoldenTroupe,
  MarechausseeHunter,
  PaleFlame,
  BloodstainedChivalry,
  DesertPavilionChronicle,
  GildedDreams,
  FlowerOfParadiseLost,
  NymphsDream,
  Lavawalker,
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
