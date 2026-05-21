// Tiny expression AST for Specular's damage / panel-stat calculator.
//
// Design goals (per the agreed shift away from Pando):
//   * Expression IS data — JSON-serializable, introspectable, pretty-printable.
//   * 12 core ops; one `custom` escape hatch backed by a runtime registry.
//   * Plain TypeScript discriminated union; switch-based evaluator. No tagged
//     deps to manage.
//   * Buffs read from a Scope (variable bindings), write nothing — pure
//     functions of state. The build pipeline composes scopes; the AST stays
//     side-effect-free.

import type { Scope } from './scope'

// =============================================================================
// Node types
// =============================================================================

export type Node =
  | { op: 'const'; v: number }
  | { op: 'var'; name: string; default?: number }
  | { op: 'sum'; args: Node[] }
  | { op: 'prod'; args: Node[] }
  | { op: 'min'; args: Node[] }
  | { op: 'max'; args: Node[] }
  | { op: 'sub'; lhs: Node; rhs: Node }
  | { op: 'div'; lhs: Node; rhs: Node }
  | { op: 'if'; cond: Node; then: Node; else: Node }
  | { op: 'cmp'; rel: '>' | '>=' | '<' | '<=' | '==' | '!='; lhs: Node; rhs: Node }
  | { op: 'lookup'; table: readonly number[]; idx: Node }
  | { op: 'scope'; bindings: Record<string, Node>; body: Node }
  | { op: 'custom'; name: string; args: Node[] }

// =============================================================================
// Custom-op registry (extensibility escape hatch)
// =============================================================================

const customOps = new Map<string, (args: number[]) => number>()

/** Register a custom op handler. Used for game-specific math that doesn't
 *  fit the standard set (e.g. `res(r)` for the kinked resistance formula).
 *
 *  Returns `unregister` for cleanup in tests. */
export function registerOp(
  name: string,
  fn: (args: number[]) => number,
): () => void {
  if (customOps.has(name)) {
    throw new Error(`Custom op '${name}' already registered`)
  }
  customOps.set(name, fn)
  return () => customOps.delete(name)
}

// =============================================================================
// Evaluator
// =============================================================================

export function evaluate(n: Node, scope: Scope): number {
  switch (n.op) {
    case 'const':
      return n.v
    case 'var': {
      const v = scope.get(n.name)
      if (v !== undefined) return v
      if (n.default !== undefined) return n.default
      // Fail-fast: typos and missing pipeline wiring blow up immediately.
      // If you legitimately want a default-0 read, declare it: `v('x', 0)`.
      throw new Error(`Unbound variable: '${n.name}'`)
    }
    case 'sum':
      return n.args.reduce((acc, a) => acc + evaluate(a, scope), 0)
    case 'prod':
      return n.args.reduce((acc, a) => acc * evaluate(a, scope), 1)
    case 'min':
      return n.args.length === 0
        ? Infinity
        : Math.min(...n.args.map((a) => evaluate(a, scope)))
    case 'max':
      return n.args.length === 0
        ? -Infinity
        : Math.max(...n.args.map((a) => evaluate(a, scope)))
    case 'sub':
      return evaluate(n.lhs, scope) - evaluate(n.rhs, scope)
    case 'div': {
      const d = evaluate(n.rhs, scope)
      if (d === 0) throw new Error('AST: division by zero')
      return evaluate(n.lhs, scope) / d
    }
    case 'if':
      return evaluate(n.cond, scope) !== 0
        ? evaluate(n.then, scope)
        : evaluate(n.else, scope)
    case 'cmp': {
      const l = evaluate(n.lhs, scope)
      const r = evaluate(n.rhs, scope)
      switch (n.rel) {
        case '>': return l > r ? 1 : 0
        case '>=': return l >= r ? 1 : 0
        case '<': return l < r ? 1 : 0
        case '<=': return l <= r ? 1 : 0
        case '==': return l === r ? 1 : 0
        case '!=': return l !== r ? 1 : 0
      }
    }
    case 'lookup': {
      const i = Math.floor(evaluate(n.idx, scope))
      return n.table[i] ?? 0
    }
    case 'scope': {
      // Bindings evaluate in the OUTER scope, then are installed in a child
      // scope for the body. This matches `let x = ... in body` semantics:
      // bindings can refer to outer vars but not to each other.
      const child = scope.child()
      for (const [k, val] of Object.entries(n.bindings)) {
        child.set(k, evaluate(val, scope))
      }
      return evaluate(n.body, child)
    }
    case 'custom': {
      const fn = customOps.get(n.name)
      if (!fn) throw new Error(`Unknown custom op: '${n.name}'`)
      return fn(n.args.map((a) => evaluate(a, scope)))
    }
  }
}

