---
description: Implement the next pending item from docs/IMPLEMENTATION_QUEUE.md. Does ONE item end-to-end (sheet + buffs + typecheck + queue update), then stops. Use repeatedly to make slow steady progress.
---

# /next

**Single rule that supersedes everything else: ONE item per invocation, then STOP.**

Don't be tempted to "do one more while we're here." That's exactly how we end up with half-finished work and lost context. Finish one item cleanly, update the queue, report, stop. The user will run `/next` again when they want the next one.

---

## Workflow

### Step 1: Read the queue
Read `docs/IMPLEMENTATION_QUEUE.md` in full. The format is `- <emoji> \`<Key>\` — 中文名 — 类型/元素 — 备注`.

### Step 2: Pick the next item
Find the **first** line matching `^- 📋 ` in document order. Extract:
- The **key** (backticked, e.g. `HuTao`)
- The **section** it's under by tracing upward to the nearest `##` heading (角色 / 武器 / 圣遗物)

If no `📋` exists → tell the user "队列空了" and stop. Don't try to scrape new candidates.

### Step 3: Mark in-progress
Edit the line: change `📋` → `🚧`. This is an anti-collision marker so a parallel session would skip it. Save the file before doing any other work.

### Step 4: Verify vendor data exists
Confirm the vendor source file is present (Glob has missed real directories — always use `ls` via Bash):
- **Character:** `ls vendor/go/gi/sheets/src/Characters/<Key>/`
- **Weapon:** try each type dir until you find it: `ls vendor/go/gi/sheets/src/Weapons/Sword/<Key>/` etc.
- **Artifact set:** `ls vendor/go/gi/sheets/src/Artifacts/<Key>/`

If missing → revert status to 📋, add a note `备注` like "vendor sheet 缺失, 等同步", tell the user, stop.

### Step 5: Implement
Branch on section:

#### 引擎工程 (Engine work)
1. No vendor sheet to read — the queue 备注 IS the spec
2. Read existing code thoroughly before changing — these touch cross-cutting concerns (scope keys, formula.ts, build.ts phases, sheet apply hooks)
3. Make the minimal change that satisfies the spec; resist scope creep into related items (those have their own queue entries)
4. If the spec is wrong or under-specified, STOP and ask the user — don't extrapolate
5. After implementing, also UPDATE THE BUFF DESCRIPTORS in `buff-sources.ts` (and/or sheet `buffs: [...]`) for anything that becomes correctly modeled — remove "未在引擎建模" / "engine gap" notes
6. Verify typecheck AND that at least one previously-broken character now computes correctly (re-read the relevant sheets to confirm wiring is end-to-end)

#### 角色 (Character)
Follow `.claude/skills/add-character/SKILL.md` end-to-end. Use the queue key as the `<GoKey>` argument. That skill is comprehensive — don't re-derive its rules here.

When done, the character should:
- Compile (`npx tsc --noEmit` exits 0)
- Be registered in `src/calc/sheets/index.ts` → `characterSheets`
- Have an entry in `src/integration/buff-sources.ts` → `CHARACTER_BUFF_DESCRIPTORS` with at minimum 1 buff descriptor per gated passive/constellation
- Be dispatched in `src/calc/build.ts` (formulaDefs, applyXFormulaBuffs, RES shred if any)

#### 武器 (Weapon)
1. Read the vendor sheet `vendor/go/gi/sheets/src/Weapons/<Type>/<Key>/index.tsx` top-to-bottom
2. Choose location:
   - **If a batch file exists for that weapon type** (e.g. `src/calc/sheets/polearms-batch1.ts`) — append the new weapon to it; use the existing `wepBuff()` helper
   - **Otherwise** — create `src/calc/sheets/<Key>.ts` modeled after `CalamityQueller.ts` / `FluteOfEzpitzal.ts`
3. The `WeaponSheet` must define:
   - `key`
   - `conds: CondDef[]` — toggles for any non-always-on passive
   - `buffs: BuffEntry[]` — descriptor rows; default `scope: 'self'` (weapon passives only buff the wielder); set `sheetKey: '<Key>'` on each entry
   - `apply(scope, ctx, condState)` — refinement-aware effect application using `ctx.refinement` (1..5)
4. Register in `src/calc/sheets/index.ts` → `weaponSheets`
5. Vendor → Specular cheat sheet:
   - `ownBuff.premod.atk_.add(X)` → `scope.add('weap.passive.atk_', X, source)` (or `premod.atk_` for cleaner provenance)
   - `ownBuff.premod.<ele>_dmg_.add(X)` → `scope.add('premod.dmg_.<ele>', X, source)`
   - `ownBuff.premod.critRate_.add(X)` → `scope.add('premod.critRate_', X, source)`
   - Refinement values typically scale linearly: R1→R5 = base, +25%, +50%, +75%, +100% of base. Read actual table from `dm.passive.X` array.
6. Mark always-on rows without `condName` (renders with `✓ 常驻` indicator). Only add a cond toggle for things the player can fail to trigger (stacks, post-skill window, etc.).

