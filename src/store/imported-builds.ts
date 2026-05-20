// Cross-page store: when UidImport fetches a player's showcase, it stashes
// each character's build here. CharacterDetail consumes them on mount to
// pre-fill the form.

import { create } from 'zustand'
import type { ImportedBuild } from '@/data/uid-import'

interface ImportedBuildsState {
  byCharacterId: Record<string, ImportedBuild>
  setMany: (builds: ImportedBuild[]) => void
  get: (id: number | string) => ImportedBuild | undefined
  clear: () => void
}

export const useImportedBuilds = create<ImportedBuildsState>((set, getState) => ({
  byCharacterId: {},
  setMany: (builds) => {
    const next: Record<string, ImportedBuild> = { ...getState().byCharacterId }
    for (const b of builds) next[String(b.characterId)] = b
    set({ byCharacterId: next })
  },
  get: (id) => getState().byCharacterId[String(id)],
  clear: () => set({ byCharacterId: {} }),
}))
