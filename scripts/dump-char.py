# Dump everything about a character in one shot — for use by /add-character.
# Usage: python scripts/dump-char.py Linnea

import json, os, sys

if len(sys.argv) < 2:
    print('usage: dump-char.py <GoKey>')
    sys.exit(1)

key = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

idmap = json.load(open(os.path.join(ROOT, 'src/integration/go-id-map.json'), encoding='utf-8'))['map']['characters']
chars_raw = json.load(open(os.path.join(ROOT, 'src/data/raw/characters.json'), encoding='utf-8'))
stats = json.load(open(os.path.join(ROOT, 'vendor/go/gi/stats/src/allStat_gen.json'), encoding='utf-8'))
names_zh = open(os.path.join(ROOT, 'src/calc/data/names-zh.ts'), encoding='utf-8').read()

internal_id = None
for cid, gk in idmap.items():
    if gk == key:
        internal_id = cid
        break
if not internal_id:
    print(f'  GoKey {key!r} not in go-id-map')
    sys.exit(1)

raw = chars_raw.get(internal_id)
data = stats['char']['data'].get(key)
sp = stats['char']['skillParam'].get(key)
if not (raw and data and sp):
    print(f'  raw={bool(raw)} data={bool(data)} skillParam={bool(sp)}')
    sys.exit(1)

print(f'=== {key} (id={internal_id}, name={raw["name"]}) ===')
print(f'rarity: {raw.get("rank")}★  weaponType: {raw.get("weaponType")}  element: {raw.get("element")}')
print(f'data.ele: {data.get("ele")}  data.weaponType: {data.get("weaponType")}')
print(f'lvlCurves: {data["lvlCurves"]}')
print(f'ascensionBonus: {data["ascensionBonus"]}')
print()
print(f'-- skillParam ({key}) --')
for cat in ['auto', 'skill', 'burst', 'passive1', 'passive2', 'passive3', 'constellation1', 'constellation2', 'constellation3', 'constellation4', 'constellation5', 'constellation6']:
    if cat not in sp:
        continue
    rows = sp[cat]
    print(f'  {cat}: len={len(rows)}')
    for i, row in enumerate(rows):
        if isinstance(row, list):
            lv1 = row[0] if row else None
            lv10 = row[9] if len(row) > 9 else None
            lv15 = row[14] if len(row) > 14 else None
            print(f'    [{i}] lv1={lv1}  lv10={lv10}  lv15={lv15}')
        else:
            print(f'    [{i}] {row}')
print()

# Effect descriptions from raw
talents = raw.get('talent', {})
print(f'-- raw.talent ({len(talents)} entries) --')
for tid, t in talents.items():
    print(f'  [{tid}] {t.get("name")}')
    desc = t.get('description') or ''
    # Trim HTML-ish color tags for readability
    import re
    clean = re.sub(r'<[^>]+>', '', desc)
    print(f'    {clean[:200]}{"..." if len(clean) > 200 else ""}')

cons = raw.get('constellation', {})
print()
print(f'-- raw.constellation ({len(cons)} entries) --')
for cid_, c in cons.items():
    print(f'  [{cid_}] {c.get("name")}')
    desc = c.get('description') or ''
    import re
    clean = re.sub(r'<[^>]+>', '', desc)
    print(f'    {clean[:200]}{"..." if len(clean) > 200 else ""}')

# Check name in canonical table
import re
m = re.search(rf'  {key}: "([^"]+)"', names_zh)
print()
print(f'-- canonical zh name --')
print(f'  CHARACTER_NAME_ZH.{key} = {m.group(1) if m else "NOT FOUND"}')
