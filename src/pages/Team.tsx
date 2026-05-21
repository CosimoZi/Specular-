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
import { deriveConfigStats, type DerivedStatsInput } from '@/data/config-to-stats'
import {
  aggregateStats,
  calcDamage,
  type DamageElement,
  type Reaction,
  type StatBag,
} from '@/engine'
import {
  aggregateZoneBuffs,
  partValue,
  type BuffSpec,
  type ZoneBuffs,
  type Position,
} from '@/engine/buff-zones'
import { BUFFS, eligibleBuffsForTeam } from '@/data/buffs'
import type { GoComputeResult, SubstatMargin, CondInfo } from '@/integration/go-calc'
import { wiringTierForGoKey } from '@/integration/go-coverage'
import { goCharacterKey } from '@/integration/good-adapter'
import {
  buffsForCharacter,
  type BuffEntry,
  type BuffSourceType,
} from '@/integration/buff-sources'
import { ALL_SUBSTATS, MAX_ROLL_VALUES, type Substat } from '@/engine/substat'
import { ELEMENT_COLOR } from '@/data/types'
import { useI18n, useT } from '@/i18n/store'
import { useCharacterConfigs } from '@/store/character-configs'
import { useTeamConfig } from '@/store/team-config'
import { isConfigured, type TeamConfig, type CharacterConfig } from '@/data/config-types'

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

function reactionKindOf(pick: TeamConfig['reaction']): 'vape' | 'melt' | 'aggravate' | 'spread' | 'none' {
  switch (pick) {
    case 'vape_strong': case 'vape_weak': return 'vape'
    case 'melt_strong': case 'melt_weak': return 'melt'
    case 'aggravate': return 'aggravate'
    case 'spread': return 'spread'
    default: return 'none'
  }
}

type ComputedRow = {
  role: 'auto' | 'skill' | 'burst'
  hit: ExtractedHit
  multiplier: number
  out: ReturnType<typeof calcDamage>
  appliedZones: ZoneBuffs
}

/** Convert ZoneBuffs (for one hit) into a StatBag delta + per-hit / per-target overrides. */
function zonesToOverrides(zones: ZoneBuffs, hitElement: DamageElement): {
  statBagDelta: StatBag
  targetResShred: number
  targetDefIgnore: number
  targetDefShred: number
  hitReactionBonus: number
  hitAdditiveFlat: number
} {
  const elemKey: keyof StatBag = (() => {
    switch (hitElement) {
      case 'Pyro': return 'pyroDmg'
      case 'Hydro': return 'hydroDmg'
      case 'Cryo': return 'cryoDmg'
      case 'Electro': return 'electroDmg'
      case 'Anemo': return 'anemoDmg'
      case 'Geo': return 'geoDmg'
      case 'Dendro': return 'dendroDmg'
      case 'Physical': return 'physicalDmg'
    }
  })()
  const bag: StatBag = {
    atkFlat: zones.baseAtkFlat,
    atkPct: zones.baseAtkPct,
    hpFlat: zones.baseHpFlat,
    hpPct: zones.baseHpPct,
    defFlat: zones.baseDefFlat,
    defPct: zones.baseDefPct,
    em: zones.em,
    er: zones.er,
    critRate: zones.critRate,
    critDmg: zones.critDmg,
    [elemKey]: zones.dmgBonus,
  }
  return {
    statBagDelta: bag,
    targetResShred: zones.resShred,
    targetDefIgnore: zones.defIgnore,
    targetDefShred: zones.defShred,
    hitReactionBonus: zones.reactionBonus,
    hitAdditiveFlat: zones.additiveFlat,
  }
}

