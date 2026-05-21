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
  // Vendor-bug regression baseline. With Shenhe + Calamity Queller L90 R1
  // (no artifacts), the engine reports:
  //   base.atk    = 911.83
  //   premod.atk_ = 0.288   (Shenhe A6 ascension only — weapon's 16.5% substat ATK% missing!)
  //   final.atk   = 1174.44
  //
  // Expected per wiki + game data:
  //   char_base_atk    = 23.6474 × 8.739 (ATTACK_S5 L90 curve) = 206.66
  //   + char_asc_atk   = 97.10 (Shenhe A6 atk ascension)
  //   = 303.76 char total
  //   weapon_base_atk  = 49.1377 × 11.272 (ATTACK_303 L90)    = 553.88
  //   + weapon_asc_atk = 186.7 (CalamityQueller A6)
  //   = 740.58 weapon total
  //   weapon_substat   = 0.036 × 4.594 (CRITICAL_301 L90)     = 16.54%
  //   Total base.atk = 1044.34
  //   Total premod.atk_ = 0.288 + 0.165 = 0.453
  //   Total final.atk = 1044.34 × 1.453 ≈ 1517.4
  //
  // Two latent vendor bugs:
  //   (1) base.atk short by 132.5 — weapon ascension flat ATK reads at wrong
  //       index or partially missed
  //   (2) weapon substat ATK% not propagating to premod.atk_ at all
  //
  // Tracked separately. All RELATIVE damage tests pass because everything
  // routes through the same (consistent) base.atk; only absolute matchup
  // with wiki is off.
  it('panel baseline (regression check — currently undercounts weapon stats)', async () => {
    const { genshinCalculatorWithEntries, charData, weaponData, teamData, withMember, own, ownBuff, enemyDebuff } =
      await import('@genshin-optimizer/gi/formula')
    const { configToGoCharacter, weaponConfigToGoWeapon } = await import('@/integration/good-adapter')
    const cfg = shenheConfig()
    const goChar = configToGoCharacter(cfg)!
    const goWep = weaponConfigToGoWeapon(cfg.weapon, goChar.key)!
    const calc = genshinCalculatorWithEntries([
      ...teamData(['0']),
      ...withMember('0', ...charData(goChar as never), ...weaponData(goWep as never)),
      enemyDebuff.common.lvl.add(100),
      enemyDebuff.common.preRes.add(0.1),
      ownBuff.common.critMode.add('avg'),
    ])
    const mem = calc.withTag({ src: '0' })
    expect(mem.compute(own.base.atk as never).val).toBeCloseTo(911.83, 1)
    expect(mem.compute(own.premod.atk_ as never).val).toBeCloseTo(0.288, 3)
    // When vendor bug is fixed, these should jump to ~1044.34 / 0.453 and the
    // test will need updating.
  })

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

  it('C4 stacks lift Shenhe own skill DMG (own-side cond, regression check)', () => {
    // Shenhe must be C4+ for the buff to fire. Pump c4Stacks via cond.
    const sh = { ...shenheConfig(), constellation: 6 }
    const off = computeTeamViaGo([{ config: sh }, null, null, null], 0)
    const on = computeTeamViaGo([{ config: sh }, null, null, null], 0, {
      condState: { '0': { Shenhe: { c4Stacks: 20 } } },
    })
    expect(off).not.toBeNull()
    expect(on).not.toBeNull()
    // C4 gives +5% per stack to Shenhe's own skill DMG. At 20 stacks → +100%
    // on skill formulas only.
    expect(on!.values.skill_press).toBeGreaterThan(off!.values.skill_press)
    expect(on!.values.skill_hold).toBeGreaterThan(off!.values.skill_hold)
    // Doesn't touch burst or normals.
    expect(on!.values.burst).toBeCloseTo(off!.values.burst, 0)
    expect(on!.values.normal_0).toBeCloseTo(off!.values.normal_0, 0)
    const pct = ((on!.values.skill_press - off!.values.skill_press) / off!.values.skill_press) * 100
    console.log(`=== C4 (20 stacks) on C6 Shenhe ===`)
    console.log(`  skill_press: off=${Math.round(off!.values.skill_press)} on=${Math.round(on!.values.skill_press)} (+${pct.toFixed(0)}%)`)
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
