// Stub for @genshin-optimizer/gi/assets. The real package is 118 MB of PNGs;
// we never render GO's UI so any string is acceptable. We make the API surface
// realistic enough that charTemplates and CharacterSheet can call into us
// without crashing at module-load.

const noImg = '/no-image.png'

const proxyTarget: Record<string, unknown> = {}
const stringProxy = new Proxy(proxyTarget, {
  get(_t, key) {
    if (typeof key !== 'string') return undefined
    // Auto-deep proxy: any property access returns either a string or a
    // nested proxy depending on call context.
    if (key === 'then' || key === 'toJSON') return undefined
    if (key === 'toString' || key === 'valueOf' || key === Symbol.toPrimitive) {
      return () => noImg
    }
    return stringProxy
  },
}) as Record<string, unknown>

export const imgAssets = stringProxy as unknown as Record<string, Record<string, string>>
export const characterAsset = (..._args: unknown[]): string => noImg
export const artifactAsset = (..._args: unknown[]): string => noImg
export const weaponAsset = (..._args: unknown[]): string => noImg
export const elementalAsset = (..._args: unknown[]): string => noImg
export const namecardAsset = (..._args: unknown[]): string => noImg
export const allStaticAssetsLoaded = Promise.resolve()

export default stringProxy
