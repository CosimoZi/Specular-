import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  displayName,
  iconUrl,
  listCharacters,
  getCharacterIndex,
} from '@/data'
import type { GoComputeResult, SubstatMargin, CondInfo } from '@/integration/go-calc'
import { wiringTierForGoKey } from '@/integration/go-coverage'
import { goCharacterKey } from '@/integration/good-adapter'
import {
  buffsForCharacter,
  type BuffEntry,
  type BuffSourceType,
} from '@/integration/buff-sources'
import { ELEMENT_COLOR } from '@/data/types'
import { useI18n, useT } from '@/i18n/store'
import { useCharacterConfigs } from '@/store/character-configs'
import { useTeamConfig } from '@/store/team-config'
import { isConfigured, type TeamConfig, type CharacterConfig } from '@/data/config-types'

// Removed import section: hitMultiplier, normalizeElement, ExtractedHit,
// deriveConfigStats, aggregateStats, calcDamage, DamageElement, Reaction,
// StatBag, aggregateZoneBuffs, partValue, BuffSpec, ZoneBuffs, Position,
// BUFFS, eligibleBuffsForTeam, ALL_SUBSTATS, MAX_ROLL_VALUES, Substat.
// All belong to the legacy pre-GO buff/damage path that's been superseded
// by the GO Pando pipeline.

// Legacy helper removed: reactionFromPick, reactionKindOf, ComputedRow,
// zonesToOverrides, computeFocusRows, substatToBag, BuffRow, FocusDamagePanel.

