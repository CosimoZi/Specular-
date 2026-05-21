// ConfigPanel — the user's structured character build editor. Sections:
//   • Character (level, ascension, constellation, talents)
//   • Weapon (picker + refinement)
//   • Artifacts (5 slots, each: set + main stat + 4 substats)
//   • Custom buffs (optional)
//   • Enemy + reaction
//
// Reads/writes through useCharacterConfigs (persisted to localStorage).

import { useMemo } from 'react'
import { useCharacterConfigs } from '@/store/character-configs'
import {
  type CharacterConfig,
  type ArtifactPiece,
  type ArtifactSubStat,
} from '@/data/config-types'
import {
  ALL_SLOTS,
  ARTIFACT_MAIN_OPTIONS,
  STAT_LABEL_ZH,
  STAT_LABEL_EN,
  SLOT_LABEL_ZH,
  SLOT_LABEL_EN,
  artifactMainValue,
} from '@/data/artifact-tables'
import { listWeapons, listArtifacts, fetchWeaponDetail } from '@/data'
import { weaponStatsAtL90 } from '@/data/weapon-stats'
import { useEffect, useState } from 'react'
import { useI18n, useT } from '@/i18n/store'
import {
  defaultAscensionFor,
  MAX_LEVEL_BY_ASCENSION,
} from '@/data/character-stats'

const SUBSTAT_OPTIONS: ArtifactSubStat[] = [
  'critRate',
  'critDmg',
  'atkPct',
  'hpPct',
  'defPct',
  'em',
  'er',
  'atkFlat',
  'hpFlat',
  'defFlat',
]

