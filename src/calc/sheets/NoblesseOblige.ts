// Noblesse Oblige (昔日宗室之仪)
//   2pc: +20% burst DMG (SELF only).
//   4pc: After Burst, ALL party members +20% ATK for 12s (TEAM buff, non-stacking).

import type { ArtifactSetSheet } from '../sheet-types'
import { ARTIFACT_SET_NAME_ZH as A } from '../data/names-zh'

const NAME = A.NoblesseOblige

export const NoblesseOblige: ArtifactSetSheet = {
  key: 'NoblesseOblige',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:Q 后队伍 ATK +20%' },
  ],
  buffs: [
    {
      source: { type: 'artifact', ordinal: 2, label: { zh: `${NAME} 2 件套`, en: `${NAME} 2pc` } },
      name: { zh: '元素爆发伤害 +20%', en: '+20% Burst DMG' },
      effect: { zh: '元素爆发造成的伤害提升 20%。', en: 'Burst DMG +20%.' },
      scope: 'self',
      sheetKey: 'NoblesseOblige',
    },
    {
      source: { type: 'artifact', ordinal: 4, label: { zh: `${NAME} 4 件套`, en: `${NAME} 4pc` } },
      name: { zh: 'Q 后队伍 ATK +20%', en: 'After Q: team +20% ATK' },
      effect: { zh: '元素爆发后, 队伍中所有角色攻击力 +20% 持续 12 秒。同套装不叠加。', en: 'After burst, team ATK +20% for 12s. Non-stacking.' },
      condName: 'set4',
      scope: 'team',
      sheetKey: 'NoblesseOblige',
    },
  ],
  apply(scope, count, condState) {
    // 2pc — self-only burst DMG
    if (count >= 2) {
      scope.add('premod.dmg_.burst', 0.2, `${NAME} 2 件套(自身)`)
    }
    // 4pc — wearer is part of the team that gets the buff
    if (count >= 4 && condState.NoblesseOblige?.set4) {
      scope.add('artifact.set.atk_', 0.2, `${NAME} 4 件套(Q 后, 自身)`)
    }
  },
  applyAsTeammate(focusScope, count, condState, wearer) {
    // 4pc team buff: +20% ATK to all team members after wearer's Q.
    // Non-stacking in vendor; we apply once per teammate-with-4pc. Multiple
    // 4pc holders would cause overcount — left as known approximation.
    if (count >= 4 && condState.NoblesseOblige?.set4) {
      focusScope.add('artifact.set.atk_', 0.2, `${wearer.goKey} ${NAME} 4 件套(Q 后)`)
    }
  },
}