export default function Team() {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const team = useTeamConfig((s) => s.team)
  const setSlot = useTeamConfig((s) => s.setSlot)
  const setFocus = useTeamConfig((s) => s.setFocus)
  const teamPatch = useTeamConfig((s) => s.patch)
  const setCond = useTeamConfig((s) => s.setCond)
  // Flatten characters → active-build-only map (for buff filtering / picker).
  const characters = useCharacterConfigs((s) => s.characters)
  const configsMap = useMemo(() => {
    const out: Record<string, CharacterConfig> = {}
    for (const [k, c] of Object.entries(characters)) {
      const cfg = c.builds[c.activeBuildId]
      if (cfg) out[k] = cfg
    }
    return out
  }, [characters])
  const allCharacters = useMemo(() => listCharacters(), [])

  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')

  const focusIdx = team.focusIndex ?? team.slots.findIndex((s) => s !== null)
  const focusCharId = focusIdx >= 0 ? team.slots[focusIdx] : null
  // Resolve focusConfig stably from configsMap so it doesn't flip identity on
  // every render when the character has no entry (which would tank useEffect
  // deps below and trip the same kind of loop as /characters/<id> had).
  const focusConfig = useMemo(() => {
    if (focusCharId == null) return null
    return configsMap[String(focusCharId)] ?? null
  }, [focusCharId, configsMap])

  // Per-slot cond list (which conditional buffs a slot's character exposes).
  // Loaded lazily via the same go-calc dynamic-imported module so we don't
  // eagerly pull the GO chunk into the main /team bundle.
  const [condsBySlot, setCondsBySlot] = useState<Array<CondInfo[]>>([[], [], [], []])
  useEffect(() => {
    let cancelled = false
    import('@/integration/go-calc').then(({ listCondsForCharacter }) => {
      if (cancelled) return
      setCondsBySlot(team.slots.map((id) => (id == null ? [] : listCondsForCharacter(id))))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.slots.join(',')])

  // GO Pando — compute via vendored GenshinOptimizer engine, full 4-member
  // team context so team buffs (4pc artifacts, weapon passives, character
  // teamBuff entries) propagate to the focus member. Dynamic import so the
  // ~230 KB gzip GO chunk only loads when user visits /team.
  const [goResult, setGoResult] = useState<GoComputeResult | null>(null)
  const [goMargins, setGoMargins] = useState<{
    baselineFormula: string
    baselineValue: number
    margins: SubstatMargin[]
  } | null>(null)
  // Which formula the substat-margin panel computes deltas against. User can
  // pin one via 📌 in the damage panel. Reset on focus change so we don't
  // hold a name that no longer exists on the new character.
  const [pinnedFormula, setPinnedFormula] = useState<string | null>(null)
  useEffect(() => { setPinnedFormula(null) }, [focusCharId])
  // Stable string key for the full team's config (so a child's build edit
  // re-runs GO compute, not just slot changes).
  const teamConfigsKey = useMemo(() => {
    return team.slots
      .map((id) => {
        if (id == null) return 'x'
        const c = configsMap[String(id)]
        return c ? `${id}:${c.lastModified}` : `${id}:0`
      })
      .join('|')
  }, [team.slots, configsMap])
  const condStateKey = useMemo(() => JSON.stringify(team.condState ?? {}), [team.condState])
  useEffect(() => {
    if (!focusConfig || focusIdx < 0) {
      setGoResult(null)
      setGoMargins(null)
      return
    }
    let cancelled = false
    Promise.all([
      import('@/integration/go-calc'),
      import('@/calc/team-adapter'),
    ]).then(([goMod, newMod]) => {
      if (cancelled) return
      const { computeTeamViaGo, computeSubstatMarginsViaGo } = goMod
      const { computeTeamNew, hasNewSheet } = newMod
      const members = team.slots.map((id) => {
        if (id == null) return null
        const cfg = configsMap[String(id)]
        return cfg ? { config: cfg } : null
      })
      const opts = {
        enemyLevel: team.enemyLevel,
        enemyPreRes: team.enemyBaseRes / 100,
        condState: team.condState,
      }
      // Route through new pipeline for characters that have a src/calc sheet
      // (Shenhe today). Fall back to legacy GO for everything else.
      const focusCfg = focusConfig
      if (focusCfg && hasNewSheet(focusCfg.characterId)) {
        const r = computeTeamNew(members, focusIdx, opts)
        // Adapt to GoComputeResult shape — both pipelines share the field names.
        setGoResult(r as unknown as GoComputeResult)
        // Substat margin compute still goes through GO for now; it's mainly a
        // ranking signal so a small numeric discrepancy is acceptable.
        setGoMargins(
          computeSubstatMarginsViaGo(members, focusIdx, {
            ...opts,
            targetFormula: pinnedFormula ?? undefined,
          }),
        )
      } else {
        setGoResult(computeTeamViaGo(members, focusIdx, opts))
        setGoMargins(
          computeSubstatMarginsViaGo(members, focusIdx, {
            ...opts,
            targetFormula: pinnedFormula ?? undefined,
          }),
        )
      }
    })
    return () => { cancelled = true }
    // teamConfigsKey + condStateKey + enemy* together cover every input to the
    // GO call. pinnedFormula is included so changing the substat target
    // re-runs the margin compute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx, teamConfigsKey, condStateKey, team.enemyLevel, team.enemyBaseRes, pinnedFormula])

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

      <CoverageBanner t={t} />

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
            config={charId != null ? configsMap[String(charId)] ?? null : null}
          />
        ))}
      </div>

      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold">{t('team.enemyAndReaction')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          <NumberCell label={t('enemy.level')} value={team.enemyLevel} step={5} onChange={(v) => teamPatch({ enemyLevel: v })} />
          <NumberCell label={t('enemy.baseRes')} value={team.enemyBaseRes} step={5} onChange={(v) => teamPatch({ enemyBaseRes: v })} />
        </div>
        <p className="text-[10px] text-zinc-500 leading-snug">{t('enemy.shredHint')}</p>
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

      {/* Conditional buffs (via GO Pando) — character-specific toggles like
          Bennett's Q field, Nahida's burst-active flag, etc. Only renders
          for team members whose vendored GO sheet actually wires conds. */}
      <CondSection
        slots={team.slots}
        condsBySlot={condsBySlot}
        condState={team.condState}
        configsMap={configsMap}
        locale={locale}
        t={t}
        onChange={(slotIdx, sheet, condName, value) => setCond(slotIdx, sheet, condName, value)}
      />

      {goResult && (
        <GoPandoPanel
          result={goResult}
          focusIdx={focusCharId != null ? getCharacterIndex(focusCharId) ?? null : null}
          pinnedFormula={pinnedFormula}
          onPinFormula={setPinnedFormula}
          locale={locale}
          t={t}
        />
      )}
      {goMargins && <GoSubstatPanel data={goMargins} t={t} />}

      {!focusCharId && (
        <p className="text-sm text-zinc-500">{t('team.pickToBegin')}</p>
      )}

      {pickerSlot !== null && (
        <PickerModal
          query={pickerQuery}
          setQuery={setPickerQuery}
          characters={configuredCharacters}
          locale={locale}
          t={t}
          onClose={() => setPickerSlot(null)}
          onPick={(id) => { setSlot(pickerSlot, id); setPickerSlot(null) }}
        />
      )}
    </div>
  )
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
  const tier = wiringTierForGoKey(goCharacterKey(charId))
  return (
    <div className={`rounded-lg border bg-white dark:bg-zinc-900 overflow-hidden ${isFocus ? 'border-amber-500 dark:border-amber-400 ring-2 ring-amber-500/30' : 'border-zinc-200 dark:border-zinc-800'}`}>
      <div className="flex items-center gap-3 p-3">
        <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0" style={{ background: `linear-gradient(180deg, ${ELEMENT_COLOR[idx.element] ?? '#888'}33, transparent)` }}>
          <img src={iconUrl(idx.icon)} alt={displayName(idx, locale)} className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate flex items-center gap-1.5">
            <span className="truncate">{displayName(idx, locale)}</span>
            {tier === 'wired' ? (
              <span
                title={t('team.tier.wiredHint')}
                className="text-[9px] px-1 py-0 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-medium flex-shrink-0"
              >
                {t('team.tier.wired')}
              </span>
            ) : (
              <span
                title={t('team.tier.stubHint')}
                className="text-[9px] px-1 py-0 rounded bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 flex-shrink-0"
              >
                {t('team.tier.stub')}
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: ELEMENT_COLOR[idx.element] }}>
            {t(`element.${idx.element}`)} · C{config?.constellation ?? 0}
          </div>
        </div>
        <button onClick={onClear} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm" title={t('team.clearSlot')}>✕</button>
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

/** Conditional buffs panel — groups each character's buffs by source
 *  (元素战技 / 天赋1 / 天赋2 / 命座N / 武器 / 圣遗物). Each buff shows its
 *  effect text + a toggle/input for the underlying Pando cond. Multiple
 *  buffs may share a cond (e.g. Shenhe A1 + C2 + Q-field RES shred all
 *  fire when burstField=1) — toggling any of them syncs the others. */
function CondSection({
  slots, condsBySlot, condState, configsMap, locale, t, onChange,
}: {
  slots: Array<number | string | null>
  condsBySlot: Array<CondInfo[]>
  condState: TeamConfig['condState']
  configsMap: Record<string, CharacterConfig>
  locale: 'zh' | 'en'
  t: (k: string, f?: string) => string
  onChange: (slotIdx: number, sheet: string, condName: string, value: number) => void
}) {
  // Only render the section if at least one slot has any wired conds.
  const hasAny = condsBySlot.some((cs) => cs.length > 0)
  if (!hasAny) return null
  return (
    <section className="border border-violet-200 dark:border-violet-900 rounded-lg overflow-hidden">
      <h3 className="text-sm font-semibold px-4 py-2 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200 dark:border-violet-800">
        {t('team.condTitle')}
        <span className="ml-2 text-xs font-normal text-zinc-500">{t('team.condSubtitle')}</span>
      </h3>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {slots.map((charId, slotIdx) => {
          if (charId == null) return null
          const conds = condsBySlot[slotIdx]
          if (!conds || conds.length === 0) return null
          const idx = getCharacterIndex(charId)
          if (!idx) return null
          const goKey = goCharacterKey(charId)
          const buffs = buffsForCharacter(goKey)
          // Build a per-cond lookup so we know each cond's metadata.
          const condByName = new Map(conds.map((c) => [c.name, c]))
          const slotKey = String(slotIdx)
          const charConds = condState?.[slotKey] ?? {}

          // Group buffs by source (e.g. all 天赋2 entries together). If we
          // have no descriptor for this character, fall back to raw cond
          // input rows so the user still has some way to drive them.
          const grouped = groupBuffsBySource(buffs)
          return (
            <div key={slotIdx} className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <img src={iconUrl(idx.icon)} alt="" className="w-6 h-6 rounded flex-shrink-0" />
                <span>{displayName(idx, locale)}</span>
                <span className="text-xs text-zinc-400">· C{configsMap[String(charId)]?.constellation ?? 0}</span>
              </div>
              {buffs.length === 0 ? (
                // No descriptor — fall back to raw cond inputs
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {conds.map((c) => (
                    <CondInputRowRaw
                      key={`${c.sheet}.${c.name}`}
                      cond={c}
                      value={charConds[c.sheet]?.[c.name] ?? 0}
                      onChange={(v) => onChange(slotIdx, c.sheet, c.name, v)}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {grouped.map((group, gi) => (
                    <div
                      key={gi}
                      className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden bg-white/40 dark:bg-zinc-900/40"
                    >
                      <div className={`px-3 py-1.5 text-[11px] font-semibold ${sourceHeaderClass(group.source.type)}`}>
                        <span className="opacity-80 text-[10px] mr-1.5">{sourceTagPrefix(group.source.type, group.source.ordinal)}</span>
                        {group.source.label[locale]}
                      </div>
                      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {group.entries.map((b, bi) => {
                          const condMeta = b.condName ? condByName.get(b.condName) : undefined
                          const val =
                            b.condName && goKey
                              ? charConds[goKey]?.[b.condName] ?? 0
                              : 0
                          const sourceCfg = configsMap[String(charId)]
                          const computedValue = b.valueAt && sourceCfg ? b.valueAt(sourceCfg) : undefined
                          return (
                            <BuffRowStructured
                              key={`${gi}-${bi}`}
                              buff={b}
                              cond={condMeta}
                              value={val}
                              computedValue={computedValue}
                              locale={locale}
                              onChange={(v) => {
                                if (b.condName && goKey) {
                                  onChange(slotIdx, goKey, b.condName, v)
                                }
                              }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-zinc-500 px-4 py-2 bg-violet-50/40 dark:bg-violet-950/20 border-t border-violet-100 dark:border-violet-900/50">
        {t('team.condHint')}
      </p>
    </section>
  )
}

/** Group buffs by source label so the UI can render one block per source. */
function groupBuffsBySource(buffs: ReadonlyArray<BuffEntry>): Array<{
  source: BuffEntry['source']
  entries: BuffEntry[]
}> {
  const groups: Array<{ source: BuffEntry['source']; entries: BuffEntry[] }> = []
  for (const b of buffs) {
    const key = `${b.source.type}-${b.source.ordinal ?? ''}-${b.source.label.zh}`
    const found = groups.find(
      (g) =>
        g.source.type === b.source.type &&
        g.source.ordinal === b.source.ordinal &&
        g.source.label.zh === b.source.label.zh,
    )
    if (found) found.entries.push(b)
    else groups.push({ source: b.source, entries: [b] })
    void key
  }
  return groups
}

function sourceTagPrefix(type: BuffSourceType, ordinal?: number): string {
  if (type === 'constellation' && ordinal) return `C${ordinal}`
  switch (type) {
    case 'skill': return 'E'
    case 'burst': return 'Q'
    case 'normal': return 'N'
    case 'passive1': return 'A1'
    case 'passive2': return 'A4'
    case 'passive3': return 'A6'
    case 'weapon': return '武器'
    case 'artifact': return '圣遗物'
    default: return ''
  }
}

function sourceHeaderClass(type: BuffSourceType): string {
  switch (type) {
    case 'skill':         return 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300'
    case 'burst':         return 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300'
    case 'normal':        return 'bg-zinc-50 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300'
    case 'passive1':
    case 'passive2':
    case 'passive3':      return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
    case 'constellation': return 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
    case 'weapon':        return 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300'
    case 'artifact':      return 'bg-pink-50 dark:bg-pink-950/40 text-pink-800 dark:text-pink-300'
    default:              return 'bg-zinc-50 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300'
  }
}

/** Structured buff row: name + effect copy, plus a toggle / number input for
 *  the underlying cond when one is present. Always-on buffs (no cond) render
 *  with just an "✓ 常驻" indicator. If the buff descriptor provided a
 *  computed value (from valueAt), it renders below the effect text. */
function BuffRowStructured({
  buff, cond, value, computedValue, locale, onChange,
}: {
  buff: BuffEntry
  cond?: CondInfo
  value: number
  computedValue?: { zh: string; en: string }
  locale: 'zh' | 'en'
  onChange: (v: number) => void
}) {
  const body = (
    <div className="flex-1 min-w-0">
      <div className="font-medium">{buff.name[locale]}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{buff.effect[locale]}</div>
      {computedValue && (
        <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 font-medium tabular-nums">
          {computedValue[locale]}
        </div>
      )}
    </div>
  )
  if (!cond) {
    return (
      <div className="px-3 py-2 flex items-start gap-3 text-sm">
        <span className="text-emerald-600 dark:text-emerald-400 text-xs mt-0.5">✓ 常驻</span>
        {body}
      </div>
    )
  }
  if (cond.type === 'bool') {
    return (
      <label className="px-3 py-2 flex items-start gap-3 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
        <input
          type="checkbox"
          checked={value !== 0}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          className="mt-1 cursor-pointer flex-shrink-0"
        />
        {body}
      </label>
    )
  }
  if (cond.type === 'num') {
    return (
      <div className="px-3 py-2 flex items-start gap-3 text-sm">
        <input
          type="number"
          value={value}
          min={cond.min}
          max={cond.max}
          step={cond.int_only ? 1 : 0.1}
          onChange={(e) => {
            const n = parseFloat(e.target.value)
            if (!Number.isNaN(n)) onChange(n)
          }}
          className="w-16 px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-right text-sm flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium">
            {buff.name[locale]}
            {cond.min != null && cond.max != null && (
              <span className="ml-1 text-[10px] text-zinc-400">{cond.min}–{cond.max}</span>
            )}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">{buff.effect[locale]}</div>
          {computedValue && (
            <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 font-medium tabular-nums">
              {computedValue[locale]}
            </div>
          )}
        </div>
      </div>
    )
  }
  // 'list' fallback
  return (
    <div className="px-3 py-2 text-sm">{body}</div>
  )
}

/** Legacy raw cond input — only used as a fallback for characters that
 *  don't have a buff descriptor yet. */
function CondInputRowRaw({
  cond, value, onChange,
}: {
  cond: CondInfo
  value: number
  onChange: (v: number) => void
}) {
  // Friendly label: split camelCase / underscore_case → spaced words.
  const friendly = cond.name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
  if (cond.type === 'bool') {
    return (
      <label className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer">
        <input
          type="checkbox"
          checked={value !== 0}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          className="cursor-pointer"
        />
        <span className="flex-1">{friendly}</span>
      </label>
    )
  }
  if (cond.type === 'num') {
    return (
      <label className="flex items-center gap-2 text-sm px-2 py-1">
        <span className="flex-1">{friendly}</span>
        <input
          type="number"
          value={value}
          min={cond.min}
          max={cond.max}
          step={cond.int_only ? 1 : 0.1}
          onChange={(e) => {
            const n = parseFloat(e.target.value)
            if (!Number.isNaN(n)) onChange(n)
          }}
          className="w-20 px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-right"
        />
        {(cond.min != null && cond.max != null) && (
          <span className="text-[10px] text-zinc-400 w-12 text-right">{cond.min}-{cond.max}</span>
        )}
      </label>
    )
  }
  // 'list' — render fallback numeric input until we have option labels.
  return (
    <label className="flex items-center gap-2 text-sm px-2 py-1">
      <span className="flex-1">{friendly} <span className="text-[10px] text-zinc-400">(list)</span></span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          if (!Number.isNaN(n)) onChange(n)
        }}
        className="w-20 px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-right"
      />
    </label>
  )
}

/** Sticky banner at the top of /team telling the user how many characters
 *  have fully-wired GO sheets. Without this, users would silently get rough
 *  numbers for stub characters and assume they're authoritative. */
function CoverageBanner({ t }: { t: (k: string, f?: string) => string }) {
  // The wired-character key list lives in src/integration/go-coverage.ts.
  // Display copy uses the localized character names so the banner reads
  // naturally; keep this in sync if the wired list grows.
  const list = ['那希妲', '妮露', '坎蒂丝', '申鹤'].join('、')
  return (
    <div className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2 leading-snug">
      {t('team.coverageBanner')
        .replace('{n}', '3')
        .replace('{total}', '~130')
        .replace('{names}', list)}
    </div>
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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
          <input type="search" placeholder={t('characters.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" autoFocus />
          <button onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="text-sm text-zinc-500 text-center py-8">
              {t('team.noConfiguredCharacters')}<br />
              <Link to="/characters" className="text-blue-600 hover:underline">{t('team.goConfigureLink')}</Link>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {filtered.map((c) => (
                <button key={String(c.id)} onClick={() => onPick(c.id)} className="group rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 text-center hover:border-zinc-400">
                  <div className="aspect-square rounded overflow-hidden mb-1" style={{ background: `linear-gradient(180deg, ${ELEMENT_COLOR[c.element] ?? '#888'}33, transparent)` }}>
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

function FinalStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="text-base tabular-nums font-medium">{value}</div>
    </div>
  )
}

// ============================================================================
// Output panels — focus-character stats + per-talent damage + substat margins
// ============================================================================

const PANEL_ORDER = ['hp', 'atk', 'def', 'eleMas', 'cappedCritRate_', 'critDMG_', 'enerRech_', 'dmg_', 'heal_']
const PANEL_LABELS: Record<string, string> = {
  hp: 'HP', atk: 'ATK', def: 'DEF', eleMas: 'EM',
  enerRech_: 'ER', cappedCritRate_: 'CR', critDMG_: 'CD',
  dmg_: 'DMG%', heal_: 'Healing',
}
function formatPanelValue(k: string, v: number): string {
  if (k.endsWith('_')) return `${(v * 100).toFixed(1)}%`
  return Math.round(v).toLocaleString()
}

const MOVE_GROUP_ORDER: Array<{ key: GoComputeResult['formulas'][number]['move']; labelKey: string }> = [
  { key: 'normal', labelKey: 'damage.group.normal' },
  { key: 'charged', labelKey: 'damage.group.charged' },
  { key: 'plunging', labelKey: 'damage.group.plunging' },
  { key: 'skill', labelKey: 'damage.group.skill' },
  { key: 'burst', labelKey: 'damage.group.burst' },
  { key: 'reaction', labelKey: 'damage.group.reaction' },
  { key: 'other', labelKey: 'damage.group.other' },
]

type ElementSlug = 'pyro' | 'hydro' | 'cryo' | 'electro' | 'anemo' | 'geo' | 'dendro' | 'physical'

const ELEMENT_LABEL_ZH: Record<ElementSlug, string> = {
  pyro: '火', hydro: '水', cryo: '冰', electro: '雷',
  anemo: '风', geo: '岩', dendro: '草', physical: '物',
}
const ELEMENT_LABEL_EN: Record<ElementSlug, string> = {
  pyro: 'Pyro', hydro: 'Hydro', cryo: 'Cryo', electro: 'Electro',
  anemo: 'Anemo', geo: 'Geo', dendro: 'Dendro', physical: 'Phys',
}
const ELEMENT_BADGE_CLASS: Record<ElementSlug, string> = {
  pyro:     'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  hydro:    'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  cryo:     'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300',
  electro:  'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  anemo:    'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
  geo:      'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  dendro:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  physical: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

/** Resolve a formula's display element based on character weapon type, the
 *  formula's move, and any pre-tagged reaction element. Mirrors the same
 *  defaulting logic the Pando engine uses in dmg() → customDmg.
 *
 *  This is the BASE element. Infusion (e.g. teammate-driven cryo infusion
 *  on a polearm user) isn't modeled here yet — would need a runtime read
 *  of own.reaction.infusion per formula. */
function formulaElement(
  f: GoComputeResult['formulas'][number],
  charElement: string | null,
  weaponType: string | null,
): ElementSlug | null {
  if (f.move === 'reaction') {
    // Reactions tag their element on the formula directly.
    const e = (f.ele ?? '').toLowerCase()
    if (e === 'pyro' || e === 'hydro' || e === 'cryo' || e === 'electro' ||
        e === 'anemo' || e === 'geo' || e === 'dendro' || e === 'physical') return e
    return null
  }
  if (f.move === 'skill' || f.move === 'burst') {
    return (charElement?.toLowerCase() as ElementSlug) || null
  }
  if (f.move === 'normal' || f.move === 'charged' || f.move === 'plunging') {
    // Catalyst normals are character-elemental; everyone else is physical
    // (unless infused, which we don't model here).
    if (weaponType === 'WEAPON_CATALYST') return (charElement?.toLowerCase() as ElementSlug) || null
    return 'physical'
  }
  return null
}

/** Focus-character stats + per-move damage breakdown. Each move group is
 *  collapsible. Clicking 📌 on a formula pins it as the substat-margin target. */
function GoPandoPanel({
  result, focusIdx, pinnedFormula, onPinFormula, locale, t,
}: {
  result: GoComputeResult
  focusIdx: { element: string; weaponType: string } | null
  pinnedFormula: string | null
  onPinFormula: (name: string | null) => void
  locale: 'zh' | 'en'
  t: (k: string, f?: string) => string
}) {
  const charElement = focusIdx?.element ?? null
  const weaponType = focusIdx?.weaponType ?? null
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['skill', 'burst', 'reaction']),
  )
  const toggleGroup = (k: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const panelEntries: Array<{ name: string; value: number }> = []
  const byMove: Record<string, GoComputeResult['formulas']> = {}
  for (const f of result.formulas) {
    if (f.move === 'panel') {
      panelEntries.push({ name: f.name, value: f.value })
    } else {
      ;(byMove[f.move] ||= []).push(f)
    }
  }
  panelEntries.sort((a, b) => PANEL_ORDER.indexOf(a.name) - PANEL_ORDER.indexOf(b.name))

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <h3 className="text-sm font-semibold px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-baseline">
        <span>{t('damage.title')}</span>
        <span className="ml-2 text-xs font-normal text-zinc-500">· {result.goKey}</span>
        <span className="ml-auto text-xs font-normal text-zinc-500">
          {result.fed.weapon ? '✓ ' + t('damage.fedWeapon') : '— ' + t('damage.noWeapon')} · {result.fed.artifacts}/5 {t('damage.fedArtifacts')}
        </span>
      </h3>
      {/* Panel stats */}
      <div className="px-4 py-3 grid grid-cols-3 sm:grid-cols-6 gap-3 text-sm bg-zinc-50/40 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800">
        {panelEntries.map(({ name, value }) => (
          <FinalStat
            key={name}
            label={PANEL_LABELS[name] ?? name}
            value={formatPanelValue(name, value)}
          />
        ))}
      </div>
      {/* Per-move damage groups */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {MOVE_GROUP_ORDER.map(({ key, labelKey }) => {
          const list = byMove[key]
          if (!list || list.length === 0) return null
          const isOpen = expanded.has(key)
          const groupMax = Math.max(0, ...list.map((f) => f.value))
          return (
            <div key={key}>
              <button
                onClick={() => toggleGroup(key)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900/50 text-left"
              >
                <span className="text-zinc-400 w-3 text-center">{isOpen ? '▾' : '▸'}</span>
                <span className="font-medium">{t(labelKey)}</span>
                <span className="text-xs text-zinc-500">· {list.length}</span>
                <span className="ml-auto text-xs text-zinc-500 tabular-nums">
                  {key === 'reaction'
                    ? t('damage.maxValue').replace('{v}', Math.round(groupMax).toLocaleString())
                    : t('damage.peakHit').replace('{v}', Math.round(groupMax).toLocaleString())}
                </span>
              </button>
              {isOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 px-4 pb-3">
                  {list.map((f) => {
                    const isPinned = pinnedFormula === f.name
                    const ele = formulaElement(f, charElement, weaponType)
                    return (
                      <div
                        key={f.name}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm bg-white dark:bg-zinc-900 border ${
                          isPinned
                            ? 'border-emerald-400 dark:border-emerald-600 ring-1 ring-emerald-400/30'
                            : 'border-zinc-200 dark:border-zinc-800'
                        }`}
                      >
                        <button
                          onClick={() => onPinFormula(isPinned ? null : f.name)}
                          title={isPinned ? t('damage.unpin') : t('damage.pinForSubstat')}
                          className={`text-xs flex-shrink-0 ${
                            isPinned
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                          }`}
                        >
                          {isPinned ? '📌' : '📍'}
                        </button>
                        {ele && (
                          <span
                            className={`text-[10px] px-1 py-0 rounded font-medium flex-shrink-0 ${ELEMENT_BADGE_CLASS[ele]}`}
                            title={t('damage.elementBadgeHint')}
                          >
                            {(locale === 'en' ? ELEMENT_LABEL_EN : ELEMENT_LABEL_ZH)[ele]}
                          </span>
                        )}
                        <span className="text-zinc-600 dark:text-zinc-400 truncate flex-1">{f.name}</span>
                        <span className="tabular-nums font-medium text-right flex-shrink-0">
                          {Math.round(f.value).toLocaleString()}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-zinc-500 px-4 py-2 bg-zinc-50/40 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800 leading-snug">
        {t('damage.pinHint')}
      </p>
    </section>
  )
}

function GoSubstatPanel({ data, t }: {
  data: { baselineFormula: string; baselineValue: number; margins: SubstatMargin[] }
  t: (k: string, f?: string) => string
}) {
  const positive = data.margins.filter((m) => m.absoluteDelta > 0)
  const maxAbs = positive[0]?.absoluteDelta ?? 1
  const SUBSTAT_LABEL: Record<string, string> = {
    critRate_: 'CR (+3.89%)',
    critDMG_: 'CD (+7.77%)',
    atk_: 'ATK % (+5.83%)',
    hp_: 'HP % (+5.83%)',
    def_: 'DEF % (+7.29%)',
    eleMas: 'EM (+23.31)',
    enerRech_: 'ER (+6.48%)',
    atk: 'Flat ATK (+19.45)',
    hp: 'Flat HP (+298.75)',
    def: 'Flat DEF (+23.15)',
  }
  return (
    <section className="border border-emerald-300 dark:border-emerald-800 rounded-lg overflow-hidden">
      <h3 className="text-sm font-semibold px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800 flex items-baseline">
        <span>{t('substat.title')}</span>
        <span className="ml-auto text-xs font-normal text-zinc-500">
          {t('substat.target')}: <span className="font-medium text-emerald-700 dark:text-emerald-400">{data.baselineFormula}</span> = {Math.round(data.baselineValue).toLocaleString()}
        </span>
      </h3>
      <table className="w-full text-sm">
        <tbody>
          {data.margins.map((m) => {
            const width = m.absoluteDelta > 0 ? (m.absoluteDelta / maxAbs) * 100 : 0
            return (
              <tr key={m.substat} className="border-t border-emerald-100 dark:border-emerald-900/50">
                <td className="px-4 py-2 w-44">{SUBSTAT_LABEL[m.substat] ?? m.substat}</td>
                <td className="px-2 py-2">
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                    <div
                      className={`h-full ${m.absoluteDelta > 0 ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-zinc-400'}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums w-24">
                  {m.absoluteDelta > 0 ? '+' : ''}{Math.round(m.absoluteDelta).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-500 w-20">
                  {m.pctDelta >= 0 ? '+' : ''}{m.pctDelta.toFixed(2)}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
