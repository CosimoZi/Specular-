// 叶洛亚 / Illuga — 4★ polearm, geo. Wired by Specular.
//
// Vendor sheet: vendor/go/gi/sheets/src/Characters/Illuga/index.tsx
//
// Key mechanics:
//   * Split-scaling damage (EM + DEF). 突破 stat is eleMas, A4/C2/buff propagation all key on EM.
//   * Team-buff character. A1/A4 propagate to teammates' geo damage. We apply to focus char only.
//   * 夜莺之歌 (21 stacks consumed by team's geo damage to boost it) — cross-char,
//     not modeled. C2's 阿咚 hit (every 7 stacks) is included as a separate burst formula.
//
// Stat-side buffs (vendor: ownBuff / teamBuff):
//   A1 cond a1AfterSkillBurst: team +geo_critRate (+5%, C6 +10%) + geo_critDMG (+10%, C6 +30%);
//     moon-full + ascension >= 1: +50 EM (C6: +80).
//   A4 cond burstSong: team +geo_dmgInc + lunarcrystallize_directDmgInc — based on EM and (hydro+geo count).
//     We don't track hydro+geo count, so this approximates.
//   C4 cond c4BurstActive: active char +200 DEF flat (cross-char, skip).

import type { CharacterSheet, CondState } from '../sheet-types'
import type { Scope } from '../scope'
import type { TeamPanelSnapshot } from '../sheet-types'

// passive2.geo_dmgInc / lunarcrystallize_dmgInc indexed by hydroGeoCount.
// Vendor: dm.passive2.geo_dmgInc = [-1, p2[0][0]=0.07, p2[1][0]=0.14, p2[2][0]=0.24, 0.24]
//         dm.passive2.lunarcrystallize_dmgInc = [-1, p2[3][0]=0.48, p2[4][0]=0.96, p2[5][0]=1.6, 1.6]
const A4_GEO_DMGINC_BY_COUNT: Record<number, number> = { 1: 0.07, 2: 0.14, 3: 0.24, 4: 0.24 }
const A4_LCMC_DMGINC_BY_COUNT: Record<number, number> = { 1: 0.48, 2: 0.96, 3: 1.6, 4: 1.6 }

function illugaHydroGeoCount(scope: Scope, condState: CondState): number {
  const auto = (scope.get('team.tally.hydro') ?? 0) + (scope.get('team.tally.geo') ?? 0)
  const override = condState.Illuga?.hydroGeoCount ?? 0
  return override > 0 ? override : Math.min(4, auto)
}
function illugaHydroGeoCountFromWearer(wearer: TeamPanelSnapshot, condState: CondState): number {
  // wearer doesn't carry the team's element count yet (auto-tally engine work pending).
  // Fall back to user-set cond. Default 0 → buff doesn't fire.
  return condState.Illuga?.hydroGeoCount ?? 0
}

// Writes Q burstSong + A4 EM-flat buffs that fire for whoever is active char.
// Used by both apply() (Illuga-as-focus is active) and applyAsTeammate (focus is teammate).
function applyIllugaBurstSongActiveBuffs(
  targetScope: Scope,
  ascension: number,
  em: number,
  burstTalentLvl: number,
  hydroGeoCount: number,
  burstSongOn: boolean,
  prefix: string,
) {
  if (!burstSongOn) return
  // Q burstSong geo_dmgInc: EM × burst[0][lvl-1]. burst[0] table:
  const burstGeoTable = [8.272, 8.8924, 9.5128, 10.34, 10.9604, 11.5808, 12.408, 13.2352, 14.0624, 14.8896, 15.7168, 16.544, 17.578, 18.612, 19.646]
  const burstLCTable = [4.136, 4.4462, 4.7564, 5.17, 5.4802, 5.7904, 6.204, 6.6176, 7.0312, 7.4448, 7.8584, 8.272, 8.789, 9.306, 9.823]
  const idx = Math.max(0, Math.min(burstTalentLvl - 1, burstGeoTable.length - 1))
  const burstGeoCoef = burstGeoTable[idx]! * 0.01 // {unit: '%'}
  const burstLCCoef = burstLCTable[idx]! * 0.01
  const burstGeoFlat = em * burstGeoCoef
  const burstLCFlat = em * burstLCCoef
  if (burstGeoFlat > 0) {
    targetScope.add('premod.dmgInc.geo', burstGeoFlat, `${prefix} Q 魇夜的莺歌(burst${burstTalentLvl} EM ${Math.round(em)} × ${(burstGeoCoef * 100).toFixed(2)}% = ${Math.round(burstGeoFlat)} 岩伤 flat)`)
  }
  if (burstLCFlat > 0) {
    targetScope.add('premod.dmgIncReaction.crystallize', burstLCFlat, `${prefix} Q 魇夜的莺歌(burst${burstTalentLvl} 月结晶 EM × ${(burstLCCoef * 100).toFixed(2)}% = ${Math.round(burstLCFlat)} flat)`)
  }
  // A4 hydroGeoCount-based extra EM flats (asc>=4 required).
  if (ascension >= 4 && hydroGeoCount >= 1) {
    const a4Geo = A4_GEO_DMGINC_BY_COUNT[hydroGeoCount] ?? 0
    if (a4Geo > 0) {
      const a4GeoFlat = em * a4Geo
      if (a4GeoFlat > 0) targetScope.add('premod.dmgInc.geo', a4GeoFlat, `${prefix} A4 (${hydroGeoCount} 水+岩 → EM × ${(a4Geo * 100).toFixed(0)}% = ${Math.round(a4GeoFlat)} 岩 flat)`)
    }
    const a4LC = A4_LCMC_DMGINC_BY_COUNT[hydroGeoCount] ?? 0
    if (a4LC > 0) {
      const a4LCFlat = em * a4LC
      if (a4LCFlat > 0) targetScope.add('premod.dmgIncReaction.crystallize', a4LCFlat, `${prefix} A4 (${hydroGeoCount} 水+岩 → 月结晶 EM × ${(a4LC * 100).toFixed(0)}% = ${Math.round(a4LCFlat)} flat)`)
    }
  }
}

