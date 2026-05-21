// Verify GO Pando calc end-to-end with a CharacterConfig + minimal weapon.
import { describe, it, expect } from 'vitest'
import { computeViaGo } from '../../integration/go-calc'
import { defaultConfig } from '@/data/config-types'

describe('GO Pando calc — character config integration', () => {
  it('Mona L90 / C6 / 10·10·10, panel-only', () => {
    const config = {
      ...defaultConfig(10000041),
      constellation: 6,
    }
    const out = computeViaGo(config)
    expect(out).not.toBeNull()
    expect(out!.goKey).toBe('Mona')
    expect(out!.fed).toEqual({ weapon: false, artifacts: 0 })
    expect(out!.values.hp).toBeGreaterThan(10000) // Mona L90 ≈ 10409
    expect(out!.values.overloaded).toBeGreaterThan(0)
  })

  it('Returns null for unmapped character id', () => {
    const config = { ...defaultConfig(99999999) }
    expect(computeViaGo(config)).toBeNull()
  })
})
