// Damage formula evaluation.
//
// A formula is a (move, element, base-AST) triple. The pipeline runs base AST
// against the built scope, then layers on:
//   * DMG bonus  = 1 + dmg_<element> + dmg_<move>
//   * Crit multi = 1 + CR × CDmg  (avg mode, our default; on/off modes available)
//   * Enemy DEF  = (charLvl + 100) / (charLvl + 100 + (enemyLvl + 100) × (1 - defIgn) × (1 - defRed))
//                  ↑ 穿透 (defIgn) 和 降低 (defRed) 之间乘算; 同类各源相加
//   * Enemy RES  = piecewise (Genshin RES formula)
//
// Each zone produces a rich `ZoneBreakdown` (value + component rows) so the
// UI can render an expand-on-click panel mirroring the panel-stat breakdown.

import { evaluate, type Node } from './ast'
import { Scope } from './scope'
import {
  TRANSFORMATIVE_REACTION_BASE,
  MOON_REACTION_COEFF,
  TRANSFORMATIVE_REACTION_COEFF,
  QUICKEN_REACTION_COEFF,
  type MoonReactionType,
  type TransformativeReactionType,
  type QuickenReactionType,
} from './data/reaction-base'

export type ElementKey =
  | 'pyro' | 'hydro' | 'cryo' | 'electro' | 'anemo' | 'geo' | 'dendro' | 'physical'
export type MoveKey = 'normal' | 'charged' | 'plunging' | 'skill' | 'burst'
export type CritMode = 'off' | 'on' | 'avg'

/** Formula kind controls how `evaluateFormula` assembles damage:
 *
 *  - 'standard': `(atk × mult) × (1 + dmg_<ele> + dmg_<move>) × crit × def × res`
 *    The default — talent attacks, charged shots, plunge.
 *
 *  - 'reactionMoon' / 'directMoon': moon-reaction formulas per 月白姬君's
 *     community reference. The full expression is:
 *
 *     [transformativeBase × 1.6 (reactionMoon)  OR  3 × mainStat × mult (directMoon)]
 *       × (1 + 基础提升%)                              ← premod.moonReactionBaseBoost
 *       + flatAddFromBaseAst                          ← from `def.base` AST (e.g. Linnea C1)
 *     × (1 + 精通增益 + 月反应增伤%)                    ← premod.moonReactionDmgBoost
 *     × 抗性系数                                       ← enemy preRes (defMulti=1 — perforates DEF)
 *     × 暴击区                                         ← (1 + CR × CDmg)
 *     × (1 + 擢升)                                     ← premod.moonReactionElevation
 *
 *     No element-DMG-bonus, no enemy-DEF mitigation. */
export type FormulaKind = 'standard' | 'reactionMoon' | 'directMoon' | 'transformative'

