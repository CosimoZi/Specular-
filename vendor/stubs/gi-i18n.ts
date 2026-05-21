// Stub for @genshin-optimizer/gi/i18n — the real module spins up i18next with
// an HTTP backend that fetches /assets/locales/... at runtime. We don't render
// GO's UI strings so we don't need any of that — and the failing fetches
// surface as CORS errors on our deploy.

export const languageCodeList = ['en'] as const

// Minimal i18n shim with the API surface gi/sheets touches.
const noopT = ((key: string) => key) as unknown as (k: string) => string
export const i18n = {
  t: noopT,
  language: 'en',
  exists: () => true,
  on: () => {},
  off: () => {},
  changeLanguage: () => Promise.resolve(),
  services: {
    formatter: {
      add: () => {},
    },
  },
} as unknown as {
  t: (k: string) => string
  language: string
  exists: (k: string) => boolean
  on: (...args: unknown[]) => void
  off: (...args: unknown[]) => void
  changeLanguage: () => Promise<unknown>
}

// Translate component — gi/i18n exports this; we replace with a stub that
// just renders the key as plain text (no React deps to avoid bundling).
// Actually we DO need React since charTemplates uses <Translate /> in JSX —
// keep it minimal.
export function Translate(props: { ns18?: string; key18?: string; values?: Record<string, unknown> }): null {
  void props
  return null
}
