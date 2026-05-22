// Tenacity of the Millelith (千岩牢固)
//   2pc: +20% HP.
//   4pc: After E hits enemy, team +20% ATK and +30% shieldStr for 3s.

import type { ArtifactSetSheet } from '../sheet-types'
import { ARTIFACT_SET_NAME_ZH as A } from '../data/names-zh'

const NAME = A.TenacityOfTheMillelith

export const TenacityOfTheMillelith: ArtifactSetSheet = {
  key: 'TenacityOfTheMillelith',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:E 命中后队伍 ATK +20%' },
  ],
  buffs: [
    {
      source: { type: 'artifact', ordinal: 2, label: { zh: `${NAME} 2 件套`, en: `${NAME} 2pc` } },
      name: { zh: 'HP +20%', en: '+20% HP' },
      effect: { zh: '生命值上限 +20%。', en: '+20% HP.' },
      scope: 'self',
      sheetKey: 'TenacityOfTheMillelith',
    },
    {
      source: { type: 'artifact', ordinal: 4, label: { zh: `${NAME} 4 件套`, en: `${NAME} 4pc` } },
      name: { zh: 'E 命中 → 队伍 +20% ATK', en: 'E hit → team +20% ATK' },
      effect: { zh: '元素战技命中敌人后, 队伍 ATK +20% 持续 3 秒, 同时护盾强效 +30%。同套装不叠加。', en: 'After E hits, team ATK +20% (3s) + shield strength +30%. Non-stacking.' },
      condName: 'set4',
      scope: 'team',
      sheetKey: 'TenacityOfTheMillelith',
    },
  ],
  apply(scope, count, condState) {
    // 2pc — self-only HP%
    if (count >= 2) {
      scope.add('premod.hp_', 0.2, `${NAME} 2 件套(自身)`)
    }
    // 4pc — wearer is part of the team that gets the buff
    if (count >= 4 && condState.TenacityOfTheMillelith?.set4) {
      scope.add('artifact.set.atk_', 0.2, `${NAME} 4 件套(E 命中后, 自身)`)
      scope.add('premod.shield_', 0.3, `${NAME} 4 件套(护盾强效)`)
    }
  },
  applyAsTeammate(focusScope, count, condState, wearer) {
    // 4pc: +20% ATK team-wide after wearer's E hits enemy.
    if (count >= 4 && condState.TenacityOfTheMillelith?.set4) {
      focusScope.add('artifact.set.atk_', 0.2, `${wearer.goKey} ${NAME} 4 件套(E 后)`)
    }
  },
}