export default function Team() {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const team = useTeamConfig((s) => s.team)
  const setSlot = useTeamConfig((s) => s.setSlot)
  const setFocus = useTeamConfig((s) => s.setFocus)
  const teamPatch = useTeamConfig((s) => s.patch)
  const toggleBuff = useTeamConfig((s) => s.toggleBuff)
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

  const [metaMap, setMetaMap] = useState<Record<string, CharacterMeta>>({})
  useEffect(() => {
    const ids = team.slots.filter((s): s is number | string => s !== null).map(String)
    for (const id of ids) {
      if (metaMap[id]) continue
      loadCharacterMeta(id).then((m) => setMetaMap((p) => ({ ...p, [id]: m }))).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.slots.join(',')])

  const focusIdx = team.focusIndex ?? team.slots.findIndex((s) => s !== null)
  const focusCharId = focusIdx >= 0 ? team.slots[focusIdx] : null
  // Resolve focusConfig stably from configsMap so it doesn't flip identity on
  // every render when the character has no entry (which would tank useEffect
  // deps below and trip the same kind of loop as /characters/<id> had).
  const focusConfig = useMemo(() => {
    if (focusCharId == null) return null
    return configsMap[String(focusCharId)] ?? null
  }, [focusCharId, configsMap])
  const focusIdx_data = focusCharId != null ? getCharacterIndex(focusCharId) : null
  const focusMeta = focusCharId != null ? metaMap[String(focusCharId)] : null

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
    import('@/integration/go-calc').then(({ computeTeamViaGo, computeSubstatMarginsViaGo }) => {
      if (cancelled) return
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
      setGoResult(computeTeamViaGo(members, focusIdx, opts))
      setGoMargins(computeSubstatMarginsViaGo(members, focusIdx, opts))
    })
    return () => { cancelled = true }
    // teamConfigsKey + condStateKey + enemy* together cover every input to the
    // GO call — using them as the dep list keeps this stable across re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx, teamConfigsKey, condStateKey, team.enemyLevel, team.enemyBaseRes])

  const eligibleBuffs = useMemo(() => {
    const teamIds = team.slots.filter((s): s is number | string => s !== null)
    return eligibleBuffsForTeam(teamIds, configsMap)
  }, [team.slots, configsMap])

  /** For each eligible buff, an {spec, on, sourceTalentLevels} entry that the
   *  zone aggregator consumes. */
  const buffEvalList = useMemo(() => {
    return eligibleBuffs.map((spec) => ({
      spec,
      on: team.buffToggles[spec.id] ?? spec.defaultOn,
      sourceTalentLevels: configsMap[String(spec.sourceCharacterId)]?.talentLevels,
    }))
  }, [eligibleBuffs, team.buffToggles, configsMap])

  // Compute focus damage rows + substat marginal values
  const [focusState, setFocusState] = useState<{
    rows: ComputedRow[]
    finalStats: ReturnType<typeof aggregateStats> | null
    substatValues: Array<{ substat: Substat; absoluteDelta: number; pctDelta: number }>
  }>({ rows: [], finalStats: null, substatValues: [] })

  useEffect(() => {
    if (!focusCharId || !focusConfig || !focusMeta || !focusIdx_data) {
      setFocusState({ rows: [], finalStats: null, substatValues: [] })
      return
    }
    let cancelled = false
    deriveConfigStats(focusConfig, focusMeta, focusIdx_data.element)
      .then((derived) => {
        if (cancelled) return
        const characterElement = normalizeElement(focusIdx_data.element)
        const baseline = computeFocusRows(focusConfig, focusMeta, derived, characterElement, team, buffEvalList)
        const baselineTotal = baseline.rows.reduce((s, r) => s + r.out.avg, 0)

        let substatValues: Array<{ substat: Substat; absoluteDelta: number; pctDelta: number }> = []
        if (baselineTotal > 0) {
          substatValues = ALL_SUBSTATS.map((s) => {
            const perturbation = substatToBag(s)
            const r = computeFocusRows(focusConfig, focusMeta, {
              ...derived,
              bonusBags: [...derived.bonusBags, perturbation],
            }, characterElement, team, buffEvalList)
            const newTotal = r.rows.reduce((acc, row) => acc + row.out.avg, 0)
            return {
              substat: s,
              absoluteDelta: newTotal - baselineTotal,
              pctDelta: ((newTotal - baselineTotal) / baselineTotal) * 100,
            }
          }).sort((a, b) => b.absoluteDelta - a.absoluteDelta)
        }

        setFocusState({
          rows: baseline.rows,
          finalStats: baseline.finalStats,
          substatValues,
        })
      })
      .catch(() => setFocusState({ rows: [], finalStats: null, substatValues: [] }))
    return () => { cancelled = true }
  }, [focusCharId, focusConfig, focusMeta, focusIdx_data, team, buffEvalList])

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
                sourceTalentLevels={configsMap[String(b.sourceCharacterId)]?.talentLevels}
                t={t}
              />
            ))}
          </div>
        )}
        <p className="text-xs text-zinc-500 px-4 py-2 bg-zinc-50/50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800">
          {t('team.buffsCoverage')} ({new Set(BUFFS.map((b) => b.sourceCharacterId)).size} {t('team.charactersCoveredSuffix')})
        </p>
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

      {focusMeta && focusIdx_data && focusState.finalStats && (
        <FocusDamagePanel
          meta={focusMeta}
          rows={focusState.rows}
          finalStats={focusState.finalStats}
          substatValues={focusState.substatValues}
          t={t}
        />
      )}

      {goResult && <GoPandoPanel result={goResult} />}
      {goMargins && <GoSubstatPanel data={goMargins} />}

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

