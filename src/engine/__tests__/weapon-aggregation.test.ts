// Task #34 RESOLUTION: there is no aggregation bug.
//
// The previous session's analysis claimed Shenhe + Calamity Queller L90 A6 R1
// returned base.atk=911.83 vs an "expected" 1044.34. But the test was passing
// weaponId=13509, which maps to EngulfingLightning, not CalamityQueller (13507).
// Engulfing Lightning's substat is enerRech_ (not atk_) and its main-stat
// curve is ATTACK_301 base 45.9364 — so 911.83 is the CORRECT base.atk for
// Shenhe + EngulfingLightning, and 0.288 is the correct premod.atk_
// (Shenhe's A6 ascension only — EL gives no atk_ substat).
//
// This test re-verifies with BOTH weapons to confirm the engine returns the
// expected numbers when given the correct weapon IDs.

import { describe, it, expect } from 'vitest'

const SHENHE_ID = 10000063
const CQ_ID = 13507
const EL_ID = 13509

async function compute(weaponId: number) {
  const fm: any = await import('@genshin-optimizer/gi/formula')
  const { genshinCalculatorWithEntries, charData, weaponData, teamData, withMember, own, enemyDebuff } = fm
  const { configToGoCharacter, weaponConfigToGoWeapon } = await import('@/integration/good-adapter')
  const { defaultConfig } = await import('@/data/config-types')
  const cfg = {
    ...defaultConfig(SHENHE_ID),
    level: 90, ascensionStage: 6, constellation: 0,
    talentLevels: { auto: 10, skill: 10, burst: 10 },
    weapon: { weaponId, level: 90, ascensionStage: 6, refinement: 1 },
    artifacts: {},
    lastModified: Date.now(),
  }
  const goChar = configToGoCharacter(cfg)!
  const goWep = weaponConfigToGoWeapon(cfg.weapon, goChar.key)!
  const calc = genshinCalculatorWithEntries([
    ...teamData(['0']),
    ...withMember('0', ...charData(goChar as never), ...weaponData(goWep as never)),
    enemyDebuff.common.lvl.add(100),
    enemyDebuff.common.preRes.add(0.1),
  ])
  const mem = calc.withTag({ src: '0' })
  return {
    weaponKey: goWep.key,
    baseAtk: mem.compute(own.base.atk as never).val,
    premodAtkPct: mem.compute(own.premod.atk_ as never).val,
    premodEr: mem.compute(own.premod.enerRech_ as never).val,
    finalAtk: mem.compute(own.final.atk as never).val,
  }
}

describe('weapon-aggregation — verified working', () => {
  it('Shenhe + Engulfing Lightning (13509) — engine numbers match formula', async () => {
    const r = await compute(EL_ID)
    console.log('Engulfing Lightning:', r)
    expect(r.weaponKey).toBe('EngulfingLightning')
    // char_base = 23.6474 × ATTACK_S5[90]
    // char_asc = 97.10
    // weapon_curve = 45.9364 × ATTACK_301[90] = 421.37
    // weapon_asc = 186.7
    // → 303.76 + 421.37 + 186.7 = 911.83 ✓
    expect(r.baseAtk).toBeCloseTo(911.83, 1)
    // Shenhe A6 only — EL substat is enerRech_, no atk_ contribution.
    expect(r.premodAtkPct).toBeCloseTo(0.288, 3)
    // EL substat → enerRech_. 0.12 × CRITICAL_301[90] = 0.12 × 4.392 = 0.527
    expect(r.premodEr).toBeGreaterThan(0.5)
  })

  it('Shenhe + Calamity Queller (13507) — weapon substat ATK% reaches premod', async () => {
    const r = await compute(CQ_ID)
    console.log('Calamity Queller:', r)
    expect(r.weaponKey).toBe('CalamityQueller')
    // char = 303.76, weapon = 49.1377 × ATTACK_303[90] + 186.7
    expect(r.baseAtk).toBeGreaterThan(1000)
    // Shenhe A6 (0.288) + CQ substat ATK% (0.036 × CRITICAL_301[90] = 0.158)
    // → 0.446 (roughly)
    expect(r.premodAtkPct).toBeGreaterThan(0.4)
    expect(r.premodAtkPct).toBeLessThan(0.5)
  })

  it('CQ baseline vs EL baseline — CQ should have HIGHER base.atk', async () => {
    const cq = await compute(CQ_ID)
    const el = await compute(EL_ID)
    console.log('CQ baseAtk:', cq.baseAtk, 'EL baseAtk:', el.baseAtk)
    expect(cq.baseAtk).toBeGreaterThan(el.baseAtk)
    // CQ uses ATTACK_303 base 49.1377 → ~553.88 weapon curve atk
    // EL uses ATTACK_301 base 45.9364 → ~421.37 weapon curve atk
    // diff ≈ 132.5
    expect(cq.baseAtk - el.baseAtk).toBeGreaterThan(120)
  })
})
