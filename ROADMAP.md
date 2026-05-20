# Specular Roadmap

按"对用户最有感"分阶段。每个 milestone 包含具体可验收项。

---

## ✅ Phase 0 — Bootstrap（已完成）

- [x] Vite + React 19 + TS 6 + Tailwind v4 工程骨架
- [x] 项目改名 ysin → Specular（指 specular image / 镜像 / 自省）
- [x] 从 ambr.top 抓 129 角色 / 246 武器 / 61 圣遗物全量数据
- [x] 按 id 切片到 `public/data/` 静态分发（避免主 bundle 爆炸）
- [x] 自动从天赋描述模板抽取倍率（`{paramN:format}` → 各级 multiplier 表）
- [x] 伤害引擎核心：聚合状态 / 直伤 / 蒸发 / 融化 / 激化 / 8 种剧变反应 / 防御抗性曲线（含负抗性分支）
- [x] 14 个 vitest 单测覆盖核心公式
- [x] `/characters` 浏览页 + `/characters/:id` 详情页 + 单角色伤害计算 UI
- [x] 每个 hit 的 scaling 现场覆盖（解决 HP/DEF/EM 倍率角色识别问题）
- [x] GitHub Actions 自动部署到 GitHub Pages

---

## 🔄 Phase 1 — 上线后的基础打磨

**目标**：让"分享给朋友看"不需要带注释。

### 1.1 i18n（中英双语）
- 引入 react-i18next（或更轻量的自研 dict）
- 提取所有 UI 字串到 zh-CN.json / en.json
- Header 加语言切换器，localStorage 持久化
- 默认 zh-CN，URL `?lang=en` 也能切

### 1.2 Scaling 自动修正
当前所有 hit 默认 `scaling=atk`，HP/DEF/EM 倍率角色（胡桃 / 那维莱特 / 夜兰 / 钟离 / 芙宁娜 / 阿尔贝多 / 心海 等）要手动改。改进：
- 检查 `talent.description` prose 里"生命值/防御力/精通"等中文 keywords，结合 hit label 推断
- 维护一份 `src/data/scaling-overrides.json` 收录 30~40 个 outlier
- 修了之后默认就对，下拉框只在 advanced 模式露出

### 1.3 旅行者 (id=10000005 / 10000007) 多元素变种
- meta 抽出来是 6 个 variant 文件（`-anemo` `-geo` `-electro` `-dendro` `-hydro` `-pyro`）
- 详情页要做元素切换 tab
- 目前 404，先 hide 起来或加占位

### 1.4 基础面板自动计算（替代手填）
当前要求用户手填 ATK / HP / DEF。改成：
- 角色等级 + 突破 + 武器选择（pick from list）+ 圣遗物词条 → 自动算面板
- 用 ambr 给的 `curve` + `addProps` + `initValue` + 等级成长曲线
- 曲线表（`GROW_CURVE_HP_S5` 等）需要硬编码或从 GenshinData 拉

---

## 📥 Phase 2 — UID 一键导入（"自省"主体验）

**目标**：用户输 UID → 看到自己的角色已配好装的伤害。

### 2.1 Enka.Network 接入
- `fetch('https://enka.network/api/uid/<uid>')` （CORS-friendly）
- 解析 playerInfo + avatarInfoList
- 把每个出展角色的 weapon / artifacts / props 映射到 Specular 的 Build 模型

### 2.2 圣遗物词条数字化
- Enka 返回的副词条是 `appendPropIdList`（id 数组），需查表展开成具体词条值
- 主词条 + 4pc set bonus 也要识别

### 2.3 UID Cache + 多角色 view
- localStorage 缓存（按 UID + timestamp，5 分钟 TTL）
- 一次拉回所有出展角色，UI 横向滑动选

### 2.4 隐私模式 / 错误处理
- 隐私 UID 提示"在 Hoyo 设置里开放角色展柜"
- 国际 / 国服分离的 UID 段（亚服 5xxx / 国服 1xxx 等）

---

