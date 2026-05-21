# Generate src/calc/data/names-zh.ts from the local ambr.top-sourced JSONs.
# Provides the authoritative Chinese name for every weapon / artifact set /
# character, keyed by GO-style key (e.g. CalamityQueller -> 息灾).
#
# Re-run when src/data/raw/{weapons,artifacts,characters}.json refreshes.
# Usage: python scripts/gen-names-zh.py

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return json.load(f)

weapons = load('src/data/raw/weapons.json')
arts    = load('src/data/raw/artifacts.json')
chars   = load('src/data/raw/characters.json')
idmap   = load('src/integration/go-id-map.json')['map']

def rev(m):
    return {v: k for k, v in m.items()}

weapon_rev = rev(idmap['weapons'])
artifact_rev = rev(idmap['artifacts'])
char_rev = rev(idmap['characters'])

def build_dict(rev_map, source):
    out = {}
    for go_key, internal in rev_map.items():
        e = source.get(str(internal))
        if e and 'name' in e:
            out[go_key] = e['name']
    return out

WEAPON_ZH = build_dict(weapon_rev, weapons)
ARTIFACT_ZH = build_dict(artifact_rev, arts)
CHAR_ZH = build_dict(char_rev, chars)

out_path = os.path.join(ROOT, 'src', 'calc', 'data', 'names-zh.ts')
with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// AUTO-GENERATED from src/data/raw/{weapons,artifacts,characters}.json.\n')
    f.write('// Data origin: ambr.top (the same source Specular uses for stat data).\n')
    f.write('// Regenerate via scripts/gen-names-zh.py. Do not edit by hand.\n\n')
    for varname, m in [
        ('WEAPON_NAME_ZH', WEAPON_ZH),
        ('ARTIFACT_SET_NAME_ZH', ARTIFACT_ZH),
        ('CHARACTER_NAME_ZH', CHAR_ZH),
    ]:
        f.write(f'export const {varname}: Record<string, string> = {{\n')
        for k in sorted(m.keys()):
            v = m[k].replace('"', '\\"')
            f.write(f'  {k}: "{v}",\n')
        f.write('}\n\n')

print(f'wrote {out_path}')
print(f'  weapons: {len(WEAPON_ZH)}  artifacts: {len(ARTIFACT_ZH)}  chars: {len(CHAR_ZH)}')
print(f'  sanity: CalamityQueller -> {WEAPON_ZH.get("CalamityQueller")}')
print(f'  sanity: Shenhe -> {CHAR_ZH.get("Shenhe")}')
print(f'  sanity: NoblesseOblige -> {ARTIFACT_ZH.get("NoblesseOblige")}')