#### 圣遗物 (Artifact set)
1. Read the vendor sheet `vendor/go/gi/sheets/src/Artifacts/<Key>/index.tsx` top-to-bottom — note 2pc and 4pc separately, and any conds (`cond(key, '...')` declarations)
2. Choose location:
   - **Default:** append to `src/calc/sheets/artifact-sets-batch1.ts` — use existing `af2pc()` / `af4pc()` helpers
   - **Complex 4pc with per-element cond grid** (like Scroll of the Hero) → may warrant its own file
3. The `ArtifactSetSheet` must define:
   - `key`
   - `conds: CondDef[]` — toggles for the conditional 4pc effects
   - `buffs: BuffEntry[]` — descriptor rows; default `scope: 'self'`; flip to `scope: 'team'` ONLY for genuine team-wide buffs (NO 4pc, TotM 4pc, NoSU 4pc moon-react, SilkenMoons 4pc, DeepwoodMemories 4pc enemy debuff, etc.)
   - `apply(scope, count, condState)` — gate everything by `count >= 2` / `count >= 4`
   - `applyAsTeammate(focusScope, count, condState, wearer)` — **only if** the 4pc affects teammates (cross-char). Add when the vendor sheet uses `teamBuff.premod.X.add(...)`. Use `${wearer.goKey}` in the source string so the user can see which slot is the donor.
4. Register in `src/calc/sheets/index.ts` → `artifactSetSheets`
5. **Self-only sets with no user choice** (Husk maxed stacks, Vermillion maxed) → bake max-stack into `apply()` with `conds: []`. Quote from user: "属性只给自己一个人的情况, 我不希望出现在 buff 栏里, 直接算吃满记在人物面板里就可以". Still declare `buffs: [...]` with no `condName`.

### Step 6: Verify
Run from repo root:
```sh
wsl -d Ubuntu -- bash -lc "cd /home/cosimo/specular && npx tsc --noEmit"
```
Must exit 0. Fix anything that fails before continuing.

Vitest is optional — Shenhe NO-4pc baseline failure is pre-existing and unrelated.

### Step 7: Update queue
Edit `docs/IMPLEMENTATION_QUEUE.md`: change the line's `🚧` → `✅`.

If you uncovered something the user needs to know (engine gap, vendor sheet quirk, deferred work), add a short `备注` extension after the dash.

### Step 8: Report and STOP
Output a concise report:
- ✅ Done: `<Key>` (中文名)
- Files touched (just paths, no diffs)
- Typecheck: OK
- Next up (peek the new first `📋`): `<NextKey>` (中文名)

**Do not commit.** Leave changes for user review. (User has the rule: don't auto-commit without explicit ask.)

**Do not proceed to the next item.** Stop. User will invoke `/next` again.

---

## Failure modes — recover gracefully

- **Vendor sheet missing** → revert 🚧 → 📋, add note, stop.
- **Typecheck fails after impl** → fix the errors. If unable to resolve in reasonable effort, revert the line to 📋 with a 备注 explaining the blocker, leave failing code uncommitted, ask user.
- **Implementation reveals engine gap** (e.g. cross-char stat propagation needed and not modeled) → implement what's modelable, leave a `// TODO(engine-gap): ...` comment, complete the item with a 备注 noting the partial coverage. Mark ✅ — incremental progress is fine.
- **Conflict with existing implementation** (e.g. duplicate sheet) → check whether someone else added it manually; if so, just update queue status to ✅ and report.

---

## Anti-patterns — don't

- ❌ Doing 2+ items "while I'm here". The whole point is steady incremental progress, not bursts that overflow context.
- ❌ Skipping the typecheck. Broken code in main branch poisons future `/next` runs.
- ❌ Reordering the queue mid-run. The user owns ordering; you just take the top.
- ❌ Refactoring unrelated code. If you spot a bug, use `mcp__ccd_session__spawn_task` to flag it and keep going with the current item.
- ❌ Auto-committing.

---

## Quick reference — locations

| Thing | Path |
|---|---|
| Queue | `docs/IMPLEMENTATION_QUEUE.md` |
| Character recipe | `.claude/skills/add-character/SKILL.md` |
| Character sheets | `src/calc/sheets/<Key>.ts` + `<Key>-formulas.ts` |
| Weapon sheets | `src/calc/sheets/polearms-batch1.ts` (batch) or `<Key>.ts` |
| Artifact set sheets | `src/calc/sheets/artifact-sets-batch1.ts` (batch) |
| Sheet registry | `src/calc/sheets/index.ts` |
| Buff descriptors (chars) | `src/integration/buff-sources.ts` |
| Vendor sheets (source of truth) | `vendor/go/gi/sheets/src/{Characters,Weapons,Artifacts}/` |
| Stats data (skillParam etc.) | `vendor/go/gi/stats/src/allStat_gen.json` |
| Canonical names | `src/calc/data/names-zh.ts` |
| Build pipeline | `src/calc/build.ts` |
| Damage formula | `src/calc/formula.ts` |
