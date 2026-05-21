// Blizzard Strayer (冰风迷途的勇士)
//   2pc: +15% Cryo DMG.
//   4pc: vs cryo-affected enemy → +20% CR. vs frozen → +20% more.

import type { ArtifactSetSheet } from '../sheet-types'

export const BlizzardStrayer: ArtifactSetSheet = {
  key: 'BlizzardStrayer',
  conds: [
    { name: 'enemyCryo', type: 'bool', label: '4 件套:敌人附着冰元素 (+20% CR)' },
    { name: 'enemyFrozen', type: 'bool', label: '4 件套:敌人冻结 (再 +20% CR)' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) {
      scope.add('premod.dmg_.cryo', 0.15)
    }
    if (count >= 4) {
      if (condState.BlizzardStrayer?.enemyCryo) scope.add('premod.critRate_', 0.2)
      if (condState.BlizzardStrayer?.enemyFrozen) scope.add('premod.critRate_', 0.2)
    }
  },
}
