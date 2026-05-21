import { describe, it, expect } from 'vitest'
import {
  c, v, sum, prod, sub, div, when, ifGE, ifOn, ge, eq, lookup, letIn, custom,
  evaluate, simplify, pretty, freeVars, registerOp,
} from '../ast'
import { Scope } from '../scope'

describe('AST — arithmetic', () => {
  it('const + var', () => {
    const s = new Scope(undefined, { x: 10 })
    expect(evaluate(c(5), s)).toBe(5)
    expect(evaluate(v('x'), s)).toBe(10)
    expect(() => evaluate(v('y'), s)).toThrow(/Unbound variable: 'y'/) // fail-fast
    expect(evaluate(v('y', 42), s)).toBe(42) // explicit default tolerates missing
  })

  it('sum / prod fold over args', () => {
    const s = new Scope()
    expect(evaluate(sum(1, 2, 3), s)).toBe(6)
    expect(evaluate(prod(2, 3, 4), s)).toBe(24)
    expect(evaluate(sum(), s)).toBe(0)
    expect(evaluate(prod(), s)).toBe(1)
  })

  it('sub / div / div-by-zero throws', () => {
    const s = new Scope()
    expect(evaluate(sub(10, 3), s)).toBe(7)
    expect(evaluate(div(10, 2), s)).toBe(5)
    expect(() => evaluate(div(10, 0), s)).toThrow(/division by zero/)
  })
})

describe('AST — conditionals', () => {
  it('if/when picks branch', () => {
    const s = new Scope(undefined, { active: 1 })
    expect(evaluate(when(v('active'), 100, 0), s)).toBe(100)
    s.set('active', 0)
    expect(evaluate(when(v('active'), 100, 0), s)).toBe(0)
  })

  it('ifGE: 4pc set bonus pattern', () => {
    // Mimics `cmpGE(count, 4, percent(0.2))` from the old vendor pattern.
    const setBonus = ifGE(v('setCount'), 4, 0.2)
    expect(evaluate(setBonus, new Scope(undefined, { setCount: 5 }))).toBe(0.2)
    expect(evaluate(setBonus, new Scope(undefined, { setCount: 3 }))).toBe(0)
  })

  it('ifOn: cond-bool gate', () => {
    const buff = ifOn(v('cond.a4Hold'), 0.15)
    expect(evaluate(buff, new Scope(undefined, { 'cond.a4Hold': 1 }))).toBe(0.15)
    expect(evaluate(buff, new Scope(undefined, { 'cond.a4Hold': 0 }))).toBe(0)
  })
})

describe('AST — lookup', () => {
  it('subscripts a table by index', () => {
    const skillMult = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    expect(evaluate(lookup(skillMult, 3), new Scope())).toBe(0.8)
  })
  it('out-of-range returns 0', () => {
    expect(evaluate(lookup([1, 2, 3], 10), new Scope())).toBe(0)
  })
})

describe('AST — scope (let binding)', () => {
  it('inner scope sees outer + binding', () => {
    const expr = letIn({ y: prod(v('x'), 2) }, sum(v('x'), v('y')))
    const s = new Scope(undefined, { x: 5 })
    expect(evaluate(expr, s)).toBe(15) // 5 + (5*2)
  })

  it('bindings evaluate in outer scope (sibling bindings invisible)', () => {
    // `b` cannot read `a` from the same binding block.
    const expr = letIn({ a: 1, b: v('a', 999) }, v('b'))
    expect(evaluate(expr, new Scope())).toBe(999)
  })
})

describe('AST — custom op', () => {
  it('register + invoke', () => {
    const unreg = registerOp('triple', ([x]) => (x ?? 0) * 3)
    try {
      expect(evaluate(custom('triple', 7), new Scope())).toBe(21)
    } finally {
      unreg()
    }
  })
})

describe('AST — freeVars', () => {
  it('returns unbound var names', () => {
    expect([...freeVars(v('x'))]).toEqual(['x'])
    expect([...freeVars(sum(v('a'), v('b'), 3))].sort()).toEqual(['a', 'b'])
  })
  it('scope bindings shadow inner refs', () => {
    const expr = letIn({ x: 5 }, sum(v('x'), v('y')))
    expect([...freeVars(expr)]).toEqual(['y'])
  })
})

