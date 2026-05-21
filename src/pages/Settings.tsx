import { useRef, useState } from 'react'
import { useCharacterConfigs } from '@/store/character-configs'
import { useT } from '@/i18n/store'

export default function Settings() {
  const t = useT()
  const exportJson = useCharacterConfigs((s) => s.exportJson)
  const importJson = useCharacterConfigs((s) => s.importJson)
  const characters = useCharacterConfigs((s) => s.characters)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

  const characterCount = Object.keys(characters).length
  const totalBuilds = Object.values(characters).reduce(
    (n, c) => n + Object.keys(c.builds).length,
    0,
  )

  function onExport() {
    const json = exportJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stamp = new Date().toISOString().slice(0, 10)
    a.download = `specular-configs-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage(t('settings.exportDone'))
  }

  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((raw) => {
      const n = importJson(raw)
      setMessage(n > 0 ? t('settings.importDone').replace('{n}', String(n)) : t('settings.importFailed'))
    })
  }

  async function onExportGood() {
    // GOOD export: collapse each character to its active build only.
    const allConfigs = Object.values(characters).map(
      (c) => c.builds[c.activeBuildId],
    ).filter(Boolean)
    if (allConfigs.length === 0) {
      setMessage(t('settings.noConfigsToExport'))
      return
    }
    setMessage(t('settings.loadingGoodEngine'))
    const { exportGood } = await import('@/integration/good-adapter')
    const good = exportGood(allConfigs)
    const json = JSON.stringify(good, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stamp = new Date().toISOString().slice(0, 10)
    a.download = `specular-good-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage(
      t('settings.goodExportDone')
        .replace('{c}', String(good.characters.length))
        .replace('{w}', String(good.weapons.length))
        .replace('{a}', String(good.artifacts.length)),
    )
  }

  function onClearAll() {
    if (!confirm(t('settings.clearConfirm'))) return
    // Clear by importing an empty object via the store
    localStorage.removeItem('specular-character-configs')
    location.reload()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
        <p className="text-sm text-zinc-500 mt-2">
          {t('settings.storage')}: <strong>localStorage</strong>{' '}
          <span className="text-zinc-400">({characterCount} {t('settings.charactersStored')} / {totalBuilds} builds)</span>
        </p>
      </div>

      <section className="space-y-3 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="font-medium">{t('settings.sync')}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('settings.syncHint')}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onExport}
            className="px-4 py-2 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium hover:opacity-90"
          >
            {t('settings.export')}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {t('settings.import')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={onImport}
            className="hidden"
          />
        </div>
        {message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
      </section>

      <section className="space-y-3 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="font-medium">{t('settings.goodExport')}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('settings.goodHint')}</p>
        <button
          onClick={onExportGood}
          className="px-4 py-2 rounded-md border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-400 text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
        >
          {t('settings.goodExportBtn')}
        </button>
      </section>

      <section className="space-y-3 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="font-medium">{t('settings.danger')}</h2>
        <button
          onClick={onClearAll}
          className="px-4 py-2 rounded-md border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          {t('settings.clearAll')}
        </button>
      </section>

      <section className="text-xs text-zinc-500 space-y-1">
        <h3 className="font-medium text-zinc-700 dark:text-zinc-300">{t('settings.futureSync')}</h3>
        <p>{t('settings.futureSyncDetail')}</p>
      </section>
    </div>
  )
}
