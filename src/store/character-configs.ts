// Persistent store of per-character builds. One character can have multiple
// named builds (e.g. 'imported' / 'main' / '蒸发' / '抽卡' / ...). UID import
// only touches the 'imported' build, never overwriting user-named ones.
//
// Storage shape (v2):
//   characters: Record<charId, {
//     activeBuildId: string
//     builds: Record<buildId, CharacterConfig>
//   }>
//
// Migration: v1 storage was `configs: Record<charId, CharacterConfig>`. On
// first hydration we wrap each entry as a single 'main' build.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  defaultConfig,
  type CharacterConfig,
  type ArtifactPiece,
  type ArtifactSlot,
} from '@/data/config-types'

export interface CharacterBuilds {
  /** Which build is currently "active" — used by /team and shown by default. */
  activeBuildId: string
  /** All builds for this character, keyed by user-chosen name. */
  builds: Record<string, CharacterConfig>
}

interface ConfigStoreState {
  /** Per-character build collection. */
  characters: Record<string, CharacterBuilds>

  // ----- Read helpers -----
  /** Get the active build for a character (or default if none). */
  get: (characterId: number | string) => CharacterConfig
  /** Get a specific build by id (or default). */
  getBuild: (characterId: number | string, buildId: string) => CharacterConfig
  /** List all build ids for a character. */
  listBuilds: (characterId: number | string) => string[]
  /** Get the active build id (or 'main' if none). */
  getActiveBuildId: (characterId: number | string) => string

  // ----- Mutations on the active build -----
  /** Replace the active build's config wholesale. */
  set: (characterId: number | string, next: CharacterConfig) => void
  /** Shallow-merge into the active build. */
  patch: (characterId: number | string, patch: Partial<CharacterConfig>) => void
  /** Set or remove an artifact piece on the active build. */
  setArtifact: (
    characterId: number | string,
    slot: ArtifactSlot,
    piece: ArtifactPiece | null,
  ) => void

  // ----- Build-management -----
  /** UID import path: always writes to the 'imported' build. */
  setImported: (characterId: number | string, config: CharacterConfig) => void
  /** Switch which build is active. Creates the build if missing. */
  setActiveBuildId: (characterId: number | string, buildId: string) => void
  /** Create a new empty build (or clone of an existing one) under the given id. */
  createBuild: (
    characterId: number | string,
    newBuildId: string,
    cloneFrom?: string,
  ) => void
  /** Rename a build. */
  renameBuild: (
    characterId: number | string,
    oldId: string,
    newId: string,
  ) => void
  /** Delete a build. If it was active, fall back to another. */
  deleteBuild: (characterId: number | string, buildId: string) => void
  /** Wipe a character's entire config. */
  reset: (characterId: number | string) => void

  // ----- Export / import -----
  exportJson: () => string
  importJson: (raw: string) => number
}

const DEFAULT_BUILD_ID = 'main'
const IMPORTED_BUILD_ID = 'imported'

function ensureCharacter(state: ConfigStoreState['characters'], id: number | string): CharacterBuilds {
  const k = String(id)
  const existing = state[k]
  if (existing) return existing
  return { activeBuildId: DEFAULT_BUILD_ID, builds: {} }
}

function readActiveConfig(builds: CharacterBuilds, charId: number | string): CharacterConfig {
  return builds.builds[builds.activeBuildId] ?? defaultConfig(charId)
}