// =============================================================================
// Free-variable analysis — useful for UI ("which conds does this buff need?")
// =============================================================================

export function freeVars(n: Node, bound: ReadonlySet<string> = new Set()): Set<string> {
  const result = new Set<string>()
  walk(n, bound)
  return result

  function walk(node: Node, bnd: ReadonlySet<string>) {
    switch (node.op) {
      case 'const':
        return
      case 'var':
        if (!bnd.has(node.name)) result.add(node.name)
        return
      case 'sum':
      case 'prod':
      case 'min':
      case 'max':
      case 'custom':
        node.args.forEach((a) => walk(a, bnd))
        return
      case 'sub':
      case 'div':
      case 'cmp':
        walk(node.lhs, bnd)
        walk(node.rhs, bnd)
        return
      case 'if':
        walk(node.cond, bnd)
        walk(node.then, bnd)
        walk(node.else, bnd)
        return
      case 'lookup':
        walk(node.idx, bnd)
        return
      case 'scope': {
        // Binding values are evaluated in the OUTER scope — their free vars
        // are still free to the caller.
        Object.values(node.bindings).forEach((v) => walk(v, bnd))
        const innerBnd = new Set([...bnd, ...Object.keys(node.bindings)])
        walk(node.body, innerBnd)
        return
      }
    }
  }
}

// =============================================================================
// Pretty-print — UI uses this to show calculation traces
// =============================================================================

export interface PrettyOptions {
  /** When set, `var` nodes are rendered as `name(=42)` showing the bound value.
   *  Use for trace mode. */
  scope?: Scope
  /** Truncate floats to N decimals (default 3). */
  precision?: number
}

export function pretty(n: Node, opts: PrettyOptions = {}): string {
  const precision = opts.precision ?? 3
  const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(precision))

  function go(node: Node): string {
    switch (node.op) {
      case 'const':
        return fmt(node.v)
      case 'var': {
        if (!opts.scope) return node.name
        const v = opts.scope.get(node.name)
        return v !== undefined ? `${node.name}(=${fmt(v)})` : node.name
      }
      case 'sum':
        return node.args.length === 0 ? '0' : `(${node.args.map(go).join(' + ')})`
      case 'prod':
        return node.args.length === 0 ? '1' : `(${node.args.map(go).join(' × ')})`
      case 'min':
        return `min(${node.args.map(go).join(', ')})`
      case 'max':
        return `max(${node.args.map(go).join(', ')})`
      case 'sub':
        return `(${go(node.lhs)} - ${go(node.rhs)})`
      case 'div':
        return `(${go(node.lhs)} / ${go(node.rhs)})`
      case 'if':
        return `if(${go(node.cond)}, ${go(node.then)}, ${go(node.else)})`
      case 'cmp':
        return `(${go(node.lhs)} ${node.rel} ${go(node.rhs)})`
      case 'lookup':
        return `table[${go(node.idx)}]`
      case 'scope': {
        const parts = Object.entries(node.bindings).map(([k, v]) => `${k}=${go(v)}`)
        return `let { ${parts.join(', ')} } in ${go(node.body)}`
      }
      case 'custom':
        return `${node.name}(${node.args.map(go).join(', ')})`
    }
  }
  return go(n)
}

// =============================================================================
// Simplify — constant folding + algebraic identity removal
// =============================================================================

