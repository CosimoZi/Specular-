import { describe, it, expect } from 'vitest'
import {
  aggregateStats,
  calcDamage,
  calcTransformative,
  defMultiplier,
  resMultiplier,
  ampMultiplier,
  levelMultiplier,
} from '..'
import type { AttackerContext, DamageInstance, TargetContext } from '..'

function baseAttacker(overrides: Partial<AttackerContext['stats']> = {}): AttackerContext {
  const stats = aggregateStats([
    {
      baseAtk: 0,
      atkFlat: 2000, // hand-set ATK = 2000 for easy arithmetic
      critRate: 0, // baseline 5% + 0 = 5%, but the tests below override
      critDmg: 0,
      em: 0,
      pyroDmg: 0,
      hydroDmg: 0,
      electroDmg: 0,
      dendroDmg: 0,
      cryoDmg: 0,
    },
  ])
  return {
    level: 90,
    stats: { ...stats, ...overrides },
  }
}

function baseTarget(): TargetContext {
  return {
    level: 100,
    resistance: {
      Pyro: 0.1,
      Hydro: 0.1,
      Cryo: 0.1,
      Electro: 0.1,
      Anemo: 0.1,
      Geo: 0.1,
      Dendro: 0.1,
      Physical: 0.1,
    },
  }
}

describe('defMultiplier', () => {
  it('lvl 90 vs lvl 100 = 190/390', () => {
    expect(defMultiplier(90, 100)).toBeCloseTo(190 / 390, 6)
  })
  it('def reduction 20% lifts ratio', () => {
    const noReduction = defMultiplier(90, 100, 0)
    const withReduction = defMultiplier(90, 100, 0.2)
    expect(withReduction).toBeGreaterThan(noReduction)
  })
})

describe('resMultiplier', () => {
  it('positive res < 75% → 1 - r', () => {
    expect(resMultiplier(0.1)).toBeCloseTo(0.9, 6)
    expect(resMultiplier(0.5)).toBeCloseTo(0.5, 6)
  })
  it('res > 75% → 1 / (4r+1)', () => {
    // r = 0.9 → 1 / (3.6+1) = 1/4.6 ≈ 0.2174
    expect(resMultiplier(0.9)).toBeCloseTo(1 / 4.6, 6)
  })
  it('negative res → 1 - r/2', () => {
    // r = -0.4 → 1 - (-0.4)/2 = 1.2
    expect(resMultiplier(0.1, 0.5)).toBeCloseTo(1.2, 6)
  })
})

describe('ampMultiplier', () => {
  it('strong vape with 200 EM matches formula', () => {
    // 2.0 * (1 + 2.78 * 200 / 1600) = 2.0 * (1 + 0.3475) = 2.695
    const m = ampMultiplier({ kind: 'vape', trigger: 'pyro_on_hydro' }, 200)
    expect(m).toBeCloseTo(2.0 * (1 + (2.78 * 200) / 1600), 6)
  })
  it('weak vape is 0.75x of strong', () => {
    const strong = ampMultiplier({ kind: 'vape', trigger: 'pyro_on_hydro' }, 0)
    const weak = ampMultiplier({ kind: 'vape', trigger: 'hydro_on_pyro' }, 0)
    expect(weak / strong).toBeCloseTo(0.75, 6)
  })
})

describe('levelMultiplier', () => {
  it('lvl 90 = 1077.4434', () => {
    expect(levelMultiplier(90)).toBeCloseTo(1077.4434, 4)
  })
  it('interpolates between breakpoints', () => {
    // lvl 25 should be between lvl 20 (116.35) and lvl 30 (199.56)
    const m25 = levelMultiplier(25)
    expect(m25).toBeGreaterThan(116.35)
    expect(m25).toBeLessThan(199.56)
  })
})

