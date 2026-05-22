# Implementation Queue

> `/next` reads this file and implements the FIRST item with status 📋.
> Edit freely: reorder items, change status, add/remove. Don't break the format.
>
> **Format (strict):** `- <status> \`<Key>\` — 中文名 — 元素/类型 — 备注`
> The /next skill greps `^- 📋 ` and parses the backtick'd key.
>
> **Status codes:**
> - 📋 = TODO (next pick)
> - 🚧 = in progress (skip — was picked but not finished)
> - ✅ = done
> - 🚫 = skipped (with reason in 备注)
>
> **Ordering:** top = next priority. Drag entries up to bump priority.
> Move 📋 → top of its section to make `/next` pick it next.
>
> **One item per /next invocation.** Don't try to batch.

---

## 引擎工程 (最高优先 — 这一段做完再做角色/武器/圣遗物)

> 这些是已知会让现有 sheet 算不对、或挡住后续角色实装的引擎洞。
> 每一项的 备注 是 self-contained 实现规格 (没有 vendor 源, 全靠这里描述)。
> /next 会按顺序选一个做掉, 完成后 typecheck, 标 ✅, 停。

### 阻塞已实装角色的正确性
- ✅ `cross-char-moon-flat` — 跨角色月反应 flat 加成传播 — **实装方式**: 复用已有的 `premod.dmgIncReaction.<reaction>` 槽 (formula.ts 已读), 在 sheet-types.ts 加 `CharacterSheet.applyAsTeammate?` hook (镜像圣遗物), build.ts Phase 8.4 dispatch 非焦点队员的 hook. Linnea C1 + A4 EM 通过 hook 传到 focus scope. Linnea-as-focus 自己仍走 formula 的 inline `flat:` 字段, 不重复. **后续待办**: Columbina A6, Aino A4, Flins/Ineffa A4 各自 sheet 实装 applyAsTeammate (本 engine 工程已完成, 剩下的只是 sheet 层调用)
- ✅ `per-reaction-dmg-boost-split` — 月反应 _dmg_ 增伤槽位拆分 — **实装**: formula.ts 改为 sum(per-reaction-specific + catch-all). 新增 3 个 scope key: `premod.lunarchargedDmgBoost` / `lunarbloomDmgBoost` / `lunarcrystallizeDmgBoost`. 旧 `premod.moonReactionDmgBoost` 保留为通用槽 (Aubade/SilkenMoons/NoSU 4pc/Aino C6/Columbina burst 仍用 — 它们的 vendor 实现就是 5 个 per-reaction 同值, 用 catch-all 等效). 迁移 6 处特定 reaction 写入到细分槽: Ineffa.ts (C1 月感电) + Ineffa-formulas.ts (C1 护盾 月感电) + Flins.ts (A1 月兆满辉 月感电) + Lauma-formulas.ts (C2 月绽放) + Zibai-formulas.ts (×2: stride premod / C2 月转时隙 月结晶). breakdown 拆成两行 "X反应专属增伤" + "月反应通用增伤". **副作用**: 之前混队 (e.g. Ineffa + Zibai) 时, Ineffa A1 +20% 月感电会污染 Zibai 月结晶的数字; 现在隔离了
- ✅ `per-element-cdmg-routing` — per-element CDmg buff routing 端到端 — **审查结果**: formula.ts 读 final.critDMG_.<ele> ✓, build.ts 543-548 sum premod.critDMG_.<ele> ✓, Columbina C6 + Lauma A1 已正确写 per-element. **修了两处**: (1) Linnea C2 月笼谐奏 之前写 `premod.critDMG_` (全局), 现在改成 `premod.critDMG_.hydro` + `.geo` (per-element, 不再误污染 Linnea 物理普攻); 同时加 Linnea.applyAsTeammate 把 C2 跨角色传给场上 hydro/geo 角色. (2) Columbina C6 之前 hydro CDmg 累加 (3 个 cond 同时开 → +240%), 改成 vendor 正确的 `greaterEq(sum, 1, X)` 单触发逻辑; 同时加 Columbina.applyAsTeammate 把 4 个 per-element CDmg 传给焦点. **遗留 engine-gap**: Columbina Q burstDomain + per-reaction _specialDmg_ 也是 teamBuff 但走 formula-buffs path, 跨角色没传 — 需要新 engine 项 (formula-buffs 也要 applyAsTeammate)
- ✅ `formula-buffs-cross-char` — formula-level buff 跨角色传播 — **实装方式**: 不需要新 hook, 复用现有 `CharacterSheet.applyAsTeammate`. 把 team-scoped 月反应 buff 直接写在 applyAsTeammate 里, 用 `wearer.finalDef` / `finalHp` / `talents.burst` 等 panel snapshot 数据. **本次落地 2 个角色**: (1) Linnea: passive3 (DEF→base boost) + C6 (moonFull→crystallize elevation 25%) (2) Columbina: A6 (HP→base boost) + C1-C6 累加 elevation + Q 月之领域 (burst talent level → dmgBoost). **后续待办**: 同模式应用到其他 8 个月反应角色 — 见下方新 queue 项 `moon-char-formula-buffs-teammate-port`
- ✅ `moon-char-formula-buffs-teammate-port` — 处理了 5/8 个角色 — **完成**: Aino (C1 active EM + C6 月反应 dmgBoost), Flins (passive3 ATK→base boost + C6 team elevation), Ineffa (passive3 ATK→base + A4 active EM + C1 dmgBoost), Nefer (A6 EM→base, C4 RES shred 已早期 wire), Zibai (passive3 DEF→base + C2 lunarcrystallizeDmgBoost). 每个 vendor 核对过 teamBuff 段, 只搬真正 team-scoped 部分. **vendor 修正**: Nefer C6 在 `premod` (SELF), 不是 teamBuff — self path 已对, 不需要 propagate. **剩 3 个未处理 (Lauma 复杂, Illuga + Jahoda 待审)**, 见新 queue 项 `lauma-illuga-jahoda-teammate-port`
- ✅ `lauma-teammate-port` — **实装 (月反应部分)**: A6 EM→base boost, A1 lunarbloom CR/CD (条件), C2 lunarbloom dmgInc EM-flat, C2 lunarbloomDmgBoost (moonFull), Q burstPaleHymn EM-flat, C6 elevation (moonFull). **延后两块**: (1) 普通 bloom/hyperbloom/burgeon 变体 (dmgInc + per-reaction CR/CD) — 等 transformative-reactions 引擎; (2) hydro/dendro RES shred — 需 build.ts 加 dispatcher (新 queue 项 `lauma-skill-res-shred`)
- ✅ `illuga-teammate-port` — **实装**: Illuga.applyAsTeammate 加 6 项 team buff. (1) A1 geo CR/CD (5/10% 或 C6 10/30%) — per-element 槽; (2) A1 gleam +50/80 EM (moonFull 门); (3) Q burstSong geo_dmgInc EM-flat (burst talent 等级查表); (4) Q burstSong lunarcrystallize_directDmgInc EM-flat; (5) A4 hydroGeoCount 系数 → 同 2 个槽追加; (6) C4 c4BurstActive +200 DEF. **Bug fix**: 之前 apply() 把 A1 CR/CD/EM 写到自己 scope (错), vendor 用 `unequal(target.charKey, key)` 排除 Illuga 自身, 改正后 self 不再吃 A1 (vendor 一致). **新 cond**: c4BurstActive (旧版漏了). buff-sources 补 C4 descriptor
- ✅ `jahoda-teammate-port` — **实装**: A4 +100 EM (active-char gated, fires for any focus when cond on) + C6 +5% CR / +40% CD (gated on focus is moonsign char). **副产品**: 加了 `focus.isMoonsign` scope key (build.ts 维护 MOONSIGN_KEYS set, 启动时设置), 给后续类似 vendor `equal(target.isMoonsign, 1, ...)` gates 用
- ✅ `lauma-skill-res-shred` — **实装**: skillAfterHit cond + `laumaSkillResShred(scope, condState)` 读 skill[7] 表 (lv1 2.5% → lv15 40%, C5 +3 levels). build.ts Lauma 分支同时给 enemy.preRes.hydro 和 .dendro 减. buff-sources LAUMA_BUFFS 加 descriptor. **同 Flins/Linnea/Nefer 的旧 RES shred dispatch 都有同一个限制**: 只在 char 是焦点时 fire, vendor 实际是 teamBuff — 见新 queue 项 `teammate-side-res-shred`
- ✅ `teammate-side-res-shred` — **实装**: 统一 RES-shred 函数签名 `(ResShredCtx, CondState) => Record<element, amount>` (`ResShredCtx` 加在 sheet-types.ts). 6 个角色的 shred fn (`shenheQResShred` / `linneaA1GeoResShred` / `flinsC2ElectroResShred` / `neferC4DendroResShred` / `xingqiuC2HydroResShred` / `laumaSkillResShred`) 全部重写为常量+新签名. build.ts 加 `CHAR_RES_SHRED` 注册表, 替换 6 处 if-else dispatch 为统一循环: 焦点用 config 数据构 ctx, 队友用各自的 TeamPanelSnapshot 构 ctx; 多角色减同元素自动累加. **修了重大 bug**: 之前任何 shred 角色当后台时都不减抗
- ✅ `transformative-reactions` — **实装**: reaction-base.ts 加 `TransformativeReactionType` (overload/superconduct/electrocharged/swirl/shatter/burning) + `TRANSFORMATIVE_REACTION_COEFF` (2.0/0.5/1.2/0.6/1.5/0.25) + `TRANSFORMATIVE_REACTION_ELEMENT` 映射. formula.ts 加 `FormulaKind = 'transformative'` 分支: base = levelBase × coeff, dmgBonus = 1 + (16×EM)/(EM+2000) + 反应专属/通用 dmgBoost, defMulti = 1, **不可暴击**. 新增 scope keys: `premod.<reaction>DmgBoost` + `premod.transformativeReactionDmgBoost` (catch-all). FormulaDef 加 `transformativeReaction?` 字段. **后续待办**: 角色 sheets 加 transformative formulas (e.g. Sucrose A4 swirl, 万叶 Q swirl) — sheet-level wire-up. **VV 4pc 修了**: 4pc +60% 扩散增伤现在通过 `premod.swirlDmgBoost` 正确建模, 不再是"engine 未建模"
- ✅ `amplifying-reactions` — **实装**: FormulaDef 加 `amplifyReaction?: { kind: 'vaporize' | 'melt', multiplier: 1.5 | 2.0 }`. formula.ts 标准 kind 后加增幅乘区: `amplifyMult = baseCoef × (1 + (25/9 × EM)/(EM + 1400) + specific + catchAll)`. 新 FormulaBreakdown.amplify 字段(可选, 仅有 amplifyReaction 时出现). 新 scope keys: `premod.vaporizeDmgBoost` / `meltDmgBoost` / `amplifyReactionDmgBoost`. **CrimsonWitchOfFlames 4pc 修了**: +40% overload/burning + +15% vaporize/melt 现在通过 transformative + amplify 槽正确建模. **后续待办**: 加 angle "forward vs reverse" 让 sheet 在 N1/Q 等里直接标 amplifyReaction(sheet-level wire-up, 不在引擎范围)
- ✅ `aggravate-spread` — **实装**: reaction-base.ts 加 `QuickenReactionType` + `QUICKEN_REACTION_COEFF` (aggravate=1.15, spread=1.25). FormulaDef 加 `quickenReaction?: 'aggravate' | 'spread'`. formula.ts 标准 kind 的 base zone 内加 quickenFlat = levelBase × baseCoef × (1 + 5×EM/(EM+1200) + 反应专属增伤 + 通用增伤), 然后 += baseTotal. 新 scope keys: `premod.aggravateDmgBoost` / `spreadDmgBoost` / `quickenReactionDmgBoost`. 激化 flat 在 base zone 内, 所以同样吃 dmgBonus / crit / def / res (符合游戏规则). **后续待办**: 各角色 char-formulas.ts 给雷/草直伤标 `quickenReaction` (sheet-level wire-up)

