import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { displayName, getCharacterIndex, iconUrl } from '@/data'
import { loadCharacterMeta, normalizeElement, type CharacterMeta } from '@/data/meta'
import { ELEMENT_COLOR } from '@/data/types'
import { useI18n, useT } from '@/i18n/store'
import { useImportedBuilds } from '@/store/imported-builds'
import { useCharacterConfigs } from '@/store/character-configs'
import ConfigPanel from '@/components/ConfigPanel'

export default function CharacterDetail() {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const { id } = useParams<{ id: string }>()
  const idx = id ? getCharacterIndex(id) : undefined
  const [meta, setMeta] = useState<CharacterMeta | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const config = useCharacterConfigs((s) => (id ? s.get(id) : null))
  const patch = useCharacterConfigs((s) => s.patch)
  const importedBuild = useImportedBuilds((s) => (id ? s.get(id) : undefined))

  useEffect(() => {
    if (!id) return
    setMeta(null)
    setLoadError(null)
    loadCharacterMeta(id)
      .then(setMeta)
      .catch((e) => setLoadError(e.message))
  }, [id])

  // UID import → write importMode snapshot
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
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <div
          className="w-20 h-20 rounded-lg overflow-hidden"
          style={{
            background: `linear-gradient(180deg, ${ELEMENT_COLOR[idx.element] ?? '#888'}55, transparent)`,
          }}
        >
          <img
            src={iconUrl(idx.icon)}
            alt={displayName(idx, locale)}
            className="w-full h-full object-cover"
          />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{displayName(idx, locale)}</h1>
          <div className="text-sm text-zinc-500 flex gap-3 mt-1">
            <span style={{ color: ELEMENT_COLOR[idx.element] }}>
              {t(`element.${idx.element}`)}
            </span>
            <span>·</span>
            <span>{idx.rank}★</span>
            <span>·</span>
            <span>{t(`weapon.${idx.weaponType}`)}</span>
            <span>·</span>
            <span>{idx.region}</span>
          </div>
        </div>
        <Link
          to="/characters"
          className="ml-auto text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
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
        <div className="text-red-600 text-sm">
          {t('detail.loadError')}{loadError}
        </div>
      )}
      {!meta && !loadError && (
        <div className="text-zinc-500 text-sm">{t('detail.loading')}</div>
      )}

      {meta && id && config && (
        <>
          <ConfigPanel characterId={id} weaponType={idx.weaponType} />

          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
              {t('detail.goToTeamHint')}
            </p>
            <Link
              to="/team"
              className="inline-block px-4 py-2 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium hover:opacity-90"
            >
              {t('detail.goToTeam')} →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