export interface FormulaDef {
  name: string
  move: MoveKey
  element: ElementKey
  /** What kind of damage formula. Default 'standard'. */
  kind?: FormulaKind
  /** For reactionMoon / directMoon: which moon reaction this is. Determines
   *  the coefficient (crystallize=1.6, electrocharged=3, bloom=TBD). */
  moonReaction?: MoonReactionType
  /** For `transformative` kind: which non-moon transformative reaction. Pairs
   *  with `TRANSFORMATIVE_REACTION_COEFF` to pick the base coefficient.
   *  Damage element comes from `def.element` (allows swirl-element override). */
  transformativeReaction?: TransformativeReactionType
  /** AST for the base damage zone (standard) or for the multiplier × stat
   *  expression (directMoon). For reactionMoon this is an optional flat
   *  addition (e.g. Linnea C1 stack-consume DEF flat add). */
  base: Node
  /** Optional flat additive for `directMoon` — added AFTER the
   *  `coeff × baseExpr × (1 + baseBoost)` term but before the dmgBonus
   *  multiplication. Used e.g. by Linnea 百万吨重锤 to layer C1's
   *  stacks-consumed `DEF × 150% × stacks` flat on top of the directMoon hit. */
  flat?: Node
  /** Per-formula stat additions. Each entry is `<scope-key>: <AST>`; at
   *  evaluation time we read the original scope value, add the evaluated AST
   *  result, and use that sum when this specific formula reads the key. */
  premod?: Record<string, Node>
  /** Per-formula final multiplier. Applied to the headline damage AFTER all
   *  other zones. Use for "this specific hit deals X% more damage" effects
   *  (e.g. Zibai C4 shift4_gleam ×1.5, Jahoda A1 robot ×1.3). Default 1 (no
   *  effect). Evaluated against the formula's scope (same as `base`/`flat`/`premod`).
   */
  mult?: Node
  /** Amplifying reaction trigger. When set (only valid for `standard` kind),
   *  the headline damage is multiplied by:
   *    multiplier × (1 + (25/9 × EM) / (EM + 1400) + reaction_dmg_)
   *
   *  `kind` picks the scope key for reaction-specific dmg boost
   *  (`premod.<kind>DmgBoost`) — also reads catch-all
   *  `premod.amplifyReactionDmgBoost`.
   *
   *  `multiplier`: 2.0 for "strong" (water-triggers-pyro vape / pyro-triggers-cryo
   *  melt), 1.5 for "weak" (the opposite direction). Sheet author picks based
   *  on the attack element and intended reaction.
   *
   *  Example: 香菱 Q on hydro-applied enemy → forward vape × 2.0 */
  amplifyReaction?: { kind: 'vaporize' | 'melt'; multiplier: 1.5 | 2.0 }
  /** Quickened reaction trigger (aggravate / spread). When set (only valid for
   *  `standard` kind), a FLAT amount is added to the base zone before
   *  multiplying by dmgBonus / crit / def / res:
   *    flat = levelBase × baseCoef × (1 + (5 × EM) / (EM + 1200) + reaction_dmg_)
   *  baseCoef: aggravate=1.15, spread=1.25.
   *  Scope keys: `premod.aggravateDmgBoost` / `spreadDmgBoost` (specific)
   *  and `premod.quickenReactionDmgBoost` (catch-all).
   *
   *  Aggravate is for electro hits (Cyno N/E/Q, Keqing E, etc.). Spread is
   *  for dendro hits (Nahida E ticks, Alhaitham mirrors, etc.). */
  quickenReaction?: QuickenReactionType
  /** Optional element-infusion override. When `gate` evaluates non-zero, the
   *  formula's effective element switches from `def.element` to `element`.
   *  Affects all element-keyed reads: per-element CR/CD, RES, dmgBonus,
   *  per-element flat-add slot. The output's `element` field also reports
   *  the resolved element so UI labels stay correct.
   *
   *  Examples:
   *    - Bennett C6 sword/claymore/polearm pyro infusion on normals
   *    - Chongyun E cryo infusion on melee normals (team-wide)
   *    - Flins 月转时隙 mode N/C → electro (her normals are physical by default)
   *
   *  Pattern: `{ gate: ifGE(v('constellation'), 6, ifOn(v('cond.Bennett.activeInArea'), 1, 0), 0), element: 'pyro' }` */
  elementOverride?: { gate: Node; element: ElementKey }
}

export interface EnemyContext {
  level: number
  /** Pre-mitigation RES, 0..1. Default 0.1 (10% across all elements). */
  preRes?: Partial<Record<ElementKey, number>>
  defRed?: number
  defIgn?: number
}

export interface FormulaContext {
  scope: Scope
  charLevel: number
  enemy: EnemyContext
  critMode?: CritMode
}

/** One row in a zone's breakdown panel — a labeled numeric contribution. */
export interface BreakdownRow {
  /** Localized label (Chinese). */
  label: string
  /** Numeric value. Renderer formats based on `kind`. */
  value: number
  /** How to display the value:
   *    'int'   — plain integer (atk/def/hp absolute)
   *    'pct'   — percent (0.466 → +46.6%)
   *    'multi' — multiplier (1.466 → ×1.466)
   *    'raw'   — N.NN (for raw floats like EM bonus rates) */
  kind?: 'int' | 'pct' | 'multi' | 'raw'
}