### 中优 (UX / 准确性)
- ✅ `auto-tally-element` — **大部分本来就有**: build.ts 早就从 `teamElementCount` (team-adapter.ts 算的) populate `team.tally.<ele>` 槽. Zibai A4 + Illuga A4 已经在用. **本次补的**: (1) `focus.element.<ele>` 槽 (build.ts 启动时根据 focus goKey 查 vendor 设); (2) GildedDreams 4pc 改自动: 读 focus.element + team.tally.<ele> 算同/异元素人数, 用户 cond 仅作 override fallback. typecheck OK
- ✅ `auto-tally-moonsign` — **实装**: (1) team-adapter.ts 算 `teamMoonsignCount`, 通过 BuildOpts 传给 build.ts. (2) build.ts MOONSIGN_KEYS 改 `export`, scope.set('tally.moonsign', n). (3) **关键设计选择**: 没用 `isMoonFull(scope, condState)` helper 重写 25 处调用点; 改成 build.ts startup 时 clone+auto-fill condState — 当 teamMoonsignCount>=2 时, 给 MOON_FULL_AUTOFILL_KEYS 里的所有 sheet (10 月相角色 + 3 月相套装) 自动写 `moonFull = 1`. 现有 25 处 `condState.X?.moonFull` 调用零修改自动吃到. 用户手设的 moonFull=1 还是 force-on. 不可 force-off (但 condState 没"显式 0"区分, 这是预期妥协). typecheck OK
- ✅ `char-apply-as-teammate-hook` — **实装 + 修了一个 bug**: 把 build.ts 的 `applyTeammateBuff` switch-dispatch (Linnea/Columbina/Bennett/Xiangling 四个 case) 全部迁移到各自的 `CharacterSheet.applyAsTeammate`. Bennett 新加 hook (Q 场 ATK + C6 +15% pyro), Xiangling 新加 hook (A4 +10% ATK + C6 +15% pyro), Columbina 扩展现有 hook (加 C2 per-reaction). Linnea legacy unconditional A4 EM 删了 (重复了 applyAsTeammate 的 gated 版, 之前是 double-counted bug). Xiangling C1 pyro RES shred 加进 CHAR_RES_SHRED. build.ts 的 `applyTeammateBuff` 函数整个删除. **Bennett-as-focus 也补了 self 路径**: 站在自己的 Q 场内时 (cond `activeInArea`), 也吃 ATK buff (之前只在 teammate 路径写)
- ✅ `element-infusion-slot` — **实装**: FormulaDef 加可选 `elementOverride?: { gate: Node, element: ElementKey }`. formula.ts 在 evaluateFormula 顶端解析 `resolvedElement` (`gate` AST 非零 → 用 `elementOverride.element`, 否则 `def.element`). 所有 element-keyed reads (per-element CR/CD, RES, dmgBonus, per-element flat-add) 用 `resolvedElement`. FormulaResult.element 也 report resolved 值, UI 标签自动正确. **未做(sheet-level wire-up)**: Bennett C6 normals 加 `elementOverride: { gate: ifGE(constellation, 6, ifOn(activeInArea, 1, 0), 0), element: 'pyro' }`; Flins 月转时隙 N/C 改电; Chongyun E 冰附魔 — 都需要在 char-formulas.ts 给具体 formula 加字段

