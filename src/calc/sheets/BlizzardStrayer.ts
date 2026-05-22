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
  buffs: [
    {
      source: { type: 'artifact', ordinal: 2, label: { zh: `${NAME} 2 件套`, en: `${NAME} 2pc` } },
      name: { zh: '冰元素伤害 +15%', en: '+15% Cryo DMG' },
      effect: { zh: '冰元素伤害加成 +15%。', en: '+15% Cryo DMG.' },
      scope: 'self',
      sheetKey: 'BlizzardStrayer',
    },
    {
      source: { type: 'artifact', ordinal: 4, label: { zh: `${NAME} 4 件套`, en: `${NAME} 4pc` } },
      name: { zh: '敌人附着冰元素 → +20% CR', en: 'Vs cryo-affected → +20% CR' },
      effect: { zh: '攻击附着冰元素的敌人时, 暴击率 +20%。', en: 'Vs cryo-affected enemy: CR +20%.' },
      condName: 'enemyCryo',
      scope: 'self',
      sheetKey: 'BlizzardStrayer',
    },
    {
      source: { type: 'artifact', ordinal: 4, label: { zh: `${NAME} 4 件套`, en: `${NAME} 4pc` } },
      name: { zh: '敌人冻结 → 再 +20% CR', en: 'Vs frozen → +20% more CR' },
      effect: { zh: '若敌人处于冻结状态, 暴击率额外 +20%(合计 +40%)。', en: 'If enemy is frozen: additional CR +20% (total +40%).' },
      condName: 'enemyFrozen',
      scope: 'self',
      sheetKey: 'BlizzardStrayer',
    },
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
