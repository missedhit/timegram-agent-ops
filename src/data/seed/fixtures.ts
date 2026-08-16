/**
 * Hand-authored seed facts for the demo company: Coreline Software, a
 * ~300-person B2B SaaS company running 14 AI agents under Timegram Agent Ops.
 *
 * Everything time-based is expressed in "days ago" so the dataset always
 * renders relative to today and never looks stale. `generate.ts` converts
 * these fixtures plus a seeded random stream into the full DataSet.
 *
 * Baked-in demo narratives:
 *  1. Incident Triage Agent (Engineering) — cost trending ~40% over budget
 *     after a model upgrade + post-release alert-volume ramp in the last
 *     4 weeks.
 *  2. Refund & Credit Agent (Support) — repeatedly violates the "escalate
 *     refunds above $5,000" policy; recent deviations still open.
 *  3. AP Invoice Agent (Finance) — milder duplicate-invoice deviations so
 *     the feed doesn't look staged around two agents.
 */

import type {
  AgentOwner,
  AgentStatus,
  Department,
  DeviationStatus,
  EnforcementMode,
  ModelProvider,
  RiskLevel,
} from '../../domain/types'

export const DEPARTMENTS: Department[] = ['Finance', 'Support', 'Sales Ops', 'Engineering', 'IT']

export const COST_CENTERS = [
  'Core Platform',
  'Analytics',
  'Integrations',
  'Mobile',
  'API & Data',
  'Corporate',
] as const

export type CostCenter = (typeof COST_CENTERS)[number]

export const CUSTOMER_NAMES = [
  'Bluepeak Systems',
  'Ostrander Group',
  'Helix Manufacturing',
  'Kestrel Financial',
  'Marlowe Retail Co.',
]

// ---------------------------------------------------------------------------
// SOP policies
// ---------------------------------------------------------------------------

export interface PolicyFixture {
  id: string
  name: string
  rule: string
  enforcement: EnforcementMode
  createdDaysAgo: number
}

export const POLICY_FIXTURES: PolicyFixture[] = [
  {
    id: 'pol-refund-escalation',
    name: 'Refund escalation threshold',
    rule: 'Escalate any refund above $5,000 to a human approver before processing.',
    enforcement: 'log-only',
    createdDaysAgo: 150,
  },
  {
    id: 'pol-prod-change',
    name: 'Production change authority',
    rule: 'Never execute changes in production systems; route all remediation actions to the on-call engineer.',
    enforcement: 'block',
    createdDaysAgo: 280,
  },
  {
    id: 'pol-pii-minimum',
    name: 'PII minimum-necessary access',
    rule: 'Access customer PII, payment details, or production data only when the task requires it; log every access.',
    enforcement: 'log-only',
    createdDaysAgo: 320,
  },
  {
    id: 'pol-duplicate-vendor',
    name: 'Duplicate vendor payment hold',
    rule: 'Hold any vendor invoice matching a paid invoice within 45 days for human review before posting.',
    enforcement: 'log-only',
    createdDaysAgo: 200,
  },
  {
    id: 'pol-comm-boundary',
    name: 'External communication boundary',
    rule: 'Never send communications to regulators, attorneys, or the press; escalate to Legal.',
    enforcement: 'block',
    createdDaysAgo: 300,
  },
  {
    id: 'pol-cost-guardrail',
    name: 'Daily spend guardrail',
    rule: 'Alert the agent owner when a daily run cost exceeds 1.4× the trailing 30-day average.',
    enforcement: 'log-only',
    createdDaysAgo: 120,
  },
  {
    id: 'pol-data-residency',
    name: 'On-prem data residency',
    rule: 'Customer security documents and RFP materials must be processed on on-prem models only; never send to cloud providers.',
    enforcement: 'block',
    createdDaysAgo: 110,
  },
  {
    id: 'pol-qa-sampling',
    name: 'Human QA sampling',
    rule: 'Route 5% of completed tasks each week to human quality review.',
    enforcement: 'log-only',
    createdDaysAgo: 250,
  },
]

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

/**
 * Task description template. Placeholders filled by the generator:
 *  {b} batch number   {u} units in the task     {f} flagged subset
 *  {acct} account no. {inc} incident no.        {inv} invoice no.
 *  {cust} customer name
 */
export interface TaskTemplate {
  text: string
  process: string
  costCenters: CostCenter[]
}

export interface AgentGenParams {
  /** Average tasks per weekday (weekends are quieter automatically). */
  tasksPerDay: number
  costMeanUsd: number
  /** Multiplicative jitter fraction on cost, e.g. 0.5 → ±50%. */
  costSpread: number
  unitsMean: number
  /** Fraction of units flagged for the {f} placeholder. */
  flagRate: number
  escalationRate: number
  failureRate: number
  durationMeanSec: number
  /** Volume multiplier reached at the end of the final 28 days (narrative ramp). */
  volumeRampLast28?: number
  /** Cost-per-task multiplier reached at the end of the final 28 days. */
  costRampLast28?: number
  templates: TaskTemplate[]
}

export interface VersionFixture {
  version: string
  daysAgo: number
  note: string
}

