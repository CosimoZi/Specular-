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
  /** Set / clear one cond value. `value === 0` clears the entry so the store
   *  stays tidy (the calc treats absent === 0 anyway). */
  setCond: (slotIdx: number, sheet: string, condName: string, value: number) => void
  /** Wipe every cond entry for a slot — used when a slot is cleared / swapped. */
  clearSlotConds: (slotIdx: number) => void
  /** Set this slot's front-line/back-line override (or clear it). Doesn't
   *  touch the underlying character config. */
  setSlotPosition: (slotIdx: number, pos: 'frontline' | 'backline' | null) => void
  reset: () => void
}

export const useTeamConfig = create<TeamStoreState>()(
  persist(
    (set, getState) => ({
      team: defaultTeam(),
      patch: (p) => set({ team: { ...getState().team, ...p } }),
      setSlot: (i, charId) => {
        const cur = getState().team
        const next = { ...cur, slots: [...cur.slots], condState: { ...cur.condState } }
        const prev = next.slots[i]
        next.slots[i] = charId
        // If we're changing who's in this slot, drop their conds — they
        // belonged to the previous character.
        if (prev !== charId) {
          delete next.condState[String(i)]
        }
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
      setCond: (slotIdx, sheet, condName, value) => {
        const cur = getState().team
        const slotKey = String(slotIdx)
        const slot = cur.condState[slotKey] ?? {}
        const sheetMap = slot[sheet] ?? {}
        const nextSheetMap = { ...sheetMap }
        if (value === 0 || value == null || Number.isNaN(value)) {
          delete nextSheetMap[condName]
        } else {
          nextSheetMap[condName] = value
        }
        const nextSlot = { ...slot }
        if (Object.keys(nextSheetMap).length === 0) {
          delete nextSlot[sheet]
        } else {
          nextSlot[sheet] = nextSheetMap
        }
        const nextCondState = { ...cur.condState }
        if (Object.keys(nextSlot).length === 0) {
          delete nextCondState[slotKey]
        } else {
          nextCondState[slotKey] = nextSlot
        }
        set({ team: { ...cur, condState: nextCondState } })
      },
      clearSlotConds: (slotIdx) => {
        const cur = getState().team
        const slotKey = String(slotIdx)
        if (!cur.condState[slotKey]) return
        const next = { ...cur.condState }
        delete next[slotKey]
        set({ team: { ...cur, condState: next } })
      },
      setSlotPosition: (slotIdx, pos) => {
        const cur = getState().team
        const slotKey = String(slotIdx)
        const next = { ...(cur.slotPosition ?? {}) }
        if (pos == null) delete next[slotKey]
        else next[slotKey] = pos
        set({ team: { ...cur, slotPosition: next } })
      },
      reset: () => set({ team: defaultTeam() }),
    }),
    {
      name: 'specular-team',
      // v3: added slotPosition. v2: added condState.
      version: 3,
      migrate: (persisted: unknown, fromVersion: number) => {
        if (!persisted || typeof persisted !== 'object') return persisted
        // Treat as a loose object — the persisted shape pre-v2 doesn't have
        // condState, but TeamConfig declares it required, so a precise cast
        // would narrow s.team to `never` and break the spread.
        const s = persisted as { team?: Record<string, unknown> }
        let team = s.team
        if (team && fromVersion < 2 && !('condState' in team)) {
          team = { ...team, condState: {} }
        }
        if (team && fromVersion < 3 && !('slotPosition' in team)) {
          team = { ...team, slotPosition: {} }
        }
        return team ? { ...s, team: team as TeamConfig } : s
      },
    },
  ),
)
