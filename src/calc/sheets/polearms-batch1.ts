// Batch 1 — popular polearms (Shenhe's weapon type) with R1-R5 refinements.
// Each export is a WeaponSheet registered under `weaponSheets`.

import type { WeaponSheet } from '../sheet-types'

const ALL_ELEMENTS = ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro'] as const

// =============================================================================
// 护摩之杖 / Staff of Homa
//   被动: 生命值上限 +20/25/30/35/40%。基于装备者生命值上限,获得 0.8/1/1.2/1.4/1.6% 的攻击力加成;
//   HP <50% 时再 +1/1.2/1.4/1.6/1.8% ATK from HP.
//   面板换算:攻击力 += HP × (0.008..0.018)
// =============================================================================
const HOMA_HP_PCT = [NaN, 0.2, 0.25, 0.3, 0.35, 0.4]
const HOMA_ATK_FROM_HP_NORMAL = [NaN, 0.008, 0.01, 0.012, 0.014, 0.016]
const HOMA_ATK_FROM_HP_LOW = [NaN, 0.018, 0.022, 0.026, 0.03, 0.034] // sum of both buffs

export const StaffOfHoma: WeaponSheet = {
  key: 'StaffOfHoma',
  conds: [
    { name: 'lowHp', type: 'bool', label: 'HP < 50%(攻击力再 +1%-1.8% 生命)' },
  ],
  apply(scope, ctx, condState) {
    const r = ctx.refinement
    scope.add('premod.hp_', HOMA_HP_PCT[r]!, `护摩之杖 被动 R${r}(HP%)`)
    // HP-based flat ATK needs final HP, which is computed later in Phase 11.
    // We approximate using base+%-so-far. The build pipeline does Phase 6 (this
    // function) BEFORE Phase 9 base.hp. To do this properly we'd run Phase 11
    // before passive ATK. For now, read base.hp from char+asc and apply hp_
    // SO FAR; this misses subsequent HP buffs but matches the most common
    // build (Homa wielder relies on HP from artifacts + this passive).
    const baseHp = (scope.get('char.curve.hp') ?? 0) + (scope.get('char.asc.hp') ?? 0)
    const hpPctTotal = HOMA_HP_PCT[r]! +
      (scope.get('char.asc.hp_') ?? 0) +
      (scope.get('weap.substat.hp_') ?? 0) +
      (scope.get('artifact.main.hp_') ?? 0) +
      (scope.get('artifact.sub.hp_') ?? 0)
    const hpFlat = (scope.get('artifact.main.hp') ?? 0) + (scope.get('artifact.sub.hp') ?? 0)
    const finalHpApprox = baseHp * (1 + hpPctTotal) + hpFlat
    const atkPctFromHp = condState.StaffOfHoma?.lowHp
      ? HOMA_ATK_FROM_HP_LOW[r]!
      : HOMA_ATK_FROM_HP_NORMAL[r]!
    const flatAtk = finalHpApprox * atkPctFromHp
    scope.add(
      'artifact.sub.atk', // park flat ATK into the same slot
      flatAtk,
      `护摩之杖 被动 R${r}(HP × ${(atkPctFromHp * 100).toFixed(1)}% → +${Math.round(flatAtk)} 攻击)`,
    )
  },
}

// =============================================================================
// 和璞鸢 / Primordial Jade Winged-Spear
//   被动: 命中敌人后获得 1 层"穿点"效果,+3.2/3.9/4.6/5.3/6% 攻击,6s,最多 7 层。
//   满层额外 +12/15/18/21/24% 全部元素+物理伤害加成。
// =============================================================================
const JADE_ATK_PER_STACK = [NaN, 0.032, 0.039, 0.046, 0.053, 0.06]
const JADE_DMG_AT_MAX = [NaN, 0.12, 0.15, 0.18, 0.21, 0.24]

