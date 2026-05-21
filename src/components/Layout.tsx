import { NavLink, Outlet } from 'react-router-dom'
import { useI18n, useT } from '@/i18n/store'
import { LOCALES, type Locale } from '@/i18n/dict'

export default function Layout() {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const setLocale = useI18n((s) => s.setLocale)

  const navItems: Array<{ to: string; key: string; end?: boolean }> = [
    { to: '/', key: 'nav.home', end: true },
    { to: '/characters', key: 'nav.characters' },
    { to: '/team', key: 'nav.team' },
    { to: '/uid', key: 'nav.uid' },
  ]

  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
          <NavLink to="/" className="text-lg font-semibold tracking-tight">
            {t('app.title')}
          </NavLink>
          <nav className="flex gap-1 text-sm flex-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md transition-colors ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
          </nav>
          <div className="flex gap-1 text-xs">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLocale(l.code as Locale)}
                className={`px-2 py-1 rounded-md transition-colors ${
                  locale === l.code
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 py-4 text-center space-x-3">
        <span>
          {t('app.footer')}{' '}
          <a
            className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
            href="https://ambr.top"
            target="_blank"
            rel="noreferrer"
          >
            ambr.top
          </a>
        </span>
        <NavLink to="/settings" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
          {t('nav.settings')}
        </NavLink>
      </footer>
    </div>
  )
}
