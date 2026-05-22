// 莉奈娅 / Linnea — 5★ bow, geo. Wired by Specular (skeleton).
//
// kit (per ambr.top talent text):
//   Normal: up to 3-stage bow string (physical).
//   Charged: aimed shot. Hold to charge — fully-charged shot becomes geo.
//   Plunging: standard 3-arrow plunge.
//   Skill (露米呀吼吼!): summons "Lumi" companion with multiple form modes
//     (普通/超厉害/究极厉害) chosen by tap-vs-hold. Lumi does autonomous geo
//     attacks; some attacks count as 月结晶 reaction DMG.
//   Burst (绝境生存指南): heal team based on Linnea's DEF.
//   A1: enemies near Lumi → -15% geo RES (and an additional -15% during 月兆·满辉).
//   A4: based on Linnea's DEF, buff EM (15%/30% based on whether active char is moon-tagged).
//   A6: hydro crystallize → 月结晶 instead. Base DMG of 月结晶 += 0.7%/100 DEF, cap +14%.
//   C1: 历览编录 stacks (max 18) gained on E or 月笼谐奏; Lumi's hits consume
//       a stack and gain +75% DEF as bonus DMG.
//   C2: 月笼谐奏 → hydro/geo CDmg +40%; Lumi's heavy hammer CDmg +150%.
//   C3: E +3 talent levels.
//   C4: 月笼谐奏 → self + active char DEF +25% (stacks for Linnea).
//   C5: Q +3 talent levels.
//   C6: 历览编录 max stacks; consume 2× per trigger; 月结晶 +25% DMG.
//
// Most of this kit centers on Lumi (companion damage) and 月结晶 (a new
// reaction). Neither is modeled in our calc yet. This sheet only wires the
// player-character-side stat buffs (A4 EM, C4 DEF) and exposes the conds.
// Lumi formulas + 月结晶 reaction are TODO.

import type { CharacterSheet } from '../sheet-types'

