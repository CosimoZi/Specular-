import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  displayName,
  iconUrl,
  listCharacters,
  getCharacterIndex,
} from '@/data'
import {
  loadCharacterMeta,
  hitMultiplier,
  normalizeElement,
  type CharacterMeta,
  type ExtractedHit,
} from '@/data/meta'
import {
  computeBaseStats,
  computeAscensionBonus,
} from '@/data/character-stats'
import {
  aggregateStats,
  calcDamage,
  type DamageElement,
  type StatBag,
} from '@/engine'
import { ELEMENT_COLOR } from '@/data/types'
import { useI18n, useT } from '@/i18n/store'
import { useImportedBuilds } from '@/store/imported-builds'

interface SlotResult {
  meta: CharacterMeta
  element: DamageElement
  finalAtk: number
  finalHp: number
  finalCr: number
  finalCd: number
  bestHit: {
    label: string
    role: 'auto' | 'skill' | 'burst'
    avg: number
  } | null
  totalAvg: number
}

export default function Team() {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const all = useMemo(() => listCharacters(), [])
  const imported = useImportedBuilds((s) => s.byCharacterId)
  const [slots, setSlots] = useState<Array<number | string | null>>([null, null, null, null])
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')

  const slotResults = useSlotResults(slots, imported)

  const teamTotalAvg = slotResults.reduce(
    (sum, r) => sum + (r?.totalAvg ?? 0),
    0,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('page.team.title')}</h1>
        <p className="text-sm text-zinc-500 mt-2">{t('team.hint')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {slots.map((charId, idx) => {
          const res = slotResults[idx]
          return (
            <SlotCard
              key={idx}
              slot={idx}
              charId={charId}
              result={res}
              imported={imported[String(charId)] !== undefined}
              onPick={() => {
                setPickerSlot(idx)
                setPickerQuery('')
              }}
              onClear={() => {
                const next = [...slots]
                next[idx] = null
                setSlots(next)
              }}
              t={t}
              locale={locale}
            />
          )
        })}
      </div>

      {teamTotalAvg > 0 && (
        <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm">
          <strong>{t('team.totalDamage')}</strong>{' '}
          <span className="tabular-nums text-lg">
            {Math.round(teamTotalAvg).toLocaleString()}
          </span>
          <span className="text-xs text-zinc-500 ml-3">
            {t('team.totalNote')}
          </span>
        </div>
      )}

      {pickerSlot !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPickerSlot(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
              <input
                type="search"
                placeholder={t('characters.searchPlaceholder')}
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                autoFocus
              />
              <button
                onClick={() => setPickerSlot(null)}
                className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {all
                  .filter((c) => {
                    if (!pickerQuery) return true
                    const q = pickerQuery.toLowerCase()
                    return (
                      displayName(c, locale).toLowerCase().includes(q) ||
                      c.route.toLowerCase().includes(q)
                    )
                  })
                  .slice(0, 60)
                  .map((c) => (
                    <button
                      key={String(c.id)}
                      onClick={() => {
                        const next = [...slots]
                        next[pickerSlot] = c.id
                        setSlots(next)
                        setPickerSlot(null)
                      }}
                      className="group rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 text-center hover:border-zinc-400"
                    >
                      <div
                        className="aspect-square rounded overflow-hidden mb-1"
                        style={{
                          background: `linear-gradient(180deg, ${
                            ELEMENT_COLOR[c.element] ?? '#888'
                          }33, transparent)`,
                        }}
                      >
                        <img
                          src={iconUrl(c.icon)}
                          alt={displayName(c, locale)}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="text-xs font-medium truncate">
                        {displayName(c, locale)}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SlotCard({
  slot,
  charId,
  result,
  imported,
  onPick,
  onClear,
  t,
  locale,
}: {
  slot: number
  charId: number | string | null
  result: SlotResult | null
  imported: boolean
  onPick: () => void
  onClear: () => void
  t: (key: string, fallback?: string) => string
  locale: 'zh' | 'en'
}) {
  if (charId === null) {
    return (
      <button
        onClick={onPick}
        className="aspect-[3/4] rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 dark:hover:border-zinc-500 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 transition-colors flex items-center justify-center text-sm"
      >
        {t('team.emptySlot')} {slot + 1}
      </button>
    )
  }
  const idx = getCharacterIndex(charId)
  if (!idx) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-sm text-zinc-500">
        ?
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="flex items-center gap-3 p-3 border-b border-zinc-100 dark:border-zinc-800">
        <div
          className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0"
          style={{
            background: `linear-gradient(180deg, ${
              ELEMENT_COLOR[idx.element] ?? '#888'
            }33, transparent)`,
          }}
        >
          <img
            src={iconUrl(idx.icon)}
            alt={displayName(idx, locale)}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={`/characters/${charId}`}
            className="font-medium text-sm truncate hover:underline block"
          >
            {displayName(idx, locale)}
          </Link>
          <div
            className="text-xs"
            style={{ color: ELEMENT_COLOR[idx.element] }}
          >
            {t(`element.${idx.element}`)} · {idx.rank}★
            {imported && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 align-middle">
                UID
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClear}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm"
        >
          ✕
        </button>
      </div>
      <div className="p-3 text-xs space-y-1.5">
        {result ? (
          <>
            <div className="flex justify-between">
              <span className="text-zinc-500">{t('stat.atk')}</span>
              <span className="tabular-nums">{Math.round(result.finalAtk).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">{t('stat.hp')}</span>
              <span className="tabular-nums">{Math.round(result.finalHp).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">CR/CD</span>
              <span className="tabular-nums">
                {Math.round(result.finalCr * 100)}% / {Math.round(result.finalCd * 100)}%
              </span>
            </div>
            {result.bestHit && (
              <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div className="text-zinc-500 text-[10px]">{t('team.bestHit')}</div>
                <div className="flex justify-between items-baseline mt-0.5">
                  <span className="truncate text-[11px]">{result.bestHit.label}</span>
                  <span className="tabular-nums font-medium ml-2">
                    {Math.round(result.bestHit.avg).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-between">
              <span className="text-zinc-500 text-[10px]">{t('team.totalCycle')}</span>
              <span className="tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                {Math.round(result.totalAvg).toLocaleString()}
              </span>
            </div>
          </>
        ) : (
          <div className="text-zinc-500">{t('detail.loading')}</div>
        )}
      </div>
    </div>
  )
}

// React hook that resolves each non-empty slot to its computed damage.
function useSlotResults(
  slots: Array<number | string | null>,
  imported: Record<string, ReturnType<typeof useImportedBuilds.getState>['byCharacterId'][string]>,
): Array<SlotResult | null> {
  const [metaMap, setMetaMap] = useState<Record<string, CharacterMeta>>({})

  // Load metas as needed
  useMemo(() => {
    const toLoad = slots
      .filter((s): s is number | string => s !== null)
      .map(String)
      .filter((id) => !metaMap[id])
    toLoad.forEach((id) => {
      loadCharacterMeta(id)
        .then((m) =>
          setMetaMap((prev) =>
            prev[id] ? prev : { ...prev, [id]: m },
          ),
        )
        .catch(() => {})
    })
    return null
  }, [slots, metaMap])

  return slots.map((charId) => {
    if (charId === null) return null
    const meta = metaMap[String(charId)]
    const idx = getCharacterIndex(charId)
    if (!meta || !idx) return null
    return computeSlotDamage(meta, idx.element, imported[String(charId)])
  })
}

function computeSlotDamage(
  meta: CharacterMeta,
  ambrElement: string,
  imported?: ReturnType<typeof useImportedBuilds.getState>['byCharacterId'][string],
): SlotResult {
  const element = normalizeElement(ambrElement)
  // Build stats. Use imported if available, else lvl90 with default external bonuses.
  let baseAtk: number
  let baseHp: number
  let baseDef: number
  let bonusBag: StatBag
  let charLevel: number
  let talentLevels: { auto: number; skill: number; burst: number }

  if (imported) {
    baseAtk = imported.finalAtk
    baseHp = imported.finalHp
    baseDef = imported.finalDef
    bonusBag = {
      em: imported.em,
      critRate: imported.critRate / 100 - 0.05,
      critDmg: imported.critDmg / 100 - 0.5,
      er: imported.er / 100 - 1.0,
      pyroDmg: element === 'Pyro' ? (imported.elementalDmg.Pyro ?? 0) / 100 : 0,
      hydroDmg: element === 'Hydro' ? (imported.elementalDmg.Hydro ?? 0) / 100 : 0,
      cryoDmg: element === 'Cryo' ? (imported.elementalDmg.Cryo ?? 0) / 100 : 0,
      electroDmg: element === 'Electro' ? (imported.elementalDmg.Electro ?? 0) / 100 : 0,
      anemoDmg: element === 'Anemo' ? (imported.elementalDmg.Anemo ?? 0) / 100 : 0,
      geoDmg: element === 'Geo' ? (imported.elementalDmg.Geo ?? 0) / 100 : 0,
      dendroDmg: element === 'Dendro' ? (imported.elementalDmg.Dendro ?? 0) / 100 : 0,
    }
    charLevel = imported.characterLevel
    talentLevels = imported.talentLevels
  } else {
    const auto = computeBaseStats(meta, 90, 6)
    const asc = computeAscensionBonus(meta, 6)
    baseAtk = auto.atk
    baseHp = auto.hp
    baseDef = auto.def
    // "Reasonable default" build: 1000 flat ATK from weapon+flower, 60% ATK%,
    // 70/150 cr/cd, 100 EM, 46.6% elemDmg. Same as the detail-page DEFAULTS.
    bonusBag = {
      ...asc,
      atkFlat: 600,
      atkPct: 0.6,
      hpFlat: 4780,
      em: 100,
      critRate: 0.65, // = 70% total with 5% baseline
      critDmg: 1.0,
      pyroDmg: element === 'Pyro' ? 0.466 : 0,
      hydroDmg: element === 'Hydro' ? 0.466 : 0,
      cryoDmg: element === 'Cryo' ? 0.466 : 0,
      electroDmg: element === 'Electro' ? 0.466 : 0,
      anemoDmg: element === 'Anemo' ? 0.466 : 0,
      geoDmg: element === 'Geo' ? 0.466 : 0,
      dendroDmg: element === 'Dendro' ? 0.466 : 0,
    }
    charLevel = 90
    talentLevels = { auto: 10, skill: 10, burst: 10 }
  }

  const stats = aggregateStats([
    { atkFlat: baseAtk, hpFlat: baseHp, defFlat: baseDef },
    bonusBag,
  ])
  const target = {
    level: 100,
    resistance: {
      Pyro: 0.1, Hydro: 0.1, Cryo: 0.1, Electro: 0.1,
      Anemo: 0.1, Geo: 0.1, Dendro: 0.1, Physical: 0.1,
    },
  }

  const sections: Array<{ role: 'auto' | 'skill' | 'burst'; lvl: number }> = [
    { role: 'auto', lvl: talentLevels.auto },
    { role: 'skill', lvl: talentLevels.skill },
    { role: 'burst', lvl: talentLevels.burst },
  ]
  const allHits: Array<{ role: 'auto' | 'skill' | 'burst'; label: string; avg: number }> = []
  for (const { role, lvl } of sections) {
    const tlt = meta.talents[role]
    if (!tlt) continue
    for (const hit of tlt.hits as ExtractedHit[]) {
      const m = hitMultiplier(tlt, hit, lvl)
      if (m == null) continue
      const out = calcDamage(
        { level: charLevel, stats },
        target,
        { label: hit.label, scaling: hit.scaling, multiplier: m, element, hitType: hit.hitType },
        { kind: 'none' },
      )
      allHits.push({ role, label: hit.label, avg: out.avg })
    }
  }
  const totalAvg = allHits.reduce((s, h) => s + h.avg, 0)
  const bestHit = allHits.length
    ? allHits.reduce((best, h) => (h.avg > best.avg ? h : best))
    : null

  return {
    meta,
    element,
    finalAtk: stats.atk,
    finalHp: stats.hp,
    finalCr: stats.critRate,
    finalCd: stats.critDmg,
    bestHit,
    totalAvg,
  }
}
