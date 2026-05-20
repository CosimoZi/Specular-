import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DICT, type Locale } from './dict'

interface I18nState {
  locale: Locale
  setLocale: (l: Locale) => void
}

const browserLocale = (): Locale => {
  if (typeof navigator === 'undefined') return 'zh'
  const lang = navigator.language.toLowerCase()
  if (lang.startsWith('zh')) return 'zh'
  if (lang.startsWith('en')) return 'en'
  // URL override: ?lang=en
  if (typeof window !== 'undefined') {
    const qs = new URLSearchParams(window.location.search)
    const q = qs.get('lang')
    if (q === 'en' || q === 'zh') return q
  }
  return 'zh'
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      locale: browserLocale(),
      setLocale: (l) => set({ locale: l }),
    }),
    { name: 'specular-locale' },
  ),
)

/** Translation hook. Returns t(key, fallback?). */
export function useT() {
  const locale = useI18n((s) => s.locale)
  return (key: string, fallback?: string): string => {
    return DICT[locale][key] ?? DICT.zh[key] ?? fallback ?? key
  }
}

/** Non-hook accessor when you're already inside a component that uses useT
 *  for live updates; pass the t function down rather than calling this. */
export function tStatic(locale: Locale, key: string, fallback?: string): string {
  return DICT[locale][key] ?? DICT.zh[key] ?? fallback ?? key
}