### 低优 / 大改
- ✅ `type1-type2-conversion-partition` — **MVP 实装(引擎层)**: build.ts Phase 11/12 加 `final.{atk,hp,def,eleMas}.preconverted` 槽位 — 等于 `final.X − premod.X.converted`. 现有 `scope.add('premod.X', ...)` 写入保持 Type 2 语义(默认全计入 final.X). 新 Type 1 源需 ALSO write `premod.X.converted` (相同数值, 把它从 preconverted 中扣除). **MVP 含义**: 没改任何 sheet, 当前所有 Type 1 源 (莉奈娅 A4 DEF→EM, Ineffa A4 ATK→EM 等) 仍写 plain `premod.X` (Type 2 语义). 因为目前没有同队两个 EM 转化器, 数字不变. **后续待办**: 单独 queue 项给现有 Type 1 源迁移到 `.converted` 槽并改读 `final.X.preconverted` (`type1-source-migration`)
- 📋 `type1-source-migration` — 把现有 Type 1 转模源迁移到 partition 系统. 列表: Linnea A4 (DEF→EM, applyAsTeammate 里读 `wearer.finalDef`, 改读 wearer 端 preconverted? 或者改成显式 Type 1 标记), Ineffa A4 (ATK→EM, same), Bennett Q (base.atk×ratio→ATK flat, base.atk 本来就不被转化所以是 Type 2 safe), Columbina C2 per-reaction (HP→ATK/EM/DEF cross-char). 每个源加 `scope.add('premod.X.converted', sameValue, ...)` 配对的二次写入. 也需考虑 TeamPanelSnapshot 是否需要暴露 `finalDef.preconverted` 等. **不阻塞**: 只在多个 Type 1 转化器同队 + 同 destination stat 时才出现差异. 当前游戏中常见配置无此场景.
- 📋 `heal-shield-calc` — 治疗 / 护盾量计算 — 完全未建模, 当前 Linnea Q / Bennett Q 治疗、所有治疗角色 burst 都没数字; 新增 FormulaKind `'heal' | 'shield'`, 公式: base = stat × mult + flat, 输出量 = base × (1 + heal_/shield_); 大改但独立, 不影响伤害链
- 📋 `defense-shred-cap` — 防御穿透 / 降低上限校验 — 公式已正确 (1-穿透)×(1-降低), 但缺 0/1 clamp 之外的 unit-test; 加 vitest 覆盖 50% × 50% = 25% 等 edge case, 防止以后 regression
- 📋 `reaction-vs-element-RES` — 反应伤害的抗性归属审查 — 月反应当前用 `def.element` 查 enemy.preRes, 但实际上某些反应 (e.g. 月感电是雷, 月绽放是草, 月结晶吃岩或主属性? 待校), 不一定吃 attacker 的元素抗性; 审 formula.ts 反应分支 + 对比 vendor reaction.ts

