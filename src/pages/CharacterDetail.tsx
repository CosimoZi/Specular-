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
import {
  computeBaseStats,
  computeAscensionBonus,
  defaultAscensionFor,
  MAX_LEVEL_BY_ASCENSION,
} from '@/data/character-stats'
import {
  aggregateStats,
  calcDamage,
  type DamageElement,
  type Reaction,
  type StatBag,
} from '@/engine'
import {
  ALL_SUBSTATS,
  MAX_ROLL_VALUES,
  type Substat,
} from '@/engine/substat'
import { ELEMENT_COLOR } from '@/data/types'
import { useI18n, useT } from '@/i18n/store'
import { useImportedBuilds } from '@/store/imported-builds'

interface BuildForm {
  // Character base
  charLevel: number
  ascensionStage: number // 0..6; auto-tracks level by default
  // Manual override for base stats (if user disables auto-compute)
  manualBase: boolean
  baseAtkOverride: number
  baseHpOverride: number
  baseDefOverride: number
  // Bonuses from weapon + artifact + buffs (sum of everything that's not character base)
  atkFlat: number // flat ATK from weapon + flowers + buffs
  atkPct: number // %ATK from artifacts + buffs (0-100 in form, /100 when used)
  hpFlat: number
  hpPct: number
  defFlat: number
  defPct: number
  em: number // flat EM from substats etc.
  critRate: number // %, on top of 5% baseline
  critDmg: number // %, on top of 50% baseline
  erBonus: number // % on top of 100% baseline
  elementBonus: number // % element-matched DMG
  // Talent levels
  autoLvl: number
  skillLvl: number
  burstLvl: number
  // Enemy
  enemyLevel: number
  enemyRes: number
  resReduction: number
  defReduction: number
  reaction: ReactionPick
}

type ReactionPick =
  | 'none'
  | 'vape_strong'
  | 'vape_weak'
  | 'melt_strong'
  | 'melt_weak'
  | 'aggravate'
  | 'spread'

const DEFAULTS: BuildForm = {
  charLevel: 90,
  ascensionStage: 6,
  manualBase: false,
  baseAtkOverride: 0,
  baseHpOverride: 0,
  baseDefOverride: 0,
  atkFlat: 600, // typical 5* weapon base ATK + artifact flat
  atkPct: 60,
  hpFlat: 4780, // typical flower main stat
  hpPct: 0,
  defFlat: 0,
  defPct: 0,
  em: 100,
  critRate: 65, // 70% total with 5% baseline (matches the old default of 70)
  critDmg: 100, // 150% total
  erBonus: 30, // 130% total
  elementBonus: 46.6,
  autoLvl: 10,
  skillLvl: 10,
  burstLvl: 10,
  enemyLevel: 100,
  enemyRes: 10,
  resReduction: 0,
  defReduction: 0,
  reaction: 'none',
}

