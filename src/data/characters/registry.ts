// Registry of character definitions. As we hand-author more characters,
// add them here.
//
// Characters NOT in this registry use a "generic" fallback (no team buffs).
// This means an un-curated character can still appear in the team and contribute
// damage, just without buff support.

import { Mona } from './mona'
import type { CharacterDefinition } from './types'

const REGISTRY: Record<string, CharacterDefinition> = {
  [String(Mona.id)]: Mona,
}

export function getCharacterDefinition(id: number | string): CharacterDefinition | undefined {
  return REGISTRY[String(id)]
}

export function listCharacterDefinitions(): CharacterDefinition[] {
  return Object.values(REGISTRY)
}