export const PrimordialJadeWingedSpear: WeaponSheet = {
  key: 'PrimordialJadeWingedSpear',
  conds: [
    { name: 'stacks', type: 'num', label: '穿点层数(每层 +ATK%)', intOnly: true, min: 0, max: 7 },
  ],
  apply(scope, ctx, condState) {
    const r = ctx.refinement
    const stacks = condState.PrimordialJadeWingedSpear?.stacks ?? 0
    if (stacks > 0) {
      const atkPct = stacks * JADE_ATK_PER_STACK[r]!
      scope.add('weap.passive.atk_', atkPct, `和璞鸢 R${r}(${stacks} 层 ATK)`)
    }
    if (stacks >= 7) {
      const bonus = JADE_DMG_AT_MAX[r]!
      for (const ele of ALL_ELEMENTS) scope.add(`premod.dmg_.${ele}`, bonus, `和璞鸢 R${r}(满层 全元素伤害)`)
      scope.add('premod.dmg_.physical', bonus, `和璞鸢 R${r}(满层 物理伤害)`)
    }
  },
}

// =============================================================================
// 天空之脊 / Skyward Spine
//   被动: 暴击率 +8/10/12/14/16% 元素充能效率 +8/10/12/14/16%;
//   普攻/重击命中有 50% 几率触发真空刃(造成 40-100% 攻击力的额外伤害)。
//   面板部分只算 CR;真空刃是 proc DMG,不在面板。
// =============================================================================
const SKYWARD_CR = [NaN, 0.08, 0.1, 0.12, 0.14, 0.16]
const SKYWARD_ER = [NaN, 0.08, 0.1, 0.12, 0.14, 0.16]

export const SkywardSpine: WeaponSheet = {
  key: 'SkywardSpine',
  conds: [],
  apply(scope, ctx) {
    const r = ctx.refinement
    scope.add('premod.critRate_', SKYWARD_CR[r]!, `天空之脊 被动 R${r}(CR)`)
    scope.add('premod.enerRech_', SKYWARD_ER[r]!, `天空之脊 被动 R${r}(ER)`)
  },
}

// =============================================================================
// 薙草之稻光 / Engulfing Lightning
//   被动: 基于元素充能效率,攻击力 +(ER × 28/35/42/49/56%);该效果至多使攻击力 +80/90/100/110/120%。
//   施放 Q 后 12s 内 +30% 元素充能效率。
// =============================================================================
const ENGULFING_ATK_PCT_FROM_ER = [NaN, 0.28, 0.35, 0.42, 0.49, 0.56]
const ENGULFING_ATK_CAP = [NaN, 0.8, 0.9, 1.0, 1.1, 1.2]
const ENGULFING_Q_ER = [NaN, 0.3, 0.35, 0.4, 0.45, 0.5]

export const EngulfingLightning: WeaponSheet = {
  key: 'EngulfingLightning',
  conds: [
    { name: 'afterBurst', type: 'bool', label: 'Q 后 12s(+30% ER)' },
  ],
  apply(scope, ctx, condState) {
    const r = ctx.refinement
    if (condState.EngulfingLightning?.afterBurst) {
      scope.add('premod.enerRech_', ENGULFING_Q_ER[r]!, `薙草之稻光 R${r}(Q 后 ER)`)
    }
    // ER → ATK% conversion. Read every ER source we've populated so far,
    // including premod.enerRech_ which is where set effects (Emblem 2pc etc.)
    // deposit. Phase 7 (weapon passive) runs AFTER Phase 6 (set effects),
    // so set ER bonuses are visible here.
    const er = 1 +
      (scope.get('char.asc.enerRech_') ?? 0) +
      (scope.get('weap.substat.enerRech_') ?? 0) +
      (scope.get('artifact.main.enerRech_') ?? 0) +
      (scope.get('artifact.sub.enerRech_') ?? 0) +
      (scope.get('premod.enerRech_') ?? 0) +
      (condState.EngulfingLightning?.afterBurst ? ENGULFING_Q_ER[r]! : 0)
    const bonus = Math.min(ENGULFING_ATK_CAP[r]!, er * ENGULFING_ATK_PCT_FROM_ER[r]!)
    scope.add('weap.passive.atk_', bonus, `薙草之稻光 R${r}(ER ${(er * 100).toFixed(0)}% → +${(bonus * 100).toFixed(1)}% ATK)`)
  },
}