/** Per-zone breakdown — final multiplier value plus the components that
 *  built it. */
export interface ZoneBreakdown {
  /** Final value used in the formula assembly. */
  value: number
  /** Component rows. */
  rows: BreakdownRow[]
  /** Optional textual formula like "ATK × mult" or "(1 + EM_bonus + dmgBoost)". */
  formula?: string
}

export interface FormulaBreakdown {
  base: ZoneBreakdown
  dmgBonus: ZoneBreakdown
  critMulti: ZoneBreakdown
  defMulti: ZoneBreakdown
  resMulti: ZoneBreakdown
  /** 擢升 — only meaningful for moon reactions. Value = 1 + elevation%.
   *  Always present (defaults to {value: 1, rows: []}) so consumer can
   *  unconditionally render it (and choose to hide if value === 1). */
  elevation: ZoneBreakdown
  /** Amplifying reaction multiplier (vaporize / melt). Only present when the
   *  formula sets `amplifyReaction`. Value = baseCoef × (1 + EM bonus + dmg_). */
  amplify?: ZoneBreakdown
}

export interface FormulaResult {
  name: string
  move: MoveKey
  element: ElementKey
  /** Expected (avg-crit-mode) damage — the headline number. */
  value: number
  /** Non-crit damage (critMulti = 1). */
  nonCrit: number
  /** Crit damage (critMulti = 1 + CDmg). */
  crit: number
  /** Per-zone breakdown for the click-to-expand UI panel. */
  breakdown: FormulaBreakdown
}

/** Build a child scope that layers per-formula `premod` additions on top of
 *  the team scope. Each premod entry is evaluated in the ORIGINAL scope (so
 *  it can read constellation, conds, etc.), and the result is ADDED to the
 *  existing scope value. */
function buildFormulaScope(scope: Scope, premod: Record<string, Node> | undefined): Scope {
  if (!premod) return scope
  const sub = scope.child()
  for (const [key, node] of Object.entries(premod)) {
    const baseVal = scope.get(key) ?? 0
    const addVal = evaluate(node, scope)
    sub.set(key, baseVal + addVal)
  }
  return sub
}