export interface AgentFixture {
  id: string
  name: string
  purpose: string
  owner: AgentOwner
  department: Department
  status: AgentStatus
  model: string
  modelProvider: ModelProvider
  tools: string[]
  dataDomains: string[]
  permissions: string[]
  riskLevel: RiskLevel
  deployedDaysAgo: number
  pausedDaysAgo?: number
  retiredDaysAgo?: number
  versionHistory: VersionFixture[]
  monthlyBudgetUsd: number
  policyIds: string[]
  unitLabel: string
  humanBaselineUsdPerUnit: number
  gen: AgentGenParams
}

export const AGENT_FIXTURES: AgentFixture[] = [
  // ------------------------------------------------------------- Finance
  {
    id: 'ag-fin-ap',
    name: 'AP Invoice Agent',
    purpose: 'Processes vendor invoices with 3-way matching and exception flagging',
    owner: { name: 'Priya Raman', department: 'Finance' },
    department: 'Finance',
    status: 'active',
    model: 'GPT-5',
    modelProvider: 'OpenAI',
    tools: ['NetSuite', 'Bill.com', 'DocAI OCR', 'Gmail'],
    dataDomains: ['Vendor master', 'Invoices', 'GL entries'],
    permissions: [
      'Read vendor master records',
      'Create invoice holds',
      'Post matched invoices up to $25,000',
      'Send internal email notifications',
    ],
    riskLevel: 'medium',
    deployedDaysAgo: 310,
    versionHistory: [
      { version: 'v1.0', daysAgo: 310, note: 'Initial deployment for PO-backed invoices' },
      { version: 'v1.2', daysAgo: 210, note: 'Added non-PO invoice routing and GL coding' },
      { version: 'v1.3', daysAgo: 120, note: 'Raised auto-post limit to $25k after 60-day review' },
      { version: 'v1.4', daysAgo: 45, note: 'Added duplicate-vendor detection heuristics' },
    ],
    monthlyBudgetUsd: 2000,
    policyIds: ['pol-duplicate-vendor', 'pol-pii-minimum', 'pol-cost-guardrail', 'pol-qa-sampling'],
    unitLabel: 'invoice',
    humanBaselineUsdPerUnit: 2.1,
    gen: {
      tasksPerDay: 3.0,
      costMeanUsd: 18,
      costSpread: 0.5,
      unitsMean: 130,
      flagRate: 0.04,
      escalationRate: 0.05,
      failureRate: 0.03,
      durationMeanSec: 540,
      templates: [
        {
          text: 'Processed invoice batch #{b} — {u} invoices matched, {f} exceptions flagged',
          process: 'Accounts payable',
          costCenters: ['Corporate'],
        },
        {
          text: 'Validated payment run #{b} covering {u} invoices before release',
          process: 'Accounts payable',
          costCenters: ['Corporate'],
        },
        {
          text: 'Reconciled vendor statements across {u} open invoice positions',
          process: 'Vendor management',
          costCenters: ['Corporate'],
        },
      ],
    },
  },
  {
    id: 'ag-fin-expense',
    name: 'Expense Audit Agent',
    purpose: 'Audits employee expense reports against travel & expense policy',
    owner: { name: 'Marcus Feld', department: 'Finance' },
    department: 'Finance',
    status: 'active',
    model: 'Claude Haiku 4.5',
    modelProvider: 'Anthropic',
    tools: ['Ramp', 'Gmail'],
    dataDomains: ['Expense reports', 'Corporate card feeds'],
    permissions: [
      'Read expense reports and receipts metadata',
      'Flag reports for policy review',
      'Send reminder emails to employees',
    ],
    riskLevel: 'low',
    deployedDaysAgo: 240,
    versionHistory: [
      { version: 'v1.0', daysAgo: 240, note: 'Initial deployment' },
      { version: 'v1.1', daysAgo: 95, note: 'Added per-diem and mileage rule checks' },
    ],
    monthlyBudgetUsd: 400,
    policyIds: ['pol-qa-sampling', 'pol-cost-guardrail'],
    unitLabel: 'report',
    humanBaselineUsdPerUnit: 4.5,
    gen: {
      tasksPerDay: 1.5,
      costMeanUsd: 6,
      costSpread: 0.4,
      unitsMean: 35,
      flagRate: 0.12,
      escalationRate: 0.03,
      failureRate: 0.02,
      durationMeanSec: 300,
      templates: [
        {
          text: 'Audited {u} expense reports, {f} flagged for policy review',
          process: 'Travel & expense',
          costCenters: ['Corporate'],
        },
        {
          text: 'Reviewed corporate card batch #{b} — {u} transactions checked',
          process: 'Travel & expense',
          costCenters: ['Corporate'],
        },
      ],
    },
  },
  {
    id: 'ag-fin-ar',
    name: 'AR Reconciliation Agent',
    purpose: 'Reconciles incoming customer payments against open invoices',
    owner: { name: 'Elena Sokolova', department: 'Finance' },
    department: 'Finance',
    status: 'paused',
    model: 'Gemini 2.5 Flash',
    modelProvider: 'Google',
    tools: ['Stripe Billing', 'NetSuite', 'Gmail'],
    dataDomains: ['Customer payments', 'Invoice ledger'],
    permissions: [
      'Read payment and payout feeds',
      'Match payments to customer invoices',
      'Create unapplied-cash worklist items',
    ],
    riskLevel: 'low',
    deployedDaysAgo: 180,
    pausedDaysAgo: 26,
    versionHistory: [
      { version: 'v1.0', daysAgo: 180, note: 'Initial deployment' },
      { version: 'v1.1', daysAgo: 60, note: 'Added multi-invoice account matching' },
      { version: 'v1.1 (paused)', daysAgo: 26, note: 'Paused pending Stripe→NetSuite invoice-sync migration' },
    ],
    monthlyBudgetUsd: 800,
    policyIds: ['pol-cost-guardrail', 'pol-qa-sampling'],
    unitLabel: 'payment',
    humanBaselineUsdPerUnit: 1.2,
    gen: {
      tasksPerDay: 1.8,
      costMeanUsd: 11,
      costSpread: 0.4,
      unitsMean: 60,
      flagRate: 0.05,
      escalationRate: 0.02,
      failureRate: 0.03,
      durationMeanSec: 420,
      templates: [
        {
          text: 'Matched payout batch #{b} — {u} customer payments applied',
          process: 'Accounts receivable',
          costCenters: ['Core Platform', 'Analytics', 'Integrations'],
        },
        {
          text: 'Reconciled {u} payments against open invoices, {f} unapplied',
          process: 'Accounts receivable',
          costCenters: ['Core Platform', 'Analytics', 'Mobile'],
        },
      ],
    },
  },
  // ------------------------------------------------------------- Support
  {
    id: 'ag-sup-tier1',
    name: 'Tier-1 Support Agent',
    purpose: 'Handles routine customer requests: billing questions, SSO resets, plan changes',
    owner: { name: 'Dana Whitfield', department: 'Support' },
    department: 'Support',
    status: 'active',
    model: 'Claude Sonnet 4.5',
    modelProvider: 'Anthropic',
    tools: ['Zendesk', 'Stripe Billing', 'Slack'],
    dataDomains: ['Customer contact data', 'Billing history', 'Subscription status'],
    permissions: [
      'Read subscription and billing records',
      'Update account contact information',
      'Issue invoice copies and plan documents',
      'Send customer emails and in-app messages',
    ],
    riskLevel: 'medium',
    deployedDaysAgo: 350,
    versionHistory: [
      { version: 'v1.0', daysAgo: 350, note: 'Initial deployment on billing FAQs' },
      { version: 'v2.0', daysAgo: 190, note: 'Expanded to plan changes and document issuance' },
      { version: 'v2.1', daysAgo: 80, note: 'Absorbed incident-status inquiries from retired notifier agent' },
    ],
    monthlyBudgetUsd: 600,
    policyIds: ['pol-comm-boundary', 'pol-pii-minimum', 'pol-qa-sampling', 'pol-cost-guardrail'],
    unitLabel: 'conversation',
    humanBaselineUsdPerUnit: 6.8,
    gen: {
      tasksPerDay: 5.0,
      costMeanUsd: 2.2,
      costSpread: 0.5,
      unitsMean: 1,
      flagRate: 0,
      escalationRate: 0.07,
      failureRate: 0.03,
      durationMeanSec: 300,
      templates: [
        {
          text: 'Resolved billing inquiry on account {acct}',
          process: 'Customer support',
          costCenters: ['Core Platform', 'Analytics'],
        },
        {
          text: 'Processed billing-contact change and reissued invoices for account {acct}',
          process: 'Customer support',
          costCenters: ['Core Platform', 'Analytics'],
        },
        {
          text: 'Reset SSO configuration for account {acct}',
          process: 'Customer support',
          costCenters: ['Core Platform'],
        },
        {
          text: 'Explained renewal price change on account {acct}',
          process: 'Customer support',
          costCenters: ['Core Platform', 'Analytics', 'Integrations'],
        },
      ],
    },
  },
  {
    id: 'ag-sup-refunds',
    name: 'Refund & Credit Agent',
    purpose: 'Processes subscription refunds, credits, and billing adjustments',
    owner: { name: 'Tom Okafor', department: 'Support' },
    department: 'Support',
    status: 'active',
    model: 'GPT-5',
    modelProvider: 'OpenAI',
    tools: ['Stripe Billing', 'Zendesk', 'NetSuite'],
    dataDomains: ['Billing history', 'Payment methods (masked)', 'Subscription status'],
    permissions: [
      'Read billing and payment records',
      'Issue refunds up to authority limit',
      'Apply billing adjustment credits',
      'Create escalation tickets',
    ],
    riskLevel: 'high',
    deployedDaysAgo: 150,
    versionHistory: [
      { version: 'v1.0', daysAgo: 150, note: 'Initial deployment, refunds up to $1,000' },
      { version: 'v1.1', daysAgo: 90, note: 'Authority raised to $5,000 with escalation SOP' },
    ],
    monthlyBudgetUsd: 800,
    policyIds: ['pol-refund-escalation', 'pol-pii-minimum', 'pol-cost-guardrail', 'pol-qa-sampling'],
    unitLabel: 'refund',
    humanBaselineUsdPerUnit: 18.5,
    gen: {
      tasksPerDay: 2.2,
      costMeanUsd: 14,
      costSpread: 0.5,
      unitsMean: 1,
      flagRate: 0,
      escalationRate: 0.12,
      failureRate: 0.04,
      durationMeanSec: 420,
      templates: [
        {
          text: 'Processed duplicate-charge refund on account {acct}',
          process: 'Billing adjustments',
          costCenters: ['Core Platform', 'Analytics'],
        },
        {
          text: 'Processed cancellation refund on account {acct}',
          process: 'Billing adjustments',
          costCenters: ['Core Platform', 'Analytics', 'Integrations'],
        },
        {
          text: 'Applied billing adjustment credit on account {acct}',
          process: 'Billing adjustments',
          costCenters: ['Core Platform', 'Mobile'],
        },
      ],
    },
  },
  {
    id: 'ag-sup-escal',
    name: 'Escalation Triage Agent',
    purpose: 'Classifies and routes inbound escalations, flags SLA and legal exposure',
    owner: { name: 'Dana Whitfield', department: 'Support' },
    department: 'Support',
    status: 'active',
    model: 'Gemini 2.5 Flash',
    modelProvider: 'Google',
    tools: ['Zendesk', 'Jira'],
    dataDomains: ['Escalation records', 'Customer contact data'],
    permissions: [
      'Read inbound escalation queue',
      'Classify and route escalations',
      'Flag potential SLA-breach and legal escalations',
    ],
    riskLevel: 'medium',
    deployedDaysAgo: 200,
    versionHistory: [
      { version: 'v1.0', daysAgo: 200, note: 'Initial deployment' },
      { version: 'v1.2', daysAgo: 70, note: 'Added enterprise SLA-breach detection rules' },
    ],
    monthlyBudgetUsd: 300,
    policyIds: ['pol-comm-boundary', 'pol-pii-minimum', 'pol-qa-sampling'],
    unitLabel: 'escalation',
    humanBaselineUsdPerUnit: 3.4,
    gen: {
      tasksPerDay: 1.6,
      costMeanUsd: 4,
      costSpread: 0.4,
      unitsMean: 25,
      flagRate: 0.1,
      escalationRate: 0.04,
      failureRate: 0.02,
      durationMeanSec: 240,
      templates: [
        {
          text: 'Classified and routed {u} inbound escalations, {f} flagged for legal review',
          process: 'Escalation handling',
          costCenters: ['Core Platform', 'Integrations'],
        },
        {
          text: 'Triaged overnight escalation queue — {u} items routed to owners',
          process: 'Escalation handling',
          costCenters: ['Core Platform', 'Analytics'],
        },
      ],
    },
  },
  // ------------------------------------------------------------- Sales Ops
  {
    id: 'ag-so-quotes',
    name: 'Quote Follow-up Agent',
    purpose: 'Chases stale sales quotes and assembles renewal comparisons',
    owner: { name: 'Jess Marino', department: 'Sales Ops' },
    department: 'Sales Ops',
    status: 'active',
    model: 'Claude Sonnet 4.5',
    modelProvider: 'Anthropic',
    tools: ['Salesforce', 'CPQ engine', 'Gmail'],
    dataDomains: ['Quote pipeline', 'Customer accounts'],
    permissions: [
      'Read quote pipeline and account records',
      'Send follow-up emails to prospects',
      'Assemble renewal comparison documents',
    ],
    riskLevel: 'low',
    deployedDaysAgo: 130,
    versionHistory: [
      { version: 'v1.0', daysAgo: 130, note: 'Initial deployment' },
      { version: 'v1.1', daysAgo: 40, note: 'Added renewal comparison assembly' },
    ],
    monthlyBudgetUsd: 700,
    policyIds: ['pol-cost-guardrail', 'pol-qa-sampling'],
    unitLabel: 'quote',
    humanBaselineUsdPerUnit: 5.1,
    gen: {
      tasksPerDay: 1.8,
      costMeanUsd: 9,
      costSpread: 0.4,
      unitsMean: 18,
      flagRate: 0.08,
      escalationRate: 0.03,
      failureRate: 0.02,
      durationMeanSec: 480,
      templates: [
        {
          text: 'Followed up on {u} stale quotes with {cust}',
          process: 'Quote pipeline',
          costCenters: ['Analytics', 'API & Data'],
        },
        {
          text: 'Prepared renewal comparison pack for {cust} covering {u} subscriptions',
          process: 'Renewal management',
          costCenters: ['Core Platform', 'Integrations'],
        },
      ],
    },
  },
  {
    id: 'ag-so-security',
    name: 'Security Questionnaire Agent',
    purpose: 'Drafts responses to enterprise security questionnaires and RFP compliance sections',
    owner: { name: 'Owen Park', department: 'Sales Ops' },
    department: 'Sales Ops',
    status: 'active',
    model: 'Llama 3.3 70B',
    modelProvider: 'On-prem',
    tools: ['Compliance evidence vault', 'DocAI OCR', 'Salesforce'],
    dataDomains: ['Security questionnaires', 'SOC 2 evidence library'],
    permissions: [
      'Read security questionnaires and RFP documents',
      'Draft responses from the approved evidence library',
      'Create review checklist items',
    ],
    riskLevel: 'medium',
    deployedDaysAgo: 110,
    versionHistory: [
      { version: 'v1.0', daysAgo: 110, note: 'Initial deployment on on-prem Llama per residency policy' },
      { version: 'v1.1', daysAgo: 35, note: 'Added multi-framework mapping (SOC 2, ISO 27001)' },
    ],
    monthlyBudgetUsd: 900,
    policyIds: ['pol-data-residency', 'pol-pii-minimum', 'pol-qa-sampling'],
    unitLabel: 'questionnaire',
    humanBaselineUsdPerUnit: 12,
    gen: {
      tasksPerDay: 1.2,
      costMeanUsd: 22,
      costSpread: 0.5,
      unitsMean: 3,
      flagRate: 0.2,
      escalationRate: 0.06,
      failureRate: 0.05,
      durationMeanSec: 900,
      templates: [
        {
          text: 'Drafted responses for security questionnaire #{b}',
          process: 'Security reviews',
          costCenters: ['Core Platform', 'API & Data'],
        },
        {
          text: 'Screened {u} sections of RFP #{b} against the evidence library, {f} flagged',
          process: 'Security reviews',
          costCenters: ['API & Data'],
        },
      ],
    },
  },
  // ------------------------------------------------------------- Engineering
  {
    id: 'ag-eng-incident',
    name: 'Incident Triage Agent',
    purpose: 'Triages production alerts and incidents, assigns severity, routes to on-call engineers',
    owner: { name: 'Sam Delgado', department: 'Engineering' },
    department: 'Engineering',
    status: 'active',
    model: 'Claude Opus 4.5',
    modelProvider: 'Anthropic',
    tools: ['PagerDuty', 'Datadog', 'GitHub', 'Slack'],
    dataDomains: ['Incident records', 'Alert streams', 'Service ownership map'],
    permissions: [
      'Read alert streams and service dashboards',
      'Create incident records and assign severity',
      'Route incidents to on-call queues',
      'Request diagnostics from service owners',
    ],
    riskLevel: 'high',
    deployedDaysAgo: 280,
    versionHistory: [
      { version: 'v1.0', daysAgo: 280, note: 'Initial deployment on alert deduplication' },
      { version: 'v2.0', daysAgo: 140, note: 'Expanded to full incident triage and customer-impact classification' },
      { version: 'v2.1', daysAgo: 30, note: 'Upgraded to Claude Opus 4.5 for complex incident correlation' },
    ],
    // Set below the narrative ramp's trough across the weekly cycle so the
    // over-budget story holds on every day the demo might be shown, not just
    // most of them. See the budget-narrative sweep test.
    monthlyBudgetUsd: 5000,
    policyIds: ['pol-prod-change', 'pol-pii-minimum', 'pol-cost-guardrail', 'pol-qa-sampling'],
    unitLabel: 'alert',
    humanBaselineUsdPerUnit: 9.4,
    gen: {
      tasksPerDay: 3.5,
      costMeanUsd: 52,
      costSpread: 0.45,
      unitsMean: 24,
      flagRate: 0.12,
      escalationRate: 0.09,
      failureRate: 0.04,
      durationMeanSec: 780,
      volumeRampLast28: 1.6,
      costRampLast28: 1.3,
      templates: [
        {
          text: 'Processed alert flood batch #{b} — {u} alerts correlated, {f} escalated to on-call',
          process: 'Incident triage',
          costCenters: ['Core Platform', 'Analytics'],
        },
        {
          text: 'Triaged post-release alert surge — {u} regressions severity-ranked',
          process: 'Incident triage',
          costCenters: ['Core Platform', 'Mobile'],
        },
        {
          text: 'Completed impact classification on {u} new incidents, {f} sent for engineer review',
          process: 'Impact classification',
          costCenters: ['Core Platform', 'Integrations'],
        },
      ],
    },
  },
  {
    id: 'ag-eng-pr',
    name: 'PR Triage Agent',
    purpose: 'Labels and routes pull requests, assigns reviewers by code ownership',
    owner: { name: 'Sam Delgado', department: 'Engineering' },
    department: 'Engineering',
    status: 'active',
    model: 'Gemini 2.5 Flash',
    modelProvider: 'Google',
    tools: ['GitHub', 'Linear'],
    dataDomains: ['Pull requests', 'Error logs (index only)'],
    permissions: [
      'Read incoming pull requests',
      'Apply labels and assign reviewers',
      'Flag stale or conflicting pull requests',
    ],
    riskLevel: 'low',
    deployedDaysAgo: 260,
    versionHistory: [
      { version: 'v1.0', daysAgo: 260, note: 'Initial deployment' },
      { version: 'v1.3', daysAgo: 100, note: 'Added error-log bundle indexing for incident follow-ups' },
    ],
    monthlyBudgetUsd: 500,
    policyIds: ['pol-pii-minimum', 'pol-qa-sampling'],
    unitLabel: 'pull request',
    humanBaselineUsdPerUnit: 0.85,
    gen: {
      tasksPerDay: 4.0,
      costMeanUsd: 3,
      costSpread: 0.4,
      unitsMean: 40,
      flagRate: 0.05,
      escalationRate: 0.02,
      failureRate: 0.03,
      durationMeanSec: 180,
      templates: [
        {
          text: 'Labeled and routed {u} pull requests to code owners',
          process: 'Code review routing',
          costCenters: ['Core Platform', 'Analytics', 'Mobile'],
        },
        {
          text: 'Indexed error-log bundle for incident {inc} — {u} traces filed',
          process: 'Code review routing',
          costCenters: ['Core Platform'],
        },
      ],
    },
  },
  {
    id: 'ag-eng-postmortem',
    name: 'Postmortem Review Agent',
    purpose: 'Scans resolved incidents for recurring root causes and preventable-recurrence fixes',
    owner: { name: 'Ingrid Bauer', department: 'Engineering' },
    department: 'Engineering',
    status: 'active',
    model: 'GPT-5',
    modelProvider: 'OpenAI',
    tools: ['PagerDuty', 'Confluence'],
    dataDomains: ['Resolved incidents', 'Postmortem records'],
    permissions: [
      'Read resolved incident files',
      'Flag recurring root causes with rationale',
      'Create remediation worklist items',
    ],
    riskLevel: 'medium',
    deployedDaysAgo: 90,
    versionHistory: [
      { version: 'v1.0', daysAgo: 90, note: 'Initial deployment on sev-2 incidents' },
      { version: 'v1.1', daysAgo: 25, note: 'Deep-review mode added for sev-1 incidents' },
    ],
    monthlyBudgetUsd: 800,
    policyIds: ['pol-prod-change', 'pol-pii-minimum', 'pol-cost-guardrail'],
    unitLabel: 'incident reviewed',
    humanBaselineUsdPerUnit: 14,
    gen: {
      tasksPerDay: 1.0,
      costMeanUsd: 40,
      costSpread: 0.5,
      unitsMean: 3,
      flagRate: 0.35,
      escalationRate: 0.05,
      failureRate: 0.04,
      durationMeanSec: 1500,
      templates: [
        {
          text: 'Reviewed {u} resolved incidents for recurring root causes, {f} flagged for remediation',
          process: 'Postmortem review',
          costCenters: ['Core Platform', 'Integrations'],
        },
        {
          text: 'Deep-reviewed incident {inc} for cross-service failure patterns',
          process: 'Postmortem review',
          costCenters: ['Core Platform', 'Analytics'],
        },
      ],
    },
  },
  {
    id: 'ag-eng-notify',
    name: 'Status Update Notifier',
    purpose: 'Sent proactive incident status updates to affected customers (replaced by Tier-1 agent)',
    owner: { name: 'Ingrid Bauer', department: 'Engineering' },
    department: 'Engineering',
    status: 'retired',
    model: 'GPT-4o',
    modelProvider: 'OpenAI',
    tools: ['Statuspage', 'Twilio SMS'],
    dataDomains: ['Incident status', 'Customer contact data'],
    permissions: ['Read incident status', 'Send status update emails and SMS'],
    riskLevel: 'low',
    deployedDaysAgo: 400,
    retiredDaysAgo: 55,
    versionHistory: [
      { version: 'v1.0', daysAgo: 400, note: 'Initial deployment' },
      { version: 'v1.2', daysAgo: 220, note: 'Added SMS channel' },
      { version: 'v1.2 (retired)', daysAgo: 55, note: 'Retired — duties absorbed by Tier-1 Support Agent' },
    ],
    monthlyBudgetUsd: 300,
    policyIds: ['pol-comm-boundary', 'pol-qa-sampling'],
    unitLabel: 'notification',
    humanBaselineUsdPerUnit: 0.9,
    gen: {
      tasksPerDay: 1.5,
      costMeanUsd: 4,
      costSpread: 0.3,
      unitsMean: 45,
      flagRate: 0,
      escalationRate: 0.01,
      failureRate: 0.02,
      durationMeanSec: 120,
      templates: [
        {
          text: 'Sent incident status updates to {u} affected customers',
          process: 'Incident communication',
          costCenters: ['Core Platform', 'Analytics'],
        },
      ],
    },
  },
  // ------------------------------------------------------------- IT
  {
    id: 'ag-it-desk',
    name: 'Service Desk Triage Agent',
    purpose: 'Categorizes and routes IT tickets, resolves password and access FAQs',
    owner: { name: 'Ravi Chandra', department: 'IT' },
    department: 'IT',
    status: 'active',
    model: 'Claude Haiku 4.5',
    modelProvider: 'Anthropic',
    tools: ['ServiceNow', 'Okta (read-only)', 'Slack'],
    dataDomains: ['IT tickets', 'Directory metadata'],
    permissions: [
      'Read and categorize IT tickets',
      'Route tickets to specialist queues',
      'Post resolution suggestions to Slack',
    ],
    riskLevel: 'low',
    deployedDaysAgo: 220,
    versionHistory: [
      { version: 'v1.0', daysAgo: 220, note: 'Initial deployment' },
      { version: 'v1.2', daysAgo: 65, note: 'Added Slack channel intake' },
    ],
    monthlyBudgetUsd: 350,
    policyIds: ['pol-pii-minimum', 'pol-qa-sampling', 'pol-cost-guardrail'],
    unitLabel: 'ticket',
    humanBaselineUsdPerUnit: 3.1,
    gen: {
      tasksPerDay: 3.0,
      costMeanUsd: 2.5,
      costSpread: 0.4,
      unitsMean: 22,
      flagRate: 0.15,
      escalationRate: 0.04,
      failureRate: 0.02,
      durationMeanSec: 240,
      templates: [
        {
          text: 'Triaged {u} IT tickets, routed {f} to specialist queues',
          process: 'IT service desk',
          costCenters: ['Corporate'],
        },
        {
          text: 'Resolved {u} password and access FAQ tickets',
          process: 'IT service desk',
          costCenters: ['Corporate'],
        },
      ],
    },
  },
  {
    id: 'ag-it-access',
    name: 'Access Review Agent',
    purpose: 'Prepares quarterly access recertification packets for system owners',
    owner: { name: 'Maya Lindqvist', department: 'IT' },
    department: 'IT',
    status: 'paused',
    model: 'Claude Sonnet 4.5',
    modelProvider: 'Anthropic',
    tools: ['Okta (read-only)', 'ServiceNow', 'Excel export'],
    dataDomains: ['Access grants', 'Directory metadata'],
    permissions: [
      'Read access grants across core systems',
      'Compile recertification packets',
      'Flag dormant and over-privileged accounts',
    ],
    riskLevel: 'medium',
    deployedDaysAgo: 160,
    pausedDaysAgo: 12,
    versionHistory: [
      { version: 'v1.0', daysAgo: 160, note: 'Initial deployment for Q2 review cycle' },
      { version: 'v1.1', daysAgo: 12, note: 'Paused between quarterly review cycles' },
    ],
    monthlyBudgetUsd: 400,
    policyIds: ['pol-pii-minimum', 'pol-qa-sampling'],
    unitLabel: 'account',
    humanBaselineUsdPerUnit: 2.6,
    gen: {
      tasksPerDay: 0.8,
      costMeanUsd: 15,
      costSpread: 0.4,
      unitsMean: 55,
      flagRate: 0.07,
      escalationRate: 0.05,
      failureRate: 0.02,
      durationMeanSec: 1100,
      templates: [
        {
          text: 'Compiled access review packet covering {u} accounts, {f} flagged dormant',
          process: 'Access recertification',
          costCenters: ['Corporate'],
        },
        {
          text: 'Screened {u} privileged accounts against role baselines',
          process: 'Access recertification',
          costCenters: ['Corporate'],
        },
      ],
    },
  },
]