// =============================================================================
// 赤砂之杖 / Staff of the Scarlet Sands
//   被动: 基于元素精通,攻击力 +(EM × 52/65/78/91/104%);
//   触发夜分之愿:每次施放 E 命中获得 1 层(最多 3),每层让攻击力 +EM × 28/35/42/49/56%。
// =============================================================================
const SCARLET_ATK_FROM_EM_BASE = [NaN, 0.52, 0.65, 0.78, 0.91, 1.04]
const SCARLET_ATK_FROM_EM_PER_STACK = [NaN, 0.28, 0.35, 0.42, 0.49, 0.56]

export const StaffOfTheScarletSands: WeaponSheet = {
  key: 'StaffOfTheScarletSands',
  conds: [
    { name: 'stacks', type: 'num', label: '夜分之愿层数(每层 EM → 更多 ATK)', intOnly: true, min: 0, max: 3 },
  ],
  apply(scope, ctx, condState) {
    const r = ctx.refinement
    const stacks = condState.StaffOfTheScarletSands?.stacks ?? 0
    const em = (scope.get('char.asc.eleMas') ?? 0) +
      (scope.get('weap.substat.eleMas') ?? 0) +
      (scope.get('artifact.main.eleMas') ?? 0) +
      (scope.get('artifact.sub.eleMas') ?? 0)
    const baseBonus = em * SCARLET_ATK_FROM_EM_BASE[r]!
    // weap.passive.atk_ holds % bonuses. ATK from EM is a FLAT ATK, not %.
    // Use the artifact.sub.atk slot for accumulation.
    scope.add('artifact.sub.atk', baseBonus, `赤砂之杖 R${r}(EM × ${(SCARLET_ATK_FROM_EM_BASE[r]! * 100).toFixed(0)}% → +${Math.round(baseBonus)} ATK)`)
    if (stacks > 0) {
      const stackBonus = em * SCARLET_ATK_FROM_EM_PER_STACK[r]! * stacks
      scope.add('artifact.sub.atk', stackBonus, `赤砂之杖 R${r}(${stacks} 层夜分 → +${Math.round(stackBonus)} ATK)`)
    }
  },
}

// =============================================================================
// 匣里灭辰 / Dragon's Bane
//   副词条 EM;被动: 对附着水/火的敌人造成 +20/24/28/32/36% 伤害。
// =============================================================================
const DRAGONSBANE_DMG = [NaN, 0.2, 0.24, 0.28, 0.32, 0.36]

export const DragonsBane: WeaponSheet = {
  key: 'DragonsBane',
  conds: [
    { name: 'enemyHydroOrPyro', type: 'bool', label: '敌人附着水/火(+伤害)' },
  ],
  apply(scope, ctx, condState) {
    if (!condState.DragonsBane?.enemyHydroOrPyro) return
    const r = ctx.refinement
    const bonus = DRAGONSBANE_DMG[r]!
    // Applies to ALL outgoing damage. Use per-element broadcast.
    for (const ele of ALL_ELEMENTS) scope.add(`premod.dmg_.${ele}`, bonus, `匣里灭辰 R${r}(对水/火附着)`)
    scope.add('premod.dmg_.physical', bonus, `匣里灭辰 R${r}(对水/火附着)`)
  },
}

// =============================================================================
// 白缨枪 / White Tassel
//   副词条 CR;被动: 普通攻击伤害 +24/30/36/42/48%。
// =============================================================================
const WHITETASSEL_NORMAL = [NaN, 0.24, 0.3, 0.36, 0.42, 0.48]

export const WhiteTassel: WeaponSheet = {
  key: 'WhiteTassel',
  conds: [],
  apply(scope, ctx) {
    const r = ctx.refinement
    scope.add('premod.dmg_.normal', WHITETASSEL_NORMAL[r]!, `白缨枪 R${r}`)
  },
}

// =============================================================================
// 黑缨枪 / Black Tassel
//   副词条 HP%;被动: 对史莱姆造成的伤害 +40-80%。(几乎不影响日常面板,但实装。)
// =============================================================================
const BLACKTASSEL_DMG_SLIME = [NaN, 0.4, 0.5, 0.6, 0.7, 0.8]

export const BlackTassel: WeaponSheet = {
  key: 'BlackTassel',
  conds: [
    { name: 'enemySlime', type: 'bool', label: '敌人是史莱姆(+伤害)' },
  ],
  apply(scope, ctx, condState) {
    if (!condState.BlackTassel?.enemySlime) return
    const r = ctx.refinement
    const bonus = BLACKTASSEL_DMG_SLIME[r]!
    for (const ele of ALL_ELEMENTS) scope.add(`premod.dmg_.${ele}`, bonus, `黑缨枪 R${r}(史莱姆)`)
    scope.add('premod.dmg_.physical', bonus, `黑缨枪 R${r}(史莱姆)`)
  },
}

