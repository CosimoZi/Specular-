import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getCharacterIndex, iconUrl } from '@/data'
import {
  loadCharacterMeta,
  hitMultiplier,
  normalizeElement,
  type CharacterMeta,
  type ExtractedHit,
} from '@/data/meta'
import {
  aggregateStats,
  calcDamage,
  type DamageElement,
  type Reaction,
} from '@/engine'
import { ELEMENT_COLOR, ELEMENT_LABEL, WEAPON_TYPE_LABEL } from '@/data/types'

interface BuildForm {
  charLevel: number
  enemyLevel: number
  enemyRes: number // 0..n base resistance
  resReduction: number
  defReduction: number
  atk: number
  hp: number
  def: number
  em: number
  critRate: number // percentage 0..100
  critDmg: number // percentage
  elementBonus: number // percentage (applied to character element)
  // Per-talent level
  autoLvl: number
  skillLvl: number
  burstLvl: number
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
  enemyLevel: 100,
  enemyRes: 10,
  resReduction: 0,
  defReduction: 0,
  atk: 2000,
  hp: 20000,
  def: 1000,
  em: 100,
  critRate: 70,
  critDmg: 150,
  elementBonus: 46.6,
  autoLvl: 10,
  skillLvl: 10,
  burstLvl: 10,
  reaction: 'none',
}

function reactionFromPick(pick: ReactionPick): Reaction {
  switch (pick) {
    case 'vape_strong':
      return { kind: 'vape', trigger: 'pyro_on_hydro' }
    case 'vape_weak':
      return { kind: 'vape', trigger: 'hydro_on_pyro' }
    case 'melt_strong':
      return { kind: 'melt', trigger: 'pyro_on_cryo' }
    case 'melt_weak':
      return { kind: 'melt', trigger: 'cryo_on_pyro' }
    case 'aggravate':
      return { kind: 'aggravate' }
    case 'spread':
      return { kind: 'spread' }
    default:
      return { kind: 'none' }
  }
}

