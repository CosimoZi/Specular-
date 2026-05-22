# /add-character problems log

Running list of issues encountered while implementing moon-sign / new characters via the vendor-sheet-first methodology. Each entry tagged with character + brief note.

## Already covered (in main skill)

- **Glob misses real directories** — use `ls vendor/.../Characters/<Key>/` to confirm vendor sheet existence, never rely on Glob "No files found" alone.
- **`splitScaleDmgNode(['eleMas', 'def'], ...)` translation** — `sum(prod(EM, emCoef), prod(DEF, defCoef))`.
- **`customDmgNode(expr, 'move')`** — write the AST inline for `base`.
- **`strideAddl` / per-formula buff bundle** — `flat:` for dmgInc, `premod:` for dmg_ %.
- **Cross-char team buffs** (`teamBuff.total.X`, `input.activeCharKey === target.charKey`) — apply to focus only when focus IS this char.
- **`tally.<element>`** — expose as user-set `num` cond.
- **`tally.moonsign >= 2`** — approximate via `moonFull` bool cond.
- **Constellation effects' moon-full gating** — vendor's `greaterEq(tally.moonsign, 2, ...)` → our cond `moonFull` check.

## Per-character notes

### 莉奈娅 (Linnea) — already done

(Reference char. See Linnea.ts + Linnea-formulas.ts.)

### 兹白 (Zibai) — done

