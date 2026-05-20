import { useT } from '@/i18n/store'

export default function Team() {
  const t = useT()
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('page.team.title')}</h1>
      <p className="mt-2 text-zinc-500">{t('placeholder.todo')}7</p>
    </div>
  )
}