export function simplify(n: Node): Node {
  switch (n.op) {
    case 'const':
    case 'var':
      return n

    case 'sum': {
      const args = n.args.map(simplify)
      const consts: number[] = []
      const rest: Node[] = []
      for (const a of args) {
        if (a.op === 'const') consts.push(a.v)
        else if (a.op === 'sum') rest.push(...a.args) // flatten
        else rest.push(a)
      }
      const k = consts.reduce((a, b) => a + b, 0)
      if (rest.length === 0) return { op: 'const', v: k }
      if (k === 0) return rest.length === 1 ? rest[0]! : { op: 'sum', args: rest }
      return { op: 'sum', args: [...rest, { op: 'const', v: k }] }
    }

    case 'prod': {
      const args = n.args.map(simplify)
      const consts: number[] = []
      const rest: Node[] = []
      for (const a of args) {
        if (a.op === 'const') consts.push(a.v)
        else if (a.op === 'prod') rest.push(...a.args)
        else rest.push(a)
      }
      const k = consts.reduce((a, b) => a * b, 1)
      if (k === 0) return { op: 'const', v: 0 }
      if (rest.length === 0) return { op: 'const', v: k }
      if (k === 1) return rest.length === 1 ? rest[0]! : { op: 'prod', args: rest }
      return { op: 'prod', args: [...rest, { op: 'const', v: k }] }
    }

    case 'if': {
      const cond = simplify(n.cond)
      if (cond.op === 'const') return cond.v !== 0 ? simplify(n.then) : simplify(n.else)
      return { op: 'if', cond, then: simplify(n.then), else: simplify(n.else) }
    }

    case 'cmp': {
      const lhs = simplify(n.lhs)
      const rhs = simplify(n.rhs)
      if (lhs.op === 'const' && rhs.op === 'const') {
        const l = lhs.v, r = rhs.v
        let result = 0
        switch (n.rel) {
          case '>': result = l > r ? 1 : 0; break
          case '>=': result = l >= r ? 1 : 0; break
          case '<': result = l < r ? 1 : 0; break
          case '<=': result = l <= r ? 1 : 0; break
          case '==': result = l === r ? 1 : 0; break
          case '!=': result = l !== r ? 1 : 0; break
        }
        return { op: 'const', v: result }
      }
      return { op: 'cmp', rel: n.rel, lhs, rhs }
    }

    case 'sub': {
      const lhs = simplify(n.lhs)
      const rhs = simplify(n.rhs)
      if (lhs.op === 'const' && rhs.op === 'const') return { op: 'const', v: lhs.v - rhs.v }
      if (rhs.op === 'const' && rhs.v === 0) return lhs
      return { op: 'sub', lhs, rhs }
    }
    case 'div': {
      const lhs = simplify(n.lhs)
      const rhs = simplify(n.rhs)
      if (lhs.op === 'const' && rhs.op === 'const') {
        if (rhs.v === 0) throw new Error('AST: division by zero (during simplify)')
        return { op: 'const', v: lhs.v / rhs.v }
      }
      return { op: 'div', lhs, rhs }
    }

    case 'min':
    case 'max': {
      const args = n.args.map(simplify)
      const consts: number[] = []
      const rest: Node[] = []
      for (const a of args) {
        if (a.op === 'const') consts.push(a.v)
        else rest.push(a)
      }
      if (rest.length === 0) {
        return { op: 'const', v: n.op === 'min' ? Math.min(...consts) : Math.max(...consts) }
      }
      return { op: n.op, args } as Node
    }

    case 'lookup': {
      const idx = simplify(n.idx)
      if (idx.op === 'const') {
        return { op: 'const', v: n.table[Math.floor(idx.v)] ?? 0 }
      }
      return { op: 'lookup', table: n.table, idx }
    }

    case 'scope': {
      // Don't try to be too clever — inline bindings can blow up the tree.
      const bindings: Record<string, Node> = {}
      for (const [k, v] of Object.entries(n.bindings)) bindings[k] = simplify(v)
      return { op: 'scope', bindings, body: simplify(n.body) }
    }

    case 'custom': {
      const args = n.args.map(simplify)
      // We could fold if all args are const AND the op is registered as pure —
      // but registration doesn't (yet) declare purity. Leave as-is.
      return { op: 'custom', name: n.name, args }
    }
  }
}

