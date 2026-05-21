# Rewrite src/calc/sheets/*.ts so every hand-typed weapon / artifact-set /
# character name becomes a reference into the canonical name tables in
# src/calc/data/names-zh.ts. Replaces the literal Chinese strings with
# `${W.<key>}` / `${A.<key>}` template-literal interpolations, switching
# single-quoted strings to backticks where needed.

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NAMES_ZH = open(os.path.join(ROOT, 'src/calc/data/names-zh.ts'), encoding='utf-8').read()

def load_table(varname: str) -> dict:
    block = re.search(rf'export const {varname}: Record<string, string> = \{{\n((?:  [A-Za-z]\w*: "[^"]+",\n)+)\}}', NAMES_ZH)
    if not block:
        raise SystemExit(f'no table {varname}')
    out = {}
    for line in block.group(1).splitlines():
        m = re.match(r'^  (\w+): "([^"]+)",', line)
        if m:
            out[m.group(2)] = m.group(1)  # zh-name -> key
    return out

WEAPON_NAMES = load_table('WEAPON_NAME_ZH')
SET_NAMES = load_table('ARTIFACT_SET_NAME_ZH')
CHAR_NAMES = load_table('CHARACTER_NAME_ZH')

# Process each sheet file
SHEETS_DIR = os.path.join(ROOT, 'src/calc/sheets')
TARGETS = []
for fn in os.listdir(SHEETS_DIR):
    if fn.endswith('.ts') and fn != 'index.ts':
        TARGETS.append(os.path.join(SHEETS_DIR, fn))

# A combined name -> (alias, key) lookup. Weapons + sets + chars share the
# alias space because the names themselves never collide.
def make_repl_table():
    out = {}
    for zh, key in WEAPON_NAMES.items():
        out[zh] = ('W', key)
    for zh, key in SET_NAMES.items():
        if zh in out:
            continue
        out[zh] = ('A', key)
    for zh, key in CHAR_NAMES.items():
        if zh in out:
            continue
        out[zh] = ('C', key)
    return out

REPL = make_repl_table()
# Sort by length descending so longer names get matched first (avoid partial-
# match issues).
SORTED_NAMES = sorted(REPL.keys(), key=len, reverse=True)

def replace_in_string(s: str, used_aliases: set) -> str:
    """Replace any canonical-name substring with ${X.key}; switch quotes."""
    # s includes the surrounding quote chars. Detect quote style.
    if not (s[0] in "'\"`" and s[-1] == s[0]):
        return s
    quote = s[0]
    body = s[1:-1]
    # Find any name occurrence
    hits = []
    for name in SORTED_NAMES:
        idx = 0
        while True:
            i = body.find(name, idx)
            if i < 0:
                break
            hits.append((i, len(name), name))
            idx = i + len(name)
    if not hits:
        return s
    # Resolve overlap by keeping first hits (sorted by position then length desc)
    hits.sort(key=lambda h: (h[0], -h[1]))
    cleaned = []
    last_end = -1
    for h in hits:
        if h[0] >= last_end:
            cleaned.append(h)
            last_end = h[0] + h[1]
    # Build new body
    out_parts = []
    cursor = 0
    for (i, ln, name) in cleaned:
        out_parts.append(body[cursor:i])
        alias, key = REPL[name]
        out_parts.append(f'${{{alias}.{key}}}')
        used_aliases.add(alias)
        cursor = i + ln
    out_parts.append(body[cursor:])
    new_body = ''.join(out_parts)
    if new_body == body:
        return s
    # Switch single-quoted to backticks since we now have ${} interpolation.
    if quote == "'" or quote == '"':
        # Need to escape any existing backticks or ${...} sequences not from
        # us. None expected in our sheet files; assert if found.
        # Also escape any existing ` characters in body.
        new_body = new_body.replace('\\`', '`').replace('`', '\\`')
        return '`' + new_body + '`'
    # Already backtick — leave wrapping alone.
    return quote + new_body + quote

# Token-level rewrite: process the file, replacing string literals one at a time.
STRING_RE = re.compile(r"""(`(?:[^`\\]|\\.|\$\{[^}]*\})*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")""", re.DOTALL)

for path in sorted(TARGETS):
    src = open(path, encoding='utf-8').read()
    used = set()
    def replace(m):
        return replace_in_string(m.group(0), used)
    new = STRING_RE.sub(replace, src)
    if new == src and 'names-zh' in src:
        continue
    if used:
        imports_to_add = []
        if 'W' in used and 'WEAPON_NAME_ZH as W' not in new:
            imports_to_add.append('WEAPON_NAME_ZH as W')
        if 'A' in used and 'ARTIFACT_SET_NAME_ZH as A' not in new:
            imports_to_add.append('ARTIFACT_SET_NAME_ZH as A')
        if 'C' in used and 'CHARACTER_NAME_ZH as C' not in new:
            imports_to_add.append('CHARACTER_NAME_ZH as C')
        if imports_to_add:
            line = "import { " + ", ".join(imports_to_add) + " } from '../data/names-zh'\n"
            # Insert after the last existing import line at top of file
            lines = new.split('\n')
            last_import = -1
            for i, l in enumerate(lines):
                if l.startswith('import '):
                    last_import = i
            if last_import >= 0:
                lines.insert(last_import + 1, line.rstrip('\n'))
            else:
                lines.insert(0, line.rstrip('\n'))
            new = '\n'.join(lines)
    if new != src:
        open(path, 'w', encoding='utf-8', newline='\n').write(new)
        print(f'rewrote {os.path.basename(path)}')
    else:
        print(f'  (no change) {os.path.basename(path)}')