- C1 boost is `lunarcrystallize_dmg_` (per-formula % boost via `premod.moonReactionDmgBoost`), not a DEF-flat add. Initial guess wrong.
- C2 moon-full DEF flat is `(c2[1] - p1[0]) × DEF = 4.9 × DEF` (ADDITIONAL on top of A1's 0.6), not a separate 5.5.
- Vendor has 12 skill formulas (`stride1Dmg`, `stride2Dmg`, `shift4GleamDmg`, `shift1Dmg..shift4Dmg`, `shiftCaDmg`) — easy to miss the `shift` family which is 月转时隙 mode's N/C/E.
- A4 needs cross-char tally (`tally.geo - 1`, `tally.hydro`) — exposed as `num` cond (not yet for Zibai; TODO).

### 哥伦比娅 (Columbina) — done

- Vendor sheet has 3 separate moon-reaction skill formulas (`lunarchargedDmg`, `lunarbloomDmg`, `lunarcrystallizeDmg`) — all triggered by Gravity Interference, element depends on which reaction occurred.
- C4 has a possible vendor-sheet typo: `lunarcrystallize_dmgInc` uses `constellation4[1]` (same as lunarcharged) instead of `constellation4[3]`. Mirrored vendor behavior.
- C1-C6 each add `lunar_specialDmg_` (擢升). Summed unconditionally after each C-level unlock (no toggle).
- `burstDomain` cond adds `burst[1]` coefficient (per talent level) → moon-reaction dmgBoost.
- C2/C6 per-reaction-type CDmg buffs (`hydro_critDMG_` etc.) — per-element CDmg slots don't exist in our engine; not modeled.
- **`bloom` moon coefficient** in our `MOON_REACTION_COEFF` is placeholder `1.6` — Columbina is the first 月绽放 char, real coefficient unknown.

### 叶洛亚 (Illuga) — done

- Char ascension stat is `eleMas`, but normals/charged/plunging are ATK (not EM). Skill+burst are `splitScale(['eleMas', 'def'], ...)`.
- C2 hit is `customDmgNode(sum(prod(percent(c2[0]), EM), prod(percent(c2[1]), DEF)))` = `EM × 4 + DEF × 2`, tagged as burst.
- A4 mechanic: `geo_dmgInc` is a FLAT additive based on EM × coefficient (not a percent boost) — engine doesn't have a distinct flat-vs-percent geo slot. Approximated as `premod.dmg_.geo`. **Engine gap**: per-element flat-add (`<ele>_dmgInc`) is conceptually different from `<ele>_dmg_` (%).
- 夜莺之歌 21-stack consumption mechanic propagates EM-based bonuses to teammates' geo damage. Cross-char, not modeled.

### 爱诺 (Aino) — done (basic)

- 月感电/月绽放/月结晶 hydro char (triggers 3 moon reactions).
- All damage is ATK-scaling. Simpler than most.
- A4 `burst_dmgInc` is a FLAT additive (EM × 5%) into burst zone — **per-move flat slot doesn't exist in our engine**, approximated via comments only (not actually applied).
- C6 has 5 per-reaction `_dmg_` boosts (electrocharged/bloom/lunarcharged/lunarbloom/lunarcrystallize) using same coefficient — collapsed to `premod.moonReactionDmgBoost` (loses non-moon electrocharged/bloom variants).
- Coefficient values are placeholders (didn't read full vendor; need to reconcile with `dm.constellation*` exact numbers).

### 菲林斯 (Flins) — done (basic)

- 5★ Electro Polearm, 月感电 (electrocharged) char.
- ATK-scaling. A6 (passive3): ATK/100 × 0.7% → moon-base. Same pattern as Linnea/Zibai but ATK-based.
- Skill in "spear-storm" mode has electro-infused N1-N5 + charged (treated as `move: 'normal'`/`'charged'` but `element: 'electro'`).
- Burst has 4 directMoon lunarcharged hits (middle / final / thunder / thunder_addl).
- C2 `electro_enemyRes_` shred (-30%) → `flinsC2ElectroResShred()` function similar to Linnea/Shenhe.
- C4 always-on +20% ATK; C4 enables larger A4 EM cap (120 instead of 60).
- C6 +25% self + +50% team (moon-full gated) `lunarcharged_specialDmg_` → moonReactionElevation.

### 伊涅芙 (Ineffa) — done (basic)

- 5★ Electro Polearm. Also 月感电 char.
- ATK-scaling everywhere. Some lunarDmg lunarcharged hits at A1 / C2 / C6 levels.
- A4: ATK × 5% → EM (active char, requires burst trigger via `a4AfterBurst` cond).
- C1: After shield, ATK/100 × X% → lunarcharged_dmg_ (cap 15%).
- Coefficient values in code are placeholders — need full vendor lookup pass.

### 雅珂达 (Jahoda) — done (basic)

- 5★ Anemo Bow with cat companion 苗苗 that has 4 elemental infusions (pyro/hydro/electro/cryo).
- All ATK-scaling. Modeled 4 element variants of `skill_meow_X`.
- Complex 元素附魔/swirl mechanic — skipped detailed modeling.
- No A6 moon-base boost wired (need vendor confirmation on which stat scales).

### 菈乌玛 (Lauma) — done (basic)

- 5★ Dendro Catalyst. 月绽放 (bloom) char.
- ATK normals/charged + splitScale(ATK, EM) frostgroveDmg + lunarDmg lunarbloom skill[2] (hold2Dmg).
- C6 has eleMas-scaling lunarbloom hits (not modeled).
- 草露 stack mechanic skipped.

### 奈芙尔 (Nefer) — done (basic)

- 5★ Dendro Catalyst. 月绽放 char.
- splitScale(ATK, EM) on most skill/burst hits.
- Complex shade-state damage system (shade1/shade2/shade3 lunarDmg variants) — only partially modeled (skill_lunar entry).
- Lots of constellation effects skipped.

## Open engine gaps (cumulative)

1. **Cross-char stat propagation** — `teamBuff.premod.X` and especially `teamBuff.total.X` from non-focus chars don't reach focus calc. Affects: Zibai A4, Columbina C2 active-char buffs, Illuga A1 team, Aino C1 active EM, Flins/Ineffa team buffs, Nefer team-buff EM.
2. **Per-element flat-add slot** — `geo_dmgInc` (flat per-hit add) vs `geo_dmg_` (% multiplier). Illuga A4 / Aino A4 both hit this. Currently merged into `premod.dmg_.<ele>` which is approximate.
3. **Per-element CDmg slot** — `hydro_critDMG_` etc. (Columbina C6, others may need it).
4. **Per-reaction `_dmg_` slots** — `lunarcharged_dmg_`, `lunarbloom_dmg_`, etc. vs `moonReactionDmgBoost` (which is one bucket for all moon reactions). Aino C6 / Flins etc. would benefit from per-reaction split.
5. **Stack/state mechanics** — 时隙浮光 / 引力值 / 夜莺之歌 / 草露 / Nefer shade-stages: time-evolving resources, panel calc workaround = user-set `num` cond.
6. **`MOON_REACTION_COEFF.bloom` is placeholder** (1.6) — need real value from authoritative source. Lauma/Nefer/Columbina are bloom chars.
7. **Element infusion / weapon-normal element switching** — Flins's 月转时隙-like infusion (E mode changes N/C element), Jahoda's 苗苗 elemental cycling — currently hard-coded element per formula. No dynamic element-switching slot.
8. **Per-move flat-add slot** — `burst_dmgInc` (Aino A4 EM × 5% as flat into burst). Currently no slot.

## Coefficient TODO list

These were left as placeholders / approximations and need exact values from each vendor sheet's `dm` constants:
- Aino C2 `customDmg`: ATK × c2[0] + EM × c2[1] — used 1.5 + 5 as placeholder, real values from `skillParam.constellation2[0/1]`
- Flins A4 EM cap (60/120), C4 ATK% (0.2): need verification
- Ineffa C1 ATK-coefficient: used 0.005 / 100 placeholder
- Lauma + Nefer: most coefficients are direct table reads, but moon-base boost for these chars not yet wired (which stat scales?)
- Aino C6 reaction dmg_ (40%/40% moonFull): need exact `constellation6[0]/[1]` values
