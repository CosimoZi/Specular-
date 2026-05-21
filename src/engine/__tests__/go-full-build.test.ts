// Verify GO Pando works with a complete character config including weapon
// and artifacts — mimics what UID import produces.
import { describe, it, expect } from 'vitest'
import { computeViaGo } from '../../integration/go-calc'
import { defaultConfig, type ArtifactPiece } from '@/data/config-types'

describe('GO Pando — full character build', () => {
  it('Ayaka (神里绫华) with 5* CR weapon + crit cup typical build', () => {
    const config = {
      ...defaultConfig(10000002), // Ayaka
      constellation: 0,
      // 雾切 (Mistsplitter Reforged) id 11509 — Ayaka's signature 5* sword
      weapon: { weaponId: 11509, level: 90, ascensionStage: 6, refinement: 1 },
      artifacts: {
        flower: {
          setId: 15031, // 冰风 (Blizzard Strayer) 4pc
          slot: 'flower',
          rarity: 5,
          level: 20,
          mainStat: 'hpFlat',
          substats: [
            { key: 'critRate', value: 0.078 },
            { key: 'critDmg', value: 0.062 },
            { key: 'atkPct', value: 0.152 },
            { key: 'em', value: 16 },
          ],
        } as ArtifactPiece,
        plume: {
          setId: 15031,
          slot: 'plume',
          rarity: 5,
          level: 20,
          mainStat: 'atkFlat',
          substats: [
            { key: 'critRate', value: 0.07 },
            { key: 'critDmg', value: 0.194 },
            { key: 'hpFlat', value: 239 },
            { key: 'er', value: 0.117 },
          ],
        } as ArtifactPiece,
        sands: {
          setId: 15031,
          slot: 'sands',
          rarity: 5,
          level: 20,
          mainStat: 'atkPct',
          substats: [
            { key: 'critRate', value: 0.101 },
            { key: 'critDmg', value: 0.202 },
            { key: 'er', value: 0.058 },
            { key: 'defFlat', value: 44 },
          ],
        } as ArtifactPiece,
        goblet: {
          setId: 15031,
          slot: 'goblet',
          rarity: 5,
          level: 20,
          mainStat: 'cryoDmg', // 冰元素伤害杯
          substats: [
            { key: 'critDmg', value: 0.21 },
            { key: 'critRate', value: 0.062 },
            { key: 'defPct', value: 0.124 },
            { key: 'atkPct', value: 0.099 },
          ],
        } as ArtifactPiece,
        circlet: {
          setId: 15022, // 苍白之火 — 2pc only
          slot: 'circlet',
          rarity: 5,
          level: 20,
          mainStat: 'critDmg',
          substats: [
            { key: 'defPct', value: 0.117 },
            { key: 'critRate', value: 0.101 },
            { key: 'atkPct', value: 0.117 },
            { key: 'er', value: 0.065 },
          ],
        } as ArtifactPiece,
      },
      talentLevels: { auto: 10, skill: 10, burst: 10 },
      lastModified: Date.now(),
    }

    const out = computeViaGo(config)
    expect(out).not.toBeNull()
    // GO uses full English names: "Kamisato Ayaka" → "KamisatoAyaka"
    expect(out!.goKey).toBe('KamisatoAyaka')
    expect(out!.fed.weapon).toBe(true)
    expect(out!.fed.artifacts).toBe(5)

    console.log('=== Ayaka with full build, via GO Pando ===')
    console.log(`Computed ${Object.keys(out!.values).length} formulas`)
    const sortedKeys = Object.keys(out!.values).sort()
    for (const k of sortedKeys) {
      const v = out!.values[k]
      console.log(`  ${k.padEnd(40)} ${v < 10 ? v.toFixed(4) : Math.round(v).toLocaleString()}`)
    }

    // Sanity (using actual key names GO returns):
    expect(out!.values.atk).toBeGreaterThan(2000) // typical built Ayaka 2000+ ATK
    expect(out!.values.hp).toBeGreaterThan(15000)
    // critRate is exposed as cappedCritRate_ (clamped 0..1)
    // critDMG and cryo_dmg_ may not surface in listFormulas if no formula uses them;
    // we'll check the damage formula values instead.
    expect(out!.values.normal1).toBeGreaterThan(1000) // N1 has positive damage
  })
})