## 🔥 Phase 3 — 圣遗物词条评估（marginal value）

**目标**：装备改一件 → 看到收益是 +X% 暴击 → +Y% 伤害。

### 3.1 边际收益矩阵
- 给定 Build，对每条副词条（CR/CD/ATK%/HP%/EM/ER）做一阶差分
- 每条算"+1 滚点的伤害提升"绝对值 + 百分比
- 列表按收益从高到低排

### 3.2 月反应专用公式（接入 lunar-reaction skill）
- 月感电 / 月绽放 / 月结晶：双暴乘区、有反应增伤独立项、HP/ATK 直伤独立
- 这部分逻辑跟 [[anthropic-skills:lunar-reaction-artifact-analysis]] 同源，写一个 `src/engine/lunar.ts`
- UI 上自动识别月反应角色（菲林斯等纳塔人物），切换到专用界面

### 3.3 圣遗物有效词条数（评分）
- 5 颗圣遗物总有效词条数（按主属性需求权重）
- 跟"理论上限"对比，显示进度条
- 单件评分 + 整体评分

---

## 🤝 Phase 4 — 配队总伤害

**目标**：4 人队 → 一个轮转周期内的 DPS。

### 4.1 Buff 传递模型
- 班尼特 Q 给队友 +ATK
- 芙宁娜 Q 给队友 %DMG
- 卡齐娜 / 希诺宁 / 玛薇卡 的纳塔机制
- 共鸣（火共鸣 +25% ATK, 水共鸣 +25% HP, …）
- 圣遗物 4pc 跨队友效果（千岩、绒花、苍古、深林等）

### 4.2 轮转编辑器
- 时间轴 UI：每个角色的 N/E/Q 排序
- 计算总 DPS = 周期内总伤害 / 周期时长
- 能量充能模型（70+% 充能效率才能合理轮转）

### 4.3 反应链
- 主 C 触发反应时，其他元素留在敌人身上的 aura 如何影响
- 协同反应（绽放 → 超绽放）的额外触发

---

## 🌍 Phase 5 — 内容扩展 + 社区

### 5.1 数据更新自动化
- 每周 cron 工作流：跑 `pnpm run data` → 比对 diff → 自动提 PR
- 新角色出来当天网站就有

### 5.2 武器 / 圣遗物效果引擎化
- 当前武器精炼效果是文字描述，没"激活"
- 给每把 5* 武器写 effect plugin（"4 层叠加 +X% 攻击力"）
- 同样圣遗物 4pc 也写 plugin

### 5.3 命之座效果引擎化
- C1-C6 数值化（提升X级、+Y%、解锁特殊命中）
- UI 显示当前 C 影响的具体伤害变化

### 5.4 用户配置导出 / 导入
- 把当前 build 编码到 URL 或 JSON
- 分享朋友"看我这套配的伤害"

### 5.5 Mobile UX
- 当前布局是桌面优先
- 角色详情页面板需要 collapsible
- 手指友好的数字输入（步进按钮、长按加速）

---

## 🛠 Phase 6 — 工程化收尾

### 6.1 路由切回 BrowserRouter
- 当前用 HashRouter 是为了快速上 GH Pages
- 加 404.html 跳转技巧 → 切到 BrowserRouter 拿到 pretty URL

### 6.2 性能
- meta 文件按需 lazy import
- 角色图标 CDN preconnect
- bundle 分析，目标主 bundle < 200 KB gzip

### 6.3 测试覆盖
- 给 5-10 个代表性角色（每种 scaling 一个、每种反应一个）写 e2e 测试
- 引擎覆盖率到 80%+

### 6.4 文档
- CONTRIBUTING.md：怎么修 scaling 错误、加新角色覆写
- ARCHITECTURE.md：data pipeline / engine / UI 三层关系

---

## 暂时不做的事

- 自带账号系统（旧版用 uni-id-pages，需要后端；我们走纯静态）
- 深渊上传 / 历史记录（同上）
- 攻略 / wiki 类内容（保留给 ambr 自己）
- 移动端 native app
