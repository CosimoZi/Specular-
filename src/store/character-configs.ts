// Persistent store of per-character builds. Keyed by characterId (string for
// travelers: "10000005-anemo"). Persisted to localStorage under
// 'specular-character-configs'.
//
// Each save is a complete CharacterConfig. UID import overwrites the config
// with `importMode` populated so the engine bypasses per-piece derivation.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  defaultConfig,
  type CharacterConfig,
  type ArtifactPiece,
  type ArtifactSlot,
} from '@/data/config-types'

interface ConfigStoreState {
  configs: Record<string, CharacterConfig>
  /** Fetch — falls back to default if no saved config. */
  get: (characterId: number | string) => CharacterConfig
  set: (characterId: number | string, next: CharacterConfig) => void
  /** Patch a config (shallow merge top-level keys). */
  patch: (characterId: number | string, patch: Partial<CharacterConfig>) => void
  /** Set or remove an artifact piece. */
  setArtifact: (
    characterId: number | string,
    slot: ArtifactSlot,
    piece: ArtifactPiece | null,
  ) => void
  reset: (characterId: number | string) => void
  /** Dump all configs as a JSON object (for export). */
  exportJson: () => string
  /** Replace all configs from a JSON string (for import). Returns count loaded. */
  importJson: (raw: string) => number
}

export const useCharacterConfigs = create<ConfigStoreState>()(
  persist(
    (set, getState) => ({
      configs: {},
      get: (id) => {
        const k = String(id)
        return getState().configs[k] ?? defaultConfig(id)
      },
      set: (id, next) => {
        set({ configs: { ...getState().configs, [String(id)]: next } })
      },
      patch: (id, p) => {
        const k = String(id)
        const cur = getState().configs[k] ?? defaultConfig(id)
        set({ configs: { ...getState().configs, [k]: { ...cur, ...p } } })
      },
      setArtifact: (id, slot, piece) => {
        const k = String(id)
        const cur = getState().configs[k] ?? defaultConfig(id)
        const next = { ...cur, artifacts: { ...cur.artifacts } }
        if (piece) next.artifacts[slot] = piece
        else delete next.artifacts[slot]
        set({ configs: { ...getState().configs, [k]: next } })
      },
      reset: (id) => {
        const k = String(id)
        const rest = { ...getState().configs }
        delete rest[k]
        set({ configs: rest })
      },
      exportJson: () => {
        return JSON.stringify(
          { version: 1, configs: getState().configs },
          null,
          2,
        )
      },
      importJson: (raw) => {
        try {
          const obj = JSON.parse(raw) as { version?: number; configs?: Record<string, CharacterConfig> }
          if (!obj.configs) return 0
          set({ configs: { ...getState().configs, ...obj.configs } })
          return Object.keys(obj.configs).length
        } catch {
          return 0
        }
      },
    }),
    { name: 'specular-character-configs' },
  ),
)