export default function CharacterDetail() {
  const { id } = useParams<{ id: string }>()
  const idx = id ? getCharacterIndex(id) : undefined
  const [meta, setMeta] = useState<CharacterMeta | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<BuildForm>(DEFAULTS)
  // Per-hit scaling override map: key = "<role>:<paramIndex>", value = scaling
  const [scalingOverride, setScalingOverride] = useState<
    Record<string, 'atk' | 'hp' | 'def' | 'em'>
  >({})

  useEffect(() => {
    if (!id) return
    setMeta(null)
    setLoadError(null)
    loadCharacterMeta(id)
      .then(setMeta)
      .catch((e) => setLoadError(e.message))
  }, [id])

  const element: DamageElement = idx
    ? normalizeElement(idx.element)
    : 'Physical'

  const rows = useMemo(() => {
    if (!meta) return []
    const reaction = reactionFromPick(form.reaction)
    const stats = aggregateStats([
      {
        atkFlat: form.atk,
        hpFlat: form.hp,
        defFlat: form.def,
        em: form.em,
        critRate: form.critRate / 100 - 0.05, // engine baseline is 5%
        critDmg: form.critDmg / 100 - 0.5, // engine baseline 50%
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
        Pyro: baseRes,
        Hydro: baseRes,
        Cryo: baseRes,
        Electro: baseRes,
        Anemo: baseRes,
        Geo: baseRes,
        Dendro: baseRes,
        Physical: baseRes,
      },
      resReduction: {
        Pyro: form.resReduction / 100,
        Hydro: form.resReduction / 100,
        Cryo: form.resReduction / 100,
        Electro: form.resReduction / 100,
        Anemo: form.resReduction / 100,
        Geo: form.resReduction / 100,
        Dendro: form.resReduction / 100,
        Physical: form.resReduction / 100,
      },
      defReduction: form.defReduction / 100,
    }

    const collect: Array<{
      role: 'auto' | 'skill' | 'burst'
      lvl: number
      hit: ExtractedHit
      multiplier: number
      out: ReturnType<typeof calcDamage>
    }> = []

    const sections: Array<{
      role: 'auto' | 'skill' | 'burst'
      lvl: number
    }> = [
      { role: 'auto', lvl: form.autoLvl },
      { role: 'skill', lvl: form.skillLvl },
      { role: 'burst', lvl: form.burstLvl },
    ]
    for (const { role, lvl } of sections) {
      const t = meta.talents[role]
      if (!t) continue
      for (const hit of t.hits) {
        const m = hitMultiplier(t, hit, lvl)
        if (m == null) continue
        const key = `${role}:${hit.paramIndex}:${hit.label}`
        const scaling = scalingOverride[key] ?? hit.scaling
        const out = calcDamage(
          attacker,
          target,
          {
            label: hit.label,
            scaling,
            multiplier: m,
            element,
            hitType: hit.hitType,
          },
          reaction,
        )
        collect.push({ role, lvl, hit: { ...hit, scaling }, multiplier: m, out })
      }
    }
    return collect
  }, [meta, form, element, scalingOverride])

  if (!idx) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">未找到角色</h1>
        <Link to="/characters" className="text-blue-600 hover:underline">
          ← 返回列表
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
            background: `linear-gradient(180deg, ${
              ELEMENT_COLOR[idx.element] ?? '#888'
            }55, transparent)`,
          }}
        >
          <img
            src={iconUrl(idx.icon)}
            alt={idx.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{idx.name}</h1>
          <div className="text-sm text-zinc-500 flex gap-3 mt-1">
            <span style={{ color: ELEMENT_COLOR[idx.element] }}>
              {ELEMENT_LABEL[idx.element] ?? idx.element}
            </span>
            <span>·</span>
            <span>{idx.rank}★</span>
            <span>·</span>
            <span>{WEAPON_TYPE_LABEL[idx.weaponType]}</span>
            <span>·</span>
            <span>{idx.region}</span>
          </div>
        </div>
        <Link to="/characters" className="ml-auto text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← 列表
        </Link>
      </div>

      {loadError && (
        <div className="text-red-600 text-sm">加载技能数据失败：{loadError}</div>
      )}
      {!meta && !loadError && (
        <div className="text-zinc-500 text-sm">加载中…</div>
      )}

      {meta && (
        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          <BuildPanel form={form} setForm={setForm} element={element} />
          <DamagePanel
            meta={meta}
            rows={rows}
            scalingOverride={scalingOverride}
            setScalingOverride={setScalingOverride}
          />
        </div>
      )}
    </div>
  )
}

function BuildPanel({
  form,
  setForm,
  element,
}: {
  form: BuildForm
  setForm: (next: BuildForm) => void
  element: DamageElement
}) {
  const upd = (k: keyof BuildForm, v: number | string) =>
    setForm({ ...form, [k]: v as never })
  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-sm font-semibold mb-2">面板</h3>
        <NumberRow label="攻击力" value={form.atk} step={50} onChange={(v) => upd('atk', v)} />
        <NumberRow label="生命值" value={form.hp} step={500} onChange={(v) => upd('hp', v)} />
        <NumberRow label="防御力" value={form.def} step={50} onChange={(v) => upd('def', v)} />
        <NumberRow label="元素精通" value={form.em} step={20} onChange={(v) => upd('em', v)} />
        <NumberRow label="暴击率 %" value={form.critRate} step={5} onChange={(v) => upd('critRate', v)} />
        <NumberRow label="暴击伤害 %" value={form.critDmg} step={10} onChange={(v) => upd('critDmg', v)} />
        <NumberRow
          label={`${ELEMENT_LABEL[element] ?? element}伤加成 %`}
          value={form.elementBonus}
          step={5}
          onChange={(v) => upd('elementBonus', v)}
        />
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">天赋等级</h3>
        <NumberRow label="普攻" value={form.autoLvl} step={1} min={1} max={15} onChange={(v) => upd('autoLvl', v)} />
        <NumberRow label="战技 E" value={form.skillLvl} step={1} min={1} max={15} onChange={(v) => upd('skillLvl', v)} />
        <NumberRow label="爆发 Q" value={form.burstLvl} step={1} min={1} max={15} onChange={(v) => upd('burstLvl', v)} />
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">敌人</h3>
        <NumberRow label="等级" value={form.enemyLevel} step={5} min={1} max={110} onChange={(v) => upd('enemyLevel', v)} />
        <NumberRow label="基础抗性 %" value={form.enemyRes} step={5} onChange={(v) => upd('enemyRes', v)} />
        <NumberRow label="抗性削减 %" value={form.resReduction} step={5} onChange={(v) => upd('resReduction', v)} />
        <NumberRow label="防御削减 %" value={form.defReduction} step={5} onChange={(v) => upd('defReduction', v)} />
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">玩家等级 + 反应</h3>
        <NumberRow label="角色等级" value={form.charLevel} step={5} min={1} max={90} onChange={(v) => upd('charLevel', v)} />
        <label className="block text-xs text-zinc-500 mb-1">反应</label>
        <select
          value={form.reaction}
          onChange={(e) => upd('reaction', e.target.value)}
          className="w-full px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        >
          <option value="none">无反应（直伤）</option>
          <option value="vape_strong">蒸发（强）— 火→水</option>
          <option value="vape_weak">蒸发（弱）— 水→火</option>
          <option value="melt_strong">融化（强）— 火→冰</option>
          <option value="melt_weak">融化（弱）— 冰→火</option>
          <option value="aggravate">超激化（雷+草）</option>
          <option value="spread">蔓激化（草+雷）</option>
        </select>
      </section>
    </div>
  )
}

