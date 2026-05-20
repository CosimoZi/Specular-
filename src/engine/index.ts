export { aggregateStats, scalingValue } from './stats'
export { calcDamage, calcTransformative } from './damage'
export {
  ampMultiplier,
  catalyzeAddition,
  defMultiplier,
  resMultiplier,
  transformativeDamage,
} from './reactions'
export { levelMultiplier, AMP_BASE, TRANSFORMATIVE_BASE, CATALYZE_BASE, EM_CURVES } from './constants'
export type {
  DamageElement,
  StatKey,
  StatBag,
  FinalStats,
  AttackerContext,
  TargetContext,
  Reaction,
  DamageInstance,
  DamageOutput,
} from './types'
