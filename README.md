# Specular

原神（Genshin Impact）伤害计算 / 圣遗物词条评估 / 配队模拟，跑在浏览器里。

> *spec·u·lar* · 镜的、反射的 · 拉康 *Écrits* 里的 specular image — 镜像阶段中
> 婴儿在镜里第一次识别出"我"的那个形象。把自己的角色面板喂进来计算，本身就是
> 一种自省：你看到的不是你，是你作为他者的样子。

灵感来自 [ufoda0304 的旧版计算器](https://github.com/ufoda0304/ufoda0304.github.io)。

## 现在能做什么

- **角色浏览**：129 名角色，按元素 / 星级 / 武器 / 名字搜索过滤
- **单角色伤害计算**：每个技能按 Hit 拆开，自动用 ambr.top 的天赋倍率表，输入面板 + 反应即时算非暴击 / 暴击 / 期望
- **5 种反应**：直伤、蒸发（强/弱）、融化（强/弱）、超激化、蔓激化
- **8 种剧变反应内核**：超载、扩散、超绽放、绽放、烈绽、雷电、超导、碎冰、燃烧
- **HP / 防御 / 精通 加成倍率角色**：每个 hit 有 scaling 下拉框可现场覆盖

## 开发

需要 Node 22 LTS + pnpm 11。

```bash
pnpm install
pnpm run data       # 抓 ambr.top 数据 (~3 min, 一次性)
pnpm run dev        # 本地 dev server
pnpm run build      # 生产构建
pnpm test           # 跑伤害引擎单元测试
```

## 数据来源

- 角色 / 武器 / 圣遗物：[gi.yatta.moe (Project Amber / ambr.top)](https://gi.yatta.moe)
- 反应公式 / 等级倍率表：KQM / 提瓦特小酒馆社区文献
- UID 玩家面板：[Enka.Network](https://enka.network) 公开 API（待接入）

## 长期规划

见 [ROADMAP.md](./ROADMAP.md)。

## License

MIT (待加 LICENSE 文件)
