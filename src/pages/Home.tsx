import { Link } from 'react-router-dom'

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
  return (
    <div className="space-y-8">
      <section className="text-center py-10">
        <h1 className="text-4xl font-bold tracking-tight">Ysin</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          原神伤害计算 / 词条评估 / 配队模拟，全部跑在浏览器里。
        </p>
      </section>
      <section className="grid sm:grid-cols-2 gap-4">
        {features.map((f) => (
          <Link
            key={f.to}
            to={f.to}
            className="block p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
          >
            <h2 className="text-lg font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{f.desc}</p>
          </Link>
        ))}
      </section>
    </div>
  )
}
