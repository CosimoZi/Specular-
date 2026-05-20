import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { iconUrl, listCharacters } from '@/data'
import { ELEMENT_COLOR, ELEMENT_LABEL, WEAPON_TYPE_LABEL } from '@/data/types'
import type { Element, WeaponType } from '@/data/types'

const ELEMENT_FILTERS: Array<{ key: Element; label: string }> = [
  { key: 'Pyro' as Element, label: '火' },
  { key: 'Hydro' as Element, label: '水' },
  { key: 'Cryo' as Element, label: '冰' },
  { key: 'Electric' as Element, label: '雷' },
  { key: 'Anemo' as Element, label: '风' },
  { key: 'Geo' as Element, label: '岩' },
  { key: 'Grass' as Element, label: '草' },
]

const WEAPON_FILTERS: Array<{ key: WeaponType; label: string }> = [
  { key: 'WEAPON_SWORD_ONE_HAND', label: '单手剑' },
  { key: 'WEAPON_CLAYMORE', label: '双手剑' },
  { key: 'WEAPON_POLE', label: '长柄' },
  { key: 'WEAPON_BOW', label: '弓' },
  { key: 'WEAPON_CATALYST', label: '法器' },
]

export default function Characters() {
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
      if (elemFilter.size && !elemFilter.has(c.element)) {
        // Element keys aren't normalised — accept any synonym
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

  const toggle = (
    set: Set<string | number>,
    key: string | number,
    setter: (s: Set<string | number>) => void,
  ) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setter(next)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">角色 ({filtered.length}/{all.length})</h1>
        <p className="text-sm text-zinc-500 mt-1">
          点击进入详情页查看技能倍率表 + 简易伤害计算。
        </p>
      </div>

      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索名字或拼音…"
          className="w-full md:max-w-md px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        />
        <FilterGroup label="元素">
          {ELEMENT_FILTERS.map((f) => (
            <Chip
              key={f.key}
              active={elemFilter.has(f.key)}
              color={ELEMENT_COLOR[f.key]}
              onClick={() =>
                toggle(elemFilter, f.key, (s) => setElemFilter(s as Set<string>))
              }
            >
              {f.label}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label="星级">
          {[5, 4].map((r) => (
            <Chip
              key={r}
              active={rankFilter.has(r)}
              onClick={() =>
                toggle(rankFilter, r, (s) => setRankFilter(s as Set<number>))
              }
            >
              {r}★
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label="武器">
          {WEAPON_FILTERS.map((f) => (
            <Chip
              key={f.key}
              active={weaponFilter.has(f.key)}
              onClick={() =>
                toggle(weaponFilter, f.key, (s) => setWeaponFilter(s as Set<string>))
              }
            >
              {f.label}
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
              <span>{ELEMENT_LABEL[c.element] ?? c.element}</span>
              <span className="text-zinc-400">·</span>
              <span>{c.rank}★</span>
            </div>
            <div className="text-[10px] text-zinc-500 truncate">
              {WEAPON_TYPE_LABEL[c.weaponType]}
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
      <span className="text-xs text-zinc-500 w-10">{label}</span>
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
