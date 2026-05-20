import { useEffect, useMemo, useState } from 'react'
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
import { deriveConfigStats } from '@/data/config-to-stats'
import {
  aggregateStats,
  calcDamage,
  type DamageElement,
  type Reaction,
  type StatBag,
} from '@/engine'
import { ALL_SUBSTATS, MAX_ROLL_VALUES, type Substat } from '@/engine/substat'
import { ELEMENT_COLOR } from '@/data/types'
import { useI18n, useT } from '@/i18n/store'
import { useCharacterConfigs } from '@/store/character-configs'
import { useTeamConfig } from '@/store/team-config'
import { isConfigured, type TeamConfig, type CharacterConfig } from '@/data/config-types'
import { BUFFS, eligibleBuffsForTeam, type BuffSpec } from '@/data/buffs'

function reactionFromPick(pick: TeamConfig['reaction']): Reaction {
  switch (pick) {
    case 'vape_strong': return { kind: 'vape', trigger: 'pyro_on_hydro' }
    case 'vape_weak': return { kind: 'vape', trigger: 'hydro_on_pyro' }
    case 'melt_strong': return { kind: 'melt', trigger: 'pyro_on_cryo' }
    case 'melt_weak': return { kind: 'melt', trigger: 'cryo_on_pyro' }
    case 'aggravate': return { kind: 'aggravate' }
    case 'spread': return { kind: 'spread' }
    default: return { kind: 'none' }
  }
}

type ComputedRow = {
  role: 'auto' | 'skill' | 'burst'
  hit: ExtractedHit
  multiplier: number
  out: ReturnType<typeof calcDamage>
}

