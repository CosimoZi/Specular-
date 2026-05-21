---
description: Scaffold a new character sheet in src/calc/sheets/ from skillParam_gen + raw data, with talent multipliers wired and a TODO checklist for buffs. Usage `/add-character <GoKey>` (e.g. `/add-character KamisatoAyaka`).
---

# /add-character

Argument: GO-style key (`Shenhe`, `KamisatoAyaka`, etc.) as it appears in `src/integration/go-id-map.json` under `map.characters`.

## Goal

Produce a runnable scaffold that:
1. Compiles + passes existing tests
2. Auto-wires the mechanical pieces (13 talent damage formulas, element/move gates per weapon type, scaling stat)
3. Leaves a clean TODO checklist for me to fill (cond model + cond-gated buffs + special mechanics)

Reference implementation: `src/calc/sheets/Shenhe.ts` + `Shenhe-formulas.ts`. Follow that pattern exactly.

## Steps

### 0. Resolve the key

Read `src/integration/go-id-map.json`. The arg should be a value in `map.characters`. Reverse-lookup to find the internal id. If unknown, list nearby keys and stop.

### 1. Read source data

- `src/data/raw/characters.json[id]` → `name` (canonical zh), `element`, `weaponType`, `rarity`. Use this for sanity-checking the GO-side data.
- `src/data/raw/characters.json[id].talent` and `.passive` and `.constellation` if present — these contain wiki-style effect descriptions in Chinese, useful for the checklist.
- `vendor/go/gi/stats/src/allStat_gen.json`:
  - `char.data.<key>` for `lvlCurves`, `ascensionBonus`, `ele`, `weaponType`
  - `char.skillParam.<key>` for the talent multiplier arrays: `auto`, `skill`, `burst`, `passive1`, `passive2`, `passive3`, `constellation1..6`

### 2. Generate `src/calc/sheets/<GoKey>.ts`

Template (fill `<GoKey>`, `<NAME>` from `CHARACTER_NAME_ZH`):

```ts
import type { CharacterSheet } from '../sheet-types'

// <NAME zh> / <Name en> — wired by Specular.
//
// Conds: TODO — read raw/characters.json[id].constellation + .passive for
// effect descriptions, then decide which entries belong as bool / num / list
// conds. See Shenhe.ts for the pattern.

export const <GoKey>: CharacterSheet = {
  key: '<GoKey>',
  conds: [
    // TODO: fill per buff list. Naming convention: a4Hold/a4Press for window
    // toggles, burstField for active-Q states, c4Stacks etc. for stack count.
  ],
  apply(_scope, _ctx, _condState) {
    // Most character buffs are damage-side (not panel). Stays no-op unless
    // the char has a stat-affecting ascension passive (rare — Bennett's Q ATK,
    // Yelan HP scaling, etc.).
  },
}
```

### 3. Generate `src/calc/sheets/<GoKey>-formulas.ts`

The 13 damage formulas. Element rules per `weaponType`:

| weaponType | normals | charged | plunging | skill/burst |
|---|---|---|---|---|
| polearm | physical | physical | physical | char-element |
| sword   | physical | physical | physical | char-element |
| claymore | physical | physical | physical | char-element |
| bow     | physical | char-element (aimed) | physical | char-element |
| catalyst | char-element | char-element | physical | char-element |

Scaling stat — default `final.atk`. Exceptions (read wiki / talent description):
- HP scaling: HuTao, Zhongli, Yelan, Nilou, KamisatoAyato (his skill scales HP via 4pc), HuTao (her E gives HP-based ATK)
- DEF scaling: AratakiItto, NobleeAlbedo (transient sword formula), Gorou
- EM scaling: weapon's-passive territory (see Staff of Scarlet Sands), not the formula itself.

When unsure, default to ATK and leave a TODO comment.

