// Verify GO Pando calc actually computes Mona's damage formulas end-to-end.
import { describe, it, expect } from 'vitest'
import { computeMonaPoc } from '../../integration/go-calc'

describe('GO Pando calc — Mona PoC', () => {
  it('returns non-trivial damage numbers for lvl 90 / talent 10·10·10 / C6', () => {
    const out = computeMonaPoc({
      level: 90, ascension: 6, constellation: 6,
      talents: { auto: 10, skill: 10, burst: 10 },
    })
    console.log('Mona damage formulas (lvl 90, C6, 10/10/10):', out)
    expect(Object.keys(out).length).toBeGreaterThan(0)
    // Some formula should be non-zero
    expect(Object.values(out).some((v) => v > 0)).toBe(true)
  })
})