---

## 角色

### 5★ — 高优先 (主流/强力)
- 📋 `Furina` — 芙宁娜 — 水 单手剑 — HP scaling, fanfare 层数, 全队 +DMG buff
- 📋 `Neuvillette` — 那维莱特 — 水 法器 — HP scaling, 重击+水滴, 直伤大佬
- 📋 `HuTao` — 胡桃 — 火 长柄 — HP scaling, 跳健康 + 火附魔
- 📋 `KaedeharaKazuha` — 枫原万叶 — 风 单手剑 — EM → 元素增伤 + 减抗
- 📋 `Nahida` — 纳西妲 — 草 法器 — EM scaling, 团队 EM buff
- 📋 `Xilonen` — 希诺宁 — 岩 单手剑 — 全元素减抗 + 防御 scaling
- 📋 `RaidenShogun` — 雷电将军 — 雷 长柄 — ER → 攻击, Q 充能型
- 📋 `Arlecchino` — 阿蕾奇诺 — 火 长柄 — 红死契约, 普攻型
- 📋 `KamisatoAyaka` — 神里绫华 — 冰 单手剑 — 冻结/超绽放
- 📋 `Ganyu` — 甘雨 — 冰 弓 — 重击霜花
- 📋 `Mavuika` — 玛薇卡 — 火 双手剑 — 战意/Nightsoul
- 📋 `Citlali` — 茜特菈莉 — 冰 法器 — 减抗副C
- 📋 `Wriothesley` — 莱欧斯利 — 冰 法器 — HP, 拳法状态

