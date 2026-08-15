/**
 * The per-prospect CONNECT handout, as a pure template. Zero imports so the
 * same file serves the Deno admin edge function, the org-create CLI, and
 * vitest — the established cross-tree sharing pattern (see the ingest
 * contracts). The rendered markdown contains the RAW API key: it is shown
 * once, written only to git-ignored locations, and never logged.
 */

export interface HandoutOptions {
  orgName: string
  appUrl: string
  ingestUrl: string
  mcpUrl: string
  rawKey: string
}

/** The slug used for handout/export filenames — keep in sync everywhere. */
export const orgSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export function handoutMarkdown({ orgName, appUrl, ingestUrl, mcpUrl, rawKey }: HandoutOptions): string {
  return `# Connect your agents — ${orgName}

Welcome to Timegram Agent Ops. This page has everything needed to see your
own agents in your workspace. Nothing here touches your models or prompts:
the platform records **what agents did — never what they said**. The reporting
contract structurally cannot carry prompts, outputs, or customer content
(such fields are rejected client-side and server-side by name).

## Your workspace

- **App**: ${appUrl} — sign in with your work email (magic link, no password)
- **Ingest endpoint**: \`${ingestUrl}\`
- **API key** (keep secret — treat like a password):

\`\`\`
${rawKey}
\`\`\`

If the key is ever exposed, tell us — revocation is immediate and a new key
takes seconds.

## Report your first task (60 seconds, curl)

\`\`\`bash
curl -X POST '${ingestUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-api-key: ${rawKey}' \\
  -d '{
    "agent_id": "my-first-agent",
    "description": "Processed 12 invoices from the morning batch",
    "business_process": "Accounts payable",
    "cost_center": "Finance",
    "outcome": "completed",
    "duration_sec": 95,
    "cost_usd": 0.31,
    "units": 12
  }'
\`\`\`

Unknown agents are auto-registered on first report, so this works
immediately — open the Work Log in the app and it is already there. Enrich
the agent (name, owner, budget) any time via \`/register\`.

## Python (any stack, no dependencies)

Copy \`timegram_reporter.py\` — the single-file SDK attached to the same
email as this page (stdlib only, Python 3.9+) — next to your agent:

\`\`\`python
from timegram_reporter import TimegramReporter

timegram = TimegramReporter(
    ingest_url="${ingestUrl}",
    api_key="${rawKey}",
    agent_id="my-first-agent",
    defaults={"business_process": "Accounts payable", "cost_center": "Finance"},
)

with timegram.track(description="Processing morning invoice batch", cost_usd=0.31, units=12) as work:
    result = run_my_agent()          # your existing code, unchanged
    work.update(units=result.count)  # enrich from the result
\`\`\`

## TypeScript / JavaScript

The TS SDK lives in the \`connector/\` folder of our repo and imports shared
contract modules, so it is used from a clone rather than a single copied
file — ask us for repo access (or a bundled build) and import it in place:

\`\`\`ts
import { TimegramReporter } from '<repo>/connector/src'

const timegram = new TimegramReporter({
  ingestUrl: '${ingestUrl}',
  apiKey: '${rawKey}',
  agentId: 'my-first-agent',
  defaults: { business_process: 'Accounts payable', cost_center: 'Finance' },
})

await timegram.report({
  description: 'Processed 12 invoices from the morning batch',
  outcome: 'completed',
  duration_sec: 95,
  cost_usd: 0.31,
  units: 12,
})
\`\`\`

## Connect via MCP (fastest — a config snippet, no code)

Point any MCP-capable agent tool at your workspace — the quickest way to see
data flowing, and ideal for agents that live inside Claude Code or Cursor.
Treat it as the quick-connect path: for production, audit-grade telemetry use
the SDK sections above — an LLM reporting on itself is discretionary, while
the SDK reports measured values from code.

Claude Code, one command (available in every project — the key is stored in
your user config, never in a repo):

\`\`\`bash
claude mcp add --scope user --transport http timegram ${mcpUrl} --header "Authorization: Bearer ${rawKey}"
\`\`\`

Project \`.mcp.json\` (checked into git — keep the key in an env var, never
inline; \`"type": "http"\` is required):

\`\`\`json
{
  "mcpServers": {
    "timegram": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer \${TIMEGRAM_API_KEY}" }
    }
  }
}
\`\`\`

Set \`TIMEGRAM_API_KEY\` to the key under "Your workspace" above. Cursor
(\`~/.cursor/mcp.json\`) takes the same block without the \`"type"\` line, with
\`"Bearer \${env:TIMEGRAM_API_KEY}"\` as the header value.

Claude Desktop (its local config is stdio-only — bridge via mcp-remote,
needs Node):

\`\`\`json
{
  "mcpServers": {
    "timegram": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${mcpUrl}", "--header", "Authorization:\${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer ${rawKey}" }
    }
  }
}
\`\`\`

(No space after \`Authorization:\` — the full value lives in the env var
because some clients fail to escape spaces in args on Windows.)

Once connected, ask your agent to call \`workspace_status\` — it answers with
your workspace name and live counts, proving the connection end to end.

## What gets recorded

Task metadata only: a one-line business description, outcome
(completed / escalated / failed), duration, cost, units of work, optional
tokens. Policy deviations (via \`/deviation\`) carry the same discipline — a
business-language description of what was departed from, never the content
that triggered it. Your Policies screen starts with five standard policies
you can react against on day one.

Questions or a key rotation: reply to the email this came with.
`
}
