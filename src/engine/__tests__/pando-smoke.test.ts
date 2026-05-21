// Verify our vendored Pando engine compiles + the AST builders work.
import { describe, it, expect } from 'vitest'
import { constant, prod, sum } from '@genshin-optimizer/pando/engine'

describe('Pando engine — Stage 1 smoke', () => {
  it('builds AST nodes', () => {
    const c2 = constant(2)
    const c3 = constant(3)
    const expr = prod(c2, sum(c3, constant(4)))
    expect(expr).toBeTruthy()
    expect(typeof expr).toBe('object')
    expect((expr as unknown as { op?: string }).op).toBe('prod')
  })
})

describe('GO gi/wr — Stage 2 smoke', () => {
  it('can import gi/wr without runtime error', async () => {
    // gi/wr's `input` etc. require setReadNodeKeys to be called first;
    // this just verifies the module loads.
    const wr = await import('@genshin-optimizer/gi/wr')
    expect(wr).toBeTruthy()
    expect(typeof wr.percent).toBe('function')
    expect(typeof wr.equal).toBe('function')
  })
})

describe('GO gi/consts — Stage 2 smoke', () => {
  it('exposes element keys', async () => {
    const consts = await import('@genshin-optimizer/gi/consts')
    expect(consts).toBeTruthy()
    // Common keys we'd use
    expect(Array.isArray(consts.allElementKeys)).toBe(true)
    expect(consts.allElementKeys).toContain('hydro')
  })
})