// Per-hit zone-aware damage compute.
function computeFocusRows(
  config: CharacterConfig,
  meta: CharacterMeta,
  derived: DerivedStatsInput,
  characterElement: DamageElement,
  team: TeamConfig,
  buffEvalList: Array<{ spec: BuffSpec; on: boolean; sourceTalentLevels?: { auto: number; skill: number; burst: number } }>,
): { rows: ComputedRow[]; finalStats: ReturnType<typeof aggregateStats> } {
  // Receiver context — TODO read from config.position when we add it.
  const receiverPosition: Position = 'frontline'
  const receiverCharacterId = config.characterId
  const reaction = reactionFromPick(team.reaction)
  const reactionKind = reactionKindOf(team.reaction)

  // Solo (no team buffs) final stats — useful for the side panel + as baseline.
  const soloStats = aggregateStats([
    { atkFlat: derived.baseAtk, hpFlat: derived.baseHp, defFlat: derived.baseDef },
    ...derived.bonusBags,
  ])

  const baseRes = team.enemyBaseRes / 100
  const baseResMap = {
    Pyro: baseRes, Hydro: baseRes, Cryo: baseRes, Electro: baseRes,
    Anemo: baseRes, Geo: baseRes, Dendro: baseRes, Physical: baseRes,
  }
  const baseResShred = team.enemyResReduction / 100

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
      // Filter and aggregate per-hit zone buffs
      const zones = aggregateZoneBuffs(buffEvalList, {
        hitElement: characterElement,
        hitType: hit.hitType,
        receiverPosition,
        sourceCharacterId: 0, // overridden by aggregator per part
        receiverCharacterId,
        reactionKind,
      })
      const ov = zonesToOverrides(zones, characterElement)
      const perHitStats = aggregateStats([
        { atkFlat: derived.baseAtk, hpFlat: derived.baseHp, defFlat: derived.baseDef },
        ...derived.bonusBags,
        ov.statBagDelta,
      ])
      const attacker = { level: config.level, stats: perHitStats }
      const target = {
        level: team.enemyLevel,
        resistance: baseResMap,
        resReduction: {
          Pyro: baseResShred + ov.targetResShred, Hydro: baseResShred + ov.targetResShred,
          Cryo: baseResShred + ov.targetResShred, Electro: baseResShred + ov.targetResShred,
          Anemo: baseResShred + ov.targetResShred, Geo: baseResShred + ov.targetResShred,
          Dendro: baseResShred + ov.targetResShred, Physical: baseResShred + ov.targetResShred,
        },
        defReduction: team.enemyDefReduction / 100 + ov.targetDefShred,
        defIgnore: ov.targetDefIgnore,
      }
      const out = calcDamage(
        attacker,
        target,
        {
          label: hit.label, scaling, multiplier: m, element: characterElement, hitType: hit.hitType,
          reactionBonus: ov.hitReactionBonus,
        },
        reaction,
      )
      rows.push({ role, hit: { ...hit, scaling }, multiplier: m, out, appliedZones: zones })
    }
  }
  return { rows, finalStats: soloStats }
}

