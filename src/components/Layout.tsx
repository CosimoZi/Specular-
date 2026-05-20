import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: '首页', end: true },
  { to: '/characters', label: '角色' },
  { to: '/substat', label: '词条评估' },
  { to: '/team', label: '配队伤害' },
  { to: '/uid', label: 'UID 导入' },
]

export default function Layout() {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
          <NavLink to="/" className="text-lg font-semibold tracking-tight">
            Specular
          </NavLink>
          <nav className="flex gap-1 text-sm">
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
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 py-4 text-center">
        Specular · 原神镜中之像 · 数据来自{' '}
        <a className="underline hover:text-zinc-700 dark:hover:text-zinc-300" href="https://ambr.top" target="_blank" rel="noreferrer">
          ambr.top
        </a>
      </footer>
    </div>
  )
}