export const Linnea: CharacterSheet = {
  key: 'Linnea',
  conds: [
    { name: 'lumiActive', type: 'bool', label: 'A1 露米在场(敌人岩抗 -15%)' },
    { name: 'moonFull', type: 'bool', label: 'A1 月兆·满辉(露米召出后岩抗再 -15%)' },
    { name: 'c2Resonance', type: 'bool', label: 'C2 月笼谐奏(水/岩 暴击伤害 +40%)' },
    { name: 'c4DefStacks', type: 'num', label: 'C4 月笼谐奏(DEF +25%/层 最多 2)', intOnly: true, min: 0, max: 2 },
    // 百万吨重锤 special-case stack consumption (regular moon-crystallize hits
    // consume 1 stack each and have no user input). Max 5 normally, up to 10
    // with C6's 2x consumption — the 5 max is a soft cap for typical play.
    { name: 'c1UltraStacks', type: 'num', label: 'C1 百万吨重锤消耗层数(每层 +DEF×150%)', intOnly: true, min: 0, max: 5 },
    // A4 cond: encodes whether A4 is active AND whether the focus (active char)
    // is moon-tagged. Vendor uses three-state ('off'/'moonsign'/'nonMoonsign');
    // we approximate with a single bool 'a4Active' (treated as "active char IS
    // moon-tagged" — the relevant case for teammate EM transfer). The
    // self-only 'nonMoonsign' variant (Linnea herself when focus is non-moon)
    // is handled inline in apply().
    { name: 'a4Active', type: 'bool', label: 'A4 (DEF × 5% → 场上角色 EM)' },
    // TODO (still needs engine extension):
    // - Burst heal (DEF-scaling) — not a damage formula
    // - Skill: Lumi 形态切换 + 攻击 (companion-damage layer needed)
  ],
  apply(scope, ctx, condState) {
    // C2: 月笼谐奏 → hydro/geo CDmg +40%. Per-element slots are now wired
    // end-to-end (formula.ts reads final.critDMG_.<ele>). Linnea-as-focus is
    // geo, so the hydro write is a no-op on her formulas; the geo write
    // boosts her geo hits but NOT her physical normals (correct).
    if (ctx.constellation >= 2 && condState.Linnea?.c2Resonance) {
      scope.add('premod.critDMG_.hydro', 0.4, '月笼谐奏(C2, 水暴击伤害)')
      scope.add('premod.critDMG_.geo', 0.4, '月笼谐奏(C2, 岩暴击伤害)')
    }
    // C4: per-stack DEF +25%, max 2 stacks (self only, since "active char" coincides
    // with focus in our single-character build pipeline).
    if (ctx.constellation >= 4) {
      const s = condState.Linnea?.c4DefStacks ?? 0
      if (s > 0) scope.add('premod.def_', 0.25 * s, `月笼谐奏(C4, ${s} 层)`)
    }
    // A4 self-side: when A4 is on AND Linnea herself is focus (active char),
    // she only gets the EM if she's the moon-tagged active char. Since she
    // IS moon-tagged (Linnea is a moonsign char), apply directly when toggled.
    // The cap is 60 EM (vendor: passive2[1] = 0.6 absolute cap on the converted
    // value — but our DEF × 5% is uncapped; in practice Linnea DEF rarely
    // exceeds 1200, keeping result under 60).
    if (ctx.ascension >= 4 && condState.Linnea?.a4Active) {
      const def = scope.get('final.def') ?? 0
      const em = Math.min(60, def * 0.05)
      if (em > 0) {
        scope.add('premod.eleMas', em, `A4 自身(DEF × 5% → EM, +${Math.round(em)})`)
      }
    }
  },
  applyAsTeammate(focusScope, condState, wearer) {
    // C1 first effect (TEAM buff per vendor `teamBuff.premod.lunarcrystallize_dmgInc`):
    // Per moon-crystallize hit, +Linnea.DEF × 0.75 to the base zone (C6 adds
    // another 0.75 → total 1.5). The flat lands in the shared per-reaction
    // scope key `premod.dmgIncReaction.crystallize`, which formula.ts reads
    // for every moon-crystallize formula on the focus side.
    if (wearer.constellation >= 1) {
      const ratio = wearer.constellation >= 6 ? 1.5 : 0.75
      const flat = wearer.finalDef * ratio
      focusScope.add(
        'premod.dmgIncReaction.crystallize',
        flat,
        `Linnea C1 团队层数(DEF ${Math.round(wearer.finalDef)} × ${(ratio * 100).toFixed(0)}% = ${Math.round(flat)})`,
      )
    }
    // A4 (TEAM buff per vendor `teamBuff.premod.eleMas`): when active char is
    // moon-tagged, the active char gets EM = Linnea.DEF × 5% (cap 60). Gated
    // on Linnea's a4Active cond; the moon-tagged-active-char condition is
    // implicit when this is fired — vendor's cond mode 'moonsign' encodes it,
    // we approximate by trusting the user to toggle a4Active when relevant.
    if (wearer.ascension >= 4 && condState.Linnea?.a4Active) {
      const em = Math.min(60, wearer.finalDef * 0.05)
      if (em > 0) {
        focusScope.add(
          'premod.eleMas',
          em,
          `Linnea A4(DEF ${Math.round(wearer.finalDef)} × 5% → EM, +${Math.round(em)})`,
        )
      }
    }
    // C2 (TEAM buff per vendor `teamBuff.premod.{hydro,geo}_critDMG_`):
    // 月笼谐奏 → hydro & geo CDmg +40%. Writes to per-element slots; only
    // hydro/geo formulas on focus pick it up (formula.ts reads
    // final.critDMG_.<def.element>).
    if (wearer.constellation >= 2 && condState.Linnea?.c2Resonance) {
      focusScope.add('premod.critDMG_.hydro', 0.4, 'Linnea C2 月笼谐奏(水暴击伤害 +40%)')
      focusScope.add('premod.critDMG_.geo', 0.4, 'Linnea C2 月笼谐奏(岩暴击伤害 +40%)')
    }
    // passive3 月兆祝赐·栖地考察 (TEAM buff per vendor
    // `teamBuff.premod.lunarcrystallize_baseDmg_`):
    // per 100 DEF, +0.7% moon-reaction base damage (cap 14%). All-on. Lands
    // in catch-all `premod.moonReactionBaseBoost` (formula.ts reads for all
    // 3 moon reactions). Vendor scopes it to `lunarcrystallize_baseDmg_`
    // specifically but Linnea only contributes to crystallize anyway.
    const baseBoost = Math.min(0.14, (wearer.finalDef / 100) * 0.007)
    if (baseBoost > 0) {
      focusScope.add(
        'premod.moonReactionBaseBoost',
        baseBoost,
        `Linnea 月兆祝赐·栖地考察(DEF ${Math.round(wearer.finalDef)} → +${(baseBoost * 100).toFixed(1)}% 月反应基础)`,
      )
    }
    // C6 黄金猎犬之梦 (TEAM buff per vendor
    // `teamBuff.premod.lunarcrystallize_specialDmg_`): moon-crystallize
    // elevation +25% when moon-full (tally.moonsign >= 2). Use the user's
    // moonFull cond on Linnea as the gate (consistent with self path).
    if (wearer.constellation >= 6 && condState.Linnea?.moonFull) {
      focusScope.add(
        'premod.moonReactionElevation',
        0.25,
        'Linnea C6 黄金猎犬之梦(月兆·满辉 → 月结晶 擢升 25%)',
      )
    }
  },
}
