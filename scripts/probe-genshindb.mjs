// Probe what data genshin-db actually provides for Mona — talents,
// constellations, scaling tables, both English and Chinese.
import genshindb from 'genshin-db'

function dump(label, obj) {
  console.log('='.repeat(70))
  console.log(label)
  console.log('-'.repeat(70))
  console.log(JSON.stringify(obj, null, 2))
}

// --- English ---
const monaEN = genshindb.characters('mona')
const monaTalentEN = genshindb.talents('mona')
const monaConstEN = genshindb.constellations('mona')

dump('character/mona (EN) — top-level keys', Object.keys(monaEN ?? {}))
dump('talents/mona (EN) — top-level keys', Object.keys(monaTalentEN ?? {}))
dump('constellations/mona (EN) — top-level keys', Object.keys(monaConstEN ?? {}))

console.log()
console.log('### TALENTS (English) — combat3 = burst ###')
console.log(JSON.stringify(monaTalentEN.combat3 ?? {}, null, 2))

console.log()
console.log('### CONSTELLATIONS (English) — c1, c4, c6 ###')
console.log(JSON.stringify(monaConstEN.c1 ?? {}, null, 2))
console.log('---')
console.log(JSON.stringify(monaConstEN.c4 ?? {}, null, 2))
console.log('---')
console.log(JSON.stringify(monaConstEN.c6 ?? {}, null, 2))

// --- Chinese (Simplified) ---
console.log()
console.log()
console.log('############### 中文 ###############')
const monaTalentZH = genshindb.talents('mona', { resultLanguage: 'ChineseSimplified' })
const monaConstZH = genshindb.constellations('mona', { resultLanguage: 'ChineseSimplified' })

console.log('### Q (combat3) 中文 ###')
console.log(JSON.stringify(monaTalentZH?.combat3 ?? {}, null, 2))

console.log()
console.log('### 命座 c1 中文 ###')
console.log(JSON.stringify(monaConstZH?.c1 ?? {}, null, 2))
console.log('### 命座 c4 中文 ###')
console.log(JSON.stringify(monaConstZH?.c4 ?? {}, null, 2))
console.log('### 命座 c6 中文 ###')
console.log(JSON.stringify(monaConstZH?.c6 ?? {}, null, 2))
