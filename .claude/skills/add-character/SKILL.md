---
description: Scaffold a new character sheet in src/calc/sheets/ from skillParam_gen + raw data, with talent multipliers wired and a TODO checklist for buffs. Usage `/add-character <GoKey>` (e.g. `/add-character KamisatoAyaka`).
---

# /add-character

Argument: GO-style key (`Shenhe`, `KamisatoAyaka`, etc.) as it appears in `src/integration/go-id-map.json` under `map.characters`.

## Goal

Produce a runnable sheet that:
1. Compiles + passes existing tests
2. Auto-wires all damage formulas with correct scaling (atk / def / hp / em)
3. Wires character passives + constellation buffs (premod stat additions + per-formula premod where needed)
4. Exposes the right cond toggles and self/team buff descriptors

Reference implementation: `src/calc/sheets/Linnea.ts` + `Linnea-formulas.ts` (DEF-scaling, moon reactions, per-formula premod, A1 enemy RES shred). Also `Shenhe.ts` / `Shenhe-formulas.ts` (ATK-scaling, classic kit, A1+C2 shared cond pattern).

---

## ⭐ Primary source: vendor GO sheet — recipe

**The single most important file for any character is** `vendor/go/gi/sheets/src/Characters/<GoKey>/index.tsx`. This is the upstream GenshinOptimizer sheet — the **authoritative translation source**.

⚠️ **Do NOT** use `vendor/go/gi/formula/src/data/char/<Key>.ts`. That file is just an empty stub template with placeholder `dmg('normal1', info, 'atk', _dm.normal.dmg1, 'normal')` for every char — same content, fake values. Not real data.

### Step-by-step recipe (always follow this order)

**Step 1: Verify the vendor sheet exists.** Use `ls`, **never** Glob (Glob has missed real directories in past sessions):

```sh
wsl -- bash -lc "ls vendor/go/gi/sheets/src/Characters/<GoKey>/"
```

Expected output: `index.tsx`. If missing → fallback to talent-text + skillParam (rare).

**Step 2: Read the whole vendor sheet top to bottom.** The structure is consistent across all chars:

```
1. Imports + key/skillParam_gen setup
2. const dm = { ... }            ← maps skillParam[i] → named coefficients
3. cond/state declarations       ← [condXPath, condX] = cond(key, 'xName')
4. Buff expression trees         ← greaterEq(...), equal(...), prod(...)
5. const dmgFormulas = { ... }   ← THE damage formulas with scaling
6. export const data = dataObjForCharacterSheet(key, dmgFormulas, {
     premod: { ... },             ← OWN-buff slots (scope: 'self')
     teamBuff: { premod: { ... }} ← TEAM-buff slots (scope: 'team')
   })
7. const sheet: TalentSheet = { ... }  ← UI display order; can skim
```

**Step 3: Extract the `dm` mapping.** This is the table you'll mirror in our sheet:

```ts
// In our <Char>-formulas.ts, mirror the dm structure:
const skillParam = (statsJson as any).char.skillParam.<GoKey> as { auto, skill, burst, ... }
// Use the same skillParam[i] indices the vendor sheet uses.
```