describe('calcDamage (direct hit)', () => {
  it('non-reaction hydro burst with hand-calculable numbers', () => {
    const atk = baseAttacker({
      critRate: 0.5,
      critDmg: 1.0,
      elementalDmg: {
        Pyro: 0,
        Hydro: 0.466,
        Cryo: 0,
        Electro: 0,
        Anemo: 0,
        Geo: 0,
        Dendro: 0,
        Physical: 0,
      },
    })
    const tgt = baseTarget()
    const hit: DamageInstance = {
      label: 'Burst',
      scaling: 'atk',
      multiplier: 2.0,
      element: 'Hydro',
    }
    const out = calcDamage(atk, tgt, hit)
    // base = 2000 * 2 = 4000; raw = 4000 * 1.466 = 5864
    // defMult = 190/390 ≈ 0.487179; resMult = 0.9
    const expectedNonCrit = 5864 * (190 / 390) * 0.9
    const expectedCrit = expectedNonCrit * (1 + 1.0)
    const expectedAvg = expectedNonCrit * (1 + 0.5 * 1.0)
    expect(out.nonCrit).toBeCloseTo(expectedNonCrit, 2)
    expect(out.crit).toBeCloseTo(expectedCrit, 2)
    expect(out.avg).toBeCloseTo(expectedAvg, 2)
  })

  it('strong vape applies amp multiplier to the bracket', () => {
    const atk = baseAttacker({
      critRate: 0,
      critDmg: 0.5,
      em: 200,
      elementalDmg: {
        Pyro: 0.466,
        Hydro: 0,
        Cryo: 0,
        Electro: 0,
        Anemo: 0,
        Geo: 0,
        Dendro: 0,
        Physical: 0,
      },
    })
    const tgt = baseTarget()
    const hit: DamageInstance = {
      label: 'Pyro skill',
      scaling: 'atk',
      multiplier: 2.0,
      element: 'Pyro',
    }
    const out = calcDamage(atk, tgt, hit, {
      kind: 'vape',
      trigger: 'pyro_on_hydro',
    })
    const raw = 2000 * 2.0 * 1.466
    const dm = 190 / 390
    const rm = 0.9
    const amp = 2.0 * (1 + (2.78 * 200) / 1600)
    const expectedNonCrit = raw * dm * rm * amp
    expect(out.nonCrit).toBeCloseTo(expectedNonCrit, 1)
  })

  it('aggravate adds catalyze damage to electro hit', () => {
    const atk = baseAttacker({
      critRate: 0,
      critDmg: 0.5,
      em: 100,
      elementalDmg: {
        Pyro: 0,
        Hydro: 0,
        Cryo: 0,
        Electro: 0.466,
        Anemo: 0,
        Geo: 0,
        Dendro: 0,
        Physical: 0,
      },
    })
    const tgt = baseTarget()
    const hit: DamageInstance = {
      label: 'Aggravate hit',
      scaling: 'atk',
      multiplier: 1.0,
      element: 'Electro',
    }
    const out = calcDamage(atk, tgt, hit, { kind: 'aggravate' })
    const raw = 2000 * 1.0 // base
    const bonus = 0.466
    const dm = 190 / 390
    const rm = 0.9
    const cat = 1.15 * levelMultiplier(90) * (1 + (5 * 100) / 1300)
    const expectedNonCrit = (raw + cat) * (1 + bonus) * dm * rm
    expect(out.nonCrit).toBeCloseTo(expectedNonCrit, 1)
  })
})

describe('calcTransformative', () => {
  it('overload at lvl 90 with 0 EM matches base formula', () => {
    const atk = baseAttacker({ em: 0 })
    const tgt = baseTarget()
    const out = calcTransformative(atk, tgt, {
      kind: 'transformative',
      type: 'overload',
    })
    const expected = 4.0 * levelMultiplier(90) * 1 * 0.9
    expect(out.nonCrit).toBeCloseTo(expected, 1)
    expect(out.crit).toBe(out.nonCrit) // transformative cannot crit
  })
  it('hyperbloom resistance follows dendro element', () => {
    const atk = baseAttacker({ em: 800 })
    const tgt: TargetContext = {
      ...baseTarget(),
      resReduction: { Dendro: 0.4 },
    }
    const out = calcTransformative(atk, tgt, {
      kind: 'transformative',
      type: 'hyperbloom',
    })
    // res reduced from 0.1 - 0.4 = -0.3 → mult = 1 + 0.15 = 1.15
    expect(out.trace.resMult).toBeCloseTo(1.15, 6)
  })
})
