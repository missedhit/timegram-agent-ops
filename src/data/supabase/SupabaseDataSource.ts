/**
 * Live DataSource: loads the org's records from Supabase and assembles the
 * same DataSet shape the seed generator produces, via the shared row mappers
 * (whose round-trip test guarantees the two modes can't drift).
 */

import type { DataSet } from '../../domain/types'
import type { DataSource } from '../DataContext'
import { getSupabaseClient } from './client'
import {
  DEMO_ORG_ID,
  fromRows,
  type AgentPolicyRow,
  type AgentRow,
  type AgentVersionRow,
  type ApprovalRow,
  type DataSetRows,
  type DeviationRow,
  type PolicyRow,
  type TaskRow,
} from './mappers'

/**
 * supabase-js caps every response at 1000 rows by default. With ~2,000 tasks a
 * naive select() would silently truncate and quietly corrupt every cost figure
 * on every screen — so every table read pages until a short page arrives.
 */
const PAGE = 1000

/**
 * Paged reads MUST have a total, stable ordering — .range() without .order()
 * lets Postgres return rows in any order per page, silently duplicating or
 * dropping rows across page boundaries. Ordering by the primary key (org_id
 * is pinned by the filter) also means rows inserted mid-load by the ingest
 * endpoint land after the cursor instead of shifting it.
 */
async function fetchAll<T>(table: string, orderCols: string[]): Promise<T[]> {
  const supabase = await getSupabaseClient()
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select('*').eq('org_id', DEMO_ORG_ID)
    for (const col of orderCols) query = query.order(col)
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to load ${table}: ${error.message}`)
    rows.push(...(data as T[]))
    if (!data || data.length < PAGE) return rows
  }
}

export const supabaseDataSource: DataSource = {
  async load(): Promise<DataSet> {
    const [agents, agentVersions, policies, agentPolicies, tasks, deviations, approvals] =
      await Promise.all([
        fetchAll<AgentRow>('agents', ['id']),
        fetchAll<AgentVersionRow>('agent_versions', ['agent_id', 'version']),
        fetchAll<PolicyRow>('policies', ['id']),
        fetchAll<AgentPolicyRow>('agent_policies', ['agent_id', 'policy_id']),
        fetchAll<TaskRow>('tasks', ['id']),
        fetchAll<DeviationRow>('deviations', ['id']),
        fetchAll<ApprovalRow>('approvals', ['id']),
      ])
    const rows: DataSetRows = {
      agents,
      agentVersions,
      policies,
      agentPolicies,
      tasks,
      deviations,
      approvals,
    }
    return fromRows(rows, new Date().toISOString())
  },
}