export default function Team() {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const team = useTeamConfig((s) => s.team)
  const setSlot = useTeamConfig((s) => s.setSlot)
  const setFocus = useTeamConfig((s) => s.setFocus)
  const teamPatch = useTeamConfig((s) => s.patch)
  const toggleBuff = useTeamConfig((s) => s.toggleBuff)
  const configsMap = useCharacterConfigs((s) => s.configs)
  const getConfig = useCharacterConfigs((s) => s.get)
  const allCharacters = useMemo(() => listCharacters(), [])

  // Picker modal state
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')

  // Load metas for all team members
  const [metaMap, setMetaMap] = useState<Record<string, CharacterMeta>>({})
  useEffect(() => {
    const ids = team.slots.filter((s): s is number | string => s !== null).map(String)
    for (const id of ids) {
      if (metaMap[id]) continue
      loadCharacterMeta(id)
        .then((m) => setMetaMap((prev) => ({ ...prev, [id]: m })))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.slots.join(',')])

  // Compute focus
  const focusIdx = team.focusIndex ?? team.slots.findIndex((s) => s !== null)
  const focusCharId = focusIdx >= 0 ? team.slots[focusIdx] : null

  // Eligible buffs from the current team
  const eligibleBuffs = useMemo(() => {
    const teamIds = team.slots.filter((s): s is number | string => s !== null)
    return eligibleBuffsForTeam(teamIds, configsMap)
  }, [team.slots, configsMap])

  // Computed StatBag merged from all enabled buffs
  const buffBag = useMemo(() => {
    const bag: StatBag = {}
    for (const b of eligibleBuffs) {
      const key = b.id
      const explicit = team.buffToggles[key]
      const on = explicit ?? b.defaultOn
      if (!on) continue
      // 'self' buffs only apply if focus IS the source
      if (b.target === 'self' && focusCharId != b.sourceCharacterId) continue
      for (const [k, v] of Object.entries(b.bag)) {
        const sk = k as keyof StatBag
        if (typeof v === 'number') {
          bag[sk] = (bag[sk] ?? 0) + v
        }
      }
    }
    return bag
  }, [eligibleBuffs, team.buffToggles, focusCharId])

  // Compute focus character's damage rows (async because derive fetches weapon detail)
  const [focusRows, setFocusRows] = useState<{
    rows: ComputedRow[]
    finalStats: ReturnType<typeof aggregateStats> | null
  }>({ rows: [], finalStats: null })
  const [substatValues, setSubstatValues] = useState<
    Array<{ substat: Substat; absoluteDelta: number; pctDelta: number }>
  >([])

  const focusConfig = focusCharId != null ? getConfig(focusCharId) : null
  const focusIdx_data = focusCharId != null ? getCharacterIndex(focusCharId) : null
  const focusMeta = focusCharId != null ? metaMap[String(focusCharId)] : null

  useEffect(() => {
    if (!focusCharId || !focusConfig || !focusMeta || !focusIdx_data) {
      setFocusRows({ rows: [], finalStats: null })
      setSubstatValues([])
      return
    }
    let cancelled = false
    deriveConfigStats(focusConfig, focusMeta, focusIdx_data.element)
      .then((derived) => {
        if (cancelled) return
        const element = normalizeElement(focusIdx_data.element)
        const baseline = computeRows(focusConfig, focusMeta, derived, element, team, buffBag)
        setFocusRows(baseline)

        // Substat marginal values
        const baselineTotal = baseline.rows.reduce((s, r) => s + r.out.avg, 0)
        if (baselineTotal === 0) {
          setSubstatValues([])
          return
        }
        const subValues = ALL_SUBSTATS.map((s) => {
          const { key, delta } = substatToBag(s)
          const perturbed: StatBag = { ...buffBag, [key]: (buffBag[key] ?? 0) + delta }
          const r = computeRows(focusConfig, focusMeta, derived, element, team, perturbed)
          const newTotal = r.rows.reduce((acc, row) => acc + row.out.avg, 0)
          return {
            substat: s,
            absoluteDelta: newTotal - baselineTotal,
            pctDelta: ((newTotal - baselineTotal) / baselineTotal) * 100,
          }
        }).sort((a, b) => b.absoluteDelta - a.absoluteDelta)
        setSubstatValues(subValues)
      })
      .catch(() => setFocusRows({ rows: [], finalStats: null }))
    return () => { cancelled = true }
  }, [focusCharId, focusConfig, focusMeta, focusIdx_data, team, buffBag])

  // Picker: only configured characters
  const configuredCharacters = useMemo(
    () => allCharacters.filter((c) => isConfigured(configsMap[String(c.id)])),
    [allCharacters, configsMap],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('page.team.title')}</h1>
        <p className="text-sm text-zinc-500 mt-2">{t('team.v2Hint')}</p>
      </div>

      {/* Team slots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {team.slots.map((charId, slotIdx) => (
          <SlotCard
            key={slotIdx}
            slotIdx={slotIdx}
            charId={charId}
            isFocus={slotIdx === focusIdx}
            onPick={() => { setPickerSlot(slotIdx); setPickerQuery('') }}
            onClear={() => setSlot(slotIdx, null)}
            onFocus={() => setFocus(slotIdx)}
            locale={locale}
            t={t}
            config={charId != null ? getConfig(charId) : null}
          />
        ))}
      </div>

      {/* Enemy + reaction (now on team) */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold">{t('team.enemyAndReaction')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <NumberCell label={t('enemy.level')} value={team.enemyLevel} step={5} onChange={(v) => teamPatch({ enemyLevel: v })} />
          <NumberCell label={t('enemy.baseRes')} value={team.enemyBaseRes} step={5} onChange={(v) => teamPatch({ enemyBaseRes: v })} />
          <NumberCell label={t('enemy.resReduction')} value={team.enemyResReduction} step={5} onChange={(v) => teamPatch({ enemyResReduction: v })} />
          <NumberCell label={t('enemy.defReduction')} value={team.enemyDefReduction} step={5} onChange={(v) => teamPatch({ enemyDefReduction: v })} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">{t('reaction.label')}</span>
          <select
            value={team.reaction}
            onChange={(e) => teamPatch({ reaction: e.target.value as TeamConfig['reaction'] })}
            className="flex-1 px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          >
            <option value="none">{t('reaction.none')}</option>
            <option value="vape_strong">{t('reaction.vape_strong')}</option>
            <option value="vape_weak">{t('reaction.vape_weak')}</option>
            <option value="melt_strong">{t('reaction.melt_strong')}</option>
            <option value="melt_weak">{t('reaction.melt_weak')}</option>
            <option value="aggravate">{t('reaction.aggravate')}</option>
            <option value="spread">{t('reaction.spread')}</option>
          </select>
        </div>
      </section>

      {/* Received buffs */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <h3 className="text-sm font-semibold px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          {t('team.buffsTitle')} {focusCharId != null && <span className="text-xs font-normal text-zinc-500">· {t('team.forFocus')}: {focusIdx_data ? displayName(focusIdx_data, locale) : ''}</span>}
        </h3>
        {eligibleBuffs.length === 0 ? (
          <p className="text-sm text-zinc-500 px-4 py-3">{t('team.noBuffsAvailable')}</p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {eligibleBuffs.map((b) => (
              <BuffRow
                key={b.id}
                buff={b}
                on={team.buffToggles[b.id] ?? b.defaultOn}
                onToggle={(on) => toggleBuff(b.id, on)}
                locale={locale}
                focusCharId={focusCharId}
              />
            ))}
          </div>
        )}
        <p className="text-xs text-zinc-500 px-4 py-2 bg-zinc-50/50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800">
          {t('team.buffsCoverage')} ({new Set(BUFFS.map((b) => b.sourceCharacterId)).size} {t('team.charactersCoveredSuffix')})
        </p>
      </section>

      {/* Focus damage panel */}
      {focusMeta && focusIdx_data && focusRows.finalStats && (
        <FocusDamagePanel
          meta={focusMeta}
          rows={focusRows.rows}
          finalStats={focusRows.finalStats}
          substatValues={substatValues}
          t={t}
        />
      )}

      {!focusCharId && (
        <p className="text-sm text-zinc-500">{t('team.pickToBegin')}</p>
      )}

      {/* Picker modal */}
      {pickerSlot !== null && (
        <PickerModal
          query={pickerQuery}
          setQuery={setPickerQuery}
          characters={configuredCharacters}
          locale={locale}
          t={t}
          onClose={() => setPickerSlot(null)}
          onPick={(id) => {
            setSlot(pickerSlot, id)
            setPickerSlot(null)
          }}
        />
      )}
    </div>
  )
}

function computeRows(
  config: CharacterConfig,
  meta: CharacterMeta,
  derived: import('@/data/config-to-stats').DerivedStatsInput,
  element: DamageElement,
  team: TeamConfig,
  buffBag: StatBag,
): { rows: ComputedRow[]; finalStats: ReturnType<typeof aggregateStats> } {
  const reaction = reactionFromPick(team.reaction)
  const stats = aggregateStats([
    {
      atkFlat: derived.baseAtk,
      hpFlat: derived.baseHp,
      defFlat: derived.baseDef,
    },
    ...derived.bonusBags,
    buffBag,
  ])
  const baseRes = team.enemyBaseRes / 100
  const attacker = { level: config.level, stats }
  const target = {
    level: team.enemyLevel,
    resistance: {
      Pyro: baseRes, Hydro: baseRes, Cryo: baseRes, Electro: baseRes,
      Anemo: baseRes, Geo: baseRes, Dendro: baseRes, Physical: baseRes,
    },
    resReduction: {
      Pyro: team.enemyResReduction / 100, Hydro: team.enemyResReduction / 100,
      Cryo: team.enemyResReduction / 100, Electro: team.enemyResReduction / 100,
      Anemo: team.enemyResReduction / 100, Geo: team.enemyResReduction / 100,
      Dendro: team.enemyResReduction / 100, Physical: team.enemyResReduction / 100,
    },
    defReduction: team.enemyDefReduction / 100,
  }

  const rows: ComputedRow[] = []
  const sections: Array<{ role: 'auto' | 'skill' | 'burst'; lvl: number }> = [
    { role: 'auto', lvl: config.talentLevels.auto },
    { role: 'skill', lvl: config.talentLevels.skill },
    { role: 'burst', lvl: config.talentLevels.burst },
  ]
  const scalingOverride = config.scalingOverride ?? {}
  for (const { role, lvl } of sections) {
    const tlt = meta.talents[role]
    if (!tlt) continue
    for (const hit of tlt.hits) {
      const m = hitMultiplier(tlt, hit, lvl)
      if (m == null) continue
      const key = `${role}:${hit.paramIndex}:${hit.label}`
      const scaling = scalingOverride[key] ?? hit.scaling
      const out = calcDamage(
        attacker,
        target,
        { label: hit.label, scaling, multiplier: m, element, hitType: hit.hitType },
        reaction,
      )
      rows.push({ role, hit: { ...hit, scaling }, multiplier: m, out })
    }
  }
  return { rows, finalStats: stats }
}

function substatToBag(substat: Substat): { key: keyof StatBag; delta: number } {
  const roll = MAX_ROLL_VALUES[substat]
  switch (substat) {
    case 'critRate': return { key: 'critRate', delta: roll }
    case 'critDmg': return { key: 'critDmg', delta: roll }
    case 'atkPct': return { key: 'atkPct', delta: roll }
    case 'hpPct': return { key: 'hpPct', delta: roll }
    case 'defPct': return { key: 'defPct', delta: roll }
    case 'em': return { key: 'em', delta: roll }
    case 'er': return { key: 'er', delta: roll }
    case 'atkFlat': return { key: 'atkFlat', delta: roll }
    case 'hpFlat': return { key: 'hpFlat', delta: roll }
    case 'defFlat': return { key: 'defFlat', delta: roll }
  }
}

function SlotCard({
  slotIdx, charId, isFocus, onPick, onClear, onFocus, locale, t, config,
}: {
  slotIdx: number
  charId: number | string | null
  isFocus: boolean
  onPick: () => void
  onClear: () => void
  onFocus: () => void
  locale: 'zh' | 'en'
  t: (k: string, f?: string) => string
  config: CharacterConfig | null
}) {
  if (charId == null) {
    return (
      <button
        onClick={onPick}
        className="aspect-[3/4] rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-600 transition-colors flex items-center justify-center text-sm"
      >
        + {t('team.emptySlot')} {slotIdx + 1}
      </button>
    )
  }
  const idx = getCharacterIndex(charId)
  if (!idx) return null
  return (
    <div className={`rounded-lg border bg-white dark:bg-zinc-900 overflow-hidden ${isFocus ? 'border-amber-500 dark:border-amber-400 ring-2 ring-amber-500/30' : 'border-zinc-200 dark:border-zinc-800'}`}>
      <div className="flex items-center gap-3 p-3">
        <div
          className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0"
          style={{ background: `linear-gradient(180deg, ${ELEMENT_COLOR[idx.element] ?? '#888'}33, transparent)` }}
        >
          <img src={iconUrl(idx.icon)} alt={displayName(idx, locale)} className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{displayName(idx, locale)}</div>
          <div className="text-xs" style={{ color: ELEMENT_COLOR[idx.element] }}>
            {t(`element.${idx.element}`)} · C{config?.constellation ?? 0}
          </div>
        </div>
        <button onClick={onClear} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm" title={t('team.clearSlot')}>
          ✕
        </button>
      </div>
      <button
        onClick={onFocus}
        className={`block w-full text-xs px-3 py-1.5 border-t ${isFocus ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500/30 text-amber-700 dark:text-amber-400 font-medium' : 'border-zinc-100 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
      >
        {isFocus ? `★ ${t('team.thisFocus')}` : t('team.setFocus')}
      </button>
    </div>
  )
}

function NumberCell({
  label, value, step, onChange,
}: { label: string; value: number; step: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <div className="text-xs text-zinc-500">{label}</div>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => {
          const n = parseFloat(e.target.value)
          if (!Number.isNaN(n)) onChange(n)
        }}
        className="w-full px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
      />
    </label>
  )
}

function BuffRow({
  buff, on, onToggle, locale, focusCharId,
}: {
  buff: BuffSpec
  on: boolean
  onToggle: (on: boolean) => void
  locale: 'zh' | 'en'
  focusCharId: number | string | null
}) {
  const source = getCharacterIndex(buff.sourceCharacterId)
  // For 'self' buffs, hide if the focus is NOT the source
  if (buff.target === 'self' && focusCharId != buff.sourceCharacterId) {
    return null
  }
  return (
    <label className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-1 cursor-pointer"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm flex items-center gap-2">
          {source && (
            <img
              src={iconUrl(source.icon)}
              alt=""
              className="w-5 h-5 rounded inline-block flex-shrink-0"
            />
          )}
          <span className="font-medium">{buff.label[locale]}</span>
          <span className="text-xs text-zinc-500">
            {buff.target === 'self' ? '· self only' : ''}
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{buff.description[locale]}</p>
      </div>
    </label>
  )
}

function PickerModal({
  query, setQuery, characters, locale, t, onClose, onPick,
}: {
  query: string
  setQuery: (s: string) => void
  characters: ReturnType<typeof listCharacters>
  locale: 'zh' | 'en'
  t: (k: string, f?: string) => string
  onClose: () => void
  onPick: (id: number | string) => void
}) {
  const filtered = characters.filter((c) => {
    if (!query) return true
    const q = query.toLowerCase()
    return displayName(c, locale).toLowerCase().includes(q) || c.route.toLowerCase().includes(q)
  })
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
          <input
            type="search"
            placeholder={t('characters.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            autoFocus
          />
          <button onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="text-sm text-zinc-500 text-center py-8">
              {t('team.noConfiguredCharacters')}
              <br />
              <Link to="/characters" className="text-blue-600 hover:underline">
                {t('team.goConfigureLink')}
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {filtered.map((c) => (
                <button
                  key={String(c.id)}
                  onClick={() => onPick(c.id)}
                  className="group rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 text-center hover:border-zinc-400"
                >
                  <div
                    className="aspect-square rounded overflow-hidden mb-1"
                    style={{ background: `linear-gradient(180deg, ${ELEMENT_COLOR[c.element] ?? '#888'}33, transparent)` }}
                  >
                    <img src={iconUrl(c.icon)} alt={displayName(c, locale)} loading="lazy" className="w-full h-full object-cover" />
                  </div>
                  <div className="text-xs font-medium truncate">{displayName(c, locale)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FocusDamagePanel({
  meta, rows, finalStats, substatValues, t,
}: {
  meta: CharacterMeta
  rows: ComputedRow[]
  finalStats: ReturnType<typeof aggregateStats>
  substatValues: Array<{ substat: Substat; absoluteDelta: number; pctDelta: number }>
  t: (k: string, f?: string) => string
}) {
  const groups = useMemo(() => {
    const g: Record<string, ComputedRow[]> = { auto: [], skill: [], burst: [] }
    for (const r of rows) g[r.role].push(r)
    return g
  }, [rows])
  const roleLabels: Record<string, string> = {
    auto: `${t('talent.normalFull')} · ${meta.talents.auto?.name ?? ''}`,
    skill: `${t('talent.skillFull')} · ${meta.talents.skill?.name ?? ''}`,
    burst: `${t('talent.burstFull')} · ${meta.talents.burst?.name ?? ''}`,
  }
  const fmt = (n: number) => Math.round(n).toLocaleString()
  const positive = substatValues.filter((s) => s.absoluteDelta > 0)
  const maxDelta = positive[0]?.absoluteDelta ?? 1

  return (
    <div className="space-y-4">
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 bg-zinc-50/50 dark:bg-zinc-900/50 text-sm grid grid-cols-3 sm:grid-cols-6 gap-3">
        <FinalStat label={t('stat.atk')} value={fmt(finalStats.atk)} />
        <FinalStat label={t('stat.hp')} value={fmt(finalStats.hp)} />
        <FinalStat label={t('stat.def')} value={fmt(finalStats.def)} />
        <FinalStat label={t('stat.em')} value={fmt(finalStats.em)} />
        <FinalStat label="CR/CD" value={`${(finalStats.critRate * 100).toFixed(1)}% / ${(finalStats.critDmg * 100).toFixed(1)}%`} />
        <FinalStat label="ER" value={`${(finalStats.er * 100).toFixed(0)}%`} />
      </section>

      {(['auto', 'skill', 'burst'] as const).map((role) => {
        const list = groups[role]
        if (!list.length) return null
        return (
          <section key={role} className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <h3 className="text-sm font-semibold px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
              {roleLabels[role]}
            </h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/50">
                <tr>
                  <th className="text-left px-4 py-2 font-normal">{t('damage.skill')}</th>
                  <th className="text-left px-2 py-2 font-normal w-24">{t('damage.multiplier')}</th>
                  <th className="text-left px-2 py-2 font-normal w-24">{t('damage.scaling')}</th>
                  <th className="text-right px-2 py-2 font-normal">{t('damage.nonCrit')}</th>
                  <th className="text-right px-2 py-2 font-normal">{t('damage.crit')}</th>
                  <th className="text-right px-4 py-2 font-normal">{t('damage.avg')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => (
                  <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2">{r.hit.label}</td>
                    <td className="px-2 py-2 text-zinc-500 text-xs">{(r.multiplier * 100).toFixed(1)}%</td>
                    <td className="px-2 py-2 text-xs">{t(`damage.scaling.${r.hit.scaling}`)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(r.out.nonCrit)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{fmt(r.out.crit)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(r.out.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}

      {substatValues.length > 0 && (
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <h3 className="text-sm font-semibold px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            {t('substat.title')}
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {substatValues.map((s, i) => {
                const width = s.absoluteDelta > 0 ? (s.absoluteDelta / maxDelta) * 100 : 0
                const isPositive = s.absoluteDelta > 0
                return (
                  <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2 w-40">{t(`substat.${s.substat}`)}</td>
                    <td className="px-2 py-2">
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                        <div className={`h-full ${isPositive ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-zinc-400'}`} style={{ width: `${width}%` }} />
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{isPositive ? '+' : ''}{fmt(s.absoluteDelta)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{s.pctDelta >= 0 ? '+' : ''}{s.pctDelta.toFixed(2)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function FinalStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="text-base tabular-nums font-medium">{value}</div>
    </div>
  )
}
