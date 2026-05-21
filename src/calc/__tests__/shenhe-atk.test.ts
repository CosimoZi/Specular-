// Shenhe panel ATK — end-to-end via new src/calc/ pipeline.
//
// Verifies every contribution lines up with the analytic formula the user
// gave us: final.atk = (char_base + weapon_white) × (1 + atk_%) + atk_flat.

import { describe, it, expect } from 'vitest'
import { buildCharacter } from '../build'
import { defaultConfig, type CharacterConfig, type ArtifactPiece } from '@/data/config-types'

const SHENHE = 10000063
const CQ = 13507 // Calamity Queller (NOT 13509 — that's Engulfing Lightning)
const NO = 15007 // Noblesse Oblige

function shenhe(overrides: Partial<CharacterConfig> = {}): CharacterConfig {
  return {
    ...defaultConfig(SHENHE),
    level: 90,
    ascensionStage: 6,
    constellation: 0,
    talentLevels: { auto: 10, skill: 10, burst: 10 },
    weapon: { weaponId: CQ, level: 90, ascensionStage: 6, refinement: 1 },
    artifacts: {},
    lastModified: Date.now(),
    ...overrides,
  }
}

function piece(set: number, slot: ArtifactPiece['slot'], mainStat: string, substats: Array<{ key: string; value: number }> = []): ArtifactPiece {
  return {
    setId: set, slot, rarity: 5, level: 20,
    mainStat: mainStat as ArtifactPiece['mainStat'],
    substats: substats as ArtifactPiece['substats'],
  }
}

describe('Shenhe panel ATK — pure src/calc/ pipeline', () => {
  it('L90 A6 C0 + Calamity Queller L90 A6 R1, no artifacts (前台 default 6 stacks)', () => {
    const r = buildCharacter(shenhe())
    console.log('Breakdown:', r.breakdown)
    console.log('Panel:', r.panel)

    // Base ATK:
    //   char curve   = 23.6474 × 8.739  = 206.66
    //   char ascA6   = 97.10
    //   weapon curve = 49.1377 × 11.272 = 553.88
    //   weapon ascA6 = 186.7
    //   TOTAL                         = 1044.34
    expect(r.panel.baseAtk).toBeCloseTo(1044.34, 1)

    // premod.atk_:
    //   char ascA6 atk%       = 0.288
    //   CQ R1 substat         = 0.036 × 4.594 = 0.165384
    //   CQ R1 passive (6 × 3.2% on-field default) = 0.192
    //   TOTAL                 = 0.645384
    expect(r.panel.premodAtkPct).toBeCloseTo(0.645384, 4)

    expect(r.panel.premodAtkFlat).toBe(0)

    // final.atk = 1044.336693 × (1 + 0.645384) ≈ 1718.33
    expect(r.panel.finalAtk).toBeCloseTo(1718.33, 1)
  })

  it('+ realistic 5pc NO build with substats — every contribution adds correctly', () => {
    // 5pc Noblesse Oblige, level-20 max mainstats. Substats picked to give
    // 5 critRate + 5 critDmg + 5 atk% + 5 atkFlat rolls — a typical max-DPS
    // distribution after sweeping ~30 fodder.
    //
    // Per-roll max values (5★ max tier):
    //   critRate_: 0.0389, critDMG_: 0.0777, atk_: 0.0583, atk (flat): 19.45
    const subs = (atkPct: number, atkFlat: number, cr: number, cd: number) => [
      { key: 'atkPct', value: atkPct },
      { key: 'atkFlat', value: atkFlat },
      { key: 'critRate', value: cr },
      { key: 'critDmg', value: cd },
    ]
    const cfg = shenhe({
      artifacts: {
        flower: piece(NO, 'flower', 'hpFlat', subs(0.0583, 19.45, 0.0389, 0.0777)),
        plume: piece(NO, 'plume', 'atkFlat', subs(0.0583, 19.45, 0.0389, 0.0777)),
        sands: piece(NO, 'sands', 'atkPct', subs(0.0583, 19.45, 0.0389, 0.0777)),
        goblet: piece(NO, 'goblet', 'cryoDmg', subs(0.0583, 19.45, 0.0389, 0.0777)),
        circlet: piece(NO, 'circlet', 'critRate', subs(0.0583, 19.45, 0.0389, 0.0777)),
      },
    })
    const r = buildCharacter(cfg)
    console.log('Breakdown:', r.breakdown)
    console.log('Panel:', r.panel)

    // base.atk: unchanged from no-artifact case (artifact mainstats go into
    // premod, not base — except plume which is flat ATK, also in premod).
    expect(r.panel.baseAtk).toBeCloseTo(1044.34, 1)

    // premod.atk_: char(0.288) + weapon(0.165384) + CQ-passive(0.192)
    //              + sands main(0.466) + 5×atk_sub(5×0.0583=0.2915)
    //            = 1.402884
    expect(r.panel.premodAtkPct).toBeCloseTo(1.402884, 4)

    // premod.atk.flat: plume main(311) + 5×atkFlat sub(5×19.45=97.25) = 408.25
    expect(r.panel.premodAtkFlat).toBeCloseTo(408.25, 2)

    // final.atk = 1044.336693 × (1 + 1.402884) + 408.25
    //          ≈ 2509.41 + 408.25 = 2917.66
    expect(r.panel.finalAtk).toBeCloseTo(2917.66, 1)
  })

  it('no weapon → only character contributions', () => {
    const cfg = shenhe({ weapon: { weaponId: null, level: 1, ascensionStage: 0, refinement: 1 } })
    const r = buildCharacter(cfg)
    // Just char curve + char asc.
    expect(r.panel.baseAtk).toBeCloseTo(206.66 + 97.10, 1)
    expect(r.panel.premodAtkPct).toBeCloseTo(0.288, 3)
    expect(r.panel.premodAtkFlat).toBe(0)
    expect(r.panel.finalAtk).toBeCloseTo((206.66 + 97.10) * 1.288, 1)
  })

  it('breakdown sums all sources accountably', () => {
    const cfg = shenhe({
      artifacts: {
        flower: piece(NO, 'flower', 'hpFlat'),
        plume: piece(NO, 'plume', 'atkFlat'),
        sands: piece(NO, 'sands', 'atkPct'),
        goblet: piece(NO, 'goblet', 'cryoDmg'),
        circlet: piece(NO, 'circlet', 'critRate'),
      },
    })
    const r = buildCharacter(cfg)
    const b = r.breakdown
    // base.atk should equal the four base sources summed.
    expect(r.panel.baseAtk).toBeCloseTo(b.charCurve + b.charAscFlat + b.weaponCurve + b.weaponAscFlat, 2)
    // premod.atk_ should equal all %-sources summed (including weapon passive).
    expect(r.panel.premodAtkPct).toBeCloseTo(
      b.charAscPct + b.weaponSubstatPct + b.weaponPassivePct + b.artifactMainPct + b.artifactSubPct + b.artifactSetPct,
      4,
    )
    // premod.atk.flat should equal flat sources.
    expect(r.panel.premodAtkFlat).toBeCloseTo(b.artifactMainFlat + b.artifactSubFlat, 2)
  })
})
