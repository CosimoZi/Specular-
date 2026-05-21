import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  displayName,
  iconUrl,
  listCharacters,
} from '@/data'
import { ELEMENT_COLOR } from '@/data/types'
import type { Element, WeaponType } from '@/data/types'
import type { CharacterIndexEntry } from '@/data/types'
import { useI18n, useT } from '@/i18n/store'
import { useCharacterConfigs } from '@/store/character-configs'
import { isConfigured } from '@/data/config-types'

const ELEMENT_FILTERS: Element[] = [
  'Pyro' as Element, 'Hydro' as Element, 'Cryo' as Element,
  'Electric' as Element, 'Anemo' as Element, 'Geo' as Element, 'Grass' as Element,
]

const WEAPON_FILTERS: WeaponType[] = [
  'WEAPON_SWORD_ONE_HAND', 'WEAPON_CLAYMORE', 'WEAPON_POLE',
  'WEAPON_BOW', 'WEAPON_CATALYST',
]

export default function Characters() {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const characters = useCharacterConfigs((s) => s.characters)
  const all = useMemo(() => listCharacters(), [])
  const [query, setQuery] = useState('')
  const [elemFilter, setElemFilter] = useState<Set<string>>(new Set())
  const [rankFilter, setRankFilter] = useState<Set<number>>(new Set())
  const [weaponFilter, setWeaponFilter] = useState<Set<string>>(new Set())

  // Split into configured / unconfigured + apply filters
  const { configured, unconfigured } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const elementSynonyms: Record<string, string[]> = {
      Pyro: ['Pyro', 'Fire'],
      Hydro: ['Hydro', 'Water'],
      Cryo: ['Cryo', 'Ice'],
      Electric: ['Electric', 'Electro'],
      Anemo: ['Anemo', 'Wind'],
      Geo: ['Geo', 'Rock'],
      Grass: ['Grass', 'Dendro'],
    }
    const matches = (c: CharacterIndexEntry): boolean => {
      if (q && !displayName(c, locale).toLowerCase().includes(q) && !c.route.toLowerCase().includes(q)) return false
      if (elemFilter.size) {
        const hit = [...elemFilter].some((k) => (elementSynonyms[k] ?? [k]).includes(c.element))
        if (!hit) return false
      }
      if (rankFilter.size && !rankFilter.has(c.rank)) return false
      if (weaponFilter.size && !weaponFilter.has(c.weaponType)) return false
      return true
    }
    const conf: Array<{ c: CharacterIndexEntry; lastModified: number }> = []
    const unconf: CharacterIndexEntry[] = []
    for (const c of all) {
      if (!matches(c)) continue
      const charBuilds = characters[String(c.id)]
      const activeBuild = charBuilds?.builds[charBuilds.activeBuildId]
      if (isConfigured(activeBuild)) {
        conf.push({ c, lastModified: activeBuild?.lastModified ?? 0 })
      } else {
        unconf.push(c)
      }
    }
    conf.sort((a, b) => b.lastModified - a.lastModified)
    return { configured: conf.map((x) => x.c), unconfigured: unconf }
  }, [all, query, elemFilter, rankFilter, weaponFilter, characters, locale])

  const toggle = <T extends string | number>(
    set: Set<T>,
    key: T,
    setter: (s: Set<T>) => void,
  ) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setter(next)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('characters.title')}</h1>
        <p className="text-sm text-zinc-500 mt-1">{t('characters.hintV2')}</p>
      </div>

      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('characters.searchPlaceholder')}
          className="w-full md:max-w-md px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        />
        <FilterGroup label={t('characters.filter.element')}>
          {ELEMENT_FILTERS.map((key) => (
            <Chip
              key={key}
              active={elemFilter.has(key)}
              color={ELEMENT_COLOR[key]}
              onClick={() => toggle(elemFilter as Set<string>, key, (s) => setElemFilter(s))}
            >
              {t(`element.${key}`)}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label={t('characters.filter.rarity')}>
          {[5, 4].map((r) => (
            <Chip
              key={r}
              active={rankFilter.has(r)}
              onClick={() => toggle(rankFilter as Set<number>, r, (s) => setRankFilter(s))}
            >
              {r}★
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label={t('characters.filter.weapon')}>
          {WEAPON_FILTERS.map((key) => (
            <Chip
              key={key}
              active={weaponFilter.has(key)}
              onClick={() => toggle(weaponFilter as Set<string>, key, (s) => setWeaponFilter(s))}
            >
              {t(`weapon.${key}`)}
            </Chip>
          ))}
        </FilterGroup>
      </div>

      {/* Configured section */}
      <section>
        <h2 className="text-sm font-medium text-zinc-500 mb-3">
          {t('characters.configured')} ({configured.length})
        </h2>
        {configured.length === 0 ? (
          <p className="text-sm text-zinc-400 italic">{t('characters.noneConfigured')}</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {configured.map((c) => (
              <CharacterCard key={String(c.id)} c={c} locale={locale} t={t} configured />
            ))}
          </div>
        )}
      </section>

      {/* Unconfigured section */}
      <section>
        <h2 className="text-sm font-medium text-zinc-500 mb-3">
          {t('characters.notConfigured')} ({unconfigured.length})
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {unconfigured.map((c) => (
            <CharacterCard key={String(c.id)} c={c} locale={locale} t={t} configured={false} />
          ))}
        </div>
      </section>
    </div>
  )
}

function CharacterCard({
  c,
  locale,
  t,
  configured,
}: {
  c: CharacterIndexEntry
  locale: 'zh' | 'en'
  t: (key: string, fallback?: string) => string
  configured: boolean
}) {
  const color = ELEMENT_COLOR[c.element] ?? '#888'
  return (
    <Link
      to={`/characters/${c.id}`}
      className={`group rounded-lg border bg-white dark:bg-zinc-900 p-2 text-center transition-all relative ${
        configured
          ? 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
          : 'border-zinc-100 dark:border-zinc-900 opacity-40 hover:opacity-80 saturate-50'
      }`}
    >
      {configured && (
        <span className="absolute top-1 right-1 text-[9px] px-1 rounded bg-emerald-500/90 text-white">
          ✓
        </span>
      )}
      <div
        className="aspect-square rounded-md overflow-hidden mb-2"
        style={{ background: `linear-gradient(180deg, ${color}33, transparent)` }}
      >
        <img
          src={iconUrl(c.icon)}
          alt={displayName(c, locale)}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
        />
      </div>
      <div className="text-sm font-medium truncate">{displayName(c, locale)}</div>
      <div className="text-xs flex justify-center gap-1 items-center" style={{ color: configured ? color : undefined }}>
        <span>{t(`element.${c.element}`)}</span>
        <span className="text-zinc-400">·</span>
        <span>{c.rank}★</span>
      </div>
      <div className="text-[10px] text-zinc-500 truncate">
        {t(`weapon.${c.weaponType}`)}
      </div>
    </Link>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-zinc-500 w-16">{label}</span>
      <div className="flex gap-1.5 flex-wrap">{children}</div>
    </div>
  )
}

function Chip({
  children, active, color, onClick,
}: {
  children: React.ReactNode
  active?: boolean
  color?: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
        active
          ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
          : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300 hover:border-zinc-500'
      }`}
      style={active && color ? { backgroundColor: color, borderColor: color, color: 'white' } : undefined}
    >
      {children}
    </button>
  )
}
