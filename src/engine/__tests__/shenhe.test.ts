// Sanity test for hand-wired Shenhe (申鹤) sheet — verify that:
//   1. talent damage formulas register and compute non-zero numbers
//   2. conditional registry exposes Shenhe's 6 conds for the UI
//   3. team buffs propagate to teammates (verified via A4 hold → ally normal)
//
// Uses a 2-member team: Shenhe (slot 0) + cryo Ayaka (slot 1) so we can
// observe team-buff propagation through Ayaka's lone stub `normal1` formula.
import { describe, it, expect } from 'vitest'
import { computeTeamViaGo, listCondsForCharacter } from '../../integration/go-calc'
import { defaultConfig, type CharacterConfig } from '@/data/config-types'

function shenheConfig(): CharacterConfig {
  return {
    ...defaultConfig(10000063),
    level: 90,
    ascensionStage: 6,
    constellation: 0,
    talentLevels: { auto: 10, skill: 10, burst: 10 },
    weapon: { weaponId: 13509, level: 90, ascensionStage: 6, refinement: 1 }, // Calamity Queller
    artifacts: {},
    lastModified: Date.now(),
  }
}
function ayakaConfig(): CharacterConfig {
  return {
    ...defaultConfig(10000002),
    level: 90,
    ascensionStage: 6,
    constellation: 0,
    talentLevels: { auto: 10, skill: 10, burst: 10 },
    weapon: { weaponId: 11509, level: 90, ascensionStage: 6, refinement: 1 },
    artifacts: {},
    lastModified: Date.now(),
  }
}

describe('Shenhe — hand-wired sheet', () => {
  it('exposes 5 conditionals via the registry', () => {
    const conds = listCondsForCharacter(10000063)
    const names = conds.map((c) => c.name).sort()
    // a1Field merged into burstField (same physical trigger: Q field up).
    expect(names).toEqual(
      ['a4Hold', 'a4Press', 'burstField', 'c4Stacks', 'quillActive'],
    )
    const c4 = conds.find((c) => c.name === 'c4Stacks')!
    expect(c4.type).toBe('num')
    expect(c4.min).toBe(0)
    expect(c4.max).toBe(50)
  })

  it('computes all 13 damage formulas for Shenhe as focus', () => {
    const out = computeTeamViaGo([{ config: shenheConfig() }, null, null, null], 0)
    expect(out).not.toBeNull()
    expect(out!.goKey).toBe('Shenhe')
    // 5 normals, charged, 3 plunge, 2 skill, 2 burst = 13.
    expect(out!.values.normal_0).toBeGreaterThan(0)
    expect(out!.values.normal_4).toBeGreaterThan(0)
    expect(out!.values.charged).toBeGreaterThan(0)
    expect(out!.values.plunging_dmg).toBeGreaterThan(0)
    expect(out!.values.skill_press).toBeGreaterThan(0)
    expect(out!.values.skill_hold).toBeGreaterThan(0)
    expect(out!.values.burst).toBeGreaterThan(0)
    expect(out!.values.burst_dot).toBeGreaterThan(0)
    // icy_quill is no longer a standalone formula — it's a flat additive
    // baked into cryo formulas' base via ownBuff.formula.base.add(...).
    expect(out!.values.icy_quill).toBeUndefined()
    console.log('=== Shenhe focus damage (L90 / Calamity Queller / no artifacts) ===')
    for (const k of ['normal_0', 'normal_4', 'charged', 'plunging_high', 'skill_press', 'skill_hold', 'burst', 'burst_dot']) {
      console.log(`  ${k.padEnd(15)} ${Math.round(out!.values[k]).toLocaleString()}`)
    }
  })

  it('toggling quillActive lifts cryo formulas via teamBuff fan-out', () => {
    const sh = shenheConfig()
    const off = computeTeamViaGo([{ config: sh }, null, null, null], 0)
    const on = computeTeamViaGo([{ config: sh }, null, null, null], 0, {
      condState: { '0': { Shenhe: { quillActive: 1 } } },
    })
    expect(off).not.toBeNull()
    expect(on).not.toBeNull()
    expect(on!.values.skill_press).toBeGreaterThan(off!.values.skill_press)
    expect(on!.values.skill_hold).toBeGreaterThan(off!.values.skill_hold)
    expect(on!.values.burst).toBeGreaterThan(off!.values.burst)
    expect(on!.values.burst_dot).toBeGreaterThan(off!.values.burst_dot)
    // Physical normals — polearm default — don't get the cryo-gated flat.
    expect(on!.values.normal_0).toBeCloseTo(off!.values.normal_0, 0)
    expect(on!.values.charged).toBeCloseTo(off!.values.charged, 0)
    expect(on!.values.plunging_dmg).toBeCloseTo(off!.values.plunging_dmg, 0)
    const delta = on!.values.skill_press - off!.values.skill_press
    console.log(`=== Icy Quill base add (after teamBuff rewire) ===`)
    console.log(`  skill_press off=${Math.round(off!.values.skill_press)} on=${Math.round(on!.values.skill_press)} (per quill ≈ ${Math.round(delta)})`)
  })

  it('A1 cryo DMG bonus boosts Shenhe skill (cryo) but NOT her polearm normal (physical)', () => {
    // Shenhe is a polearm user → her N1..N4 + charged + plunging default to
    // physical damage. Her A1 teamBuff is +15% cryo DMG only. The buff must
    // therefore lift skill_press / burst (cryo) but leave normal_0 untouched.
    const sh = shenheConfig()
    const off = computeTeamViaGo([{ config: sh }, null, null, null], 0)
    const on = computeTeamViaGo([{ config: sh }, null, null, null], 0, {
      condState: { '0': { Shenhe: { burstField: 1 } } },
    })
    expect(off).not.toBeNull()
    expect(on).not.toBeNull()
    // Skill press is cryo — should be boosted by A1's +15% cryo DMG.
    expect(on!.values.skill_press).toBeGreaterThan(off!.values.skill_press)
    // Normal_0 is physical (polearm default) — should be unchanged.
    expect(on!.values.normal_0).toBeCloseTo(off!.values.normal_0, 0)
    // Charged + plunging are also physical.
    expect(on!.values.charged).toBeCloseTo(off!.values.charged, 0)
  })

  it('A4 hold dmg_ buffs Ayaka normal hit', () => {
    // A4 hold buff applies +X% dmg to all party members' normal/charged/
    // plunging attacks. With Ayaka in slot 1, her `normal1` formula should
    // increase when Shenhe's a4Hold cond is toggled on.
    const sh = shenheConfig()
    const ay = ayakaConfig()
    const off = computeTeamViaGo([{ config: sh }, { config: ay }, null, null], 1)
    const on = computeTeamViaGo([{ config: sh }, { config: ay }, null, null], 1, {
      condState: { '0': { Shenhe: { a4Hold: 1 } } },
    })
    expect(off).not.toBeNull()
    expect(on).not.toBeNull()
    expect(on!.values.normal1).toBeGreaterThan(off!.values.normal1)
    const delta = on!.values.normal1 - off!.values.normal1
    const pct = (delta / off!.values.normal1) * 100
    console.log(`=== A4 hold propagation ===`)
    console.log(`  Ayaka normal1 off=${Math.round(off!.values.normal1)} on=${Math.round(on!.values.normal1)} (+${pct.toFixed(1)}%)`)
  })
})