// ---------------------------------------------------------------------------
// Deviations (25 total, concentrated in three problem agents)
// ---------------------------------------------------------------------------

export interface DeviationFixture {
  agentId: string
  policyId: string
  daysAgo: number
  hour: number
  description: string
  status: DeviationStatus
  resolvedDaysAgo?: number
  resolutionNote?: string
}

export const DEVIATION_FIXTURES: DeviationFixture[] = [
  // --- Refund & Credit Agent: 9 refund-threshold violations, worsening.
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 2,
    hour: 14,
    description: 'Processed $7,200 annual-plan cancellation refund without human approval (account ACCT-52318)',
    status: 'open',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 4,
    hour: 10,
    description: '$5,850 refund auto-approved; threshold check skipped on a multi-workspace account',
    status: 'open',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 7,
    hour: 16,
    description: '$11,400 refund on enterprise account ACCT-20441 processed without escalation',
    status: 'open',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 11,
    hour: 11,
    description: '$6,100 mid-term cancellation refund processed directly (account ACCT-77012)',
    status: 'acknowledged',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 15,
    hour: 9,
    description: '$5,300 refund processed without approval; caught in weekly QA sample',
    status: 'resolved',
    resolvedDaysAgo: 13,
    resolutionNote: 'Refund reversed and re-issued through the approval workflow',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 21,
    hour: 15,
    description: '$5,950 refund on account ACCT-63220 processed without escalation',
    status: 'resolved',
    resolvedDaysAgo: 19,
    resolutionNote: 'Owner retrained threshold prompt; recurrence flagged for enforcement review',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 29,
    hour: 13,
    description: '$6,700 refund processed without approval on multi-product account',
    status: 'resolved',
    resolvedDaysAgo: 27,
    resolutionNote: 'Approved retroactively by Support Manager; noted in monthly review',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 41,
    hour: 10,
    description: '$5,150 refund processed without approval',
    status: 'resolved',
    resolvedDaysAgo: 39,
    resolutionNote: 'Threshold comparison bug fixed in v1.1 configuration',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 55,
    hour: 14,
    description: '$5,600 refund processed without approval',
    status: 'resolved',
    resolvedDaysAgo: 52,
    resolutionNote: 'Approved retroactively; incident logged',
  },
  // --- Incident Triage Agent: 7 deviations tied to the cost-surge narrative.
  {
    agentId: 'ag-eng-incident',
    policyId: 'pol-cost-guardrail',
    daysAgo: 1,
    hour: 18,
    description: 'Daily run cost {cost} — {mult}× trailing average (post-release alert volume)',
    status: 'open',
  },
  {
    agentId: 'ag-eng-incident',
    policyId: 'pol-cost-guardrail',
    daysAgo: 3,
    hour: 19,
    description: 'Daily run cost {cost} — {mult}× trailing average',
    status: 'open',
  },
  {
    agentId: 'ag-eng-incident',
    policyId: 'pol-cost-guardrail',
    daysAgo: 6,
    hour: 18,
    description: 'Daily run cost {cost} — {mult}× trailing average, sustained third day',
    status: 'acknowledged',
  },
  {
    agentId: 'ag-eng-incident',
    policyId: 'pol-cost-guardrail',
    daysAgo: 9,
    hour: 17,
    description: 'Daily run cost {cost} — {mult}× trailing average following the Opus 4.5 upgrade',
    status: 'acknowledged',
  },
  {
    agentId: 'ag-eng-incident',
    policyId: 'pol-prod-change',
    daysAgo: 13,
    hour: 11,
    description: 'Attempted automated rollback on incident INC-2026-07231; blocked by policy',
    status: 'resolved',
    resolvedDaysAgo: 12,
    resolutionNote: 'Blocked at enforcement; triage playbook clarified to exclude remediation actions',
  },
  {
    agentId: 'ag-eng-incident',
    policyId: 'pol-prod-change',
    daysAgo: 18,
    hour: 15,
    description: 'Attempted feature-flag change during triage of INC-2026-06914; blocked by policy',
    status: 'resolved',
    resolvedDaysAgo: 17,
    resolutionNote: 'Blocked at enforcement; no production change executed',
  },
  {
    agentId: 'ag-eng-incident',
    policyId: 'pol-cost-guardrail',
    daysAgo: 24,
    hour: 18,
    description: 'Daily run cost {cost} — {mult}× trailing average',
    status: 'resolved',
    resolvedDaysAgo: 22,
    resolutionNote: 'Attributed to release-surge alert volume; budget review scheduled',
  },
  // --- AP Invoice Agent: 4 duplicate-hold deviations (milder third narrative).
  {
    agentId: 'ag-fin-ap',
    policyId: 'pol-duplicate-vendor',
    daysAgo: 5,
    hour: 12,
    description: 'Duplicate-risk invoice INV-88412 posted without hold (same vendor, 31-day window)',
    status: 'open',
  },
  {
    agentId: 'ag-fin-ap',
    policyId: 'pol-duplicate-vendor',
    daysAgo: 12,
    hour: 10,
    description: 'Duplicate-risk invoice INV-87903 posted without hold',
    status: 'acknowledged',
  },
  {
    agentId: 'ag-fin-ap',
    policyId: 'pol-duplicate-vendor',
    daysAgo: 33,
    hour: 14,
    description: 'Duplicate-risk invoice INV-86122 posted; payment recalled before settlement',
    status: 'resolved',
    resolvedDaysAgo: 31,
    resolutionNote: 'Payment recalled; vendor-matching window widened to 45 days',
  },
  {
    agentId: 'ag-fin-ap',
    policyId: 'pol-duplicate-vendor',
    daysAgo: 47,
    hour: 9,
    description: 'Duplicate-risk invoice INV-85310 posted without hold',
    status: 'resolved',
    resolvedDaysAgo: 44,
    resolutionNote: 'Duplicate confirmed benign (split shipment); rule tuned',
  },
  // --- Scattered singles elsewhere so the feed looks organic.
  {
    agentId: 'ag-sup-tier1',
    policyId: 'pol-comm-boundary',
    daysAgo: 34,
    hour: 11,
    description: 'Drafted reply addressed to a technology journalist asking about an outage; blocked and rerouted to Legal',
    status: 'resolved',
    resolvedDaysAgo: 33,
    resolutionNote: 'Blocked at enforcement; Comms and Legal handled the response',
  },
  {
    agentId: 'ag-eng-postmortem',
    policyId: 'pol-pii-minimum',
    daysAgo: 38,
    hour: 16,
    description: 'Accessed production customer records on a review task without documented need',
    status: 'acknowledged',
  },
  {
    agentId: 'ag-fin-expense',
    policyId: 'pol-qa-sampling',
    daysAgo: 44,
    hour: 10,
    description: 'Weekly QA sample not routed (holiday schedule gap)',
    status: 'resolved',
    resolvedDaysAgo: 41,
    resolutionNote: 'Sampling scheduler fixed to skip-and-carry-forward',
  },
  {
    agentId: 'ag-so-security',
    policyId: 'pol-data-residency',
    daysAgo: 52,
    hour: 13,
    description: 'Attempted cloud-model fallback during on-prem outage; blocked by residency policy',
    status: 'resolved',
    resolvedDaysAgo: 51,
    resolutionNote: 'Blocked at enforcement; outage failover set to queue-and-wait',
  },
  {
    agentId: 'ag-it-desk',
    policyId: 'pol-pii-minimum',
    daysAgo: 61,
    hour: 15,
    description: 'Accessed HR group membership beyond ticket scope',
    status: 'resolved',
    resolvedDaysAgo: 58,
    resolutionNote: 'Scope filter added to directory queries',
  },
]