export function evaluateFormula(def: FormulaDef, ctx: FormulaContext): FormulaResult {
  const { scope: rawScope, charLevel, enemy, critMode = 'avg' } = ctx
  const scope = buildFormulaScope(rawScope, def.premod)
  const kind = def.kind ?? 'standard'
  const baseExpr = evaluate(def.base, scope)

  // ----- Resolve effective element (element infusion override) -----
  // If def.elementOverride is set AND its gate AST evaluates non-zero, the
  // formula's element switches (e.g. Bennett C6 + activeInArea → pyro on
  // sword/claymore/polearm normals). All element-keyed reads below use
  // `resolvedElement` instead of `def.element`. Output's `element` field also
  // reports the resolved value so UI labels match the actual damage element.
  const resolvedElement: ElementKey =
    def.elementOverride && evaluate(def.elementOverride.gate, scope) !== 0
      ? def.elementOverride.element
      : def.element

  // ----- Crit zone (common) -----
  // Global CR/CD plus per-element + per-reaction bonuses (used by Columbina C6
  // hydro_critDMG_, Lauma A1 bloom_critRate_, etc.).
  const crGlobal = scope.get('cappedCritRate_') ?? 0
  const crEle = scope.get(`final.critRate_.${resolvedElement}`) ?? 0
  const crReaction = def.moonReaction
    ? (scope.get(`final.critRate_.${def.moonReaction}`) ?? 0)
    : 0
  const cr = Math.max(0, Math.min(1, crGlobal + crEle + crReaction))
  const cdGlobal = scope.get('final.critDMG_') ?? 0
  const cdEle = scope.get(`final.critDMG_.${resolvedElement}`) ?? 0
  const cdReaction = def.moonReaction
    ? (scope.get(`final.critDMG_.${def.moonReaction}`) ?? 0)
    : 0
  const cd = cdGlobal + cdEle + cdReaction
  const critMultiNonCrit = 1
  const critMultiCrit = 1 + cd
  const critMultiAvg = 1 + cr * cd
  const critMultiHeadline =
    critMode === 'on' ? critMultiCrit :
    critMode === 'avg' ? critMultiAvg :
    /* off */ critMultiNonCrit

  const critBreakdown: ZoneBreakdown = {
    value: critMultiHeadline,
    rows: [
      { label: '全局暴击率', value: crGlobal, kind: 'pct' },
      { label: `${ELEMENT_LABEL_ZH[resolvedElement]}元素暴击率`, value: crEle, kind: 'pct' },
      ...(def.moonReaction ? [{ label: `${def.moonReaction} 反应暴击率`, value: crReaction, kind: 'pct' as const }] : []),
      { label: '全局暴击伤害', value: cdGlobal, kind: 'pct' },
      { label: `${ELEMENT_LABEL_ZH[resolvedElement]}元素暴击伤害`, value: cdEle, kind: 'pct' },
      ...(def.moonReaction ? [{ label: `${def.moonReaction} 反应暴击伤害`, value: cdReaction, kind: 'pct' as const }] : []),
    ],
    formula:
      critMode === 'on' ? '1 + 暴击伤害' :
      critMode === 'avg' ? '1 + 暴击率 × 暴击伤害' :
      '1 (未暴击)',
  }

  // ----- Enemy RES zone (common) -----
  const res = enemy.preRes?.[resolvedElement] ?? 0.1
  const resMulti = res >= 0.75 ? 1 / (1 + 4 * res) : res >= 0 ? 1 - res : 1 - 0.5 * res
  const resBreakdown: ZoneBreakdown = {
    value: resMulti,
    rows: [
      { label: `敌人 ${ELEMENT_LABEL_ZH[resolvedElement]}抗性`, value: res, kind: 'pct' },
    ],
    formula:
      res >= 0.75 ? '1 / (1 + 4 × 抗性)' :
      res >= 0 ? '1 - 抗性' :
      '1 - 0.5 × 抗性',
  }

  // ----- Base / dmgBonus / defMulti / elevation — kind-dependent -----
  let baseZone: ZoneBreakdown
  let dmgBonusZone: ZoneBreakdown
  let defMultiZone: ZoneBreakdown
  let elevationZone: ZoneBreakdown = { value: 1, rows: [], formula: '1 (无擢升)' }

  if (kind === 'standard') {
    // base zone — atk × mult from baseExpr + per-element dmgInc (flat additive
    // that lands inside the base zone, before the dmgBonus multiplier).
    const finalAtk = scope.get('final.atk') ?? 0
    const finalDef = scope.get('final.def') ?? 0
    const finalHp = scope.get('final.hp') ?? 0
    // Per-element flat-add slot — e.g. `premod.dmgInc.geo` adds a flat amount
    // to all geo hits' base zone (used by Aino A4 EM×50% to burst, Illuga A4
    // dyenightingale EM bonuses on geo, Lauma C2 bloom_dmgInc, etc.).
    const eleDmgInc = scope.get(`premod.dmgInc.${resolvedElement}`) ?? 0
    // Per-move flat-add slot — e.g. `premod.dmgInc.burst` for Aino A4.
    const moveDmgInc = scope.get(`premod.dmgIncMove.${def.move}`) ?? 0
    // Quickened reaction (aggravate/spread) — flat add to the base zone.
    // Computed from level-base × reaction coef × (1 + EM bonus + dmg_). Lives
    // INSIDE the base zone so crit/DEF/RES all apply to it (the wiki standard
    // way quickened reactions hit).
    let quickenFlat = 0
    let quickenEmBonus = 0
    let quickenSpecificDmg = 0
    let quickenCatchAllDmg = 0
    if (def.quickenReaction) {
      const levelBaseQ = TRANSFORMATIVE_REACTION_BASE[Math.floor(charLevel)] ?? 0
      const baseCoefQ = QUICKEN_REACTION_COEFF[def.quickenReaction]
      const emQ = scope.get('final.eleMas') ?? 0
      quickenEmBonus = (5 * emQ) / (emQ + 1200)
      quickenSpecificDmg = scope.get(`premod.${def.quickenReaction}DmgBoost`) ?? 0
      quickenCatchAllDmg = scope.get('premod.quickenReactionDmgBoost') ?? 0
      quickenFlat = levelBaseQ * baseCoefQ * (1 + quickenEmBonus + quickenSpecificDmg + quickenCatchAllDmg)
    }
    const baseTotal = baseExpr + eleDmgInc + moveDmgInc + quickenFlat
    baseZone = {
      value: baseTotal,
      rows: [
        { label: '总 ATK', value: finalAtk, kind: 'int' },
        { label: '总 DEF', value: finalDef, kind: 'int' },
        { label: '总 HP', value: finalHp, kind: 'int' },
        { label: '主属性 × 倍率', value: baseExpr, kind: 'int' },
        { label: `${ELEMENT_LABEL_ZH[resolvedElement]}元素 flat 加成`, value: eleDmgInc, kind: 'int' },
        { label: `${MOVE_LABEL_ZH[def.move]}伤害 flat 加成`, value: moveDmgInc, kind: 'int' },
        ...(def.quickenReaction ? [
          { label: `${def.quickenReaction} 反应 flat 加成`, value: quickenFlat, kind: 'int' as const },
        ] : []),
        { label: '基础区合计', value: baseTotal, kind: 'int' },
      ],
      formula: def.quickenReaction
        ? '主属性 × 倍率 + 元素 flat + 攻击类型 flat + 激化 flat'
        : '主属性 × 技能倍率 + 元素 flat + 攻击类型 flat',
    }

    const eleBonus = scope.get(`final.dmg_.${resolvedElement}`) ?? 0
    const moveBonus = scope.get(`final.dmgMove_.${def.move}`) ?? 0
    dmgBonusZone = {
      value: 1 + eleBonus + moveBonus,
      rows: [
        { label: `${ELEMENT_LABEL_ZH[resolvedElement]}元素伤害加成`, value: eleBonus, kind: 'pct' },
        { label: `${MOVE_LABEL_ZH[def.move]}伤害加成`, value: moveBonus, kind: 'pct' },
      ],
      formula: '1 + 元素伤害 + 攻击类型伤害',
    }

    const charPart = charLevel + 100
    // 防御穿透 (penetration, defIgn) and 防御降低 (reduction, defRed) are
    // INDEPENDENT multipliers, NOT a single additive term.
    //   - Within each category, multiple sources ADD (engine already sums
    //     into defIgn / defRed before they reach here).
    //   - Between categories, they MULTIPLY:
    //       enemyDefFactor = (1 - 穿透) × (1 - 降低)
    //   - So 50% pen + 50% red leaves 0.5 × 0.5 = 25% DEF (not 0% DEF).
    const defIgn = enemy.defIgn ?? 0
    const defRed = enemy.defRed ?? 0
    const defFactor = Math.max(0, 1 - defIgn) * Math.max(0, 1 - defRed)
    const enemyPart = (enemy.level + 100) * defFactor
    const defMulti = charPart / (charPart + enemyPart)
    defMultiZone = {
      value: defMulti,
      rows: [
        { label: '角色等级 + 100', value: charPart, kind: 'int' },
        { label: '敌人等级 + 100', value: enemy.level + 100, kind: 'int' },
        { label: '防御穿透 (各源相加)', value: defIgn, kind: 'pct' },
        { label: '防御降低 (各源相加)', value: defRed, kind: 'pct' },
        { label: '剩余 DEF 系数 (1-穿透) × (1-降低)', value: defFactor, kind: 'raw' },
      ],
      formula: '(L_角色 + 100) / (L_角色 + 100 + (L_敌人 + 100) × (1 - 穿透) × (1 - 降低))',
    }
  } else if (kind === 'transformative') {
    // Non-moon transformative reactions (超载/超导/感电/扩散/碎冰/燃烧).
    // Pure reaction damage — no main-stat × multiplier, no crit, no DEF mitigation.
    //   base = levelBase × reactionCoeff
    //   dmgBonus = 1 + (16 × EM) / (EM + 2000) + <reaction>_dmg_ + catch-all reaction_dmg_
    //   defMulti = 1 (transformative ignores DEF)
    //   resMulti = enemy.preRes[def.element] (standard piecewise)
    //   critMulti = 1 (transformative can't crit; quickened reactions are SEPARATE — TODO)
    //   elevation = 1
    const reaction = def.transformativeReaction ?? 'overload'
    const reactionCoeff = TRANSFORMATIVE_REACTION_COEFF[reaction]
    const levelBase = TRANSFORMATIVE_REACTION_BASE[Math.floor(charLevel)] ?? 0
    const baseValue = levelBase * reactionCoeff

    const em = scope.get('final.eleMas') ?? 0
    const emBonus = (16 * em) / (em + 2000) // transformative uses 16x (vs 6x for moon)
    const specificDmgBoost = scope.get(`premod.${reaction}DmgBoost`) ?? 0
    const catchAllDmgBoost = scope.get('premod.transformativeReactionDmgBoost') ?? 0
    const dmgBoost = specificDmgBoost + catchAllDmgBoost

    baseZone = {
      value: baseValue,
      rows: [
        { label: `等级基础数 (L${Math.floor(charLevel)})`, value: levelBase, kind: 'int' },
        { label: `${reaction} 反应系数`, value: reactionCoeff, kind: 'multi' },
        { label: '基础区合计', value: baseValue, kind: 'int' },
      ],
      formula: '等级基础 × 反应系数',
    }
    dmgBonusZone = {
      value: 1 + emBonus + dmgBoost,
      rows: [
        { label: '元素精通', value: em, kind: 'int' },
        { label: '精通增益 = 16×EM / (EM+2000)', value: emBonus, kind: 'raw' },
        { label: `${reaction} 反应专属增伤`, value: specificDmgBoost, kind: 'pct' },
        { label: '转化反应通用增伤', value: catchAllDmgBoost, kind: 'pct' },
      ],
      formula: '1 + 精通增益 + 反应专属增伤 + 反应通用增伤',
    }
    defMultiZone = {
      value: 1,
      rows: [{ label: '转化反应无视防御', value: 1, kind: 'multi' }],
      formula: '1 (转化反应不吃 DEF)',
    }
    // Override crit to non-crit: transformative reactions can't crit.
  } else {
    // Moon reactions
    const baseBoost = scope.get('premod.moonReactionBaseBoost') ?? 0  // 基础提升%
    // 月反应增伤 reads are SPLIT into per-reaction-specific + a catch-all:
    //   - `premod.lunarchargedDmgBoost` / `lunarbloomDmgBoost` / `lunarcrystallizeDmgBoost`
    //     hold reaction-specific boosts (Flins/Ineffa 月感电, Lauma C2 月绽放,
    //     Zibai stride/team 月结晶). Only the matching reaction reads them.
    //   - `premod.moonReactionDmgBoost` is the catch-all that applies to all
    //     three moon reactions (Aubade/SilkenMoons/NoSU 4pc, Aino C6, Columbina
    //     burst — vendor writes to 5 per-reaction slots with same value, our
    //     catch-all is equivalent and simpler).
    // Both are summed into dmgBoost.
    const moonReactionVendorPrefix: Record<NonNullable<typeof def.moonReaction>, string> = {
      crystallize: 'lunarcrystallize',
      electrocharged: 'lunarcharged',
      bloom: 'lunarbloom',
    }
    const specificKey = `premod.${moonReactionVendorPrefix[def.moonReaction ?? 'crystallize']}DmgBoost`
    const specificDmgBoost = scope.get(specificKey) ?? 0
    const catchAllDmgBoost = scope.get('premod.moonReactionDmgBoost') ?? 0
    const dmgBoost = specificDmgBoost + catchAllDmgBoost
    const elevation = scope.get('premod.moonReactionElevation') ?? 0  // 擢升
    const em = scope.get('final.eleMas') ?? 0
    const emBonus = (6 * em) / (em + 2000) // 精通增益

    dmgBonusZone = {
      value: 1 + emBonus + dmgBoost,
      rows: [
        { label: '元素精通', value: em, kind: 'int' },
        { label: '精通增益 = 6×EM / (EM+2000)', value: emBonus, kind: 'raw' },
        { label: `${def.moonReaction ?? 'crystallize'} 反应专属增伤`, value: specificDmgBoost, kind: 'pct' },
        { label: '月反应通用增伤(套装等)', value: catchAllDmgBoost, kind: 'pct' },
      ],
      formula: '1 + 精通增益 + 月反应专属增伤 + 月反应通用增伤',
    }

    defMultiZone = {
      value: 1,
      rows: [{ label: '月反应穿透防御', value: 1, kind: 'multi' }],
      formula: '1 (月结晶反应无视敌人 DEF)',
    }

    elevationZone = {
      value: 1 + elevation,
      rows: [{ label: '擢升', value: elevation, kind: 'pct' }],
      formula: '1 + 擢升',
    }

    const reaction = def.moonReaction ?? 'crystallize'
    const coeff = MOON_REACTION_COEFF[reaction]
    const reactionDmgInc = scope.get(`premod.dmgIncReaction.${reaction}`) ?? 0
    if (kind === 'reactionMoon') {
      const levelBase = TRANSFORMATIVE_REACTION_BASE[Math.floor(charLevel)] ?? 0
      const mainBase = levelBase * coeff * (1 + baseBoost)
      const baseTotal = mainBase + baseExpr + reactionDmgInc
      baseZone = {
        value: baseTotal,
        rows: [
          { label: `等级基础数 (L${Math.floor(charLevel)})`, value: levelBase, kind: 'int' },
          { label: `月反应系数 (${reaction === 'crystallize' ? '月结晶 1.6' : reaction === 'electrocharged' ? '月感电 3' : reaction === 'bloom' ? '月绽放 2.8' : '?'})`, value: coeff, kind: 'multi' },
          { label: '基础提升%', value: baseBoost, kind: 'pct' },
          { label: '主项 (等级基础 × 系数 × (1+基础提升))', value: mainBase, kind: 'int' },
          { label: 'C1 flat add (DEF × ratio)', value: baseExpr, kind: 'int' },
          { label: `${reaction} 反应 flat 加成`, value: reactionDmgInc, kind: 'int' },
          { label: '基础区合计', value: baseTotal, kind: 'int' },
        ],
        formula: '等级基础 × 系数 × (1+基础提升%) + flat + 反应 flat',
      }
    } else {
      // directMoon
      const flatAdd = def.flat ? evaluate(def.flat, scope) : 0
      const mainTerm = coeff * baseExpr * (1 + baseBoost)
      const baseTotal = mainTerm + flatAdd + reactionDmgInc
      baseZone = {
        value: baseTotal,
        rows: [
          { label: `月反应系数 (${reaction === 'crystallize' ? '月结晶 1.6' : reaction === 'electrocharged' ? '月感电 3' : reaction === 'bloom' ? '月绽放 2.8' : '?'})`, value: coeff, kind: 'multi' },
          { label: '主属性 × 倍率', value: baseExpr, kind: 'int' },
          { label: '基础提升%', value: baseBoost, kind: 'pct' },
          { label: '主项 (系数 × 主属性 × 倍率 × (1+基础提升))', value: mainTerm, kind: 'int' },
          { label: 'C1 flat add (DEF × stacks × ratio)', value: flatAdd, kind: 'int' },
          { label: `${reaction} 反应 flat 加成`, value: reactionDmgInc, kind: 'int' },
          { label: '基础区合计', value: baseTotal, kind: 'int' },
        ],
        formula: '系数 × 主属性 × 倍率 × (1+基础提升%) + flat + 反应 flat',
      }
    }
  }

  // Per-formula final multiplier (Zibai C4 shift4_gleam ×1.5 etc.).
  const formulaMult = def.mult ? evaluate(def.mult, scope) : 1

  // Amplifying reactions (vaporize / melt). Only valid for standard kind —
  // amplify a direct hit's headline damage. Formula:
  //   amplifyMult = baseCoef × (1 + (25/9 × EM) / (EM + 1400) + reaction_dmg_)
  // The (25/9 × EM / (EM + 1400)) coefficient is the Mihoyo standard for
  // amplifying reactions; converges to ~2.78 at extreme EM.
  let amplifyMult = 1
  let amplifyZone: ZoneBreakdown | undefined
  if (kind === 'standard' && def.amplifyReaction) {
    const { kind: rxKind, multiplier: rxBaseCoef } = def.amplifyReaction
    const em = scope.get('final.eleMas') ?? 0
    const amplifyEmBonus = (25 / 9 * em) / (em + 1400)
    const specificDmg = scope.get(`premod.${rxKind}DmgBoost`) ?? 0
    const catchAllDmg = scope.get('premod.amplifyReactionDmgBoost') ?? 0
    amplifyMult = rxBaseCoef * (1 + amplifyEmBonus + specificDmg + catchAllDmg)
    amplifyZone = {
      value: amplifyMult,
      rows: [
        { label: `反应类型`, value: rxBaseCoef, kind: 'multi' },
        { label: '元素精通', value: em, kind: 'int' },
        { label: '精通增益 = 25/9 × EM / (EM+1400)', value: amplifyEmBonus, kind: 'raw' },
        { label: `${rxKind} 反应专属增伤`, value: specificDmg, kind: 'pct' },
        { label: '增幅反应通用增伤', value: catchAllDmg, kind: 'pct' },
      ],
      formula: '基础系数 × (1 + 精通增益 + 反应专属增伤 + 反应通用增伤)',
    }
  }

  // Transformative reactions can't crit. Override crit zone to 1 and zero out
  // the breakdown rows so the panel reflects reality.
  const noCrit = kind === 'transformative'
  if (noCrit) {
    critBreakdown.value = 1
    critBreakdown.rows = [{ label: '转化反应不可暴击', value: 1, kind: 'multi' }]
    critBreakdown.formula = '1 (转化反应不可暴击)'
  }
  const finalCritHeadline = noCrit ? 1 : critMultiHeadline
  const finalCritNonCrit = noCrit ? 1 : critMultiNonCrit
  const finalCritCrit = noCrit ? 1 : critMultiCrit

  const preCrit =
    baseZone.value * dmgBonusZone.value * defMultiZone.value * resBreakdown.value * elevationZone.value * formulaMult * amplifyMult
  const value = preCrit * finalCritHeadline
  const nonCrit = preCrit * finalCritNonCrit
  const crit = preCrit * finalCritCrit

  return {
    name: def.name,
    move: def.move,
    element: resolvedElement,
    value,
    nonCrit,
    crit,
    breakdown: {
      base: baseZone,
      dmgBonus: dmgBonusZone,
      critMulti: critBreakdown,
      defMulti: defMultiZone,
      resMulti: resBreakdown,
      elevation: elevationZone,
      ...(amplifyZone ? { amplify: amplifyZone } : {}),
    },
  }
}

const ELEMENT_LABEL_ZH: Record<ElementKey, string> = {
  pyro: '火', hydro: '水', cryo: '冰', electro: '雷',
  anemo: '风', geo: '岩', dendro: '草', physical: '物',
}

const MOVE_LABEL_ZH: Record<MoveKey, string> = {
  normal: '普通攻击',
  charged: '重击',
  plunging: '下落攻击',
  skill: '元素战技',
  burst: '元素爆发',
}
