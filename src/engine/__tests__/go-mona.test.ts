// Stage 3: verify we can load Mona's data export from GO's sheet.
import { describe, it, expect } from 'vitest'

describe('GO Mona sheet — Stage 3', () => {
  it('imports Mona data export', async () => {
    // Try a dynamic import to surface any module-load errors clearly
    const mod = await import('../../../vendor/go/gi/sheets/src/Characters/Mona')
    expect(mod).toBeTruthy()
    expect(mod.data).toBeTruthy()
    // data should have shape from dataObjForCharacterSheet
    expect(typeof mod.data).toBe('object')
  })
})