### 5★ — 标准/老牌
- 📋 `Mualani` — 玛拉妮 — 水 法器 — HP scaling, Nightsoul
- 📋 `Lyney` — 林尼 — 火 弓 — HP, 重击
- 📋 `Yelan` — 夜兰 — 水 弓 — HP, 副C
- 📋 `Tartaglia` — 达达利亚 — 水 弓 — 远近双形态
- 📋 `Zhongli` — 钟离 — 岩 长柄 — HP, 减抗主辅
- 📋 `Xiao` — 魈 — 风 长柄 — Q 高频 plunge
- 📋 `Wanderer` — 流浪者 — 风 法器 — ATK, 飞行普攻
- 📋 `KamisatoAyato` — 神里绫人 — 水 单手剑 — HP, 普攻型
- 📋 `Cyno` — 赛诺 — 雷 长柄 — Q 后白天形态
- 📋 `Alhaitham` — 艾尔海森 — 草 单手剑 — 镜像, EM 转伤
- 📋 `Clorinde` — 克洛琳德 — 雷 单手剑 — 法器形态
- 📋 `Skirk` — 丝柯克 — 冰 单手剑 — 深渊形态
- 📋 `Chiori` — 千织 — 岩 单手剑 — 召物
- 📋 `Navia` — 娜维娅 — 岩 双手剑 — 散弹
- 📋 `Sigewinne` — 希格雯 — 水 弓 — 治疗+DPS
- 📋 `Emilie` — 艾梅莉埃 — 草 长柄 — 焚烧反应
- 📋 `Kinich` — 基尼奇 — 草 双手剑 — Nightsoul, 钩
- 📋 `Chasca` — 恰斯卡 — 风 弓 — 多元素弹
- 📋 `Xianyun` — 闲云 — 风 法器 — plunge support
- 📋 `Varesa` — 瓦雷莎 — 雷 双手剑 — Nightsoul, plunge
- 📋 `YumemizukiMizuki` — 梦见月瑞希 — 风 法器 — 梦境
- 📋 `Escoffier` — 爱可菲 — 冰 长柄 — 减冰抗

### 5★ — 老一代
- 📋 `Diluc` — 迪卢克 — 火 双手剑
- 📋 `Klee` — 可莉 — 火 法器
- 📋 `Mona` — 莫娜 — 水 法器
- 📋 `Venti` — 温迪 — 风 弓
- 📋 `Qiqi` — 七七 — 冰 单手剑
- 📋 `Albedo` — 阿贝多 — 岩 单手剑 — DEF scaling
- 📋 `Jean` — 琴 — 风 单手剑
- 📋 `Keqing` — 刻晴 — 雷 单手剑
- 📋 `Eula` — 优菈 — 冰 双手剑 — 物理
- 📋 `AratakiItto` — 荒泷一斗 — 岩 双手剑 — DEF scaling
- 📋 `YaeMiko` — 八重神子 — 雷 法器
- 📋 `Yoimiya` — 宵宫 — 火 弓 — 普攻型
- 📋 `SangonomiyaKokomi` — 珊瑚宫心海 — 水 法器 — HP
- 📋 `Nilou` — 妮露 — 水 单手剑 — HP, 丰穰之核
- 📋 `Baizhu` — 白术 — 草 法器 — HP, 治疗
- 📋 `Tighnari` — 提纳里 — 草 弓 — 重击
- 📋 `Dehya` — 迪希雅 — 火 双手剑 — HP

### 5★ — 跳过
- 🚫 `Aloy` — 埃洛伊 — 冰 弓 — 免费角, 无命座, 性能弱

### 月相人物 (已实装)
- ✅ `Shenhe` — 申鹤
- ✅ `Linnea` — 莉奈娅
- ✅ `Zibai` — 兹白
- ✅ `Columbina` — 哥伦比娅
- ✅ `Illuga` — 叶洛亚
- ✅ `Aino` — 爱诺
- ✅ `Flins` — 菲林斯
- ✅ `Ineffa` — 伊涅芙
- ✅ `Jahoda` — 雅珂达
- ✅ `Lauma` — 菈乌玛
- ✅ `Nefer` — 奈芙尔

