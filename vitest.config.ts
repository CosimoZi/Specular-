import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@genshin-optimizer/pando/engine': path.resolve(
        __dirname,
        'vendor/go/pando/engine/src/index.ts',
      ),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'vendor/**'],
  },
})
