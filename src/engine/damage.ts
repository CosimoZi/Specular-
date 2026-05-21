import {
  ampMultiplier,
  catalyzeAddition,
  defMultiplier,
  resMultiplier,
  transformativeCanCrit,
  transformativeDamage,
} from './reactions'
import { scalingValue } from './stats'
import type {
  AttackerContext,
  DamageInstance,
  DamageOutput,
  Reaction,
  TargetContext,
} from './types'

/**
 * Compute the expected damage for a single hit.
 *
 * Direct damage formula:
 *   base   = scalingStat * multiplier + (flatBonus.scaling * flatBonus.multiplier)
 *   bonus  = elementalDmg + hitDmgBonus
 *   raw    = base * (1 + bonus)
 *   nonCrit = raw * defMult * resMult * (ampMult ?? 1) + catalyzeAdd? * defMult * resMult
 *   crit    = raw * (1 + critDmg) * defMult * resMult * (ampMult ?? 1) + catalyzeAdd?
 *   avg     = raw * (1 + min(critRate, 1) * critDmg) * defMult * resMult * (ampMult ?? 1)
 *           + catalyzeAdd? * defMult * resMult * (1 + min(critRate, 1) * critDmg)
 *
 *   For transformative reactions, output is appended as a separate hit by the caller —
 *   the function here only handles the direct hit + its amp/catalyze rider.
 */
export function calcDamage(
  attacker: AttackerContext,
  target: TargetContext,
  hit: DamageInstance,
  reaction: Reaction = { kind: 'none' },
): DamageOutput {
  const stats = attacker.stats
  const scaleStat = scalingValue(stats, hit.scaling)
  const baseScaled = scaleStat * hit.multiplier
  const baseFlat = hit.flatBonus
    ? scalingValue(stats, hit.flatBonus.scaling) * hit.flatBonus.multiplier
    : 0
  const base = baseScaled + baseFlat

  const elemBonus = stats.elementalDmg[hit.element] ?? 0
  const bonus = elemBonus + (hit.hitDmgBonus ?? 0)
  const raw = base * (1 + bonus)

  const dm = defMultiplier(
    attacker.level,
    target.level,
    target.defReduction ?? 0,
    target.defIgnore ?? 0,
  )
  const baseRes = target.resistance[hit.element] ?? 0.1
  const reducedRes = (target.resReduction?.[hit.element] ?? 0)
  const rm = resMultiplier(baseRes, reducedRes)

  // Amp reaction multiplier (vape/melt). Applies INSIDE the def/res bracket.
  let amp = 1
  if (reaction.kind === 'vape' || reaction.kind === 'melt') {
    amp = ampMultiplier(reaction, stats.em, hit.reactionBonus ?? 0)
  }

  // Catalyze additional damage (aggravate/spread). Added to the base hit AS
  // additive damage that itself goes through (1 + bonus) and def/res, then
  // is summed with the base hit before crit/avg.
  let catalyzeAdd = 0
  if (reaction.kind === 'aggravate' || reaction.kind === 'spread') {
    catalyzeAdd = catalyzeAddition(
      reaction,
      stats.em,
      attacker.level,
      hit.reactionBonus ?? 0,
    )
  }
  const rawCatalyze = catalyzeAdd * (1 + bonus)

  const crNonCritFactor = dm * rm
  const nonCritDirect = (raw + rawCatalyze) * crNonCritFactor * amp
  const critFactor = 1 + Math.max(stats.critDmg, 0)
  const critDirect = (raw + rawCatalyze) * critFactor * crNonCritFactor * amp
  const cr = Math.min(Math.max(stats.critRate, 0), 1)
  const avgFactor = 1 + cr * Math.max(stats.critDmg, 0)
  const avgDirect = (raw + rawCatalyze) * avgFactor * crNonCritFactor * amp

  return {
    nonCrit: nonCritDirect,
    crit: critDirect,
    avg: avgDirect,
    trace: {
      base,
      bonus,
      defMult: dm,
      resMult: rm,
      ampMult: amp,
      catalyzeAdd,
    },
  }
}

/** Compute the standalone transformative-reaction damage (overload/swirl/etc).
 *  This is a separate "tick" of damage not blended with the direct hit. */
export function calcTransformative(
  attacker: AttackerContext,
  target: TargetContext,
  reaction: Extract<Reaction, { kind: 'transformative' }>,
  reactionBonus = 0,
): DamageOutput {
  const stats = attacker.stats
  const base = transformativeDamage(reaction, stats.em, attacker.level, reactionBonus)
  // Element of the transformative damage (for res lookup).
  const reactionElement: Record<typeof reaction.type, 'Pyro' | 'Hydro' | 'Cryo' | 'Electro' | 'Anemo' | 'Geo' | 'Dendro' | 'Physical'> =
    {
      overload: 'Pyro',
      swirl: reaction.swirlElement ?? 'Anemo',
      electrocharged: 'Electro',
      superconduct: 'Cryo',
      shatter: 'Physical',
      burning: 'Pyro',
      bloom: 'Dendro',
      hyperbloom: 'Dendro',
      burgeon: 'Dendro',
      lunarcharged: 'Electro',
    }
  const elem = reactionElement[reaction.type]
  const baseRes = target.resistance[elem] ?? 0.1
  const reducedRes = target.resReduction?.[elem] ?? 0
  const rm = resMultiplier(baseRes, reducedRes)
  const dmg = base * rm

  // Bloom-family + burning + lunar reactions CAN crit in current patch.
  // Classical reactions (overload/swirl/EC/SC/shatter) still can't.
  if (transformativeCanCrit(reaction.type)) {
    const stats = attacker.stats
    const cr = Math.min(Math.max(stats.critRate, 0), 1)
    const cd = Math.max(stats.critDmg, 0)
    return {
      nonCrit: dmg,
      crit: dmg * (1 + cd),
      avg: dmg * (1 + cr * cd),
      trace: { base, resMult: rm, reactionElement: elem as unknown as number, canCrit: 1 },
    }
  }
  return {
    nonCrit: dmg,
    crit: dmg,
    avg: dmg,
    trace: { base, resMult: rm, reactionElement: elem as unknown as number, canCrit: 0 },
  }
}
