import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { displayName, getCharacterIndex, iconUrl } from '@/data'
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
} from '@/engine'
import { ALL_SUBSTATS, MAX_ROLL_VALUES, type Substat } from '@/engine/substat'
import { ELEMENT_COLOR } from '@/data/types'
import { useI18n, useT } from '@/i18n/store'
import { useImportedBuilds } from '@/store/imported-builds'
import { useCharacterConfigs } from '@/store/character-configs'
import { type CharacterConfig } from '@/data/config-types'
import ConfigPanel from '@/components/ConfigPanel'

function reactionFromPick(pick: CharacterConfig['reaction']): Reaction {
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
  lvl: number
  hit: ExtractedHit
  multiplier: number
  out: ReturnType<typeof calcDamage>
}

/** Run the full damage calc using already-derived stats input. Synchronous. */
function computeRowsFromDerived(
  config: CharacterConfig,
  meta: CharacterMeta,
  derived: DerivedStatsInput,
  element: DamageElement,
  scalingOverride: Record<string, 'atk' | 'hp' | 'def' | 'em'>,
): { rows: ComputedRow[]; finalStats: ReturnType<typeof aggregateStats> } {
  const reaction = reactionFromPick(config.reaction)
  const stats = aggregateStats([
    {
      atkFlat: derived.baseAtk,
      hpFlat: derived.baseHp,
      defFlat: derived.baseDef,
    },
    ...derived.bonusBags,
  ])
  const baseRes = config.enemyBaseRes / 100
  const attacker = { level: config.level, stats }
  const target = {
    level: config.enemyLevel,
    resistance: {
      Pyro: baseRes, Hydro: baseRes, Cryo: baseRes, Electro: baseRes,
      Anemo: baseRes, Geo: baseRes, Dendro: baseRes, Physical: baseRes,
    },
    resReduction: {
      Pyro: config.enemyResReduction / 100, Hydro: config.enemyResReduction / 100,
      Cryo: config.enemyResReduction / 100, Electro: config.enemyResReduction / 100,
      Anemo: config.enemyResReduction / 100, Geo: config.enemyResReduction / 100,
      Dendro: config.enemyResReduction / 100, Physical: config.enemyResReduction / 100,
    },
    defReduction: config.enemyDefReduction / 100,
  }

  const rows: ComputedRow[] = []
  const sections: Array<{ role: 'auto' | 'skill' | 'burst'; lvl: number }> = [
    { role: 'auto', lvl: config.talentLevels.auto },
    { role: 'skill', lvl: config.talentLevels.skill },
    { role: 'burst', lvl: config.talentLevels.burst },
  ]
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
      rows.push({ role, lvl, hit: { ...hit, scaling }, multiplier: m, out })
    }
  }
  return { rows, finalStats: stats }
}

