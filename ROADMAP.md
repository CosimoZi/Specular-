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

## ✅ Phase 1 — 上线后的基础打磨

**目标**：让"分享给朋友看"不需要带注释。

### 1.1 i18n（中英双语）✅
- 自研 dict（zh-CN / EN），约 200 字串
- Header 切换器 + Zustand persist 到 localStorage
- `navigator.language` 自动检测；URL `?lang=en` 覆盖

### 1.2 Scaling 自动修正 ✅（部分）
- `src/data/scaling-overrides.ts` 收录 10 个明确的 HP/DEF 倍率角色（胡桃、夜兰、那维莱特、钟离、芙宁娜、阿贝多、诺艾尔、迪希雅、莱依拉、妮露）
- 在 `loadCharacterMeta` 中运行时 merge
- 用户仍可在 UI 现场覆盖
- TODO: 扩到 ~30 个 outlier，加 EM-scaling 识别

### 1.3 旅行者多元素变种 ✅
- 12 个 variant（6 元素 × 2 性别）已在网格显示，按 `id-element` 路由
- 名字标 `·空 / ·荧` 区分双胞胎
- 排序按 id 数字前缀以保持顺序稳定

### 1.4 基础面板自动计算 ✅
- `src/engine/stat-curves.ts` 硬编码 S5/S4 曲线（lvl 1→90 多点插值）
- `src/data/character-stats.ts` 从 ambr 的 `initValue` + `addProps` + 曲线算 base
- 突破属性（CR/CD/ATK%/HP% 等）自动加入聚合
- 仍可用「手动覆盖面板」开关切换
- TODO: 武器 picker、武器成长曲线、武器副词条

---

## ✅ Phase 2 — UID 一键导入（"自省"主体验）

**目标**：用户输 UID → 看到自己的角色已配好装的伤害。

### 2.1 Enka.Network 接入 ✅
- 浏览器直接 fetch enka.network/api/uid/<uid>（CORS OK）
- 解析 `fightPropMap` → final HP/ATK/DEF/CR/CD/EM/ER/elemDmg
- localStorage 缓存 5 分钟
- 错误码处理：404 / 424（无展柜）/ 429（rate-limit）

### 2.2 跨页 store + 自动 pre-fill ✅
- Zustand store `useImportedBuilds`
- 点击 UID 页角色卡 → 跳转角色详情页 → useEffect 自动填面板
- `manualBase` 切换开关，避免 ascension 双重计算

### 2.3 武器 / 圣遗物明细 TODO
- Enka 也返回每件圣遗物的主词条 + 副词条 id 列表
- 解码副词条值（21 种主词条 + 10 种副词条 × 多档值）
- UI 单独展示"装备列表" tab

---

## ✅ Phase 3 — 圣遗物词条评估（marginal value）

**目标**：装备改一件 → 看到收益是 +X% 暴击 → +Y% 伤害。

### 3.1 边际收益矩阵 ✅
- 10 种副词条（CR/CD/ATK%/HP%/DEF%/EM/ER%/flat ATK/flat HP/flat DEF）
- 每条 +1 max roll 后重算总伤害 → 绝对/百分比增幅
- 横向条形图按收益排序，绿色 = 正收益
- 集成在角色详情页的伤害表下方

### 3.2 月反应专用公式 TODO
- 月感电 / 月绽放 / 月结晶：双暴乘区、有反应增伤独立项、HP/ATK 直伤独立
- 写 `src/engine/lunar.ts`，对接 lunar-reaction-artifact-analysis skill
- UI 识别月反应角色（菲林斯等）自动切换专用界面

### 3.3 圣遗物有效词条数（评分）TODO
- 5 颗圣遗物总有效词条数（按主属性需求权重）
- 跟"理论上限"对比，进度条
- 单件评分 + 整体评分

---

## ✅ Phase 4 — 配队总伤害（v1 完成）

**目标**：4 人队 → 一个轮转周期内的 DPS。

### v1 已交付：
- 4 个角色 slot + 模态选择器
- 每个 slot 显示最终面板（ATK/HP/CR/CD）+ 最高单击 + 总伤
- 团队总伤 = 各角色单算的总和
- 接入 UID 导入的 build（标有"UID"徽章）

### 4.1 Buff 传递模型 TODO
- 班尼特 Q 给队友 +ATK
- 芙宁娜 Q 给队友 %DMG
- 卡齐娜 / 希诺宁 / 玛薇卡 的纳塔机制
- 共鸣（火共鸣 +25% ATK, 水共鸣 +25% HP, …）
- 圣遗物 4pc 跨队友效果（千岩、绒花、苍古、深林等）

### 4.2 轮转编辑器 TODO
- 时间轴 UI：每个角色的 N/E/Q 排序
- 计算总 DPS = 周期内总伤害 / 周期时长
- 能量充能模型（70+% 充能效率才能合理轮转）

### 4.3 反应链 TODO
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
