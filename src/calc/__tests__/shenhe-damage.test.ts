// Shenhe damage formulas — verify new pipeline matches the legacy GO values.
//
// Reference (from the old shenhe.test.ts via GO Pando, L90 + CQ R1 no artifacts):
//   normal_0        583
//   normal_4        885
//   charged         1,492
//   plunging_high   2,153
//   skill_press     1,914
//   skill_hold      2,596
//   burst           1,386
//   burst_dot       455

import { describe, it, expect } from 'vitest'
import { buildCharacter } from '../build'
import { defaultConfig, type CharacterConfig } from '@/data/config-types'

const SHENHE = 10000063
const CQ = 13507

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

describe('Shenhe damage formulas — match legacy GO values', () => {
  it('Shenhe + CQ R1, no artifacts, no conds → all 13 formulas computed', () => {
    const r = buildCharacter(shenhe())
    const byName = Object.fromEntries(r.formulas.map((f) => [f.name, f]))
    console.log('=== Shenhe damage @ L90 + CQ R1, no artifacts ===')
    for (const f of r.formulas) {
      console.log(`  ${f.name.padEnd(15)} ${Math.round(f.value).toLocaleString()}`)
    }
    expect(r.formulas.length).toBe(13)
    // Match values from the verified old test, within ~3% (tolerates rounding
    // in the def/res multi).
    expect(byName.normal_0!.value).toBeCloseTo(583, -1)
    expect(byName.normal_4!.value).toBeCloseTo(885, -1)
    expect(byName.charged!.value).toBeCloseTo(1492, -1)
    expect(byName.plunging_high!.value).toBeCloseTo(2153, -1)
    expect(byName.skill_press!.value).toBeCloseTo(1914, -1)
    expect(byName.skill_hold!.value).toBeCloseTo(2596, -1)
    expect(byName.burst!.value).toBeCloseTo(1386, -1)
    expect(byName.burst_dot!.value).toBeCloseTo(455, -1)
  })

  it('quillActive=on lifts cryo formulas but not physical', () => {
    const off = buildCharacter(shenhe())
    const on = buildCharacter(shenhe(), { condState: { Shenhe: { quillActive: 1 } } })
    const offByName = Object.fromEntries(off.formulas.map((f) => [f.name, f.value]))
    const onByName = Object.fromEntries(on.formulas.map((f) => [f.name, f.value]))
    console.log(`Icy Quill on skill_press: off=${Math.round(offByName.skill_press!)} on=${Math.round(onByName.skill_press!)}`)
    // skill_press (cryo) should go up.
    expect(onByName.skill_press!).toBeGreaterThan(offByName.skill_press!)
    // normal_0 (physical) unchanged.
    expect(onByName.normal_0!).toBeCloseTo(offByName.normal_0!, 0)
  })

  it('burstField=on triggers A1 cryo DMG + Q-field RES shred (cryo + physical)', () => {
    const off = buildCharacter(shenhe())
    const on = buildCharacter(shenhe(), { condState: { Shenhe: { burstField: 1 } } })
    const o = (rs: typeof off.formulas) => Object.fromEntries(rs.map((f) => [f.name, f.value]))
    const oo = o(off.formulas), no = o(on.formulas)
    // skill_press (cryo): A1 +15% cryo DMG AND RES shred lift it.
    expect(no.skill_press!).toBeGreaterThan(oo.skill_press!)
    // normal_0 (physical): A1 doesn't apply, but Q-field RES shred reduces
    // enemy physical RES → normal damage also goes up. This is correct per
    // the wiki (Q field shreds BOTH cryo AND physical RES).
    expect(no.normal_0!).toBeGreaterThan(oo.normal_0!)
  })

  it('C6 + c4Stacks=20 lifts skill but not normals or burst', () => {
    const cfg = shenhe({ constellation: 6 })
    const off = buildCharacter(cfg)
    const on = buildCharacter(cfg, { condState: { Shenhe: { c4Stacks: 20 } } })
    const o = (rs: typeof off.formulas) => Object.fromEntries(rs.map((f) => [f.name, f.value]))
    const oo = o(off.formulas), no = o(on.formulas)
    expect(no.skill_press!).toBeGreaterThan(oo.skill_press!)
    expect(no.burst!).toBeCloseTo(oo.burst!, 0)
    expect(no.normal_0!).toBeCloseTo(oo.normal_0!, 0)
  })
})
