import { Link } from 'react-router-dom'
import {
  iconUrl,
  listCharacters,
} from '@/data'
import { ELEMENT_COLOR, ELEMENT_LABEL } from '@/data/types'

const features = [
  {
    to: '/calc',
    title: '单角色伤害计算',
    desc: '输入面板 + 圣遗物 + 武器 + 天赋等级，查看每个技能的预期伤害与暴击/期望伤害。',
  },
  {
    to: '/substat',
    title: '圣遗物词条评估',
    desc: '基于你的角色配置，给出每条副词条的边际收益排序。月反应角色支持月感电/月绽放/月结晶专用公式。',
  },
  {
    to: '/team',
    title: '配队总伤害',
    desc: '最多 4 人配队，模拟一个轮转周期内的总输出，自动考虑共鸣、增益、减抗。',
  },
  {
    to: '/uid',
    title: 'UID 一键导入',
    desc: '通过 Enka.Network 公开 API 拉取你的角色面板与圣遗物，直接喂给计算器。',
  },
]

export default function Home() {
  const latest = listCharacters().slice(0, 12)
  return (
    <div className="space-y-10">
      <section className="text-center py-10">
        <h1 className="text-4xl font-bold tracking-tight">Specular</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          把你的角色看作镜中的他者 — 伤害计算 / 词条评估 / 配队模拟。
        </p>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          spec·u·lar · 镜的、反射的 · 出自拉康的 <em>specular image</em>
        </p>
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-500 mb-3">功能</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {features.map((f) => (
            <Link
              key={f.to}
              to={f.to}
              className="block p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
            >
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {f.desc}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-500 mb-3">
          最新角色（{listCharacters().length} 名收录）
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {latest.map((c) => (
            <div
              key={c.id}
              className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 text-center"
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
              <div
                className="text-xs"
                style={{ color: ELEMENT_COLOR[c.element] ?? undefined }}
              >
                {ELEMENT_LABEL[c.element] ?? c.element} · {c.rank}★
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