describe('AST — simplify', () => {
  it('folds const arithmetic', () => {
    const e = sum(c(1), c(2), v('x'))
    const s = simplify(e)
    expect(s).toEqual({ op: 'sum', args: [{ op: 'var', name: 'x' }, { op: 'const', v: 3 }] })
  })
  it('eliminates identity ops', () => {
    expect(simplify(sum(c(0), v('x')))).toEqual({ op: 'var', name: 'x' })
    expect(simplify(prod(c(1), v('x')))).toEqual({ op: 'var', name: 'x' })
    expect(simplify(prod(c(0), v('x')))).toEqual({ op: 'const', v: 0 })
  })
  it('flattens nested sum/prod', () => {
    const e = sum(v('a'), sum(v('b'), v('c')))
    expect(simplify(e)).toEqual({
      op: 'sum',
      args: [{ op: 'var', name: 'a' }, { op: 'var', name: 'b' }, { op: 'var', name: 'c' }],
    })
  })
  it('folds if when cond is const', () => {
    expect(simplify(when(c(1), v('x'), v('y')))).toEqual({ op: 'var', name: 'x' })
    expect(simplify(when(c(0), v('x'), v('y')))).toEqual({ op: 'var', name: 'y' })
  })
})

describe('AST — pretty', () => {
  it('prints arithmetic', () => {
    expect(pretty(sum(v('a'), prod(2, v('b'))))).toBe('(a + (2 × b))')
  })
  it('shows bound values when scope is provided', () => {
    const s = new Scope(undefined, { atk: 1517 })
    expect(pretty(v('atk'), { scope: s })).toBe('atk(=1517)')
  })
})

describe('Shenhe + CQ panel ATK — end-to-end formula in pure AST', () => {
  // Sanity check the design pre-flight. This will be replicated more cleanly
  // once we have proper sheet definitions; for now it's a hand-built tree
  // showing the pattern works.
  it('matches analytic 1517.42 for L90 A6 C0 + CQ L90 A6 R1, no artifacts', () => {
    // Pre-computed numbers from raw stat data (verified against wiki):
    const SHENHE_CURVE_L90 = 23.6474 * 8.74 // ATTACK_S5[90] ≈ 8.74
    const SHENHE_ASC_A6_ATK = 97.10
    const CQ_CURVE_L90 = 49.1377 * 11.272 // ATTACK_303[90]
    const CQ_ASC_A6_ATK = 186.7
    const CQ_SUBSTAT_ATK_PCT = 0.036 * 4.594 // CRITICAL_301[90] ≈ 4.594
    const SHENHE_ASC_A6_ATK_PCT = 0.288

    // base.atk = char_curve + char_asc + weap_curve + weap_asc
    const baseAtk = sum(
      v('char.curve.atk'),
      v('char.asc.atk'),
      v('weap.curve.atk'),
      v('weap.asc.atk'),
    )
    // premod.atk_ = char_asc_atk_pct + weap_substat_atk_pct
    const premodAtkPct = sum(v('char.asc.atk_'), v('weap.substat.atk_'))
    // final.atk = base.atk × (1 + premod.atk_) + premod.atk (flat)
    const finalAtk = sum(
      prod(baseAtk, sum(1, premodAtkPct)),
      v('premod.atk.flat', 0), // explicit default — no flat ATK in this scenario
    )

    const scope = new Scope(undefined, {
      'char.curve.atk': SHENHE_CURVE_L90,
      'char.asc.atk': SHENHE_ASC_A6_ATK,
      'weap.curve.atk': CQ_CURVE_L90,
      'weap.asc.atk': CQ_ASC_A6_ATK,
      'char.asc.atk_': SHENHE_ASC_A6_ATK_PCT,
      'weap.substat.atk_': CQ_SUBSTAT_ATK_PCT,
    })

    const result = evaluate(finalAtk, scope)
    // Match the verified Pando number (1517.82) within rounding.
    expect(result).toBeCloseTo(1517.42, 0)
  })
})