**Step 4: Translate each `dmgFormulas` entry.** Walk through normal / charged / plunging / skill / burst in order. For each entry, identify:
- Move type (`'normal'`, `'charged'`, `'plunging'`, `'skill'`, `'burst'`)
- Element (`hitEle.X` or the char's default ele)
- Scaling key (`'atk'` / `'def'` / `'hp'` / `'eleMas'`)
- Talent multiplier table (the `skillParam[i]` array)
- Is it a `lunarDmg(...)` → `kind: 'directMoon' | 'reactionMoon'`, `moonReaction: '...'`
- Has `premod: { ... }` → per-formula `premod`
- Has `customDmgNode` → write inline `sum(prod(...), prod(...))` AST

Use the recipe tables below.

**Step 5: Translate buff expressions (data.premod / data.teamBuff.premod).** Map vendor's `ownBuff.premod.X.add(expr)` → `scope.add('premod.X', value, source)` in CharacterSheet.apply (for self) and tag descriptor `scope: 'self'`. For `teamBuff.premod.X.add(expr)` do the same with `scope: 'team'`.

If the expression has cross-character logic (`input.activeCharKey === target.charKey`, `tally.<element>`), note as **HARD blocker** — our engine doesn't propagate team buffs to other slots. Apply to focus only when focus IS this character.

**Step 6: Sanity-check vs talent text.** Use `python3 scripts/dump-char.py <GoKey>` to confirm talent descriptions match what the vendor sheet does. Vendor wins on disagreement.

**Step 7: Write `<Char>.ts` (CharacterSheet) + `<Char>-formulas.ts` (FormulaDef[] + applyXFormulaBuffs).**

**Step 8: Wire into `sheets/index.ts` + `build.ts` + `buff-sources.ts`.** Run typecheck + vitest.

### Vendor sheet structural reference: what each section means

| Vendor expression | Meaning | Our translation |
|---|---|---|
| `const [condXPath, condX] = cond(key, 'xName')` | Declare a UI toggle named `xName` | Add to `CharacterSheet.conds: [{ name: 'xName', type: 'bool', label: '...' }]` |
| `greaterEq(input.constellation, N, X)` | Gate by constellation level | `ifGE(v('constellation', 0), N, X, 0)` (AST) OR `if (ctx.constellation >= N) { ... }` (apply()) |
| `greaterEq(input.asc, N, X)` | Gate by ascension stage | `ifGE(v('ascension', 0), N, X, 0)` OR `if (ctx.ascension >= N) { ... }` |
| `equal(condX, 'on', value)` | Bool cond gate | `ifOn(v('cond.<Char>.xName', 0), value, 0)` OR `if (condState.<Char>?.xName) { ... }` |
| `equal(input.activeCharKey, target.charKey, X)` | "applies to active char" — cross-char | **Cross-char limitation: apply only when focus IS this char.** |
| `tally.<ele>` (geo/hydro/etc.) | Count of teammates with that element | **Not modeled**: expose as `num` cond for user. |
| `tally.moonsign` | Count of moon-sign teammates (≥2 = moon-full state) | Approximate via `condState.<Char>.moonFull` bool. |
| `dmgNode('atk', table, 'normal')` | Standard ATK-scaling normal hit | `{ name, move: 'normal', element: 'physical', base: prod(v('final.atk'), lookup(table, sub(v('talent.auto'), 1))) }` |
| `dmgNode('def', table, 'skill')` | DEF-scaling skill | Swap `final.atk` → `final.def` |
| `dmgNode('hp', table, 'burst')` | HP-scaling burst | Swap to `final.hp` |
| `dmgNode('X', table, 'normal', hitEle.geo)` | Normal hit with element override | Set `element: 'geo'` |
| `dmgNode('X', table, 'normal', addl, undefined, 'skill')` | Normal-hit move but BUFFED by skill premod | Set `move: 'normal'` but consider buff context |
| `splitScaleDmgNode(['eleMas', 'def'], [emTable, defTable], 'skill')` | EM + DEF split-scaling | `base: sum(prod(v('final.eleMas'), lookup(emTable, ...)), prod(v('final.def'), lookup(defTable, ...)))` |
| `customDmgNode(expr, 'burst')` | One-off expression damage | Write the AST inline for `base`, set `move: 'burst'` |
| `lunarDmg(subscript(input.total.skillIndex, table), 'def', 'lunarcrystallize', strideAddl)` | Moon-reaction directMoon | `{ kind: 'directMoon', moonReaction: 'crystallize', base: prod(v('final.def'), lookup(table, ...)), flat: <strideAddl flat>, premod: <strideAddl premod> }` |
| `lunarDmg(...)` with no `'def'/'atk'` second arg | reactionMoon (pure reaction with no main-stat scaling) | `{ kind: 'reactionMoon', moonReaction: '...', base: <flat AST or 0> }` |
| `infoMut(dmgFormulas.X, { premod: { critDMG_: Y } })` | Per-formula CD boost | `FormulaDef.premod: { 'final.critDMG_': Y_AST }` |
| `strideAddl = { premod: { lunarcrystallize_dmgInc: X, lunarcrystallize_dmg_: Y } }` | Flat add + per-formula dmg boost combo | `flat: X_AST` (the dmgInc, which is a DEF-based flat add) + `premod: { 'premod.moonReactionDmgBoost': Y_AST }` (the dmg_ %, which boosts the moon-reaction dmgBonus zone) |

### Buff slot translation reference

| Vendor slot | Our scope key | Notes |
|---|---|---|
| `ownBuff.premod.atk_` / `def_` / `hp_` | `premod.atk_` / `def_` / `hp_` | direct |
| `ownBuff.premod.critRate_` / `critDMG_` | `premod.critRate_` / `critDMG_` | direct |
| `ownBuff.premod.eleMas` | `premod.eleMas` | direct |
| `ownBuff.premod.enerRech_` | `premod.enerRech_` | direct |
| `ownBuff.premod.dmg_<ele>` | `premod.dmg_.<ele>` | per-element |
| `ownBuff.premod.dmgMove_<move>` | `premod.dmg_.<move>` | per-move (normal/charged/plunging/skill/burst) |
| `ownBuff.premod.lunarcrystallize_baseDmg_` | `premod.moonReactionBaseBoost` | 月反应基础提升 |
| `ownBuff.premod.lunarcrystallize_dmg_` | `premod.moonReactionDmgBoost` | 月反应增伤 (vs reactionMoon's dmgBoost zone) |
| `ownBuff.premod.lunarcrystallize_dmgInc` | per-formula `flat` field | flat additive (typically `DEF × X` or `HP × X`) |
| `ownBuff.premod.lunar_specialDmg_` (and per-reaction) | `premod.moonReactionElevation` | 擢升 |
| `ownBuff.premod.lunarcrystallize_directDmgInc` | per-formula `flat` field | only for `directMoon` hits |
| `teamBuff.premod.X` | same as ownBuff for focus char + tag `scope: 'team'` | cross-char propagation not modeled |
| `teamBuff.total.X` | only applies to active char (cross-char) | not modeled |
| `enemyDebuff.common.<ele>_enemyRes_` | enemy preRes adjustment via `<char>QResShred` | see Shenhe / Linnea |

### Specific patterns

**`strideAddl` / per-formula buff bundle:**
```ts
// Vendor:
const strideAddl = {
  premod: {
    lunarcrystallize_dmgInc: sum(a1_flat, c2_flat),  // DEF-based flat add
    lunarcrystallize_dmg_: c1_boost,                  // per-formula % boost
  },
}
const stride2 = lunarDmg(table, 'def', 'lunarcrystallize', strideAddl)

// Our translation:
{
  name: 'lingju_2_crystal',
  kind: 'directMoon',
  moonReaction: 'crystallize',
  base: prod(v('final.def'), lookup(table, ...)),
  flat: sum(a1FlatAst, c2FlatAst),  // the lunarcrystallize_dmgInc
  premod: {
    'premod.moonReactionDmgBoost': c1BoostAst,  // the lunarcrystallize_dmg_
  },
}
```

**`tally`-based per-teammate count (e.g. A4 conditional EM/DEF):**
```ts
// Vendor (Zibai A4):
const a4Geo_def_ = greaterEq(input.asc, 4,
  prod(sum(tally.geo, -1), percent(dm.passive2.geo_def_))
)
// Means: per (geo teammate - 1) × 15% DEF, since char herself counts in tally.

// Our translation: expose as `num` cond `geoTeamCount` (1-3) for user to set:
conds: [{ name: 'geoTeamCount', type: 'num', label: '队伍中其它岩元素角色数', min: 0, max: 3 }]
apply(scope, ctx, condState) {
  if (ctx.ascension >= 4) {
    const n = condState.<Char>?.geoTeamCount ?? 0
    if (n > 0) scope.add('premod.def_', 0.15 * n, `A4 (per geo: +15% DEF × ${n})`)
  }
}
```

**`tally.moonsign` (moon-full state):**
```ts
// Vendor:
greaterEq(tally.moonsign, 2, X)  // moon-full active

// Our translation: gate on `condState.<Char>.moonFull`.
if (condState.<Char>?.moonFull) { /* apply X */ }
```

---

## 🔑 二次转模 (Type 1 vs Type 2 stat conversions) — design note

Genshin has TWO distinct phrasings for stat-conversion buffs, and they behave differently regarding chaining:

| 类型 | 中文文本 | 例子 | 可否二次转模? |
|---|---|---|---|
| **Type 1** | "基于 / 相当于 / 依据属性 A 的 X%, 提升属性 B" | 伊涅芙 A4: "基于伊涅芙攻击力的 6%, 提升..." | ❌ A 如果是别处 Type 1 转化来的, 不能再用来计算 B |
| **Type 2** | "每 X 点属性 A, 能提升 Y 点属性 B" | 艾尔海森: "每点元素精通, 都会使...伤害提升 0.1%" | ✅ 只看属性 A 的面板值, 不在乎是否他处转化来 |

### Exceptions (community-tracked anomalies)
- 哥伦比娅 C2 (HP → EM/HP/DEF active char) — text 1-shaped but **behaves as Type 2** (provides fixed value to recipient).
- 夏沃蕾 纵阵武力统筹 (HP → ATK) — same: Type 2-equivalent fixed value.
- 万叶 风物之诗咏 (EM → DMG bonus) — text 2-shaped but **behaves as Type 1**.
- 仆人 唯力量可守护 (ATK → RES) — text 2-shaped but **behaves as Type 1**.

Reference: <https://meropide.cn/chs/reference/%E4%BC%A4%E5%AE%B3%E5%85%AC%E5%BC%8F/>

### Engine implications (for cross-char propagation work)

When we eventually add cross-char propagation, every buff descriptor / sheet `apply()` needs a `conversionKind` tag:
- `'type1'` (default for "依据 X 的 N%") — recipient adds the converted amount as a **non-rechain-able** flat. When recipient's OWN Type 1 conversion reads its source stat, the source value should EXCLUDE these Type 1-propagated contributions.
- `'type2'` (for "每点 X" or the named exceptions) — recipient adds the converted amount as a **regular flat** (rechain-able). Sources are read directly from `final.X`.
- `'special'` — Kazuha / Arlecchino-style anomalies needing case-by-case handling.

Engine sketch:
- Each scope key has a "fixed" partition (`premod.<stat>.fixed`) and a "converted" partition (`premod.<stat>.converted`).
- `total.<stat>` = `base + fixed + converted`.
- `total.<stat>.preconverted` = `base + fixed` only (what Type 1 conversions read).
- When applying a Type 1 conversion: `recipient.premod.<dst>.converted += source.total.<src>.preconverted × ratio`.
- When applying a Type 2 conversion: `recipient.premod.<dst>.fixed += source.total.<src> × ratio`.

This is significant engine work. Don't attempt without explicit user direction.

For now in single-char calc: every conversion is applied as a regular `scope.add('premod.<X>', ...)` and we don't track conversion provenance — fine for solo damage panel, breaks when multiple converters are in the team.

### When the vendor sheet doesn't exist (very new chars)

Newer characters (e.g. those added after the last GO upstream sync) may not have a sheet at `vendor/go/gi/sheets/src/Characters/<GoKey>/`. Fallback path:

1. Use `python3 scripts/dump-char.py <GoKey>` to get talent + constellation text + skillParam values.
2. Read scaling from talent text explicitly: 「基于HP上限的X%」/「防御力的Y%」/「攻击力的Z%」.
3. If a formula's scaling is genuinely unclear, default to ATK and add `// TODO: verify scaling — vendor sheet not yet available` comment. Note in the final report.

**⚠️ Always confirm absence via `ls`, not via the Glob tool:**

```sh
wsl -- bash -lc "ls vendor/go/gi/sheets/src/Characters/<GoKey>/"
```

The Glob tool (e.g. `vendor/go/gi/sheets/src/Characters/Zibai/*`) may silently miss directories under certain conditions; always cross-check with a direct `ls` before concluding the sheet doesn't exist. **In a recent session, vendor sheets existed for new chars (Zibai/Columbina/Illuga) but Glob returned "No files found" — wasted an entire pass writing best-effort guesses.**

### Translating `splitScaleDmgNode` (multi-stat scaling)

Some characters (e.g. Illuga) have damage that scales on multiple stats simultaneously:

GO upstream:
```ts
splitScaleDmgNode(['eleMas', 'def'], [emTable, defTable], 'skill')
```

This means `damage = (EM × emCoeff) + (DEF × defCoeff)`. Our AST handles it via `sum`:

```ts
const splitScale = (emTable: number[], defTable: number[], lvlVar: string): Node =>
  sum(
    prod(v('final.eleMas'), lvlLookup(emTable, lvlVar)),
    prod(v('final.def'), lvlLookup(defTable, lvlVar)),
  )
```

Same pattern for any two stats — just swap the `final.X` keys.

### Translating `customDmgNode`

For one-off formula expressions (not standard `dmgNode`), e.g. C2 阿咚 hit in Illuga:
```ts
customDmgNode(
  sum(
    prod(percent(dm.constellation2.dmgEleMas), input.total.eleMas),
    prod(percent(dm.constellation2.dmgDef), input.total.def),
  ),
  'burst'
)
```

→ Our equivalent: a `FormulaDef` with `move: 'burst'` and `base: sum(prod(v('final.eleMas'), c(coeff_em)), prod(v('final.def'), c(coeff_def)))`. Use `ifGE(v('constellation', 0), N, ..., 0)` to gate by constellation.

---

## GO → Specular AST translation cheatsheet

This is what makes the vendor sheet directly translatable.

| GO upstream                                | Our AST                                                                                                | Notes                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `prod(a, b, c)`                            | `prod(a, b, c)`                                                                                        | direct                                                           |
| `sum(a, b)`                                | `sum(a, b)`                                                                                            | direct                                                           |
| `min(a, b)` / `max(a, b)`                  | `min(a, b)` / `max(a, b)`                                                                              | direct                                                           |
| `percent(x)`                               | `c(x)`                                                                                                 | GO `percent()` is a typed constant; values already decimal       |
| `constant(x)`                              | `c(x)`                                                                                                 |                                                                  |
| `input.total.def` / `.atk` / `.hp` / `.eleMas` | `v('final.def')` / `v('final.atk')` / `v('final.hp')` / `v('final.eleMas')`                          | final = total in our model                                       |
| `input.premod.def` etc.                    | `v('final.def')` (approx)                                                                              | We don't keep a separate premod-vs-final layer post Phase 11.    |
| `input.constellation`                      | `v('constellation', 0)`                                                                                |                                                                  |
| `input.asc`                                | `v('ascension', 0)`                                                                                    |                                                                  |
| `input.charLvl`                            | `v('level', 90)`                                                                                       |                                                                  |
| `input.total.skillIndex` (talent lv)       | `v('talent.skill')`                                                                                    | similarly `talent.auto`, `talent.burst`                          |
| `greaterEq(a, b, then)`                    | `ifGE(a, b, then, 0)`                                                                                  | GO omits else; we default to 0                                   |
| `equal(a, b, then)`                        | `ifEQ(a, b, then, 0)`                                                                                  |                                                                  |
| `cmpGE(constellation, n, value)`           | `ifGE(v('constellation', 0), n, value, 0)`                                                             | the constellation-gate idiom                                     |
| `subscript(input.total.skillIndex, table)` | `lookup(table, sub(v('talent.skill'), 1))`                                                             | GO uses 1-indexed talent; our `lookup` is 0-indexed → subtract 1 |
| `dmgNode('atk', mult, 'normal')`           | `{ name, move: 'normal', element: <see weapon-type table>, base: prod(v('final.atk'), lookup(mult, sub(v('talent.auto'), 1))) }` | The most common formula shape.                                   |
| `dmgNode('def', mult, 'skill')`            | swap `v('final.atk')` → `v('final.def')`                                                               |                                                                  |
| `lunarDmg(mult, 'def', 'lunarcrystallize')`| `{ kind: 'directMoon', moonReaction: 'crystallize', base: prod(v('final.def'), lookup(...)), flat?: <C1 stack flat AST> }` | Direct-moon hit.                                                 |
| `register(info.key, entries, ownBuff.X.add(Y))` | `scope.add('X', Y, source)` inside CharacterSheet.apply + buff descriptor `scope: 'self'`         | for self-only buffs                                              |
| `register(..., teamBuff.X.add(Y))`         | same, but buff descriptor `scope: 'team'`                                                              | for team-propagating buffs                                       |
| `infoMut(node, { premod: { critDMG_: X } })` | `FormulaDef.premod: { 'final.critDMG_': X_as_AST }`                                                  | per-formula stat boost (e.g. Linnea C2 lumi-only +150% CD)       |

---

## Per-formula scaling pattern (recipe)

**Vendor sheet:**

```ts
const dm = {
  skill: { foo: skillParam_gen.skill[0], bar: skillParam_gen.skill[1] }
}
const dmgFormulas = {
  skill: {
    foo: dmgNode('def', dm.skill.foo, 'skill'),
    bar: dmgNode('atk', dm.skill.bar, 'skill'),
  },
}
```

**Our translation in `<Char>-formulas.ts`:**

```ts
import statsJson from '../../../vendor/go/gi/stats/src/allStat_gen.json'
const skillParam = (statsJson as any).char.skillParam.<GoKey>

const lvlLookup = (table: number[], lvlVar: string) =>
  lookup(table, sub(v(lvlVar), 1))
const atkProd = (table: number[], lvlVar: string) =>
  prod(v('final.atk'), lvlLookup(table, lvlVar))
const defProd = (table: number[], lvlVar: string) =>
  prod(v('final.def'), lvlLookup(table, lvlVar))

export const <Char>Formulas: FormulaDef[] = [
  { name: 'skill_foo', move: 'skill', element: '<char element>', base: defProd(skillParam.skill[0], 'talent.skill') },
  { name: 'skill_bar', move: 'skill', element: '<char element>', base: atkProd(skillParam.skill[1], 'talent.skill') },
]
```

---

## Stat-buff pattern (recipe)

**Vendor sheet:**

```ts
const [condC4Foo, condC4FooPath] = cond(key, 'c4Foo')
const c4_def_ = greaterEq(input.constellation, 4, equal(condC4Foo, 'on', dm.constellation4.def_))
register(..., ownBuff.premod.def_.add(c4_def_), ...)
```

**Our translation in `<Char>.ts`:**

```ts
conds: [{ name: 'c4Foo', type: 'bool', label: 'C4 ...' }],
apply(scope, ctx, condState) {
  if (ctx.constellation >= 4 && condState.<Char>?.c4Foo) {
    scope.add('premod.def_', dm.constellation4.def_, 'C4 ...')
  }
}
```

Plus a buff descriptor entry in `buff-sources.ts`:
```ts
{
  source: { type: 'constellation', ordinal: 4, label: { zh: 'C4 ...', en: '...' } },
  name: { zh: '...', en: '...' },
  effect: { zh: '...', en: '...' },
  condName: 'c4Foo',
  scope: 'self',  // 'team' if it was teamBuff in the vendor sheet
}
```

---

## Moon reactions

When the talent text says "视为月结晶反应伤害" / "月感电反应" / "月绽放反应", or the vendor sheet uses `lunarDmg(...)`:

- Two formula kinds:
  - **`'reactionMoon'`**: A reaction trigger (e.g. team's hydro+geo crystallize → moon-crystallize via Linnea A6). Formula:
    `(transformative_base[lvl] × coeff × (1 + baseBoost)) + flatAdd`
    where `flatAdd` comes from the `base` AST (e.g. C1 DEF×75% per-hit flat).
  - **`'directMoon'`**: A specific attack treated as a moon reaction (e.g. Linnea 加力重锤 / 百万吨重锤). Formula:
    `(coeff × stat × mult × (1 + baseBoost)) + flat`
    where `base` is `stat × mult` and `flat` is optional per-formula additive.
- Coefficients live in `src/calc/data/reaction-base.ts` `MOON_REACTION_COEFF` (crystallize=1.6, electrocharged=3, bloom=1.6).
- Three premod slots:
  - `premod.moonReactionBaseBoost` — 基础提升% (e.g. Linnea passive3 DEF/100 × 0.7%)
  - `premod.moonReactionDmgBoost` — 月反应增伤% (next to EM)
  - `premod.moonReactionElevation` — 擢升 (separate final multiplier)
- Always-on moon passives go straight into the corresponding premod via `applyXFormulaBuffs(scope, condState)`.

---

## Buff descriptor scope (self vs team)

`BuffEntry.scope?: 'self' | 'team'` (default `'team'`). Self-scope buffs are **hidden from the cond panel when focus is on another character** — they don't affect that calc.

Mapping from vendor sheet:
- `ownBuff.X.add(...)` → `scope: 'self'`
- `teamBuff.X.add(...)` → `scope: 'team'`
- `enemyDebuff.common.<X>_enemyRes_` → `scope: 'team'` (enemy shred affects everyone hitting that enemy)

⚠️ **DO NOT add a 4-way scope** (self/team × frontline/backline). User explicitly rejected — 只分 self/team 就够了.

---

## Self-only artifact sets — bake max, don't expose cond

Sets like 华馆梦醒形骸记 (`HuskOfOpulentDreams`), 辰砂往生录 (`VermillionHereafter`) that only buff the wearer and naturally max out → set `conds: []` and BAKE the max-stack effect inside `apply()`. Don't expose a toggle.

Example: Husk
```ts
export const HuskOfOpulentDreams: ArtifactSetSheet = {
  key: 'HuskOfOpulentDreams',
  conds: [],
  apply(scope, count, _condState) {
    if (count >= 2) scope.add('premod.def_', 0.3, `${A.HuskOfOpulentDreams} 2 件套`)
    if (count >= 4) {
      scope.add('premod.def_', 0.24, `${A.HuskOfOpulentDreams} 4 件套(4 层 DEF, 默认吃满)`)
      scope.add('premod.dmg_.geo', 0.24, `${A.HuskOfOpulentDreams} 4 件套(4 层 岩伤, 默认吃满)`)
    }
  },
}
```

User quote: "属性只给自己一个人的情况, 我不希望出现在 buff 栏里, 直接算吃满记在人物面板里就可以".

---

## Per-formula `premod` — for "only-this-hit gets +X" patterns

`FormulaDef.premod?: Record<string, Node>` — keys are scope keys, values are AST.

The evaluator builds a child scope, adds each `premod` value on top of the original, then uses that scope for ALL reads during this formula's evaluation.

**Example: Linnea C2 lumi-only +150% CD on `crushDmg`** (vendor sheet pattern):
```ts
{
  name: 'lumi_ultra',
  move: 'skill',
  element: 'geo',
  kind: 'directMoon',
  moonReaction: 'crystallize',
  base: defProd(skillParam.skill[2], 'talent.skill'),
  flat: c1UltraFlat(),
  premod: {
    'final.critDMG_': ifGE(v('constellation', 0), 2,
      ifOn(v('cond.Linnea.c2Resonance', 0), 1.5, 0),
      0,
    ),
  },
}
```

When the vendor sheet does `dmgNode(..., { premod: { critDMG_: c2Lumi_critDMG_ } })`, translate to this exact pattern.

---

## UI gotchas

1. **Constellation buffs filtered by current C-level**: a C2 character shouldn't see C4 toggles. Handled centrally in `Team.tsx CondSection`.
2. **Num conds default-display max**: when `value === 0` and `cond.max != null`, show `cond.max` with a 默认满 hint. User quote: "一般技能设计都是让你吃满的".
3. **Damage formulas are click-to-expand** (▸/▾) — `FormulaBreakdownPanel` renders the 6 multiplier zones (base / dmgBonus / critMulti / defMulti / resMulti / elevation). Each zone has `value`, `rows[]`, optional `formula?`. Each formula auto-populates these.

---

## Substat margin — route through new pipeline

In `Team.tsx`:
```ts
if (focusCfg && hasNewSheet(focusCfg.characterId)) {
  setGoMargins(computeSubstatMarginsNew(members, focusIdx, { ...opts, targetFormula: pinnedFormula ?? undefined }))
} else {
  setGoMargins(computeSubstatMarginsViaGo(...))
}
```

Legacy `computeSubstatMarginsViaGo` uses GO's stub formulas — gives wrong (ATK-default) rankings for DEF/HP chars. `computeSubstatMarginsNew` uses `extraSubstats: Record<string, number>` in `BuildOpts` (phase 5.5 in `build.ts` injects them into `artifact.sub.<key>` slots) so the perturbation flows through the real pipeline.

---

## Stat breakdown surfaces premod.X_

`assembleContributions` in `build.ts` MUST read `premod.def_`, `premod.atk_`, `premod.hp_` contributions. Sheets that write to those slots via `scope.add()` (e.g. Husk → `premod.def_`, Linnea C4 → `premod.def_`) need that read or the contributions vanish from the panel.

Already wired today. If you add a new premod stat key, check this function.

---

## Canonical names — never hand-type

`src/calc/data/names-zh.ts` is the auto-generated source of truth:
- `CHARACTER_NAME_ZH[<GoKey>]` → character zh name
- `WEAPON_NAME_ZH[<GoKey>]` → weapon zh name
- `ARTIFACT_SET_NAME_ZH[<GoKey>]` → set zh name

Generated by `scripts/gen-names-zh.py` from ambr.top. Re-run if data syncs introduce new entries.

Use `as W` / `as A` / `as C` import aliases in sheets for terseness:
```ts
import { WEAPON_NAME_ZH as W } from '@/calc/data/names-zh'
// ...
scope.add('weap.passive.atk_', 0.2, `${W.CalamityQueller} R${r}`)
```

---

## Moon-full / tally gating

When a constellation/passive prose says "月兆·满辉", the GO upstream gates it on `tally.moonsign >= 2` (≥ 2 moon-sign team members). We approximate with `condState.<Char>.moonFull` — a manual user toggle.

Example: Linnea C6 擢升 +25% only fires when:
```ts
if ((scope.get('constellation') ?? 0) >= 6 && condState.Linnea?.moonFull) {
  scope.add('premod.moonReactionElevation', 0.25, 'C6 ...')
}
```

---

## Workflow checklist for a new character

1. **GO key**: reverse-lookup in `src/calc/data/names-zh.ts` `CHARACTER_NAME_ZH`.
2. **Read vendor sheet** `vendor/go/gi/sheets/src/Characters/<GoKey>/index.tsx`. If missing → fallback: `python3 scripts/dump-char.py <GoKey>` and read talent text carefully.
3. **Identify scaling per formula** (from vendor sheet `dmgNode`/`lunarDmg`; fallback: explicit text "基于X的Y%").
4. **Inventory passives + constellations**: which scale to char's own stat, which propagate to team, which need a cond toggle.
5. **Create `src/calc/sheets/<GoKey>.ts`** — CharacterSheet with conds + apply() for stat buffs (any `ownBuff.premod.X.add(...)` / `teamBuff.premod.X.add(...)` from the vendor sheet).
6. **Create `src/calc/sheets/<GoKey>-formulas.ts`** — FormulaDef[] mapped from `dmgFormulas.{normal,charged,plunging,skill,burst}`. Add `applyXFormulaBuffs()` if the char has damage-side premod (moon-reaction boosts, etc.). Add `xQResShred()` style function if A1/Q shreds enemy RES.
7. **Wire**:
   - `src/calc/sheets/index.ts`: import + add to `characterSheets` map.
   - `src/calc/build.ts`: dispatch in the `if (goCharKey === 'X')` chain (call `applyXFormulaBuffs`, set `formulaDefs`, set `enemyForEval` RES shred).
   - `src/integration/buff-sources.ts`: `<CHAR>_BUFFS: CharacterBuffDescriptor` with one entry per cond/passive/constellation, `scope: 'self' | 'team'` tagged. Register in `CHARACTER_BUFF_DESCRIPTORS`.
8. **Verify**:
   - `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v vendor` — should be empty (or just pre-existing test/store warnings).
   - `npx vitest run --no-coverage` — should pass (ignore pre-existing Shenhe NO 4pc baseline failure).

---

## Auto-array reference (auto talent skillParam indexing)

For polearm / sword / claymore (no aim-charge):
- `auto[0..2]` → N1..N3 multi-hit chain (some have N4/N5)
- `auto[N..]` → continuation
- `auto[k]` → charged
- `auto[k+1]` → charged stamina (NOT a multiplier — skip)
- `auto[last 3]` → plunging_dmg / plunging_low / plunging_high

For bow:
- `auto[0..2]` → N1..N3
- `auto[3]` → charged_aim (un-aimed, physical)
- `auto[4]` → charged_full (fully-aimed, char element)
- `auto[5..7]` → plunging triplet

For catalyst:
- `auto[0..3]` → N1..N4 char element
- `auto[4]` → charged char element (usually heavy)
- `auto[5..7]` → plunging triplet

Always `console.log(`auto.length=${skillParam.auto.length}`)` once and verify the layout matches expectations before committing the index mapping.

---

## Done condition

- ✅ Scaffold compiles (`npx tsc --noEmit`)
- ✅ Tests pass (`npx vitest run`) — ignore pre-existing failures
- ✅ Character renders in `/team` with correct panel stats + formula list
- ✅ Pinning a formula gives sensible substat margins (DEF chars favor DEF%, ATK chars favor ATK%, EM chars favor EM)
- ✅ Buff descriptor entries appear under the right slot in the cond panel, with `scope: 'self'` ones hidden on non-focus

---

## Notes / pitfalls

- **Effective talent level**: if the char has C3 / C5, the affected talent gets +3. Use `effSkill(scope)` / `effBurst(scope)` helpers from `Shenhe-formulas.ts` if you need it; for most chars the talent var directly is fine.
- **Fail-fast scope reads**: every `v('cond.<sheet>.<name>')` read MUST have an explicit default `0`, e.g. `v('cond.Linnea.c2Resonance', 0)`. The AST throws on missing vars.
- **Icy-Quill flat-add pattern**: `when(ne(v('cond.<sheet>.<flag>', 0), 0), prod(v('final.atk'), lookup(coeffTable, sub(v('talent.x'), 1))), 0)` then sum into the formula's base.
- **C2 conds sharing a trigger with A1** (e.g. Shenhe `burstField`): use ONE cond name, gate by constellation via `ifGE` in the AST or `if (ctx.constellation >= 2)` in apply().
- **Burst that's a heal**: if `burst[0]` at lv1 is >> 5, it's likely a heal flat-amount (e.g. Linnea's burst). Don't model as damage — there's no heal formula type yet.
- **Companion damage** (Lumi / 阳华 / Ushi / etc.): scales with the parent character's stat. Model as `final.def` / `final.atk` of the focus character (since we don't have multi-source-stat propagation).
- **Enemy RES debuffs** (`-X% Y抗性`): write `xQResShred(scope, condState)` returning the shred amount. In `build.ts`, apply via `enemyForEval = { ...enemy, preRes: { ...enemy.preRes, <ele>: (enemy.preRes?.<ele> ?? 0.1) - r } }`.
- **Cross-character stat propagation** (e.g. Linnea A4 DEF×5% → active char's EM): we don't have this yet. Mark TODO and skip.