### 主流 4★
- ✅ `Bennett` — 班尼特
- ✅ `Xiangling` — 香菱
- ✅ `Xingqiu` — 行秋
- 📋 `Fischl` — 菲谢尔 — 雷 弓 — Q 高频副C
- 📋 `Sucrose` — 砂糖 — 风 法器 — EM 转化
- 📋 `Faruzan` — 珐露珊 — 风 弓 — 风系副C减抗
- 📋 `Chevreuse` — 夏沃蕾 — 火 长柄 — 火雷双 → HP→ATK
- 📋 `KujouSara` — 九条裟罗 — 雷 弓 — 攻击区高基础
- 📋 `Lynette` — 琳妮特 — 风 单手剑
- 📋 `ShikanoinHeizou` — 鹿野院平藏 — 风 法器
- 📋 `Iansan` — 伊安珊 — 雷 长柄 — Nightsoul, 攻击buff
- 📋 `YunJin` — 云堇 — 岩 长柄 — 普攻加伤
- 📋 `Charlotte` — 夏洛蒂 — 冰 法器 — 治疗+减抗
- 📋 `Gorou` — 五郎 — 岩 弓 — 防御 buff
- 📋 `Diona` — 迪奥娜 — 冰 弓 — 护盾
- 📋 `Layla` — 莱依拉 — 冰 单手剑 — 护盾
- 📋 `Kaeya` — 凯亚 — 冰 单手剑
- 📋 `Rosaria` — 罗莎莉亚 — 冰 长柄 — CR 副C
- 📋 `KukiShinobu` — 久岐忍 — 雷 单手剑 — HP, 治疗驱动
- 📋 `Razor` — 雷泽 — 雷 双手剑 — 物理
- 📋 `Chongyun` — 重云 — 冰 双手剑 — 冰附魔
- 📋 `Beidou` — 北斗 — 雷 双手剑 — 反弹
- 📋 `Sayu` — 早柚 — 风 双手剑
- 📋 `Yaoyao` — 瑶瑶 — 草 长柄 — 治疗
- 📋 `Mika` — 米卡 — 冰 长柄 — 物伤
- 📋 `Thoma` — 托马 — 火 长柄 — 护盾
- 📋 `Candace` — 坎蒂丝 — 水 长柄 — 水附魔
- 📋 `Freminet` — 菲米尼 — 冰 双手剑

### 新角色 / 稀有度待确认
- 📋 `Somnia` — 索莫尼亚 — TBD — 待确认稀有度/元素
- 📋 `Ifa` — 伊法 — TBD — 待确认
- 📋 `Dahlia` — 塔利雅 — TBD — 4★? 水
- 📋 `Varka` — 法尔伽 — TBD — 待确认
- 📋 `LanYan` — 蓝砚 — 风 4★ — 护盾型
- 📋 `Sethos` — 赛索斯 — 雷 4★ — 重击
- 📋 `Ororon` — 欧洛伦 — 雷 4★ — Nightsoul 副C

---

## 武器