// =============================================================================
// Builder helpers — call from sheet definitions for readable expressions
// =============================================================================

type ArgLike = Node | number

const toNode = (x: ArgLike): Node => (typeof x === 'number' ? { op: 'const', v: x } : x)

export const c = (v: number): Node => ({ op: 'const', v })
export const v = (name: string, default_?: number): Node => ({ op: 'var', name, default: default_ })
export const sum = (...args: ArgLike[]): Node => ({ op: 'sum', args: args.map(toNode) })
export const prod = (...args: ArgLike[]): Node => ({ op: 'prod', args: args.map(toNode) })
export const min = (...args: ArgLike[]): Node => ({ op: 'min', args: args.map(toNode) })
export const max = (...args: ArgLike[]): Node => ({ op: 'max', args: args.map(toNode) })
export const sub = (lhs: ArgLike, rhs: ArgLike): Node => ({ op: 'sub', lhs: toNode(lhs), rhs: toNode(rhs) })
export const div = (lhs: ArgLike, rhs: ArgLike): Node => ({ op: 'div', lhs: toNode(lhs), rhs: toNode(rhs) })
export const neg = (x: ArgLike): Node => sub(0, x)

// Comparison builders — return a 0/1 node that can be used as a condition.
export const gt = (lhs: ArgLike, rhs: ArgLike): Node => ({ op: 'cmp', rel: '>', lhs: toNode(lhs), rhs: toNode(rhs) })
export const ge = (lhs: ArgLike, rhs: ArgLike): Node => ({ op: 'cmp', rel: '>=', lhs: toNode(lhs), rhs: toNode(rhs) })
export const lt = (lhs: ArgLike, rhs: ArgLike): Node => ({ op: 'cmp', rel: '<', lhs: toNode(lhs), rhs: toNode(rhs) })
export const le = (lhs: ArgLike, rhs: ArgLike): Node => ({ op: 'cmp', rel: '<=', lhs: toNode(lhs), rhs: toNode(rhs) })
export const eq = (lhs: ArgLike, rhs: ArgLike): Node => ({ op: 'cmp', rel: '==', lhs: toNode(lhs), rhs: toNode(rhs) })
export const ne = (lhs: ArgLike, rhs: ArgLike): Node => ({ op: 'cmp', rel: '!=', lhs: toNode(lhs), rhs: toNode(rhs) })

// Conditional builder. Use as `when(cond, then[, else])`. Default else = 0.
export const when = (cond: Node, then_: ArgLike, else_: ArgLike = 0): Node => ({
  op: 'if', cond, then: toNode(then_), else: toNode(else_),
})

// Short-circuit helpers — the most common buff pattern is "if cond>=threshold then value else 0".
export const ifGE = (lhs: ArgLike, rhs: ArgLike, then_: ArgLike, else_: ArgLike = 0): Node => when(ge(lhs, rhs), then_, else_)
export const ifEQ = (lhs: ArgLike, rhs: ArgLike, then_: ArgLike, else_: ArgLike = 0): Node => when(eq(lhs, rhs), then_, else_)
export const ifOn = (boolVar: Node, then_: ArgLike, else_: ArgLike = 0): Node => when(ne(boolVar, 0), then_, else_)

export const lookup = (table: readonly number[], idx: ArgLike): Node => ({ op: 'lookup', table, idx: toNode(idx) })

export const letIn = (bindings: Record<string, ArgLike>, body: Node): Node => {
  const b: Record<string, Node> = {}
  for (const [k, v] of Object.entries(bindings)) b[k] = toNode(v)
  return { op: 'scope', bindings: b, body }
}

export const custom = (name: string, ...args: ArgLike[]): Node => ({ op: 'custom', name, args: args.map(toNode) })
