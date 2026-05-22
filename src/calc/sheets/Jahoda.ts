// 雅珂达 / Jahoda — 5★ bow, anemo. Wired by Specular.
// Vendor: vendor/go/gi/sheets/src/Characters/Jahoda/index.tsx
//
// Anemo bow with cat companion 苗苗 (element-cycling per team composition).
//
// Stat-side buffs:
//   A4 cond a4Heal: +100 EM (passive2[0]) for active char on heal trigger.
//   C6 cond c6FlaskFull (moon-full + isMoonsign target): +5% CR (constellation6[0])
//     and +40% CD (constellation6[1]) for moonsign characters.

import type { CharacterSheet } from '../sheet-types'

export const Jahoda: CharacterSheet = {
  key: 'Jahoda',
  conds: [
    { name: 'a4Heal', type: 'bool', label: 'A4 治疗后 +100 EM(场上角色)' },
    { name: 'moonFull', type: 'bool', label: '月兆·满辉(C2/C6 加强)' },
    { name: 'c6FlaskFull', type: 'bool', label: 'C6 香水瓶满 → 月兆 char +5% CR/+40% CD' },
  ],
  apply(scope, ctx, condState) {
    // A4: active char gets +100 EM when a4Heal cond on. Jahoda-as-focus IS
    // active char, so apply to self.
    if (ctx.ascension >= 4 && condState.Jahoda?.a4Heal) {
      scope.add('premod.eleMas', 100, 'A4 治疗后(+100 EM, 场上角色)')
    }
    // C6: when c6FlaskFull + moonFull + Jahoda-as-focus is herself moonsign
    // (yes, Jahoda is moonsign). So self path fires when conds satisfied.
    if (ctx.constellation >= 6 && condState.Jahoda?.c6FlaskFull && condState.Jahoda?.moonFull) {
      scope.add('premod.critRate_', 0.05, 'C6 香水瓶满 +5% CR')
      scope.add('premod.critDMG_', 0.4, 'C6 香水瓶满 +40% CD')
    }
  },
  applyAsTeammate(focusScope, condState, wearer) {
    // A4 (TEAM per vendor `teamBuff.premod.eleMas: a4Heal_eleMas`, active-char gated):
    // active char (= focus) gets +100 EM when a4Heal on.
    if (wearer.ascension >= 4 && condState.Jahoda?.a4Heal) {
      focusScope.add('premod.eleMas', 100, 'Jahoda A4 治疗后(+100 EM, 场上角色)')
    }
    // C6 (TEAM per vendor `teamBuff.premod.critRate_/critDMG_`, gated by
    // `equal(target.isMoonsign, 1, ...)` + moonsign>=2 + c6FlaskFull):
    // ONLY moonsign focus gets the buff. Use focus.isMoonsign scope flag
    // (set by build.ts based on focus goKey lookup).
    if (
      wearer.constellation >= 6 &&
      condState.Jahoda?.c6FlaskFull &&
      condState.Jahoda?.moonFull &&
      (focusScope.get('focus.isMoonsign') ?? 0) > 0
    ) {
      focusScope.add('premod.critRate_', 0.05, 'Jahoda C6 香水瓶满(月相 char +5% CR)')
      focusScope.add('premod.critDMG_', 0.4, 'Jahoda C6 香水瓶满(月相 char +40% CD)')
    }
  },
}
