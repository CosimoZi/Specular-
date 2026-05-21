import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// GitHub Pages serves at /<repo>/, so build with that base.
// Override via VITE_BASE (e.g. "/" for a user/org site or custom domain).
const base = process.env.VITE_BASE ?? '/Specular-/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Vendored GO packages — see vendor/go/ and tsconfig.app.json paths.
      '@genshin-optimizer/pando/engine': path.resolve(__dirname, 'vendor/go/pando/engine/src/index.ts'),
      '@genshin-optimizer/common/util': path.resolve(__dirname, 'vendor/go/common/util/src/index.ts'),
      '@genshin-optimizer/gi/consts': path.resolve(__dirname, 'vendor/go/gi/consts/src/index.ts'),
      '@genshin-optimizer/gi/keymap': path.resolve(__dirname, 'vendor/go/gi/keymap/src/index.ts'),
      '@genshin-optimizer/gi/util': path.resolve(__dirname, 'vendor/go/gi/util/src/index.ts'),
      '@genshin-optimizer/gi/wr': path.resolve(__dirname, 'vendor/go/gi/wr/src/index.ts'),
      '@genshin-optimizer/gi/schema': path.resolve(__dirname, 'vendor/go/gi/schema/src/index.ts'),
      '@genshin-optimizer/gi/stats': path.resolve(__dirname, 'vendor/go/gi/stats/src/index.ts'),
      '@genshin-optimizer/gi/dm': path.resolve(__dirname, 'vendor/go/gi/dm/src/index.ts'),
      '@genshin-optimizer/gi/db': path.resolve(__dirname, 'vendor/go/gi/db/src/index.ts'),
      '@genshin-optimizer/gi/good': path.resolve(__dirname, 'vendor/go/gi/good/src/index.ts'),
      '@genshin-optimizer/gi/formula': path.resolve(__dirname, 'vendor/go/gi/formula/src/index.ts'),
      '@genshin-optimizer/gi/sheets': path.resolve(__dirname, 'vendor/go/gi/sheets/src/index.ts'),
      '@genshin-optimizer/gi/i18n': path.resolve(__dirname, 'vendor/stubs/gi-i18n.ts'),
      '@genshin-optimizer/gi/svgicons': path.resolve(__dirname, 'vendor/go/gi/svgicons/src/index.ts'),
      '@genshin-optimizer/gi/uidata': path.resolve(__dirname, 'vendor/go/gi/uidata/src/index.ts'),
      '@genshin-optimizer/common/database': path.resolve(__dirname, 'vendor/go/common/database/src/index.ts'),
      '@genshin-optimizer/common/pipeline': path.resolve(__dirname, 'vendor/go/common/pipeline/src/index.ts'),
      '@genshin-optimizer/common/svgicons': path.resolve(__dirname, 'vendor/go/common/svgicons/src/index.ts'),
      '@genshin-optimizer/common/ui': path.resolve(__dirname, 'vendor/go/common/ui/src/index.ts'),
      '@genshin-optimizer/game-opt/engine': path.resolve(__dirname, 'vendor/go/game-opt/engine/src/index.ts'),
      '@genshin-optimizer/game-opt/formula': path.resolve(__dirname, 'vendor/go/game-opt/formula/src/index.ts'),
      '@genshin-optimizer/gi/wr-types': path.resolve(__dirname, 'vendor/go/gi/wr-types/src/index.ts'),
      '@genshin-optimizer/gi/theme': path.resolve(__dirname, 'vendor/go/gi/theme/src/index.ts'),
      '@genshin-optimizer/gi/ui': path.resolve(__dirname, 'vendor/go/gi/ui/src/index.ts'),
      '@genshin-optimizer/gi/localization': path.resolve(__dirname, 'vendor/go/gi/localization/src/index.ts'),
      '@genshin-optimizer/gi/dm-localization': path.resolve(__dirname, 'vendor/go/gi/dm-localization/src/index.ts'),
      '@genshin-optimizer/gi/solver': path.resolve(__dirname, 'vendor/go/gi/solver/src/index.ts'),
      '@genshin-optimizer/gi/solver-tc': path.resolve(__dirname, 'vendor/go/gi/solver-tc/src/index.ts'),
      '@genshin-optimizer/common/react-util': path.resolve(__dirname, 'vendor/go/common/react-util/src/index.ts'),
      '@genshin-optimizer/common/img-util': path.resolve(__dirname, 'vendor/go/common/img-util/src/index.ts'),
      '@genshin-optimizer/common/localization': path.resolve(__dirname, 'vendor/go/common/localization/src/index.ts'),
      '@genshin-optimizer/game-opt/solver': path.resolve(__dirname, 'vendor/go/game-opt/solver/src/index.ts'),
      '@genshin-optimizer/gi/assets': path.resolve(__dirname, 'vendor/stubs/gi-assets.ts'),
    },
  },
})