export const useCharacterConfigs = create<ConfigStoreState>()(
  persist(
    (set, getState) => ({
      characters: {},

      // ----- Read -----
      get: (id) => {
        const k = String(id)
        const c = getState().characters[k]
        if (!c) return defaultConfig(id)
        return readActiveConfig(c, id)
      },
      getBuild: (id, buildId) => {
        const k = String(id)
        return getState().characters[k]?.builds[buildId] ?? defaultConfig(id)
      },
      listBuilds: (id) => {
        const k = String(id)
        return Object.keys(getState().characters[k]?.builds ?? {})
      },
      getActiveBuildId: (id) => {
        const k = String(id)
        return getState().characters[k]?.activeBuildId ?? DEFAULT_BUILD_ID
      },

      // ----- Mutations on active build -----
      set: (id, next) => {
        const k = String(id)
        const c = ensureCharacter(getState().characters, id)
        const buildId = c.activeBuildId
        const stamped = { ...next, lastModified: Date.now() }
        set({
          characters: {
            ...getState().characters,
            [k]: {
              activeBuildId: buildId,
              builds: { ...c.builds, [buildId]: stamped },
            },
          },
        })
      },
      patch: (id, p) => {
        const k = String(id)
        const c = ensureCharacter(getState().characters, id)
        const buildId = c.activeBuildId
        const cur = c.builds[buildId] ?? defaultConfig(id)
        const stamped = { ...cur, ...p, lastModified: Date.now() }
        set({
          characters: {
            ...getState().characters,
            [k]: { activeBuildId: buildId, builds: { ...c.builds, [buildId]: stamped } },
          },
        })
      },
      setArtifact: (id, slot, piece) => {
        const k = String(id)
        const c = ensureCharacter(getState().characters, id)
        const buildId = c.activeBuildId
        const cur = c.builds[buildId] ?? defaultConfig(id)
        const nextCfg = { ...cur, artifacts: { ...cur.artifacts }, lastModified: Date.now() }
        if (piece) nextCfg.artifacts[slot] = piece
        else delete nextCfg.artifacts[slot]
        set({
          characters: {
            ...getState().characters,
            [k]: { activeBuildId: buildId, builds: { ...c.builds, [buildId]: nextCfg } },
          },
        })
      },

      // ----- Build management -----
      setImported: (id, config) => {
        const k = String(id)
        const c = getState().characters[k]
        const stamped = { ...config, lastModified: Date.now() }
        // Always write to the 'imported' build. Don't touch other builds.
        // Make 'imported' active ONLY if this character has no builds yet.
        const newActive = c?.activeBuildId ?? IMPORTED_BUILD_ID
        set({
          characters: {
            ...getState().characters,
            [k]: {
              activeBuildId: newActive,
              builds: { ...(c?.builds ?? {}), [IMPORTED_BUILD_ID]: stamped },
            },
          },
        })
      },
      setActiveBuildId: (id, buildId) => {
        const k = String(id)
        const c = ensureCharacter(getState().characters, id)
        // Auto-create empty build if it doesn't exist
        const builds = c.builds[buildId]
          ? c.builds
          : { ...c.builds, [buildId]: defaultConfig(id) }
        set({
          characters: {
            ...getState().characters,
            [k]: { activeBuildId: buildId, builds },
          },
        })
      },
      createBuild: (id, newBuildId, cloneFrom) => {
        const k = String(id)
        const c = ensureCharacter(getState().characters, id)
        const base = cloneFrom
          ? c.builds[cloneFrom] ?? defaultConfig(id)
          : defaultConfig(id)
        set({
          characters: {
            ...getState().characters,
            [k]: {
              activeBuildId: newBuildId,
              builds: { ...c.builds, [newBuildId]: { ...base, lastModified: Date.now() } },
            },
          },
        })
      },
      renameBuild: (id, oldId, newId) => {
        const k = String(id)
        const c = getState().characters[k]
        if (!c || !c.builds[oldId] || c.builds[newId]) return
        const { [oldId]: cfg, ...rest } = c.builds
        const activeBuildId = c.activeBuildId === oldId ? newId : c.activeBuildId
        set({
          characters: {
            ...getState().characters,
            [k]: { activeBuildId, builds: { ...rest, [newId]: cfg } },
          },
        })
      },
      deleteBuild: (id, buildId) => {
        const k = String(id)
        const c = getState().characters[k]
        if (!c || !c.builds[buildId]) return
        const rest = { ...c.builds }
        delete rest[buildId]
        const remainingIds = Object.keys(rest)
        const newActive =
          c.activeBuildId === buildId
            ? remainingIds[0] ?? DEFAULT_BUILD_ID
            : c.activeBuildId
        if (remainingIds.length === 0) {
          // Empty — drop the character entry entirely.
          const charsRest = { ...getState().characters }
          delete charsRest[k]
          set({ characters: charsRest })
          return
        }
        set({
          characters: {
            ...getState().characters,
            [k]: { activeBuildId: newActive, builds: rest },
          },
        })
      },
      reset: (id) => {
        const k = String(id)
        const rest = { ...getState().characters }
        delete rest[k]
        set({ characters: rest })
      },

      // ----- Export / import -----
      exportJson: () => {
        return JSON.stringify({ version: 2, characters: getState().characters }, null, 2)
      },
      importJson: (raw) => {
        try {
          const obj = JSON.parse(raw) as
            | { version: 2; characters: Record<string, CharacterBuilds> }
            | { version?: number; configs?: Record<string, CharacterConfig> }
          if ('characters' in obj && obj.characters) {
            set({ characters: { ...getState().characters, ...obj.characters } })
            return Object.keys(obj.characters).length
          }
          // v1 fallback
          if ('configs' in obj && obj.configs) {
            const wrapped: Record<string, CharacterBuilds> = {}
            for (const [k, cfg] of Object.entries(obj.configs)) {
              wrapped[k] = { activeBuildId: DEFAULT_BUILD_ID, builds: { [DEFAULT_BUILD_ID]: cfg } }
            }
            set({ characters: { ...getState().characters, ...wrapped } })
            return Object.keys(wrapped).length
          }
          return 0
        } catch {
          return 0
        }
      },
    }),
    {
      name: 'specular-character-configs',
      // v1 → v2 migration: wrap old flat configs into the new builds shape.
      version: 2,
      migrate: (persistedState: unknown, fromVersion: number) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState
        const state = persistedState as { configs?: Record<string, CharacterConfig>; characters?: Record<string, CharacterBuilds> }
        if (fromVersion < 2 && state.configs && !state.characters) {
          const characters: Record<string, CharacterBuilds> = {}
          for (const [k, cfg] of Object.entries(state.configs)) {
            characters[k] = { activeBuildId: DEFAULT_BUILD_ID, builds: { [DEFAULT_BUILD_ID]: cfg } }
          }
          return { characters }
        }
        return state
      },
    },
  ),
)

export { DEFAULT_BUILD_ID, IMPORTED_BUILD_ID }
