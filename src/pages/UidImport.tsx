import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchEnkaUid, type ImportResult } from '@/data/uid-import'
import { useImportedBuilds } from '@/store/imported-builds'
import { useCharacterConfigs } from '@/store/character-configs'
import { getCharacterIndex, iconUrl } from '@/data'
import { ELEMENT_COLOR } from '@/data/types'
import { useT } from '@/i18n/store'

export default function UidImport() {
  const t = useT()
  const setMany = useImportedBuilds((s) => s.setMany)
  // UID import writes to each character's `imported` build only — never
  // overwrites user-named custom builds (main / 蒸发 / etc.).
  const setImported = useCharacterConfigs((s) => s.setImported)
  const navigate = useNavigate()
  const [uid, setUid] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importedCount, setImportedCount] = useState<number>(0)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\d{9,10}$/.test(uid.trim())) {
      setError(t('uid.invalid'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await fetchEnkaUid(uid.trim())
      setResult(r)
      // Snapshot store (for backwards compat)
      setMany(r.builds)
      // Write FULL CharacterConfig for each imported character — they show up
      // as "configured" in /characters with weapon + 5 artifact pieces filled.
      let n = 0
      for (const b of r.builds) {
        setImported(b.characterId, b.fullConfig)
        n++
      }
      setImportedCount(n)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('page.uid.title')}</h1>
        <p className="text-sm text-zinc-500 mt-2">{t('uid.hint')}</p>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 items-center max-w-md">
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{9,10}"
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder={t('uid.placeholder')}
          className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
        >
          {loading ? t('uid.loading') : t('uid.fetch')}
        </button>
      </form>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded px-3 py-2 max-w-md">
          {error}
        </div>
      )}

      {result && (
        <section className="space-y-4">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 bg-zinc-50 dark:bg-zinc-900">
            <div className="text-sm">
              <strong className="text-base">{result.playerName}</strong>
              <span className="text-zinc-500 ml-3">
                {t('uid.advRank')} {result.level} · {t('uid.worldLevel')} {result.worldLevel}
              </span>
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              UID {result.uid} ({result.region}) · {result.builds.length} {t('uid.charactersDisplayed')}
              {importedCount > 0 && (
                <span className="ml-2 text-emerald-700 dark:text-emerald-400">
                  · {t('uid.importedToConfigs').replace('{n}', String(importedCount))}
                </span>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium text-zinc-500 mb-3">{t('uid.clickToCalc')}</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {result.builds.map((b) => {
                const idx = getCharacterIndex(b.characterId)
                if (!idx) {
                  // Traveler (10000005/10000007) won't match without the -element suffix;
                  // just show a generic card and skip the navigation.
                  return (
                    <div
                      key={String(b.characterId)}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3"
                    >
                      <div className="font-medium">{t('uid.unmappedCharacter')} {b.characterId}</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        ATK {Math.round(b.finalAtk)} · HP {Math.round(b.finalHp)}
                      </div>
                    </div>
                  )
                }
                return (
                  <button
                    key={String(b.characterId)}
                    onClick={() => navigate(`/characters/${b.characterId}`)}
                    className="text-left rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                  >
                    <div className="flex items-center gap-3">
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
                          alt={idx.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {idx.name} · Lv.{b.characterLevel}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {Math.round(b.critRate)}/{Math.round(b.critDmg)} · {Math.round(b.finalAtk)} ATK
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <details className="text-xs text-zinc-500 max-w-2xl">
        <summary className="cursor-pointer">{t('uid.privacyNote')}</summary>
        <p className="mt-2">{t('uid.privacyDetail')}</p>
      </details>
    </div>
  )
}