// =============================================================================
// 决斗之枪 / Deathmatch
//   副词条 CR;被动:周围敌人 ≥2 时 +16/20/24/28/32% 攻击 +16/20/24/28/32% 防御;
//   <2 时仅角色获得 +24/30/36/42/48% 攻击。
// =============================================================================
const DEATHMATCH_MULTI = [NaN, 0.16, 0.2, 0.24, 0.28, 0.32]
const DEATHMATCH_SOLO = [NaN, 0.24, 0.3, 0.36, 0.42, 0.48]

export const Deathmatch: WeaponSheet = {
  key: 'Deathmatch',
  conds: [
    { name: 'solo', type: 'bool', label: '只有 1 个敌人(ATK +24-48%)' },
  ],
  apply(scope, ctx, condState) {
    const r = ctx.refinement
    if (condState.Deathmatch?.solo) {
      scope.add('weap.passive.atk_', DEATHMATCH_SOLO[r]!, `决斗之枪 R${r}(单敌)`)
    } else {
      scope.add('weap.passive.atk_', DEATHMATCH_MULTI[r]!, `决斗之枪 R${r}(多敌)`)
      scope.add('premod.def_', DEATHMATCH_MULTI[r]!, `决斗之枪 R${r}(多敌 DEF)`)
    }
  },
}

// =============================================================================
// 千岩长枪 / Lithic Spear
//   副词条 ATK%;被动:每个璃月角色队友 +7/8/9/10/11% 攻击 +3/4/5/6/7% 暴击率,最多 4 层。
// =============================================================================
const LITHIC_ATK = [NaN, 0.07, 0.08, 0.09, 0.1, 0.11]
const LITHIC_CR = [NaN, 0.03, 0.04, 0.05, 0.06, 0.07]

export const LithicSpear: WeaponSheet = {
  key: 'LithicSpear',
  conds: [
    { name: 'liyueCount', type: 'num', label: '璃月队友数量(每个 +ATK/CR)', intOnly: true, min: 0, max: 4 },
  ],
  apply(scope, ctx, condState) {
    const r = ctx.refinement
    const n = condState.LithicSpear?.liyueCount ?? 0
    if (n > 0) {
      scope.add('weap.passive.atk_', LITHIC_ATK[r]! * n, `千岩长枪 R${r}(${n} 璃月 ATK)`)
      scope.add('premod.critRate_', LITHIC_CR[r]! * n, `千岩长枪 R${r}(${n} 璃月 CR)`)
    }
  },
}

// =============================================================================
// 贯虹之槊 / Vortex Vanquisher
//   副词条 ATK%;被动: +20/25/30/35/40% 护盾强效;命中敌人 +4/5/6/7/8% ATK,最多 5 层;若有护盾时该效果翻倍。
// =============================================================================
const VORTEX_SHIELD = [NaN, 0.2, 0.25, 0.3, 0.35, 0.4]
const VORTEX_ATK = [NaN, 0.04, 0.05, 0.06, 0.07, 0.08]

export const VortexVanquisher: WeaponSheet = {
  key: 'VortexVanquisher',
  conds: [
    { name: 'stacks', type: 'num', label: '层数(每层 +ATK)', intOnly: true, min: 0, max: 5 },
    { name: 'shielded', type: 'bool', label: '有护盾(ATK 翻倍)' },
  ],
  apply(scope, ctx, condState) {
    const r = ctx.refinement
    scope.add('premod.shield_', VORTEX_SHIELD[r]!, `贯虹之槊 R${r}(护盾强效)`)
    const s = condState.VortexVanquisher?.stacks ?? 0
    const mult = condState.VortexVanquisher?.shielded ? 2 : 1
    if (s > 0) {
      scope.add('weap.passive.atk_', VORTEX_ATK[r]! * s * mult, `贯虹之槊 R${r}(${s} 层${mult === 2 ? ' × 2 护盾' : ''})`)
    }
  },
}
