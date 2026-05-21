// Tenacity of the Millelith (千岩牢固)
//   2pc: +20% HP.
//   4pc: After E hits enemy, team +20% ATK and +30% shieldStr for 3s.

import type { ArtifactSetSheet } from '../sheet-types'

export const TenacityOfTheMillelith: ArtifactSetSheet = {
  key: 'TenacityOfTheMillelith',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:E 命中后队伍 ATK +20%' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) {
      scope.add('premod.hp_', 0.2, '千岩牢固 2 件套')
    }
    if (count >= 4 && condState.TenacityOfTheMillelith?.set4) {
      scope.add('artifact.set.atk_', 0.2, '千岩牢固 4 件套(E 命中后)')
      scope.add('premod.shield_', 0.3, '千岩牢固 4 件套(护盾强效)')
    }
  },
}
