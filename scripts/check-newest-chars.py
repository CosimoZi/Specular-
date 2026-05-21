import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chars_raw = json.load(open(os.path.join(ROOT, 'src/data/raw/characters.json'), encoding='utf-8'))
stats = json.load(open(os.path.join(ROOT, 'vendor/go/gi/stats/src/allStat_gen.json'), encoding='utf-8'))
idmap = json.load(open(os.path.join(ROOT, 'src/integration/go-id-map.json'), encoding='utf-8'))['map']['characters']

for cid in ['10000132', '10000131', '10000130', '10000129', '10000128']:
    if cid not in chars_raw:
        continue
    e = chars_raw[cid]
    name = e.get('name', '?')
    go = idmap.get(cid, '')
    has_talent_desc = bool(e.get('talent'))
    has_cons_desc = bool(e.get('constellation'))
    in_stats_data = go in stats['char']['data'] if go else False
    in_skillparam = go in stats['char']['skillParam'] if go else False
    wt = e.get('weaponType')
    el = e.get('element')
    print(f'{cid} {name}  GoKey={go!r}')
    print(f'  raw.talent: {has_talent_desc}  raw.constellation: {has_cons_desc}')
    print(f'  stats.data: {in_stats_data}  stats.skillParam: {in_skillparam}')
    print(f'  weaponType: {wt}  element: {el}')
    print()
