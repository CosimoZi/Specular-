// 哥伦比娅 / Columbina — 5★ catalyst, hydro. Wired by Specular.
//
// Vendor sheet: vendor/go/gi/sheets/src/Characters/Columbina/index.tsx
//
// Stat-side buffs (vendor: `ownBuff` and `teamBuff.premod`):
//   A1 (cond a1Stacks 1-3): +5% CR / stack.
//   A6 (passive3): HP/1000 × 0.2% → moon-reaction baseDmg for all reaction types.
//   C2 cond c2Brilliance: +40% HP self.
//   C2 cond c2Lunar* (active char): per-reaction +ATK/EM/DEF (we don't propagate cross-char).
//   C6: per-reaction-type +80% CDmg on corresponding element (hydro/electro/dendro/geo).
//   C1+C2+C3+C4+C5+C6 lunar_specialDmg_ summed → moonReactionElevation (in formula buffs).

import type { CharacterSheet } from '../sheet-types'

export const Columbina: CharacterSheet = {
  key: 'Columbina',
  conds: [
    { name: 'a1Stacks', type: 'num', label: 'A1 月诱叠层(+5% CR/层, 最多 3)', intOnly: true, min: 0, max: 3 },
    { name: 'c2Brilliance', type: 'bool', label: 'C2 触发引力干涉(+40% HP 8s)' },
    { name: 'c4Buff', type: 'bool', label: 'C4 引力干涉 → 月反应 HP-based 加成' },
    { name: 'burstDomain', type: 'bool', label: 'Q 月之领域(月反应增伤 +X%/talent)' },
    { name: 'c6Lunarcharged', type: 'bool', label: 'C6 月感电触发(雷+水 +80% CD)' },
    { name: 'c6Lunarbloom', type: 'bool', label: 'C6 月绽放触发(草+水 +80% CD)' },
    { name: 'c6Lunarcrystallize', type: 'bool', label: 'C6 月结晶触发(岩+水 +80% CD)' },
    // C2 per-reaction cross-char buffs (HP-based ATK/EM/DEF to active) not modeled.
  ],
  apply(scope, ctx, condState) {
    // A1: per-stack +5% CR.
    if (ctx.ascension >= 1) {
      const stacks = condState.Columbina?.a1Stacks ?? 0
      if (stacks > 0) {
        scope.add('premod.critRate_', 0.05 * stacks, `月亮诱发的疯狂(A1, ${stacks} 层)`)
      }
    }
    // C2: trigger 引力干涉 → +40% HP self 8s.
    if (ctx.constellation >= 2 && condState.Columbina?.c2Brilliance) {
      scope.add('premod.hp_', 0.4, 'C2 为夜增辉,与君遥伴(引力干涉 → +40% HP)')
    }
    // C6 (vendor: teamBuff.premod.{hydro,electro,dendro,geo}_critDMG_):
    // Each per-trigger cond adds +80% CDmg to ONE non-hydro element.
    // Hydro gets +80% ONCE if ANY of the 3 conds is on (vendor uses
    // `greaterEq(sum(...), 1, X)`, NOT cumulative). Prior bug: hydro stacked
    // up to +240% when all three were on.
    applyColumbinaC6CritDMG(scope, ctx.constellation, condState)
  },
  applyAsTeammate(focusScope, condState, wearer) {
    // C6 critDMG_ is teamBuff.premod in vendor — propagate to focus's
    // per-element CDmg slots. formula.ts reads final.critDMG_.<def.element>,
    // so only matching-element formulas pick it up (e.g. hydro Furina's
    // burst gets hydro +80% even though Columbina is just a teammate).
    applyColumbinaC6CritDMG(focusScope, wearer.constellation, condState)

    // A6 月兆祝赐·借汝月光 (TEAM buff per vendor
    // `teamBuff.premod.<reaction>_baseDmg_`): per 1000 HP, +0.2% moon-reaction
    // base damage (cap 7%). Always-on once Linnea ascended past A6 (vendor:
    // a0_ prefix → always-on utility, no asc gate).
    const baseBoost = Math.min(0.07, (wearer.finalHp / 1000) * 0.002)
    if (baseBoost > 0) {
      focusScope.add(
        'premod.moonReactionBaseBoost',
        baseBoost,
        `Columbina 月兆祝赐·借汝月光(HP ${Math.round(wearer.finalHp)} → +${(baseBoost * 100).toFixed(1)}% 月反应基础)`,
      )
    }

    // C1-C6 _specialDmg_ elevation (TEAM buff per vendor
    // `teamBuff.premod.<reaction>_specialDmg_` summed across all unlocked
    // constellations).
    let elevation = 0
    if (wearer.constellation >= 1) elevation += 0.015
    if (wearer.constellation >= 2) elevation += 0.01
    if (wearer.constellation >= 3) elevation += 0.015
    if (wearer.constellation >= 4) elevation += 0.015
    if (wearer.constellation >= 5) elevation += 0.015
    if (wearer.constellation >= 6) elevation += 0.07
    if (elevation > 0) {
      focusScope.add(
        'premod.moonReactionElevation',
        elevation,
        `Columbina 命之座累加月反应擢升 +${(elevation * 100).toFixed(1)}%`,
      )
    }

    // Q 月之领域 burstDomain (TEAM buff per vendor
    // `teamBuff.premod.<reaction>_dmg_`): in burst field, +EM × lunar_dmg_
    // coefficient (per Q talent level). burst[1] = [0.13, ..., 0.55] over
    // 15 levels. Gated by burstDomain cond.
    if (condState.Columbina?.burstDomain) {
      const lvl = wearer.talents.burst
      // burst[1] table; lvl is 1-indexed, clamp into range.
      const burstTable = [0.13, 0.17, 0.22, 0.26, 0.30, 0.35, 0.40, 0.42, 0.45, 0.47, 0.50, 0.52, 0.55, 0.575, 0.6]
      const idx = Math.max(0, Math.min(lvl - 1, burstTable.length - 1))
      const coef = burstTable[idx]!
      focusScope.add(
        'premod.moonReactionDmgBoost',
        coef,
        `Columbina 月之领域(burst${lvl} 月反应 +${(coef * 100).toFixed(0)}%)`,
      )
    }

    // C2 cross-char active-char buffs (TEAM per vendor `teamBuff.total.{atk,
    // eleMas, def}`): per-reaction-type, HP-based. Gated by c2Brilliance +
    // moonFull + per-reaction toggle. Coefficients from vendor constellation2
    // (atk = HP × 1%, eleMas = HP × 0.35%, def = HP × 1%).
    const cs = condState.Columbina
    if (wearer.constellation >= 2 && cs?.c2Brilliance && cs?.moonFull) {
      if (cs.c2Lunarcharged) {
        const v = wearer.finalHp * 0.01
        if (v > 0) focusScope.add('premod.atk.flat', v, `Columbina C2 月感电(HP × 1% → +${v.toFixed(0)} ATK)`)
      }
      if (cs.c2Lunarbloom) {
        const v = wearer.finalHp * 0.0035
        if (v > 0) focusScope.add('premod.eleMas', v, `Columbina C2 月绽放(HP × 0.35% → +${v.toFixed(0)} EM)`)
      }
      if (cs.c2Lunarcrystallize) {
        const v = wearer.finalHp * 0.01
        if (v > 0) focusScope.add('premod.def.flat', v, `Columbina C2 月结晶(HP × 1% → +${v.toFixed(0)} DEF)`)
      }
    }
  },
}

import type { Scope } from '../scope'
import type { CondState } from '../sheet-types'

function applyColumbinaC6CritDMG(scope: Scope, constellation: number, condState: CondState) {
  if (constellation < 6) return
  const cs = condState.Columbina ?? {}
  if (cs.c6Lunarcharged) scope.add('premod.critDMG_.electro', 0.8, '哥伦比娅 C6 月感电触发 → 雷暴击伤害 +80%')
  if (cs.c6Lunarbloom) scope.add('premod.critDMG_.dendro', 0.8, '哥伦比娅 C6 月绽放触发 → 草暴击伤害 +80%')
  if (cs.c6Lunarcrystallize) scope.add('premod.critDMG_.geo', 0.8, '哥伦比娅 C6 月结晶触发 → 岩暴击伤害 +80%')
  // Hydro: ONE-shot if any of the 3 is on (matches vendor `greaterEq(sum, 1, X)`).
  if (cs.c6Lunarcharged || cs.c6Lunarbloom || cs.c6Lunarcrystallize) {
    scope.add('premod.critDMG_.hydro', 0.8, '哥伦比娅 C6 任意月反应触发 → 水暴击伤害 +80%')
  }
}
