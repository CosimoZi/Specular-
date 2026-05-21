// Patched by Specular: original used `process.env['NODE_ENV']` which crashes in
// the browser. Use Vite's import.meta.env when present, otherwise fall back to
// the Node global (so the same module works in tests + Node tooling).
const env: Record<string, string | undefined> =
  // @ts-expect-error — import.meta.env is Vite-injected at build time
  (typeof import.meta !== 'undefined' && (import.meta as any).env) ||
  (typeof process !== 'undefined' && process.env) ||
  {}

export const isDev = env['NODE_ENV'] === 'development' || env['DEV'] === 'true' || env['MODE'] === 'development'
export const shouldShowDevComponents =
  isDev || env['NX_SHOW_DEV_COMPONENTS'] === 'true'