function substatToBag(substat: Substat): StatBag {
  const roll = MAX_ROLL_VALUES[substat]
  switch (substat) {
    case 'critRate': return { critRate: roll }
    case 'critDmg': return { critDmg: roll }
    case 'atkPct': return { atkPct: roll }
    case 'hpPct': return { hpPct: roll }
    case 'defPct': return { defPct: roll }
    case 'em': return { em: roll }
    case 'er': return { er: roll }
    case 'atkFlat': return { atkFlat: roll }
    case 'hpFlat': return { hpFlat: roll }
    case 'defFlat': return { defFlat: roll }
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
                          return (
                            <BuffRowStructured
                              key={`${gi}-${bi}`}
                              buff={b}
                              cond={condMeta}
                              value={val}
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
 *  with just an "✓ 常驻" indicator. */
function BuffRowStructured({
  buff, cond, value, locale, onChange,
}: {
  buff: BuffEntry
  cond?: CondInfo
  value: number
  locale: 'zh' | 'en'
  onChange: (v: number) => void
}) {
  if (!cond) {
    return (
      <div className="px-3 py-2 flex items-start gap-3 text-sm">
        <span className="text-emerald-600 dark:text-emerald-400 text-xs mt-0.5">✓ 常驻</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium">{buff.name[locale]}</div>
          <div className="text-xs text-zinc-500 mt-0.5">{buff.effect[locale]}</div>
        </div>
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
        <div className="flex-1 min-w-0">
          <div className="font-medium">{buff.name[locale]}</div>
          <div className="text-xs text-zinc-500 mt-0.5">{buff.effect[locale]}</div>
        </div>
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
        </div>
      </div>
    )
  }
  // 'list' fallback
  return (
    <div className="px-3 py-2 text-sm">
      <div className="font-medium">{buff.name[locale]}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{buff.effect[locale]}</div>
    </div>
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

function BuffRow({
  buff, on, onToggle, locale, sourceTalentLevels, t,
}: {
  buff: BuffSpec
  on: boolean
  onToggle: (on: boolean) => void
  locale: 'zh' | 'en'
  sourceTalentLevels?: { auto: number; skill: number; burst: number }
  t: (k: string, f?: string) => string
}) {
  const source = getCharacterIndex(buff.sourceCharacterId)
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
          {source && <img src={iconUrl(source.icon)} alt="" className="w-5 h-5 rounded inline-block flex-shrink-0" />}
          <span className="font-medium">{buff.label[locale]}</span>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{buff.description[locale]}</p>
        <div className="text-[10px] text-zinc-400 mt-1 flex flex-wrap gap-1.5">
          {buff.parts.map((p, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
              {p.zone} · {formatPartValue(buff, i, sourceTalentLevels)}
              {p.cond?.element && ` · ${t(`element.${p.cond.element}`)}`}
              {p.cond?.hitType && ` · ${p.cond.hitType.join('/')}`}
              {p.cond?.selfOnly && ' · self'}
            </span>
          ))}
        </div>
      </div>
    </label>
  )
}

function formatPartValue(spec: BuffSpec, idx: number, talents?: { auto: number; skill: number; burst: number }): string {
  const v = partValue(spec, idx, talents)
  const zone = spec.parts[idx].zone
  if (zone === 'em' || zone === 'baseAtkFlat' || zone === 'baseHpFlat' || zone === 'baseDefFlat' || zone === 'additiveFlat') {
    return `+${v.toFixed(0)}`
  }
  return `+${(v * 100).toFixed(1)}%`
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
                  <th className="text-left px-2 py-2 font-normal w-20">{t('damage.multiplier')}</th>
                  <th className="text-left px-2 py-2 font-normal w-16">{t('damage.scaling')}</th>
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
          <div className="px-4 py-2 text-xs text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
            {t('substat.hintV2')}
          </div>
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

/** Categorize GO formula keys for friendly display. */
const PANEL_KEYS = new Set([
  'hp', 'atk', 'def', 'eleMas', 'enerRech_',
  'cappedCritRate_', 'critDMG_', 'dmg_', 'heal_',
])
const REACTION_KEYS = new Set([
  'overloaded', 'shattered', 'electrocharged', 'superconduct', 'swirl',
  'burning', 'bloom', 'hyperbloom', 'burgeon',
  'lunarcharged', 'lunarbloom', 'lunarcrystallize',
])

function formatGoValue(key: string, v: number): string {
  if (PANEL_KEYS.has(key)) {
    // Percent stats stored as decimals → show as %
    if (key.endsWith('_')) return `${(v * 100).toFixed(1)}%`
    return Math.round(v).toLocaleString()
  }
  // Damage / reaction numbers
  return Math.round(v).toLocaleString()
}

const PANEL_LABELS: Record<string, string> = {
  hp: 'HP', atk: 'ATK', def: 'DEF', eleMas: 'EM',
  enerRech_: 'ER', cappedCritRate_: 'CR', critDMG_: 'CD',
  dmg_: 'DMG%', heal_: 'Healing',
}

function GoSubstatPanel({ data }: {
  data: { baselineFormula: string; baselineValue: number; margins: SubstatMargin[] }
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
        <span>Substat marginal value (via GO Pando)</span>
        <span className="ml-auto text-xs font-normal text-zinc-500">
          baseline: {data.baselineFormula} = {Math.round(data.baselineValue).toLocaleString()}
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

function GoPandoPanel({ result }: { result: GoComputeResult }) {
  const entries = Object.entries(result.values).filter(([, v]) => Number.isFinite(v))
  const panel: Array<[string, number]> = []
  const reactions: Array<[string, number]> = []
  const damage: Array<[string, number]> = []
  for (const [k, v] of entries) {
    if (PANEL_KEYS.has(k)) panel.push([k, v])
    else if (REACTION_KEYS.has(k)) reactions.push([k, v])
    else damage.push([k, v])
  }
  const PANEL_ORDER = ['hp', 'atk', 'def', 'eleMas', 'cappedCritRate_', 'critDMG_', 'enerRech_', 'dmg_', 'heal_']
  panel.sort(([a], [b]) => PANEL_ORDER.indexOf(a) - PANEL_ORDER.indexOf(b))
  damage.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  reactions.sort(([a], [b]) => a.localeCompare(b))

  return (
    <section className="border border-indigo-300 dark:border-indigo-800 rounded-lg overflow-hidden">
      <h3 className="text-sm font-semibold px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-800 flex items-baseline">
        <span>via GenshinOptimizer Pando · {result.goKey}</span>
        <span className="ml-auto text-xs font-normal text-zinc-500">
          {result.fed.weapon ? '✓ weapon' : '— no weapon'} · {result.fed.artifacts}/5 artifacts
        </span>
      </h3>
      {/* Panel */}
      <div className="px-4 py-3 grid grid-cols-3 sm:grid-cols-6 gap-3 text-sm border-b border-indigo-100 dark:border-indigo-900/50">
        {panel.map(([k, v]) => (
          <FinalStat key={k} label={PANEL_LABELS[k] ?? k} value={formatGoValue(k, v)} />
        ))}
      </div>
      {/* Damage per skill */}
      {damage.length > 0 && (
        <div className="px-4 py-3 border-b border-indigo-100 dark:border-indigo-900/50">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Skill damage (avg)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            {damage.map(([k, v]) => (
              <div key={k} className="flex justify-between bg-white dark:bg-zinc-900 rounded px-2 py-1">
                <span className="text-zinc-600 dark:text-zinc-400">{k}</span>
                <span className="tabular-nums font-medium">{formatGoValue(k, v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Reactions */}
      {reactions.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Transformative reactions (1 trigger)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            {reactions.map(([k, v]) => (
              <div key={k} className="flex justify-between bg-white dark:bg-zinc-900 rounded px-2 py-1">
                <span className="text-zinc-600 dark:text-zinc-400">{k}</span>
                <span className="tabular-nums">{formatGoValue(k, v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
