// Scope: variable bindings for AST evaluation.
//
// Single class, parent-chain lookup. Buff pipeline is:
//   - Initialize a root scope with character constants (level, ascension, talents, weapon/artifact stats)
//   - For each buff, evaluate its value AST in the (possibly child) scope and accumulate into the same scope
//   - For team buffs, the buffing member's scope evaluates the value; the result is written into the target member's scope
//
// Keep this simple. Map<string, number>. No reactive bullshit, no proxy magic.

/** One source's contribution to a stat slot. */
export interface Contribution {
  /** Human-readable source label (Chinese; matches the i18n style of the
   *  rest of the UI). */
  source: string
  /** The delta this source added to the slot. Sign-preserving. */
  value: number
}

export class Scope {
  private vals: Map<string, number>
  /** Per-slot list of contributions accumulated via `add()` / `setLabelled()`.
   *  Only populated when callers pass a `source`; `add()` without a source
   *  still mutates `vals` but doesn't record. Singleton stats set once via
   *  `set()` aren't recorded — the build pipeline assembles their breakdown
   *  rows directly from the well-known slot keys. */
  private contribs: Map<string, Contribution[]> = new Map()
  readonly parent?: Scope

  constructor(parent?: Scope, init?: Record<string, number>) {
    this.parent = parent
    this.vals = new Map(init ? Object.entries(init) : [])
  }

  get(name: string): number | undefined {
    const v = this.vals.get(name)
    if (v !== undefined) return v
    return this.parent?.get(name)
  }

  getOr(name: string, fallback: number): number {
    return this.get(name) ?? fallback
  }

  set(name: string, value: number): void {
    this.vals.set(name, value)
  }

  /** Sum into a slot. If `source` is given, also records the delta with its
   *  source label so the UI can render a per-source breakdown. */
  add(name: string, delta: number, source?: string): void {
    const cur = this.get(name) ?? 0
    this.vals.set(name, cur + delta)
    if (source !== undefined && delta !== 0) {
      const list = this.contribs.get(name) ?? []
      list.push({ source, value: delta })
      this.contribs.set(name, list)
    }
  }

  setMax(name: string, value: number): void {
    const cur = this.get(name) ?? -Infinity
    this.vals.set(name, Math.max(cur, value))
  }

  /** All contributions for a slot, walking parent chain. Parent-recorded rows
   *  come first. */
  contributionsFor(name: string): Contribution[] {
    const parent = this.parent?.contributionsFor(name) ?? []
    const local = this.contribs.get(name) ?? []
    return [...parent, ...local]
  }

  child(init?: Record<string, number>): Scope {
    return new Scope(this, init)
  }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = {}
    if (this.parent) Object.assign(out, this.parent.snapshot())
    for (const [k, v] of this.vals) out[k] = v
    return out
  }

  keys(): Set<string> {
    const ks = new Set<string>()
    if (this.parent) for (const k of this.parent.keys()) ks.add(k)
    for (const k of this.vals.keys()) ks.add(k)
    return ks
  }
}