/** Map a Substat → (form-bag-field, scaled delta value). Used for substat valuation. */
function substatToBagPerturb(
  substat: Substat,
): { key: string; delta: number } {
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

export default function CharacterDetail() {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const { id } = useParams<{ id: string }>()
  const idx = id ? getCharacterIndex(id) : undefined
  const [meta, setMeta] = useState<CharacterMeta | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [derived, setDerived] = useState<DerivedStatsInput | null>(null)
  const [scalingOverride, setScalingOverride] = useState<
    Record<string, 'atk' | 'hp' | 'def' | 'em'>
  >({})

  const config = useCharacterConfigs((s) => (id ? s.get(id) : null))
  const patch = useCharacterConfigs((s) => s.patch)
  const importedBuild = useImportedBuilds((s) => (id ? s.get(id) : undefined))

  // Load meta
  useEffect(() => {
    if (!id) return
    setMeta(null)
    setLoadError(null)
    loadCharacterMeta(id)
      .then(setMeta)
      .catch((e) => setLoadError(e.message))
  }, [id])

  // When a UID import comes in, apply it as importMode snapshot to the config
  useEffect(() => {
    if (!importedBuild || !id || !idx) return
    const elem = normalizeElement(idx.element)
    const elemDmg = importedBuild.elementalDmg[elem] ?? 0
    patch(id, {
      level: importedBuild.characterLevel,
      ascensionStage: importedBuild.ascensionStage,
      talentLevels: importedBuild.talentLevels,
      importMode: {
        finalAtk: importedBuild.finalAtk,
        finalHp: importedBuild.finalHp,
        finalDef: importedBuild.finalDef,
        em: importedBuild.em,
        critRate: importedBuild.critRate,
        critDmg: importedBuild.critDmg,
        er: importedBuild.er,
        elementBonus: elemDmg,
      },
    })
  }, [importedBuild, id, idx, patch])

  // Derive stats from config (async — fetches weapon detail + set bonuses)
  useEffect(() => {
    if (!meta || !config || !idx) {
      setDerived(null)
      return
    }
    let cancelled = false
    deriveConfigStats(config, meta, idx.element)
      .then((d) => { if (!cancelled) setDerived(d) })
      .catch(() => { if (!cancelled) setDerived(null) })
    return () => { cancelled = true }
  }, [meta, config, idx])

  const element: DamageElement = idx ? normalizeElement(idx.element) : 'Physical'

  const rowsResult = useMemo(() => {
    if (!meta || !config || !derived) return { rows: [] as ComputedRow[], finalStats: null as ReturnType<typeof aggregateStats> | null }
    return computeRowsFromDerived(config, meta, derived, element, scalingOverride)
  }, [meta, config, derived, element, scalingOverride])

  const substatValues = useMemo(() => {
    if (!meta || !config || !derived) return []
    const baselineTotal = rowsResult.rows.reduce((acc, r) => acc + r.out.avg, 0)
    if (baselineTotal === 0) return []
    return ALL_SUBSTATS.map((s) => {
      const { key, delta } = substatToBagPerturb(s)
      // Append a perturbation bag to the bonus list
      const perturbedDerived: DerivedStatsInput = {
        ...derived,
        bonusBags: [...derived.bonusBags, { [key]: delta }],
      }
      const r = computeRowsFromDerived(config, meta, perturbedDerived, element, scalingOverride)
      const newTotal = r.rows.reduce((acc, row) => acc + row.out.avg, 0)
      return {
        substat: s,
        absoluteDelta: newTotal - baselineTotal,
        pctDelta: ((newTotal - baselineTotal) / baselineTotal) * 100,
      }
    }).sort((a, b) => b.absoluteDelta - a.absoluteDelta)
  }, [meta, config, derived, element, scalingOverride, rowsResult.rows])

  if (!idx) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">{t('characters.notFound')}</h1>
        <Link to="/characters" className="text-blue-600 hover:underline">
          {t('characters.backToList')}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div
          className="w-20 h-20 rounded-lg overflow-hidden"
          style={{
            background: `linear-gradient(180deg, ${ELEMENT_COLOR[idx.element] ?? '#888'}55, transparent)`,
          }}
        >
          <img src={iconUrl(idx.icon)} alt={displayName(idx, locale)} className="w-full h-full object-cover" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{displayName(idx, locale)}</h1>
          <div className="text-sm text-zinc-500 flex gap-3 mt-1">
            <span style={{ color: ELEMENT_COLOR[idx.element] }}>{t(`element.${idx.element}`)}</span>
            <span>·</span>
            <span>{idx.rank}★</span>
            <span>·</span>
            <span>{t(`weapon.${idx.weaponType}`)}</span>
            <span>·</span>
            <span>{idx.region}</span>
          </div>
        </div>
        <Link to="/characters" className="ml-auto text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          {t('characters.backToList')}
        </Link>
      </div>

      {config?.importMode && (
        <div className="rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs flex items-center justify-between">
          <span>
            <strong>{t('config.importedTag')}</strong> · {t('config.importedNote')}
          </span>
          <button
            onClick={() => id && patch(id, { importMode: undefined })}
            className="text-emerald-700 dark:text-emerald-400 underline hover:no-underline"
          >
            {t('config.clearImport')}
          </button>
        </div>
      )}

      {loadError && (
        <div className="text-red-600 text-sm">{t('detail.loadError')}{loadError}</div>
      )}
      {!meta && !loadError && (
        <div className="text-zinc-500 text-sm">{t('detail.loading')}</div>
      )}

      {meta && id && config && (
        <div className="grid lg:grid-cols-[380px_1fr] gap-6">
          <ConfigPanel characterId={id} weaponType={idx.weaponType} />
          <div className="space-y-6">
            <DamagePanel
              meta={meta}
              rows={rowsResult.rows}
              finalStats={rowsResult.finalStats}
              scalingOverride={scalingOverride}
              setScalingOverride={setScalingOverride}
              t={t}
            />
            {substatValues.length > 0 && (
              <SubstatPanel substatValues={substatValues} t={t} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DamagePanel({
  meta, rows, finalStats, scalingOverride, setScalingOverride, t,
}: {
  meta: CharacterMeta
  rows: ComputedRow[]
  finalStats: ReturnType<typeof aggregateStats> | null
  scalingOverride: Record<string, 'atk' | 'hp' | 'def' | 'em'>
  setScalingOverride: (s: Record<string, 'atk' | 'hp' | 'def' | 'em'>) => void
  t: (key: string, fallback?: string) => string
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

  return (
    <div className="space-y-4">
      {finalStats && (
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 bg-zinc-50/50 dark:bg-zinc-900/50 text-sm grid grid-cols-3 sm:grid-cols-6 gap-3">
          <FinalStat label={t('stat.atk')} value={fmt(finalStats.atk)} />
          <FinalStat label={t('stat.hp')} value={fmt(finalStats.hp)} />
          <FinalStat label={t('stat.def')} value={fmt(finalStats.def)} />
          <FinalStat label={t('stat.em')} value={fmt(finalStats.em)} />
          <FinalStat label="CR/CD" value={`${(finalStats.critRate * 100).toFixed(1)}% / ${(finalStats.critDmg * 100).toFixed(1)}%`} />
          <FinalStat label="ER" value={`${(finalStats.er * 100).toFixed(0)}%`} />
        </section>
      )}
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
                {list.map((r, i) => {
                  const key = `${r.role}:${r.hit.paramIndex}:${r.hit.label}`
                  return (
                    <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-4 py-2">{r.hit.label}</td>
                      <td className="px-2 py-2 text-zinc-500 text-xs">
                        {(r.multiplier * 100).toFixed(1)}%
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={r.hit.scaling}
                          onChange={(e) =>
                            setScalingOverride({
                              ...scalingOverride,
                              [key]: e.target.value as 'atk' | 'hp' | 'def' | 'em',
                            })
                          }
                          className={`text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 ${
                            scalingOverride[key] ? 'border-amber-500 dark:border-amber-400' : ''
                          }`}
                        >
                          <option value="atk">{t('damage.scaling.atk')}</option>
                          <option value="hp">{t('damage.scaling.hp')}</option>
                          <option value="def">{t('damage.scaling.def')}</option>
                          <option value="em">{t('damage.scaling.em')}</option>
                        </select>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(r.out.nonCrit)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{fmt(r.out.crit)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(r.out.avg)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
      <p className="text-xs text-zinc-500">
        <strong>{t('damage.noteEmphasis')}</strong>：{t('damage.note')}
      </p>
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

function SubstatPanel({
  substatValues,
  t,
}: {
  substatValues: Array<{
    substat: Substat
    absoluteDelta: number
    pctDelta: number
  }>
  t: (key: string, fallback?: string) => string
}) {
  const fmt = (n: number) => Math.round(n).toLocaleString()
  const positive = substatValues.filter((s) => s.absoluteDelta > 0)
  const maxDelta = positive[0]?.absoluteDelta ?? 1
  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <h3 className="text-sm font-semibold px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        {t('substat.title')}
      </h3>
      <div className="px-4 py-2 text-xs text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
        {t('substat.hint')}
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/50">
          <tr>
            <th className="text-left px-4 py-2 font-normal">{t('substat.substat')}</th>
            <th className="text-left px-2 py-2 font-normal w-32">{t('substat.bar')}</th>
            <th className="text-right px-2 py-2 font-normal">{t('substat.absDelta')}</th>
            <th className="text-right px-4 py-2 font-normal">{t('substat.pctDelta')}</th>
          </tr>
        </thead>
        <tbody>
          {substatValues.map((s, i) => {
            const width = s.absoluteDelta > 0 ? (s.absoluteDelta / maxDelta) * 100 : 0
            const isPositive = s.absoluteDelta > 0
            return (
              <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-2">{t(`substat.${s.substat}`)}</td>
                <td className="px-2 py-2">
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                    <div
                      className={`h-full ${isPositive ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-zinc-400'}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {isPositive ? '+' : ''}{fmt(s.absoluteDelta)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-500">
                  {s.pctDelta >= 0 ? '+' : ''}{s.pctDelta.toFixed(2)}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