function reactionFromPick(pick: ReactionPick): Reaction {
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

/** Run the full damage calc for a given form. Pure function so we can call it
 *  many times for substat valuation. */
function computeBuildRows(
  form: BuildForm,
  meta: CharacterMeta,
  autoBase: { hp: number; atk: number; def: number },
  ascensionBonusBag: StatBag,
  element: DamageElement,
  scalingOverride: Record<string, 'atk' | 'hp' | 'def' | 'em'>,
): { rows: ComputedRow[]; finalStats: ReturnType<typeof aggregateStats> } {
  const baseAtk = form.manualBase ? form.baseAtkOverride : autoBase.atk
  const baseHp = form.manualBase ? form.baseHpOverride : autoBase.hp
  const baseDef = form.manualBase ? form.baseDefOverride : autoBase.def
  const reaction = reactionFromPick(form.reaction)

  const stats = aggregateStats([
    {
      atkFlat: baseAtk,
      hpFlat: baseHp,
      defFlat: baseDef,
    },
    form.manualBase ? {} : ascensionBonusBag,
    {
      atkFlat: form.atkFlat,
      atkPct: form.atkPct / 100,
      hpFlat: form.hpFlat,
      hpPct: form.hpPct / 100,
      defFlat: form.defFlat,
      defPct: form.defPct / 100,
      em: form.em,
      critRate: form.critRate / 100,
      critDmg: form.critDmg / 100,
      er: form.erBonus / 100,
      pyroDmg: element === 'Pyro' ? form.elementBonus / 100 : 0,
      hydroDmg: element === 'Hydro' ? form.elementBonus / 100 : 0,
      cryoDmg: element === 'Cryo' ? form.elementBonus / 100 : 0,
      electroDmg: element === 'Electro' ? form.elementBonus / 100 : 0,
      anemoDmg: element === 'Anemo' ? form.elementBonus / 100 : 0,
      geoDmg: element === 'Geo' ? form.elementBonus / 100 : 0,
      dendroDmg: element === 'Dendro' ? form.elementBonus / 100 : 0,
      physicalDmg: element === 'Physical' ? form.elementBonus / 100 : 0,
    },
  ])
  const baseRes = form.enemyRes / 100
  const attacker = { level: form.charLevel, stats }
  const target = {
    level: form.enemyLevel,
    resistance: {
      Pyro: baseRes, Hydro: baseRes, Cryo: baseRes, Electro: baseRes,
      Anemo: baseRes, Geo: baseRes, Dendro: baseRes, Physical: baseRes,
    },
    resReduction: {
      Pyro: form.resReduction / 100, Hydro: form.resReduction / 100,
      Cryo: form.resReduction / 100, Electro: form.resReduction / 100,
      Anemo: form.resReduction / 100, Geo: form.resReduction / 100,
      Dendro: form.resReduction / 100, Physical: form.resReduction / 100,
    },
    defReduction: form.defReduction / 100,
  }

  const rows: ComputedRow[] = []
  const sections: Array<{ role: 'auto' | 'skill' | 'burst'; lvl: number }> = [
    { role: 'auto', lvl: form.autoLvl },
    { role: 'skill', lvl: form.skillLvl },
    { role: 'burst', lvl: form.burstLvl },
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

/** For a substat, return the form-field name and the value-delta corresponding
 *  to one max roll. */
function substatToFormDelta(substat: Substat): { field: keyof BuildForm; delta: number } {
  const roll = MAX_ROLL_VALUES[substat]
  switch (substat) {
    case 'critRate': return { field: 'critRate', delta: roll * 100 }
    case 'critDmg': return { field: 'critDmg', delta: roll * 100 }
    case 'atkPct': return { field: 'atkPct', delta: roll * 100 }
    case 'hpPct': return { field: 'hpPct', delta: roll * 100 }
    case 'defPct': return { field: 'defPct', delta: roll * 100 }
    case 'em': return { field: 'em', delta: roll }
    case 'er': return { field: 'erBonus', delta: roll * 100 }
    case 'atkFlat': return { field: 'atkFlat', delta: roll }
    case 'hpFlat': return { field: 'hpFlat', delta: roll }
    case 'defFlat': return { field: 'defFlat', delta: roll }
  }
}

export default function CharacterDetail() {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const { id } = useParams<{ id: string }>()
  const idx = id ? getCharacterIndex(id) : undefined
  const [meta, setMeta] = useState<CharacterMeta | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<BuildForm>(DEFAULTS)
  const [scalingOverride, setScalingOverride] = useState<
    Record<string, 'atk' | 'hp' | 'def' | 'em'>
  >({})
  const importedBuild = useImportedBuilds((s) => (id ? s.get(id) : undefined))

  useEffect(() => {
    if (!id) return
    setMeta(null)
    setLoadError(null)
    loadCharacterMeta(id)
      .then(setMeta)
      .catch((e) => setLoadError(e.message))
  }, [id])

  // When the user lands on this page from /uid import, pre-fill the form with
  // their actual character build. Enka's fightPropMap gives FINAL stats with
  // weapon + artifacts + ascension all baked in, so we treat them as the
  // "base" and skip the ascension-stat bonus to avoid double-counting.
  useEffect(() => {
    if (!importedBuild) return
    const b = importedBuild
    const elem = idx ? normalizeElement(idx.element) : 'Physical'
    const elemDmg = b.elementalDmg[elem] ?? 0
    setForm((prev) => ({
      ...prev,
      charLevel: b.characterLevel,
      ascensionStage: b.ascensionStage,
      manualBase: true,
      baseAtkOverride: b.finalAtk,
      baseHpOverride: b.finalHp,
      baseDefOverride: b.finalDef,
      atkFlat: 0,
      atkPct: 0,
      hpFlat: 0,
      hpPct: 0,
      defFlat: 0,
      defPct: 0,
      em: b.em,
      critRate: Math.max(b.critRate - 5, 0), // dict already adds 5% baseline
      critDmg: Math.max(b.critDmg - 50, 0),
      erBonus: Math.max(b.er - 100, 0),
      elementBonus: elemDmg,
      autoLvl: b.talentLevels.auto,
      skillLvl: b.talentLevels.skill,
      burstLvl: b.talentLevels.burst,
    }))
  }, [importedBuild, idx])

  // Auto-sync ascensionStage with charLevel unless user has manually changed it.
  // We keep a simple invariant: if level allows a higher stage, but stage hasn't
  // been bumped up, bump it. We don't override a user who explicitly set a
  // higher stage at a lower level (sub-level overlevelling is valid).
  useEffect(() => {
    setForm((f) => {
      const minStage = defaultAscensionFor(f.charLevel)
      if (f.ascensionStage < minStage) return { ...f, ascensionStage: minStage }
      // Also cap level to ascension's allowed maximum (in-game ceiling).
      const cap = MAX_LEVEL_BY_ASCENSION[f.ascensionStage] ?? 90
      if (f.charLevel > cap) return { ...f, charLevel: cap }
      return f
    })
  }, [form.charLevel, form.ascensionStage])

  const element: DamageElement = idx ? normalizeElement(idx.element) : 'Physical'

  // Auto-computed base stats from level + ascension
  const autoBase = useMemo(() => {
    if (!meta) return { hp: 0, atk: 0, def: 0 }
    return computeBaseStats(meta, form.charLevel, form.ascensionStage)
  }, [meta, form.charLevel, form.ascensionStage])

  const ascensionBonusBag: StatBag = useMemo(() => {
    if (!meta) return {}
    return computeAscensionBonus(meta, form.ascensionStage)
  }, [meta, form.ascensionStage])

  // Compute final stats by aggregating: char base + ascension bonus + form bonuses.
  const rows = useMemo(() => {
    if (!meta) {
      return {
        rows: [] as ComputedRow[],
        finalStats: null as ReturnType<typeof aggregateStats> | null,
      }
    }
    return computeBuildRows(form, meta, autoBase, ascensionBonusBag, element, scalingOverride)
  }, [meta, form, element, scalingOverride, autoBase, ascensionBonusBag])

  // Substat marginal-value: for each substat type, add +1 max roll to the form
  // and recompute total avg damage. Sort by delta.
  const substatValues = useMemo(() => {
    if (!meta) return []
    const baselineTotal = rows.rows.reduce((acc, r) => acc + r.out.avg, 0)
    if (baselineTotal === 0) return []
    return ALL_SUBSTATS.map((s) => {
      const { field, delta } = substatToFormDelta(s)
      const perturbed = { ...form, [field]: (form[field] as number) + delta }
      const r = computeBuildRows(perturbed, meta, autoBase, ascensionBonusBag, element, scalingOverride)
      const newTotal = r.rows.reduce((acc, row) => acc + row.out.avg, 0)
      return {
        substat: s,
        absoluteDelta: newTotal - baselineTotal,
        pctDelta: ((newTotal - baselineTotal) / baselineTotal) * 100,
      }
    }).sort((a, b) => b.absoluteDelta - a.absoluteDelta)
  }, [rows.rows, form, meta, autoBase, ascensionBonusBag, element, scalingOverride])

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

      {loadError && (
        <div className="text-red-600 text-sm">
          {t('detail.loadError')}{loadError}
        </div>
      )}
      {!meta && !loadError && (
        <div className="text-zinc-500 text-sm">{t('detail.loading')}</div>
      )}

      {meta && (
        <div className="grid lg:grid-cols-[360px_1fr] gap-6">
          <BuildPanel
            form={form}
            setForm={setForm}
            element={element}
            autoBase={autoBase}
            ascensionBonusBag={ascensionBonusBag}
            t={t}
          />
          <div className="space-y-6">
            <DamagePanel
              meta={meta}
              rows={rows.rows}
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

function BuildPanel({
  form,
  setForm,
  element,
  autoBase,
  ascensionBonusBag,
  t,
}: {
  form: BuildForm
  setForm: (next: BuildForm) => void
  element: DamageElement
  autoBase: { hp: number; atk: number; def: number }
  ascensionBonusBag: StatBag
  t: (key: string, fallback?: string) => string
}) {
  const upd = (k: keyof BuildForm, v: number | string | boolean) =>
    setForm({ ...form, [k]: v as never })
  const ascensionStages = [0, 1, 2, 3, 4, 5, 6]

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-sm font-semibold mb-2">{t('detail.section.charLevel')}</h3>
        <NumberRow label={t('player.charLevel')} value={form.charLevel} step={1} min={1} max={90} onChange={(v) => upd('charLevel', v)} />
        <label className="block text-xs text-zinc-500 mt-2 mb-1">{t('player.ascensionStage')}</label>
        <select
          value={form.ascensionStage}
          onChange={(e) => upd('ascensionStage', parseInt(e.target.value, 10))}
          className="w-full px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        >
          {ascensionStages.map((s) => (
            <option key={s} value={s}>
              {t('player.stage')} {s} (≤{MAX_LEVEL_BY_ASCENSION[s]})
            </option>
          ))}
        </select>
        {!form.manualBase && (
          <>
            <p className="text-xs text-zinc-500 mt-2">
              {t('player.autoBase')}: ATK <strong>{Math.round(autoBase.atk)}</strong> · HP <strong>{Math.round(autoBase.hp)}</strong> · DEF <strong>{Math.round(autoBase.def)}</strong>
            </p>
            {Object.keys(ascensionBonusBag).length > 0 && (
              <p className="text-xs text-zinc-500 mt-1">
                {t('player.ascensionBonus')}:{' '}
                {Object.entries(ascensionBonusBag)
                  .map(([k, v]) => `${k}: ${typeof v === 'number' && v < 1 ? `${(v * 100).toFixed(1)}%` : v}`)
                  .join(', ')}
              </p>
            )}
          </>
        )}
        <label className="flex items-center gap-2 text-xs mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.manualBase}
            onChange={(e) => upd('manualBase', e.target.checked)}
          />
          <span>{t('build.manualBase')}</span>
        </label>
        {form.manualBase && (
          <div className="mt-2 pl-5 space-y-0.5">
            <NumberRow label="Base ATK" value={form.baseAtkOverride} step={50} onChange={(v) => upd('baseAtkOverride', v)} />
            <NumberRow label="Base HP" value={form.baseHpOverride} step={500} onChange={(v) => upd('baseHpOverride', v)} />
            <NumberRow label="Base DEF" value={form.baseDefOverride} step={50} onChange={(v) => upd('baseDefOverride', v)} />
            <p className="text-[10px] text-zinc-500 mt-1">{t('build.manualBaseHint')}</p>
          </div>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">{t('detail.section.weaponArtifact')}</h3>
        <NumberRow label={t('stat.atkFlat')} value={form.atkFlat} step={50} onChange={(v) => upd('atkFlat', v)} />
        <NumberRow label={t('stat.atkPct')} value={form.atkPct} step={5} onChange={(v) => upd('atkPct', v)} />
        <NumberRow label={t('stat.hpFlat')} value={form.hpFlat} step={500} onChange={(v) => upd('hpFlat', v)} />
        <NumberRow label={t('stat.hpPct')} value={form.hpPct} step={5} onChange={(v) => upd('hpPct', v)} />
        <NumberRow label={t('stat.defFlat')} value={form.defFlat} step={20} onChange={(v) => upd('defFlat', v)} />
        <NumberRow label={t('stat.defPct')} value={form.defPct} step={5} onChange={(v) => upd('defPct', v)} />
        <NumberRow label={t('stat.em')} value={form.em} step={20} onChange={(v) => upd('em', v)} />
        <NumberRow label={t('stat.critRate')} value={form.critRate} step={5} onChange={(v) => upd('critRate', v)} />
        <NumberRow label={t('stat.critDmg')} value={form.critDmg} step={10} onChange={(v) => upd('critDmg', v)} />
        <NumberRow label={t('stat.erBonus')} value={form.erBonus} step={5} onChange={(v) => upd('erBonus', v)} />
        <NumberRow
          label={`${t(`element.${element}`)}${t('stat.elementBonus')}`}
          value={form.elementBonus}
          step={5}
          onChange={(v) => upd('elementBonus', v)}
        />
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">{t('detail.section.talentLevels')}</h3>
        <NumberRow label={t('talent.normal')} value={form.autoLvl} step={1} min={1} max={15} onChange={(v) => upd('autoLvl', v)} />
        <NumberRow label={t('talent.skill')} value={form.skillLvl} step={1} min={1} max={15} onChange={(v) => upd('skillLvl', v)} />
        <NumberRow label={t('talent.burst')} value={form.burstLvl} step={1} min={1} max={15} onChange={(v) => upd('burstLvl', v)} />
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">{t('detail.section.enemy')}</h3>
        <NumberRow label={t('enemy.level')} value={form.enemyLevel} step={5} min={1} max={110} onChange={(v) => upd('enemyLevel', v)} />
        <NumberRow label={t('enemy.baseRes')} value={form.enemyRes} step={5} onChange={(v) => upd('enemyRes', v)} />
        <NumberRow label={t('enemy.resReduction')} value={form.resReduction} step={5} onChange={(v) => upd('resReduction', v)} />
        <NumberRow label={t('enemy.defReduction')} value={form.defReduction} step={5} onChange={(v) => upd('defReduction', v)} />
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">{t('reaction.label')}</h3>
        <select
          value={form.reaction}
          onChange={(e) => upd('reaction', e.target.value)}
          className="w-full px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        >
          <option value="none">{t('reaction.none')}</option>
          <option value="vape_strong">{t('reaction.vape_strong')}</option>
          <option value="vape_weak">{t('reaction.vape_weak')}</option>
          <option value="melt_strong">{t('reaction.melt_strong')}</option>
          <option value="melt_weak">{t('reaction.melt_weak')}</option>
          <option value="aggravate">{t('reaction.aggravate')}</option>
          <option value="spread">{t('reaction.spread')}</option>
        </select>
      </section>
    </div>
  )
}

function NumberRow({
  label, value, step = 1, min, max, onChange,
}: {
  label: string
  value: number
  step?: number
  min?: number
  max?: number
  onChange: (n: number) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm py-1">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseFloat(e.target.value)
          if (!Number.isNaN(n)) onChange(n)
        }}
        className="w-24 px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-right text-sm"
      />
    </label>
  )
}

function DamagePanel({
  meta, rows, scalingOverride, setScalingOverride, t,
}: {
  meta: CharacterMeta
  rows: Array<{
    role: 'auto' | 'skill' | 'burst'
    lvl: number
    hit: ExtractedHit
    multiplier: number
    out: ReturnType<typeof calcDamage>
  }>
  scalingOverride: Record<string, 'atk' | 'hp' | 'def' | 'em'>
  setScalingOverride: (s: Record<string, 'atk' | 'hp' | 'def' | 'em'>) => void
  t: (key: string, fallback?: string) => string
}) {
  const groups = useMemo(() => {
    const g: Record<string, typeof rows> = { auto: [], skill: [], burst: [] }
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
                      <td className="px-2 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">
                        {fmt(r.out.crit)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">
                        {fmt(r.out.avg)}
                      </td>
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
                <td className="px-4 py-2">
                  {t(`substat.${s.substat}`)}
                </td>
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
