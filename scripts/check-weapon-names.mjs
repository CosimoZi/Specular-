import genshindb from 'genshin-db'

const targets = [
  { id: 12515, zh: '狼的武功歌' },
  { id: 11513, zh: '静水流涌之辉' },
  { id: 11431, zh: '息燧之笛' },
  { id: 15041, zh: '穹境示现之夜', type: 'art' },
  { id: 15043, zh: '晨星与月的晓歌', type: 'art' },
  { id: 15021, zh: '华馆梦醒形骸记', type: 'art' },
]

for (const t of targets) {
  // Look up by Chinese name in genshin-db
  const fn = t.type === 'art' ? genshindb.artifacts : genshindb.weapons
  const enResult = fn(t.zh, { resultLanguage: 'English', queryLanguages: ['ChineseSimplified'] })
  const idLookup = fn(t.zh, { queryLanguages: ['ChineseSimplified'] })
  console.log(`id=${t.id}  zh="${t.zh}"`)
  console.log(`  EN: ${enResult?.name || '— not found in gdb'}  (gdb id=${idLookup?.id || '?'})`)
}
