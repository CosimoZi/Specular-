// Noblesse Oblige (昔日宗室之仪)
//   2pc: +20% burst DMG.
//   4pc: After using Elemental Burst, all party members +20% ATK for 12s.

import type { ArtifactSetSheet } from '../sheet-types'

export const NoblesseOblige: ArtifactSetSheet = {
  key: 'NoblesseOblige',
  conds: [
    { name: 'set4', type: 'bool', label: '4 件套:Q 后队伍 ATK +20%' },
  ],
  apply(scope, count, condState) {
    if (count >= 2) {
      scope.add('premod.dmg_.burst', 0.2)
    }
    if (count >= 4 && condState.NoblesseOblige?.set4) {
      // Team-wide buff. For now, the wielder also picks it up via their own
      // scope. Cross-character propagation comes when the team pipeline lands.
      scope.add('artifact.set.atk_', 0.2)
    }
  },
}
