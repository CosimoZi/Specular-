// Scope: variable bindings for AST evaluation.
//
// Single class, parent-chain lookup. Buff pipeline is:
//   - Initialize a root scope with character constants (level, ascension, talents, weapon/artifact stats)
//   - For each buff, evaluate its value AST in the (possibly child) scope and accumulate into the same scope
//   - For team buffs, the buffing member's scope evaluates the value; the result is written into the target member's scope
//
// Keep this simple. Map<string, number>. No reactive bullshit, no proxy magic.

export class Scope {
  private vals: Map<string, number>
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

  /** Like get(), but returns the default if unbound. Used in the AST evaluator
   *  for `var` nodes with a `default` field. */
  getOr(name: string, fallback: number): number {
    return this.get(name) ?? fallback
  }

  set(name: string, value: number): void {
    this.vals.set(name, value)
  }

  /** Sum into a slot. Used by buff accumulation:
   *    scope.add('premod.atk_', 0.165)  // CQ R1 substat
   *    scope.add('premod.atk_', 0.288)  // Shenhe A6 ascension
   *  After both, scope.get('premod.atk_') === 0.453. */
  add(name: string, delta: number): void {
    const cur = this.get(name) ?? 0
    this.vals.set(name, cur + delta)
  }

  /** Replace a slot with the max of current and incoming. Used for non-stacking
   *  buffs (only the strongest source wins). */
  setMax(name: string, value: number): void {
    const cur = this.get(name) ?? -Infinity
    this.vals.set(name, Math.max(cur, value))
  }

  child(init?: Record<string, number>): Scope {
    return new Scope(this, init)
  }

  /** Snapshot — flatten parent chain into a plain object. For debug / UI display. */
  snapshot(): Record<string, number> {
    const out: Record<string, number> = {}
    if (this.parent) Object.assign(out, this.parent.snapshot())
    for (const [k, v] of this.vals) out[k] = v
    return out
  }

  /** Just the keys this scope (or its parents) has bound. */
  keys(): Set<string> {
    const ks = new Set<string>()
    if (this.parent) for (const k of this.parent.keys()) ks.add(k)
    for (const k of this.vals.keys()) ks.add(k)
    return ks
  }
}
