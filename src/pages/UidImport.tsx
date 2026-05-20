import { useT } from '@/i18n/store'

export default function UidImport() {
  const t = useT()
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('page.uid.title')}</h1>
      <p className="mt-2 text-zinc-500">{t('placeholder.todo')}6</p>
    </div>
  )
}
