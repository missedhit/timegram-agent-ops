/** Shared .env.local loader for scripts. No side effects. */
import { readFileSync } from 'node:fs'

export function loadEnvLocal() {
  let text
  try {
    text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  } catch {
    console.error('No .env.local found — copy .env.example and fill in the Supabase keys.')
    process.exit(1)
  }
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}
