// Verify our vendored Pando engine compiles + the AST builders work.
// We don't instantiate Calculator here (Stage 1) — that requires a GI tag-map
// setup which lives in libs/gi/wr, vendored in Stage 2.
import { describe, it, expect } from 'vitest'
import { constant, prod, sum } from '@genshin-optimizer/pando/engine'

describe('Pando engine — Stage 1 smoke', () => {
  it('builds AST nodes', () => {
    const c2 = constant(2)
    const c3 = constant(3)
    const expr = prod(c2, sum(c3, constant(4)))
    // The AST is opaque from outside, but it should be a non-null object with op tag
    expect(expr).toBeTruthy()
    expect(typeof expr).toBe('object')
    // Pando's nodes carry an `op` tag
    expect((expr as unknown as { op?: string }).op).toBe('prod')
  })
})
