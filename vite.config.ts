import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    // The ingest contract is shared with the Deno edge runtime; only the pure
    // contract test runs here (index.ts uses Deno globals and stays out).
    include: [
      'src/**/*.test.ts',
      'supabase/functions/**/*contract.test.ts',
      'supabase/functions/**/vectors.test.ts',
      'supabase/functions/**/handout.test.ts',
      'connector/src/**/*.test.ts',
    ],
  },
})