Hit-array indexing (most polearm/sword/claymore):
- `auto[0..2]` → N1..N3
- `auto[3]` → N4a single hit (or N4 total if combined)
- `auto[4]` → N4b duplicate (skip)
- `auto[5]` → N5
- `auto[6]` → charged
- `auto[7]` → charged stamina cost (NOT a multiplier — skip)
- `auto[8]` → plunging_dmg (initial)
- `auto[9]` → plunging_low
- `auto[10]` → plunging_high

Some weapon types have different shapes:
- Bow: `auto[5]` is aimed shot (charged); plunging follows the standard offset
- Catalyst: charged may be a separate array; check by length

**Always print `auto.length` and the first row of each table** in the checklist so I can verify the layout before trusting the index mapping.

Use the Shenhe-formulas template (`atkProd`, `icyQuillFlat` style cond-gated additions) as the reference.

### 4. Register in `src/calc/sheets/index.ts`

Add the imports + entries to `characterSheets`. Also import + invoke `applyXxxFormulaBuffs` in `build.ts` IF the character has damage-side buffs (most do). Mirror the Shenhe wiring in `build.ts`:

```ts
if (goCharKey === '<GoKey>') applyXxxFormulaBuffs(scope, condState)
```

And formula definitions:
```ts
const formulaDefs = goCharKey === '<GoKey>' ? XxxFormulas : []
```

(For now, build.ts has a Shenhe-specific branch. Once 3+ characters are wired, refactor to a map keyed by GoKey.)

### 5. Smoke test

```
cd /home/cosimo/specular && npx vitest run src/calc/ 2>&1 | tail
```

All existing tests must still pass.

### 6. Output TODO checklist

Print a Chinese checklist for the user / me to fill, structured as:

```
### <GoKey> 骨架已装好。还需要决定:

天赋数据
- skillParam.auto.length = N (期望 11)
- skillParam.skill.length = M, burst.length = K
- 标量缩放: ATK / HP / DEF / mixed
- 元素附魔: 是否有(挂在 prep.ele 上)?

天赋被动 (raw/characters.json[id].passive 的描述)
- A1: <wiki 文本> → 模型化为: ?
- A4: <wiki 文本> → 模型化为: ?

命之座 (raw/characters.json[id].constellation)
- C1: <wiki 文本> → ?
- C2: <wiki 文本> → ?
- C3: 天赋 +3 (skill 还是 burst?)
- C4: ?
- C5: 天赋 +3 (skill 还是 burst?)
- C6: ?

特殊机制
- Icy-Quill 样的"基础区 flat 加值"?
- 前台/后台不同效果?
- 队内某元素数量 cond?

下一步:把 cond 模型告诉我,或者 spawn 一个 explore subagent 去读 wiki 把 cond 模型先草拟出来。
```

## Notes / pitfalls

- **Canonical zh names**: NEVER hand-type. Always import `CHARACTER_NAME_ZH` from `src/calc/data/names-zh.ts` and reference `${CHARACTER_NAME_ZH.<GoKey>}` in source labels. Same for weapons (`WEAPON_NAME_ZH`) and artifact sets (`ARTIFACT_SET_NAME_ZH`).
- **Effective talent level**: if the char has C3 / C5, the affected talent gets +3. Use `effSkill(scope)` / `effBurst(scope)` helpers from Shenhe-formulas.ts (or copy the pattern).
- **Fail-fast scope reads**: declare all `cond.<sheet>.<name>` reads with explicit default `0` (via `v('name', 0)`). The AST throws on missing vars.
- **Icy-Quill pattern**: if the character has a "flat add to base damage for element X", wrap it with `when(ne(v('cond.<sheet>.<flag>', 0), 0), prod(v('final.atk'), lookup(coeffTable, 'talent.x')), 0)` and sum into the formula's base.
- **C2 conds** that share a trigger with A1 (e.g. Shenhe burstField): use ONE cond name and gate by constellation level with `cmpGE`.

## Done condition

- Scaffold compiles
- Existing tests pass (current count: 28 tests in `src/calc/__tests__/`)
- Checklist is printed
- The user reviews the checklist and tells me how to model the buffs, or asks me to spawn a subagent to read wiki and propose the cond model