export default function ConfigPanel({
  characterId,
  weaponType,
}: {
  characterId: number | string
  weaponType: string
}) {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const STAT_LABEL = locale === 'en' ? STAT_LABEL_EN : STAT_LABEL_ZH
  const SLOT_LABEL = locale === 'en' ? SLOT_LABEL_EN : SLOT_LABEL_ZH
  const config = useCharacterConfigs((s) => s.get(characterId))
  const patch = useCharacterConfigs((s) => s.patch)
  const setArtifact = useCharacterConfigs((s) => s.setArtifact)
  const reset = useCharacterConfigs((s) => s.reset)
  // Multi-build awareness
  const buildIds = useCharacterConfigs((s) => s.listBuilds(characterId))
  const activeBuildId = useCharacterConfigs((s) => s.getActiveBuildId(characterId))
  const setActiveBuildId = useCharacterConfigs((s) => s.setActiveBuildId)
  const createBuild = useCharacterConfigs((s) => s.createBuild)
  const renameBuild = useCharacterConfigs((s) => s.renameBuild)
  const deleteBuild = useCharacterConfigs((s) => s.deleteBuild)

  const upd = <K extends keyof CharacterConfig>(k: K, v: CharacterConfig[K]) =>
    patch(characterId, { [k]: v })

  // Auto-sync ascension stage with level
  useEffect(() => {
    const minStage = defaultAscensionFor(config.level)
    if (config.ascensionStage < minStage) {
      patch(characterId, { ascensionStage: minStage })
    }
    const cap = MAX_LEVEL_BY_ASCENSION[config.ascensionStage] ?? 90
    if (config.level > cap) patch(characterId, { level: cap })
  }, [config.level, config.ascensionStage, characterId, patch])

  // Weapons filtered by the character's weapon type
  const weapons = useMemo(
    () => listWeapons().filter((w) => w.type === weaponType),
    [weaponType],
  )
  const artifactSets = useMemo(() => listArtifacts(), [])

  // Auto-load weapon's lvl-90 stats for display
  const [weaponPreview, setWeaponPreview] = useState<{
    baseAtk: number
    secondaryLabel: string
    secondaryValue: number
  } | null>(null)
  useEffect(() => {
    if (config.weapon.weaponId == null) {
      setWeaponPreview(null)
      return
    }
    fetchWeaponDetail(config.weapon.weaponId)
      .then((d) => {
        const s = weaponStatsAtL90(d)
        const secondaryProp = s.secondary?.propType ?? ''
        // Translate ambr's FIGHT_PROP_* into a readable label
        const labelMap: Record<string, string> = {
          FIGHT_PROP_CRITICAL: 'CR',
          FIGHT_PROP_CRITICAL_HURT: 'CD',
          FIGHT_PROP_ATTACK_PERCENT: 'ATK %',
          FIGHT_PROP_HP_PERCENT: 'HP %',
          FIGHT_PROP_DEFENSE_PERCENT: 'DEF %',
          FIGHT_PROP_ELEMENT_MASTERY: 'EM',
          FIGHT_PROP_CHARGE_EFFICIENCY: 'ER %',
          FIGHT_PROP_PHYSICAL_ADD_HURT: 'Phys %',
        }
        setWeaponPreview({
          baseAtk: s.baseAtk,
          secondaryLabel: labelMap[secondaryProp] ?? secondaryProp.replace('FIGHT_PROP_', ''),
          secondaryValue: s.secondary
            ? s.secondary.propType === 'FIGHT_PROP_ELEMENT_MASTERY'
              ? s.secondary.value
              : s.secondary.value * 100
            : 0,
        })
      })
      .catch(() => setWeaponPreview(null))
  }, [config.weapon.weaponId])

  function updateArtifact(slot: typeof ALL_SLOTS[number], patchObj: Partial<ArtifactPiece>) {
    const existing = config.artifacts[slot]
    if (!existing) {
      // Create with defaults
      const defaultRarity: 5 | 4 = 5
      const mainOptions = ARTIFACT_MAIN_OPTIONS[slot]
      const piece: ArtifactPiece = {
        setId: artifactSets[0]?.id ?? 0,
        slot,
        rarity: defaultRarity,
        level: defaultRarity === 5 ? 20 : 16,
        mainStat: mainOptions[0],
        substats: [],
        ...patchObj,
      }
      setArtifact(characterId, slot, piece)
    } else {
      setArtifact(characterId, slot, { ...existing, ...patchObj })
    }
  }

  return (
    <div className="space-y-5">
      {/* Build picker — pick / create / rename / delete named builds */}
      <BuildPicker
        characterId={characterId}
        buildIds={buildIds}
        activeBuildId={activeBuildId}
        onSwitch={(b) => setActiveBuildId(characterId, b)}
        onCreate={(name, cloneFrom) => createBuild(characterId, name, cloneFrom)}
        onRename={(oldId, newId) => renameBuild(characterId, oldId, newId)}
        onDelete={(b) => deleteBuild(characterId, b)}
        t={t}
      />
      {/* Character section */}
      <Section title={t('config.character')}>
        <NumberRow label={t('player.charLevel')} value={config.level} min={1} max={90} step={1} onChange={(v) => upd('level', v)} />
        <SelectRow
          label={t('player.ascensionStage')}
          value={String(config.ascensionStage)}
          options={[0, 1, 2, 3, 4, 5, 6].map((s) => ({
            value: String(s),
            label: `${s} (≤${MAX_LEVEL_BY_ASCENSION[s]})`,
          }))}
          onChange={(v) => upd('ascensionStage', parseInt(v, 10))}
        />
        <SelectRow
          label={t('config.position')}
          value={config.position ?? 'frontline'}
          options={[
            { value: 'frontline', label: t('config.frontline') },
            { value: 'backline', label: t('config.backline') },
          ]}
          onChange={(v) => upd('position', v as 'frontline' | 'backline')}
        />
        <NumberRow label={t('config.constellation')} value={config.constellation} min={0} max={6} step={1} onChange={(v) => upd('constellation', v)} />
        <NumberRow label={t('talent.normal')} value={config.talentLevels.auto} min={1} max={15} step={1} onChange={(v) => upd('talentLevels', { ...config.talentLevels, auto: v })} />
        <NumberRow label={t('talent.skill')} value={config.talentLevels.skill} min={1} max={15} step={1} onChange={(v) => upd('talentLevels', { ...config.talentLevels, skill: v })} />
        <NumberRow label={t('talent.burst')} value={config.talentLevels.burst} min={1} max={15} step={1} onChange={(v) => upd('talentLevels', { ...config.talentLevels, burst: v })} />
      </Section>

      {/* Weapon section */}
      <Section title={t('config.weapon')}>
        <SelectRow
          label={t('config.weaponPick')}
          value={config.weapon.weaponId == null ? '' : String(config.weapon.weaponId)}
          options={[
            { value: '', label: '— ' + t('config.none') + ' —' },
            ...weapons.map((w) => ({
              value: String(w.id),
              label: `${w.name} (${w.rank}★)`,
            })),
          ]}
          onChange={(v) =>
            upd('weapon', {
              ...config.weapon,
              weaponId: v ? parseInt(v, 10) : null,
            })
          }
        />
        <NumberRow label={t('config.weaponLevel')} value={config.weapon.level} min={1} max={90} step={1} onChange={(v) => upd('weapon', { ...config.weapon, level: v })} />
        <NumberRow label={t('config.refinement')} value={config.weapon.refinement} min={1} max={5} step={1} onChange={(v) => upd('weapon', { ...config.weapon, refinement: v })} />
        {weaponPreview && (
          <p className="text-xs text-zinc-500 mt-1">
            {t('config.weaponPreview')}: ATK <strong>{Math.round(weaponPreview.baseAtk)}</strong> · {weaponPreview.secondaryLabel}{' '}
            <strong>{weaponPreview.secondaryValue.toFixed(1)}</strong>
            <span className="ml-2 text-[10px] opacity-60">({t('config.refinementNote')})</span>
          </p>
        )}
      </Section>

      {/* Artifact slots */}
      <Section title={t('config.artifacts')}>
        <p className="text-xs text-zinc-500 mb-2">{t('config.artifactHint')}</p>
        {ALL_SLOTS.map((slot) => {
          const piece = config.artifacts[slot]
          const mainOptions = ARTIFACT_MAIN_OPTIONS[slot]
          return (
            <div
              key={slot}
              className="border border-zinc-200 dark:border-zinc-800 rounded-md p-2 mb-2"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">{SLOT_LABEL[slot]}</span>
                {piece && (
                  <button
                    onClick={() => setArtifact(characterId, slot, null)}
                    className="text-xs text-zinc-400 hover:text-red-500"
                  >
                    {t('config.removePiece')}
                  </button>
                )}
              </div>
              {!piece ? (
                <button
                  onClick={() => updateArtifact(slot, {})}
                  className="w-full text-xs py-1.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-600"
                >
                  + {t('config.addPiece')}
                </button>
              ) : (
                <div className="space-y-1.5">
                  <SelectRow
                    label={t('config.set')}
                    value={String(piece.setId)}
                    options={artifactSets
                      .filter((a) =>
                        a.levelList.includes(piece.rarity),
                      )
                      .map((a) => ({
                        value: String(a.id),
                        label: a.name,
                      }))}
                    onChange={(v) =>
                      updateArtifact(slot, { setId: parseInt(v, 10) })
                    }
                  />
                  <div className="flex gap-2">
                    <SelectRow
                      label={t('config.rarity')}
                      value={String(piece.rarity)}
                      options={[{ value: '5', label: '5★' }, { value: '4', label: '4★' }]}
                      onChange={(v) => {
                        const newRarity = parseInt(v, 10) as 5 | 4
                        const newMaxLvl = newRarity === 5 ? 20 : 16
                        updateArtifact(slot, { rarity: newRarity, level: newMaxLvl })
                      }}
                      compact
                    />
                    <NumberRow
                      label={t('config.level')}
                      value={piece.level}
                      min={0}
                      max={piece.rarity === 5 ? 20 : 16}
                      step={1}
                      onChange={(v) => updateArtifact(slot, { level: v })}
                      compact
                    />
                  </div>
                  <SelectRow
                    label={t('config.mainStat')}
                    value={piece.mainStat}
                    options={mainOptions.map((m) => ({
                      value: m,
                      label: `${STAT_LABEL[m]} (${formatStatValue(m, artifactMainValue(m, piece.rarity, piece.level))})`,
                    }))}
                    onChange={(v) =>
                      updateArtifact(slot, { mainStat: v as ArtifactPiece['mainStat'] })
                    }
                  />
                  {/* 4 substats */}
                  {[0, 1, 2, 3].map((i) => {
                    const sub = piece.substats[i]
                    return (
                      <div key={i} className="flex gap-1.5 items-center text-xs">
                        <select
                          value={sub?.key ?? ''}
                          onChange={(e) => {
                            const v = e.target.value as ArtifactSubStat | ''
                            const subs = [...piece.substats]
                            if (!v) {
                              subs.splice(i, 1)
                            } else {
                              subs[i] = { key: v, value: subs[i]?.value ?? 0 }
                            }
                            updateArtifact(slot, { substats: subs })
                          }}
                          className="flex-1 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                        >
                          <option value="">{t('config.noSubstat')}</option>
                          {SUBSTAT_OPTIONS.map((s) => (
                            <option key={s} value={s}>{STAT_LABEL[s]}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.1"
                          value={sub ? formatStatValue(sub.key, sub.value, true) : ''}
                          disabled={!sub}
                          onChange={(e) => {
                            const subs = [...piece.substats]
                            const raw = parseFloat(e.target.value) || 0
                            const k = subs[i]?.key
                            if (!k) return
                            // Convert from display unit back to internal
                            const value = isPercentStat(k) ? raw / 100 : raw
                            subs[i] = { ...subs[i], value }
                            updateArtifact(slot, { substats: subs })
                          }}
                          className="w-20 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-right"
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </Section>

      <p className="text-xs text-zinc-500 italic pt-2">
        {t('config.enemyMoved')}
      </p>

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => reset(characterId)}
          className="px-3 py-1.5 rounded-md text-xs border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {t('config.reset')}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div>{children}</div>
    </section>
  )
}

function NumberRow({
  label, value, step = 1, min, max, onChange, compact,
}: {
  label: string
  value: number
  step?: number
  min?: number
  max?: number
  onChange: (n: number) => void
  compact?: boolean
}) {
  return (
    <label className={`flex items-center ${compact ? '' : 'justify-between'} gap-2 text-sm py-1`}>
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
        className={`${compact ? 'flex-1' : 'w-24'} px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-right text-sm`}
      />
    </label>
  )
}

function SelectRow({
  label, value, options, onChange, compact,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
  compact?: boolean
}) {
  return (
    <label className={`flex items-center ${compact ? '' : 'justify-between'} gap-2 text-sm py-1`}>
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${compact ? 'flex-1' : 'w-44'} px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

function isPercentStat(k: ArtifactSubStat | ArtifactPiece['mainStat']): boolean {
  return [
    'hpPct', 'atkPct', 'defPct', 'er', 'critRate', 'critDmg',
    'healingBonus', 'pyroDmg', 'hydroDmg', 'cryoDmg', 'electroDmg',
    'anemoDmg', 'geoDmg', 'dendroDmg', 'physicalDmg',
  ].includes(k as string)
}

function formatStatValue(k: ArtifactSubStat | ArtifactPiece['mainStat'], v: number, plain = false): string {
  if (isPercentStat(k)) return `${(v * 100).toFixed(1)}${plain ? '' : '%'}`
  return v.toFixed(0)
}

function BuildPicker({
  buildIds, activeBuildId, onSwitch, onCreate, onRename, onDelete, t,
}: {
  characterId: number | string
  buildIds: string[]
  activeBuildId: string
  onSwitch: (id: string) => void
  onCreate: (name: string, cloneFrom?: string) => void
  onRename: (oldId: string, newId: string) => void
  onDelete: (id: string) => void
  t: (k: string, f?: string) => string
}) {
  const sorted = [...buildIds].sort()
  const isImported = activeBuildId === 'imported'
  function promptNew(cloneFrom?: string) {
    const name = window.prompt(t('build.promptNewName'), cloneFrom ?? '')
    if (!name) return
    const clean = name.trim().slice(0, 30)
    if (!clean || sorted.includes(clean)) return
    onCreate(clean, cloneFrom)
  }
  function promptRename() {
    if (!activeBuildId) return
    const next = window.prompt(t('build.promptRename'), activeBuildId)
    if (!next) return
    const clean = next.trim().slice(0, 30)
    if (!clean || clean === activeBuildId || sorted.includes(clean)) return
    onRename(activeBuildId, clean)
  }
  function confirmDelete() {
    if (!confirm(t('build.confirmDelete').replace('{n}', activeBuildId))) return
    onDelete(activeBuildId)
  }
  return (
    <section className="border border-indigo-200 dark:border-indigo-900 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 shrink-0">{t('build.activeBuild')}</span>
        <select
          value={activeBuildId}
          onChange={(e) => onSwitch(e.target.value)}
          className="flex-1 px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        >
          {sorted.length === 0 ? (
            <option value={activeBuildId}>{activeBuildId}</option>
          ) : (
            sorted.map((id) => (
              <option key={id} value={id}>
                {id === 'imported' ? `${id} · ${t('build.fromUid')}` : id}
              </option>
            ))
          )}
        </select>
      </div>
      <div className="flex gap-1.5 text-xs">
        <button
          onClick={() => promptNew()}
          className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800"
        >
          + {t('build.new')}
        </button>
        <button
          onClick={() => promptNew(activeBuildId)}
          className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800"
        >
          ⎘ {t('build.duplicate')}
        </button>
        <button
          onClick={promptRename}
          disabled={isImported}
          className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
          title={isImported ? t('build.cantEditImported') : undefined}
        >
          ✏ {t('build.rename')}
        </button>
        <button
          onClick={confirmDelete}
          disabled={sorted.length <= 1}
          className="ml-auto px-2 py-1 rounded border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          🗑 {t('build.delete')}
        </button>
      </div>
      {isImported && (
        <p className="text-[10px] text-zinc-500 leading-tight">
          {t('build.importedHint')}
        </p>
      )}
    </section>
  )
}
