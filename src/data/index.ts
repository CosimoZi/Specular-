import charactersJson from './index/characters.json'
import weaponsJson from './index/weapons.json'
import artifactsJson from './index/artifacts.json'
import type {
  ArtifactSetDetail,
  ArtifactSetIndexEntry,
  CharacterDetail,
  CharacterIndexEntry,
  IndexFile,
  WeaponDetail,
  WeaponIndexEntry,
} from './types'

const charactersIndex = charactersJson as unknown as IndexFile<CharacterIndexEntry>
const weaponsIndex = weaponsJson as unknown as IndexFile<WeaponIndexEntry>
const artifactsIndex = artifactsJson as unknown as IndexFile<ArtifactSetIndexEntry>

export function listCharacters(): CharacterIndexEntry[] {
  return Object.values(charactersIndex.items).sort((a, b) => b.id - a.id)
}

export function listWeapons(): WeaponIndexEntry[] {
  return Object.values(weaponsIndex.items).sort((a, b) => b.id - a.id)
}

export function listArtifacts(): ArtifactSetIndexEntry[] {
  return Object.values(artifactsIndex.items).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )
}

export function getCharacterIndex(id: number | string): CharacterIndexEntry | undefined {
  return charactersIndex.items[String(id)]
}

export function getWeaponIndex(id: number | string): WeaponIndexEntry | undefined {
  return weaponsIndex.items[String(id)]
}

export function getArtifactIndex(id: number | string): ArtifactSetIndexEntry | undefined {
  return artifactsIndex.items[String(id)]
}

const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
const detailCache = new Map<string, unknown>()

async function fetchDetail<T>(kind: string, id: number | string): Promise<T> {
  const key = `${kind}:${id}`
  if (detailCache.has(key)) return detailCache.get(key) as T
  const res = await fetch(`${base}data/${kind}/${id}.json`)
  if (!res.ok) throw new Error(`fetch ${kind} ${id}: HTTP ${res.status}`)
  const data = (await res.json()) as T
  detailCache.set(key, data)
  return data
}

export const fetchCharacterDetail = (id: number | string) =>
  fetchDetail<CharacterDetail>('characters', id)
export const fetchWeaponDetail = (id: number | string) =>
  fetchDetail<WeaponDetail>('weapons', id)
export const fetchArtifactDetail = (id: number | string) =>
  fetchDetail<ArtifactSetDetail>('artifacts', id)

/** ambr CDN URL for an icon name (e.g. "UI_AvatarIcon_Flins"). */
export function iconUrl(icon: string): string {
  if (!icon) return ''
  return `https://gi.yatta.moe/assets/UI/${icon}.png`
}
