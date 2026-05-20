import { Link } from 'react-router-dom'
import { useT } from '@/i18n/store'

export default function Substat() {
  const t = useT()
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">{t('page.substat.title')}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t('substatPage.movedNotice')}
      </p>
      <Link
        to="/characters"
        className="inline-block px-4 py-2 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        {t('substatPage.goToCharacters')}
      </Link>
    </div>
  )
}
