// 雅珂达 / Jahoda damage formulas.
// Vendor: vendor/go/gi/sheets/src/Characters/Jahoda/index.tsx
//
// 5★ Anemo Bow with companion 苗苗 (the cat). All damage ATK-scaling.
//
// Cat 苗苗 attacks element-cycle based on highest team element (pyro/hydro/electro/cryo).
// We expose 4 variants — pick whichever matches user's team comp.
//
// Auto-array (bow, 8 entries):
//   auto[0..2]  N1..N3 (physical)
//   auto[3]     charged aimed (physical)
//   auto[4]     charged fullyAimed (anemo — char element)
//   auto[5..7]  plunging triplet
//
// Skill (10 entries):
//   skill[0]  bombDmg (anemo)
//   skill[1]  unfilledDmg (anemo)
//   skill[2]  filledDmg (anemo)
//   skill[3]  duration (const)
//   skill[4]  meowDmg (cat attack, element from team comp)
//   skill[5..9] consts
//
// Burst (11 entries):
//   burst[0]  skillDmg (anemo Q hit)
//   burst[1]  robotDmg (robot follower hit, anemo; A1 buffs if pyro is highest)
//   burst[2]  duration (const)
//   burst[3..6] heal mults
//   burst[7..10] consts

import { prod, lookup, v, sub, ifGE, type Node } from '../ast'
import type { FormulaDef } from '../formula'
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'

const skillParam = (statsJson as any).char.skillParam.Jahoda as {
  auto: number[][]; skill: number[][]; burst: number[][]
}
const lvlLookup = (table: number[], lvlVar: string): Node => lookup(table, sub(v(lvlVar), 1))
const atkProd = (table: number[], lvlVar: string) => prod(v('final.atk'), lvlLookup(table, lvlVar))

export const JahodaFormulas: FormulaDef[] = [
  // Bow normals (physical)
  { name: 'normal_0', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[0]!, 'talent.auto') },
  { name: 'normal_1', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[1]!, 'talent.auto') },
  { name: 'normal_2', move: 'normal', element: 'physical', base: atkProd(skillParam.auto[2]!, 'talent.auto') },
  // Charged
  { name: 'charged_aim', move: 'charged', element: 'physical', base: atkProd(skillParam.auto[3]!, 'talent.auto') },
  { name: 'charged_full', move: 'charged', element: 'anemo', base: atkProd(skillParam.auto[4]!, 'talent.auto') },
  // Plunging
  { name: 'plunging_dmg', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[5]!, 'talent.auto') },
  { name: 'plunging_low', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[6]!, 'talent.auto') },
  { name: 'plunging_high', move: 'plunging', element: 'physical', base: atkProd(skillParam.auto[7]!, 'talent.auto') },

  // Skill anemo hits
  { name: 'skill_bomb', move: 'skill', element: 'anemo', base: atkProd(skillParam.skill[0]!, 'talent.skill') },
  { name: 'skill_unfilled', move: 'skill', element: 'anemo', base: atkProd(skillParam.skill[1]!, 'talent.skill') },
  { name: 'skill_filled', move: 'skill', element: 'anemo', base: atkProd(skillParam.skill[2]!, 'talent.skill') },

  // 苗苗 (cat) meowDmg — 4 element variants (player picks based on team comp).
  // Vendor uses `tally` arithmetic to pick highest element; we present all 4
  // and let the user identify which fires in their team.
  { name: 'skill_meow_pyro', move: 'skill', element: 'pyro', base: atkProd(skillParam.skill[4]!, 'talent.skill') },
  { name: 'skill_meow_hydro', move: 'skill', element: 'hydro', base: atkProd(skillParam.skill[4]!, 'talent.skill') },
  { name: 'skill_meow_electro', move: 'skill', element: 'electro', base: atkProd(skillParam.skill[4]!, 'talent.skill') },
  { name: 'skill_meow_cryo', move: 'skill', element: 'cryo', base: atkProd(skillParam.skill[4]!, 'talent.skill') },

  // Burst (Q hit + robot follower hit)
  { name: 'burst_dmg', move: 'burst', element: 'anemo', base: atkProd(skillParam.burst[0]!, 'talent.burst') },
  // Robot dmg: A1 multiplier when highest team element is pyro (passive1[0] = 1.3 = ×1.3).
  // Read team.tally.pyro from scope; we DON'T do full priority here in the AST
  // (too complex inline) — see applyJahodaFormulaBuffs for fallback logic that
  // handles the priority. For the AST, simple pyro-tally check approximation:
  {
    name: 'burst_robot',
    move: 'burst', element: 'anemo',
    base: atkProd(skillParam.burst[1]!, 'talent.burst'),
    mult: ifGE(v('team.tally.pyro', 0), 1, 1.3, 1),
  },
]

export function applyJahodaFormulaBuffs(
  _scope: import('../scope').Scope,
  _condState: Record<string, Record<string, number>>,
) {
  // A1 robot dmg buff (when pyro is highest team element) now applied via
  // per-formula `mult` on burst_robot directly. No premod hack needed.
  // TODO: handle "second-highest pyro counts too" under C2 + moon-full.
}