export const Illuga: CharacterSheet = {
  key: 'Illuga',
  conds: [
    { name: 'a1AfterSkillBurst', type: 'bool', label: 'A1 执灯之誓(E/Q 后, 队友 岩元素 +CR/+CD)' },
    { name: 'burstSong', type: 'bool', label: '魇夜的莺歌(Q 期间)' },
    { name: 'moonFull', type: 'bool', label: '月兆·满辉(A1 EM 加成)' },
    { name: 'hydroGeoCount', type: 'num', label: 'A4 队伍 水+岩 角色数(1-3)', intOnly: true, min: 0, max: 3 },
    { name: 'c4BurstActive', type: 'bool', label: 'C4 Q 状态(场上角色 +200 DEF)' },
  ],
  apply(scope, ctx, condState) {
    // A1 a1AfterSkillBurst: vendor uses `unequal(target.charKey, key, ...)` —
    // applies to OTHER team members, NOT Illuga herself. So apply() doesn't
    // write A1 to self scope. (Bug fix: previously wrote A1 CR/CD/EM to self.)
    // For teammates, handled in applyAsTeammate.

    // Q burstSong + A4 hydroGeoCount EM-flats: active-char gated in vendor.
    // Illuga-as-focus IS the active char, so apply to self.
    const em = scope.get('final.eleMas') ?? 0
    const burstLvl = scope.get('talent.burst') ?? 1
    const hgc = illugaHydroGeoCount(scope, condState)
    applyIllugaBurstSongActiveBuffs(
      scope,
      ctx.ascension,
      em,
      burstLvl,
      hgc,
      !!condState.Illuga?.burstSong,
      '',
    )

    // C4 c4BurstActive: active char +200 DEF flat. Illuga-as-focus is active.
    if (ctx.constellation >= 4 && condState.Illuga?.c4BurstActive) {
      scope.add('artifact.sub.def', 200, 'C4 鉴照之夜(场上角色 +200 DEF)')
    }
  },
  applyAsTeammate(focusScope, condState, wearer) {
    // A1 (TEAM via `teamBuff.premod.geo_critRate_/geo_critDMG_/eleMas`, with
    // `unequal(target.charKey, key)` gate — does NOT fire for Illuga herself).
    // Per-element CR/CD slots; only geo formulas pick up.
    if (wearer.ascension >= 1 && condState.Illuga?.a1AfterSkillBurst) {
      const isC6 = wearer.constellation >= 6
      const crBoost = isC6 ? 0.1 : 0.05
      const cdBoost = isC6 ? 0.3 : 0.1
      focusScope.add('premod.critRate_.geo', crBoost, `Illuga 执灯之誓${isC6 ? '+C6' : ''}(岩元素 +${(crBoost * 100).toFixed(0)}% CR)`)
      focusScope.add('premod.critDMG_.geo', cdBoost, `Illuga 执灯之誓${isC6 ? '+C6' : ''}(岩元素 +${(cdBoost * 100).toFixed(0)}% CD)`)
      // Moon-full + ascension >= 1: +50/+80 EM
      if (condState.Illuga?.moonFull) {
        const emBoost = isC6 ? 80 : 50
        focusScope.add('premod.eleMas', emBoost, `Illuga 执灯之誓(月兆·满辉) +${emBoost} EM`)
      }
    }

    // Q burstSong + A4: same active-char-gated EM-flat geo/lunarcrystallize.
    // focus IS the active char here.
    const em = wearer.finalEleMas
    applyIllugaBurstSongActiveBuffs(
      focusScope,
      wearer.ascension,
      em,
      wearer.talents.burst,
      illugaHydroGeoCountFromWearer(wearer, condState),
      !!condState.Illuga?.burstSong,
      'Illuga',
    )

    // C4 c4BurstActive: active char +200 DEF. focus IS active.
    if (wearer.constellation >= 4 && condState.Illuga?.c4BurstActive) {
      focusScope.add('artifact.sub.def', 200, 'Illuga C4 鉴照之夜(场上角色 +200 DEF)')
    }
  },
}
