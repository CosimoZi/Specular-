import { Link } from 'react-router-dom'
import { iconUrl, listCharacters } from '@/data'
import { ELEMENT_COLOR } from '@/data/types'
import { useT } from '@/i18n/store'

export default function Home() {
  const t = useT()
  const all = listCharacters()
  const latest = all.slice(0, 12)
  const features = [
    { to: '/characters', title: t('feature.singleChar.title'), desc: t('feature.singleChar.desc') },
    { to: '/substat', title: t('feature.substat.title'), desc: t('feature.substat.desc') },
    { to: '/team', title: t('feature.team.title'), desc: t('feature.team.desc') },
    { to: '/uid', title: t('feature.uid.title'), desc: t('feature.uid.desc') },
  ]

  return (
    <div className="space-y-10">
      <section className="text-center py-10">
        <h1 className="text-4xl font-bold tracking-tight">{t('app.title')}</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">{t('app.tagline')}</p>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{t('app.subtagline')}</p>
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-500 mb-3">{t('home.features')}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {features.map((f) => (
            <Link
              key={f.to}
              to={f.to}
              className="block p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
            >
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-500 mb-3">
          {t('home.recentCharacters')}（{all.length} {t('home.charactersTotal')}）
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {latest.map((c) => (
            <Link
              key={c.id}
              to={`/characters/${c.id}`}
              className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 text-center hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
            >
              <div
                className="aspect-square rounded-md overflow-hidden mb-2"
                style={{
                  background: `linear-gradient(180deg, ${ELEMENT_COLOR[c.element] ?? '#888'}33, transparent)`,
                }}
              >
                <img
                  src={iconUrl(c.icon)}
                  alt={c.name}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </div>
              <div className="text-sm font-medium truncate">{c.name}</div>
              <div className="text-xs" style={{ color: ELEMENT_COLOR[c.element] ?? undefined }}>
                {t(`element.${c.element}`)} · {c.rank}★
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
