// The user's persistent team configuration: which 4 (max) characters are in
// the active team, who is the focus, what enemy + buff toggles.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultTeam, type TeamConfig } from '@/data/config-types'

interface TeamStoreState {
  team: TeamConfig
  patch: (p: Partial<TeamConfig>) => void
  setSlot: (i: number, charId: number | string | null) => void
  setFocus: (i: number | null) => void
  toggleBuff: (key: string, on: boolean) => void
  reset: () => void
}

export const useTeamConfig = create<TeamStoreState>()(
  persist(
    (set, getState) => ({
      team: defaultTeam(),
      patch: (p) => set({ team: { ...getState().team, ...p } }),
      setSlot: (i, charId) => {
        const next = { ...getState().team, slots: [...getState().team.slots] }
        next.slots[i] = charId
        // Auto-set focus to first non-null if missing
        if (next.focusIndex == null && charId != null) next.focusIndex = i
        set({ team: next })
      },
      setFocus: (i) => set({ team: { ...getState().team, focusIndex: i } }),
      toggleBuff: (key, on) =>
        set({
          team: {
            ...getState().team,
            buffToggles: { ...getState().team.buffToggles, [key]: on },
          },
        }),
      reset: () => set({ team: defaultTeam() }),
    }),
    { name: 'specular-team' },
  ),
)
