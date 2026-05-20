import { useT } from '@/i18n/store'

export default function Substat() {
  const t = useT()
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('page.substat.title')}</h1>
      <p className="mt-2 text-zinc-500">{t('placeholder.todo')}5</p>
    </div>
  )
}
