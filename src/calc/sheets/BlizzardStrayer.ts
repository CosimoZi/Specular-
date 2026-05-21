// Blizzard Strayer (冰风迷途的勇士)
//   2pc: +15% Cryo DMG.
//   4pc: vs cryo-affected enemy → +20% CR. vs frozen → +20% more.

import type { ArtifactSetSheet } from '../sheet-types'
import { ARTIFACT_SET_NAME_ZH as A } from '../data/names-zh'

const NAME = A.BlizzardStrayer

export const BlizzardStrayer: ArtifactSetSheet = {
  key: 'BlizzardStrayer',
  conds: [
    { name: 'enemyCryo', type: 'bool', label: '4 件套:敌人附着冰元素 (+20% CR)' },
    { name: 'enemyFrozen', type: 'bool', label: '4 件套:敌人冻结 (再 +20% CR)' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) {
      scope.add('premod.dmg_.cryo', 0.15, `${NAME} 2 件套`)
    }
    if (count >= 4) {
      if (condState.BlizzardStrayer?.enemyCryo) scope.add('premod.critRate_', 0.2, `${NAME} 4 件套(冰附着)`)
      if (condState.BlizzardStrayer?.enemyFrozen) scope.add('premod.critRate_', 0.2, `${NAME} 4 件套(冻结)`)
    }
  },
}