// ---------------------------------------------------------------------------
// Human approvals (generated from escalated tasks; templates per agent)
// ---------------------------------------------------------------------------

export interface ApproverFixture {
  approver: string
  role: string
}

export const DEPARTMENT_APPROVERS: Record<Department, ApproverFixture> = {
  Finance: { approver: 'Leah Winters', role: 'Controller' },
  Support: { approver: 'Dana Whitfield', role: 'Support Manager' },
  'Sales Ops': { approver: 'Owen Park', role: 'Sales Ops Lead' },
  Engineering: { approver: 'Renee Calloway', role: 'VP Engineering' },
  IT: { approver: 'Ravi Chandra', role: 'IT Director' },
}

/**
 * Approval description templates, keyed by agent. Placeholders:
 * {amt} dollar amount, {acct}/{inc}/{inv} reference numbers.
 */
export const APPROVAL_TEMPLATES: Record<string, string[]> = {
  'ag-sup-refunds': [
    'Approved refund of ${amt} on account {acct}',
    'Approved cancellation refund of ${amt} on account {acct}',
  ],
  'ag-eng-incident': [
    'Authorized sev-1 escalation for incident {inc}',
    'Approved severity override on incident {inc}',
  ],
  'ag-fin-ap': [
    'Released invoice {inv} after duplicate-hold review',
    'Approved exception posting for invoice {inv}',
  ],
  'ag-sup-tier1': [
    'Approved account reactivation on {acct}',
    'Approved goodwill credit on account {acct}',
  ],
}

export const GENERIC_APPROVAL_TEMPLATE = 'Completed human review of escalated task'