function NumberRow({
  label,
  value,
  step = 1,
  min,
  max,
  onChange,
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
  meta,
  rows,
  scalingOverride,
  setScalingOverride,
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
  setScalingOverride: (
    s: Record<string, 'atk' | 'hp' | 'def' | 'em'>,
  ) => void
}) {
  const groups = useMemo(() => {
    const g: Record<string, typeof rows> = { auto: [], skill: [], burst: [] }
    for (const r of rows) g[r.role].push(r)
    return g
  }, [rows])

  const roleLabels: Record<string, string> = {
    auto: `普攻 · ${meta.talents.auto?.name ?? ''}`,
    skill: `战技 · ${meta.talents.skill?.name ?? ''}`,
    burst: `爆发 · ${meta.talents.burst?.name ?? ''}`,
  }

  const fmt = (n: number) => Math.round(n).toLocaleString()

  return (
    <div className="space-y-4">
      {(['auto', 'skill', 'burst'] as const).map((role) => {
        const list = groups[role]
        if (!list.length) return null
        return (
          <section
            key={role}
            className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
          >
            <h3 className="text-sm font-semibold px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
              {roleLabels[role]}
            </h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/50">
                <tr>
                  <th className="text-left px-4 py-2 font-normal">技能</th>
                  <th className="text-left px-2 py-2 font-normal w-24">倍率</th>
                  <th className="text-left px-2 py-2 font-normal w-24">scaling</th>
                  <th className="text-right px-2 py-2 font-normal">非暴击</th>
                  <th className="text-right px-2 py-2 font-normal">暴击</th>
                  <th className="text-right px-4 py-2 font-normal">期望</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const key = `${r.role}:${r.hit.paramIndex}:${r.hit.label}`
                  return (
                    <tr
                      key={i}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
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
                              [key]: e.target
                                .value as 'atk' | 'hp' | 'def' | 'em',
                            })
                          }
                          className={`text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 ${
                            scalingOverride[key] ? 'border-amber-500 dark:border-amber-400' : ''
                          }`}
                        >
                          <option value="atk">攻击</option>
                          <option value="hp">生命</option>
                          <option value="def">防御</option>
                          <option value="em">精通</option>
                        </select>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmt(r.out.nonCrit)}
                      </td>
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
        <strong>注</strong>：倍率自动从 ambr 数据抽出，但 <em>scaling</em> 默认按 ATK；
        HP/防御/精通 倍率角色（胡桃、那维莱特、夜兰、钟离等）请在下拉框里改正。
        修改即时生效。
      </p>
    </div>
  )
}
