// Hand-curated scaling-stat overrides. The auto-extractor in scripts/extract-meta.mjs
// defaults every hit to ATK because ambr's row labels rarely state the scaling
// stat explicitly (the info lives in the talent's prose description, often as
// "造成相当于生命值上限X%的伤害" / "based on Max HP" etc.).
//
// Each entry overrides a slice of an extracted talent. Use:
//   role: 'auto' | 'skill' | 'burst' | '*'   — which talent
//   labelRegex: RegExp to match the row label, or undefined for ALL rows
//   scaling: the corrected scaling stat
//
// Only add entries you are confident about. Players can also override per-hit
// at runtime via the dropdown on the character detail page; this file just
// makes the defaults sensible for well-known outliers.

import type { ExtractedHit } from './meta'

export interface ScalingOverride {
  role: 'auto' | 'skill' | 'burst' | '*'
  labelRegex?: RegExp
  scaling: ExtractedHit['scaling']
}

export const SCALING_OVERRIDES: Record<string, ScalingOverride[]> = {
  // 胡桃 — E "血梅香" + Q "蝶引来生" 基于生命值上限
  '10000046': [
    { role: 'skill', scaling: 'hp' },
    { role: 'burst', scaling: 'hp' },
  ],

  // 夜兰 — E "萦络纵命索" + Q "玄掷玲珑" 全 HP-scaling
  '10000060': [
    { role: 'skill', scaling: 'hp' },
    { role: 'burst', scaling: 'hp' },
  ],

  // 那维莱特 — 重击 "灵息之刺" + E + Q 都 HP-scaling
  '10000087': [
    { role: 'auto', labelRegex: /灵息之刺/, scaling: 'hp' },
    { role: 'skill', scaling: 'hp' },
    { role: 'burst', scaling: 'hp' },
  ],

  // 钟离 — Q "天星" HP-scaling
  '10000030': [
    { role: 'burst', scaling: 'hp' },
  ],

  // 芙宁娜 — Q 主伤害 + 气氛值转化伤害都按 HP
  '10000089': [
    { role: 'burst', scaling: 'hp' },
  ],

  // 阿贝多 — E "阳华" + Q "诞辰光" DEF-scaling
  '10000038': [
    { role: 'skill', scaling: 'def' },
    { role: 'burst', scaling: 'def' },
  ],

  // 诺艾尔 — Q 大剑攻击 DEF-scaling（虽然显示为 ATK，实质 DEF 转化）
  '10000034': [
    { role: 'burst', scaling: 'def' },
  ],

  // 迪希雅 — Q "燃绽火心" 切换为 HP-scaling 状态
  '10000079': [
    { role: 'burst', scaling: 'hp' },
  ],

  // 莱依拉 — Q "星茫的幻巧" HP-scaling
  '10000074': [
    { role: 'burst', scaling: 'hp' },
  ],

  // 妮露 — Q 永世流沔 (花海芬芳) 部分 HP-scaling
  '10000070': [
    { role: 'burst', scaling: 'hp' },
  ],

  // 哥伦比娅 (Columbina) — 5.x「少女」型水法主 C，全套 HP-scaling
  '10000125': [
    { role: '*', scaling: 'hp' },
  ],
}

/** Apply overrides in place to a list of hits for a given role.
 *  Returns the same array (mutated) for chaining. */
export function applyOverrides(
  characterId: string,
  role: 'auto' | 'skill' | 'burst',
  hits: ExtractedHit[],
): ExtractedHit[] {
  const overrides = SCALING_OVERRIDES[characterId]
  if (!overrides) return hits
  for (const ov of overrides) {
    if (ov.role !== '*' && ov.role !== role) continue
    for (const h of hits) {
      if (ov.labelRegex && !ov.labelRegex.test(h.label)) continue
      h.scaling = ov.scaling
    }
  }
  return hits
}