### 5★ — 单手剑
- ✅ `FluteOfEzpitzal` — 息燧之笛 (4★)
- 📋 `MistsplitterReforged` — 雾切之回光 — Ayaka/Ayato 武器
- 📋 `FreedomSworn` — 苍古自由之誓 — 万叶/Kazuha
- 📋 `HaranGeppakuFutsu` — 波乱月白经津 — Ayato
- 📋 `PrimordialJadeCutter` — 雾切之回光 (no, that's mistsplitter); 和璞玉裁 — Keqing/Furina
- 📋 `SkywardBlade` — 天空之刃
- 📋 `AquilaFavonia` — 风鹰剑
- 📋 `SummitShaper` — 衔珠海皇 (no, that's catalyst); 斫峰之刃
- 📋 `LightOfFoliarIncision` — 裁叶萃光 — Alhaitham
- 📋 `UrakuMisugiri` — 雾切之回光 (no); 有乐御簾切 — Chiori
- 📋 `KeyOfKhajNisut` — 圣显之钥 — Nilou
- 📋 `SplendorOfTranquilWaters` — 静谧之水的密夜 — Clorinde
- 📋 `PeakPatrolSong` — 岩峰巡歌 — Chiori/Navia
- 📋 `Azurelight` — 苍耀 — Skirk
- 📋 `FinaleOfTheDeep` — 海渊终曲
- 📋 `Absolution` — 赦罪 — Arlecchino
- 📋 `MoonweaversDawn` — 织月者的曙色 — moon
- 📋 `CalamityOfEshu` — 厄水之祸 — moon
- 📋 `SwordOfNarzissenkreuz` — 水仙十字之剑

### 5★ — 双手剑
- 📋 `WolfsGravestone` — 狼的末路
- 📋 `RedhornStonethresher` — 赤角石溃杵 — Itto/Arlecchino
- 📋 `SongOfBrokenPines` — 松籁响起之时
- 📋 `Verdict` — 裁断 — Navia
- 📋 `BeaconOfTheReedSea` — 苇海信标
- 📋 `FangOfTheMountainKing` — 山王长牙 — Kinich
- 📋 `SkywardPride` — 天空之傲
- 📋 `AThousandBlazingSuns` — 焚曜千阳 — Mavuika
- 📋 `UltimateOverlordsMegaMagicSword` — 究极霸王超级魔剑

### 5★ — 长柄 (Shenhe/Linnea/Zibai 武器线)
- ✅ `StaffOfHoma` — 护摩之杖
- ✅ `PrimordialJadeWingedSpear` — 和璞鸢
- ✅ `EngulfingLightning` — 薙草之稻光
- ✅ `StaffOfTheScarletSands` — 赤砂之杖
- ✅ `CalamityQueller` — 息灾
- ✅ `SkywardSpine` — 天空之脊
- ✅ `VortexVanquisher` — 贯虹之槊
- 📋 `CrimsonMoonsSemblance` — 赤月之形 — Arlecchino (长柄? 待校对)
- 📋 `LumidouceElegy` — 柔灯挽歌 — Escoffier
- 📋 `BalladOfTheFjords` — 峡湾长歌
- 📋 `FootprintOfTheRainbow` — 虹的行迹 — moon polearm

### 5★ — 弓
- 📋 `SkywardHarp` — 天空之翼
- 📋 `AmosBow` — 阿莫斯之弓 — Ganyu
- 📋 `ElegyForTheEnd` — 终末嗟叹之诗
- 📋 `ThunderingPulse` — 飞雷之弦振 — Yoimiya
- 📋 `AquaSimulacra` — 若水 — Yelan/Tartaglia
- 📋 `PolarStar` — 冬极白星 — Tartaglia
- 📋 `HuntersPath` — 猎人之径 — Tighnari
- 📋 `TheFirstGreatMagic` — 最初的大魔术 — Lyney
- 📋 `SilvershowerHeartstrings` — 白雨心弦 — Sigewinne
- 📋 `EndOfTheLine` — 竭泽
- 📋 `AstralVulturesCrimsonPlumage` — 星鹫赤羽 — Chasca
- 📋 `GoldenFrostboundOath` — 霜结的誓金枝 — Escoffier (no, polearm); 弓
- 📋 `ChainBreaker` — 碎链 — Iansan
- 📋 `RainbowSerpentsRainBow` — 虹蛇之雨弓 — moon bow

### 5★ — 法器
- 📋 `LostPrayerToTheSacredWinds` — 四风原典
- 📋 `SkywardAtlas` — 天空之卷
- 📋 `MemoryOfDust` — 尘世之锁
- 📋 `KagurasVerity` — 神乐之真意 — YaeMiko
- 📋 `AThousandFloatingDreams` — 千夜浮梦 — Nahida
- 📋 `EverlastingMoonglow` — 不灭月华 — Kokomi
- 📋 `JadefallsSplendor` — 碧落之珑 — Baizhu
- 📋 `TulaytullahsRemembrance` — 图莱杜拉的回忆 — Wanderer
- 📋 `CashflowSupervision` — 金流监督 — Neuvillette/Wriothesley
- 📋 `TomeOfTheEternalFlow` — 万世流涌大典 — Neuvillette
- 📋 `SurfsUp` — 万世流涌大典 (no); 浪上的飞舞 — Mualani
- 📋 `CranesEchoingCall` — 鹤鸣余音 — Xianyun
- 📋 `StarcallersWatch` — 唤星之眼 — Citlali
- 📋 `SunnyMorningSleepIn` — 阳光开朗大男孩
- 📋 `ReliquaryOfTruth` — 真理之圣骸 — Yumemizuki
- 📋 `NightweaversLookingGlass` — 纺夜天镜 — moon catalyst
- 📋 `OathswornEye` — 立誓之眸 — moon

### 4★ — 主流 (能给多个角色用)
- 📋 `FavoniusSword` — 西风剑
- 📋 `FavoniusLance` — 西风长枪
- 📋 `FavoniusGreatsword` — 西风大剑
- 📋 `FavoniusCodex` — 西风秘典
- 📋 `FavoniusWarbow` — 西风猎弓
- 📋 `SacrificialSword` — 祭礼剑
- 📋 `SacrificialGreatsword` — 祭礼大剑
- 📋 `SacrificialFragments` — 祭礼残章
- 📋 `SacrificialBow` — 祭礼弓
- 📋 `SacrificialJade` — 祭礼玉
- ✅ `DragonsBane` — 匣里灭辰
- ✅ `LithicSpear` — 千岩长枪
- ✅ `WhiteTassel` — 白缨枪
- ✅ `BlackTassel` — 黑缨枪
- ✅ `Deathmatch` — 决斗之枪
- 📋 `TheCatch` — 渔获 — Q 强化 (Xiangling/Raiden)
- 📋 `IronSting` — 铁蜂刺 — EM 副词条
- 📋 `Moonpiercer` — 贯月矢 — Cyno
- 📋 `SolarPearl` — 流浪乐章 (no); 流浪的晚星 (no); SolarPearl is 浪客 (no); 实际中文待校
- 📋 `MakhairaAquamarine` — 玛海菈的水色 — EM stick
- 📋 `WavebreakersFin` — 断浪长鳍 — ER → Q
- 📋 `Predator` — 掠食者 — bow
- 📋 `MitternachtsWaltz` — 幽夜华尔兹
- 📋 `WindblumeOde` — 风花之颂 — EM bow
- 📋 `Frostbearer` — 忍冬之果 — catalyst
- 📋 `HakushinRing` — 白辰之环 — catalyst, ER → ele dmg
- 📋 `WineAndSong` — 流浪乐章 — catalyst, ATK off-field
- 📋 `DodocoTales` — 嘟嘟可故事集 — Klee 招牌
- 📋 `MissiveWindspear` — 风信之锋 — EM/ATK polearm
- 📋 `Akuoumaru` — 恶王丸 — Q dmg
- 📋 `KitainCrossSpear` — 喜多院十文字 — EM polearm
- 📋 `LionsRoar` — 匣里龙吟 — sword vs hydro/pyro
- 📋 `BlackcliffLongsword` — 黑岩长剑 — kill stacks
- 📋 `BlackcliffSlasher` — 黑岩斩刀
- 📋 `BlackcliffPole` — 黑岩刺枪
- 📋 `BlackcliffAgate` — 黑岩绯玉
- 📋 `BlackcliffWarbow` — 黑岩战弓
- 📋 `TheBell` — 钟剑 — claymore shield
- 📋 `Whiteblind` — 白影剑 — DEF claymore
- 📋 `Rust` — 弓藏 — bow normal
- 📋 `MailedFlower` — 饰铁之花 — EM claymore
- 📋 `MappaMare` — 万国诸海图谱 — EM catalyst

---

## 圣遗物 (5★)

### 已实装
- ✅ `GladiatorsFinale` — 角斗士的终幕礼
- ✅ `EmblemOfSeveredFate` — 绝缘之旗印
- ✅ `HeartOfDepth` — 沉沦之心
- ✅ `CrimsonWitchOfFlames` — 炽烈的炎之魔女
- ✅ `ViridescentVenerer` — 翠绿之影
- ✅ `ThunderingFury` — 如雷的盛怒
- ✅ `ArchaicPetra` — 悠古的磐岩
- ✅ `DeepwoodMemories` — 深林的记忆
- ✅ `HuskOfOpulentDreams` — 华馆梦醒形骸记
- ✅ `ShimenawasReminiscence` — 追忆之注连
- ✅ `VermillionHereafter` — 辰砂往生录
- ✅ `GoldenTroupe` — 黄金剧团
- ✅ `MarechausseeHunter` — 逐影猎人
- ✅ `PaleFlame` — 苍白之火
- ✅ `BloodstainedChivalry` — 染血的骑士道
- ✅ `DesertPavilionChronicle` — 沙上楼阁史话
- ✅ `GildedDreams` — 饰金之梦
- ✅ `FlowerOfParadiseLost` — 乐园遗落之花
- ✅ `NymphsDream` — 水仙之梦
- ✅ `Lavawalker` — 渡过烈火的贤人
- ✅ `AubadeOfMorningstarAndMoon` — 晨星与月的晓歌
- ✅ `SilkenMoonsSerenade` — 纺月的夜歌
- ✅ `NightOfTheSkysUnveiling` — 穹境示现之夜
- ✅ `ObsidianCodex` — 黑曜秘典
- ✅ `ScrollOfTheHeroOfCinderCity` — 烬城勇者绘卷
- ✅ `LongNightsOath` — 长夜之誓
- ✅ `FinaleOfTheDeepGalleries` — 深廊终曲
- ✅ `NoblesseOblige` — 昔日宗室之仪
- ✅ `BlizzardStrayer` — 冰风迷途的勇士
- ✅ `TenacityOfTheMillelith` — 千岩牢固

### 未实装 — 待补
- 📋 `FragmentOfHarmonicWhimsy` — 谐律异想断章 — Furina 专用
- 📋 `NighttimeWhispersInTheEchoingWoods` — 回声之林夜话 — Navia
- 📋 `SongOfDaysPast` — 昔时之歌 — 治疗增伤
- 📋 `UnfinishedReverie` — 未竟的遐思 — Arlecchino
- 📋 `VourukashasGlow` — 花海甘露之光 — HP-based
- 📋 `WanderersTroupe` — 流浪大地的乐团 — 弓/法器 EM+重击
- 📋 `OceanHuedClam` — 海染砗磲 — 治疗→伤害 (老)
- 📋 `EchoesOfAnOffering` — 来歆余响
- 📋 `RetracingBolide` — 逆飞的流星 — 护盾时增伤
- 📋 `ADayCarvedFromRisingWinds` — 风起之日 — 风 Natlan

### 4★ 旧套 — 跳过
- 🚫 `Adventurer` `Berserker` `BraveHeart` `DefendersWill` `Gambler` `Instructor` `LuckyDog` `MaidenBeloved` `MartialArtist` `PrayersForDestiny` `PrayersForIllumination` `PrayersForWisdom` `PrayersToSpringtime` `ResolutionOfSojourner` `Scholar` `TheExile` `Thundersoother` `TinyMiracle` `TravelingDoctor` — 4★ 已弃用, 无 panel-stat 效果或仅 utility
