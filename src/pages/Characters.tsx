import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { iconUrl, listCharacters } from '@/data'
import { ELEMENT_COLOR } from '@/data/types'
import type { Element, WeaponType } from '@/data/types'
import { useT } from '@/i18n/store'

const ELEMENT_FILTERS: Element[] = [
  'Pyro' as Element,
  'Hydro' as Element,
  'Cryo' as Element,
  'Electric' as Element,
  'Anemo' as Element,
  'Geo' as Element,
  'Grass' as Element,
]

const WEAPON_FILTERS: WeaponType[] = [
  'WEAPON_SWORD_ONE_HAND',
  'WEAPON_CLAYMORE',
  'WEAPON_POLE',
  'WEAPON_BOW',
  'WEAPON_CATALYST',
]

export default function Characters() {
  const t = useT()
  const all = useMemo(() => listCharacters(), [])
  const [query, setQuery] = useState('')
  const [elemFilter, setElemFilter] = useState<Set<string>>(new Set())
  const [rankFilter, setRankFilter] = useState<Set<number>>(new Set())
  const [weaponFilter, setWeaponFilter] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.route.toLowerCase().includes(q))
        return false
      if (elemFilter.size) {
        const synonyms: Record<string, string[]> = {
          Pyro: ['Pyro', 'Fire'],
          Hydro: ['Hydro', 'Water'],
          Cryo: ['Cryo', 'Ice'],
          Electric: ['Electric', 'Electro'],
          Anemo: ['Anemo', 'Wind'],
          Geo: ['Geo', 'Rock'],
          Grass: ['Grass', 'Dendro'],
        }
        const hit = [...elemFilter].some((k) =>
          (synonyms[k] ?? [k]).includes(c.element),
        )
        if (!hit) return false
      }
      if (rankFilter.size && !rankFilter.has(c.rank)) return false
      if (weaponFilter.size && !weaponFilter.has(c.weaponType)) return false
      return true
    })
  }, [all, query, elemFilter, rankFilter, weaponFilter])

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
        <h1 className="text-2xl font-semibold">
          {t('characters.title')} ({filtered.length}/{all.length})
        </h1>
        <p className="text-sm text-zinc-500 mt-1">{t('characters.hint')}</p>
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
              onClick={() =>
                toggle(elemFilter as Set<string>, key, (s) => setElemFilter(s))
              }
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
              onClick={() =>
                toggle(rankFilter as Set<number>, r, (s) => setRankFilter(s))
              }
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
              onClick={() =>
                toggle(weaponFilter as Set<string>, key, (s) => setWeaponFilter(s))
              }
            >
              {t(`weapon.${key}`)}
            </Chip>
          ))}
        </FilterGroup>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {filtered.map((c) => (
          <Link
            key={c.id}
            to={`/characters/${c.id}`}
            className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 text-center hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
          >
            <div
              className="aspect-square rounded-md overflow-hidden mb-2"
              style={{
                background: `linear-gradient(180deg, ${
                  ELEMENT_COLOR[c.element] ?? '#888'
                }33, transparent)`,
              }}
            >
              <img
                src={iconUrl(c.icon)}
                alt={c.name}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            </div>
            <div className="text-sm font-medium truncate">{c.name}</div>
            <div
              className="text-xs flex justify-center gap-1 items-center"
              style={{ color: ELEMENT_COLOR[c.element] ?? undefined }}
            >
              <span>{t(`element.${c.element}`)}</span>
              <span className="text-zinc-400">·</span>
              <span>{c.rank}★</span>
            </div>
            <div className="text-[10px] text-zinc-500 truncate">
              {t(`weapon.${c.weaponType}`)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function FilterGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-zinc-500 w-16">{label}</span>
      <div className="flex gap-1.5 flex-wrap">{children}</div>
    </div>
  )
}

function Chip({
  children,
  active,
  color,
  onClick,
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
      style={
        active && color
          ? { backgroundColor: color, borderColor: color, color: 'white' }
          : undefined
      }
    >
      {children}
    </button>
  )
}
