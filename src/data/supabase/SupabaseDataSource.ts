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

async function fetchAll<T>(table: string): Promise<T[]> {
  const supabase = await getSupabaseClient()
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('org_id', DEMO_ORG_ID)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to load ${table}: ${error.message}`)
    rows.push(...(data as T[]))
    if (!data || data.length < PAGE) return rows
  }
}

export const supabaseDataSource: DataSource = {
  async load(): Promise<DataSet> {
    const [agents, agentVersions, policies, agentPolicies, tasks, deviations, approvals] =
      await Promise.all([
        fetchAll<AgentRow>('agents'),
        fetchAll<AgentVersionRow>('agent_versions'),
        fetchAll<PolicyRow>('policies'),
        fetchAll<AgentPolicyRow>('agent_policies'),
        fetchAll<TaskRow>('tasks'),
        fetchAll<DeviationRow>('deviations'),
        fetchAll<ApprovalRow>('approvals'),
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
