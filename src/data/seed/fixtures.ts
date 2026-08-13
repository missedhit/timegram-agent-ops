/**
 * Hand-authored seed facts for the demo company: Northbridge Mutual, a
 * mid-size P&C insurer running 14 AI agents under Timegram Agent Ops.
 *
 * Everything time-based is expressed in "days ago" so the dataset always
 * renders relative to today and never looks stale. `generate.ts` converts
 * these fixtures plus a seeded random stream into the full DataSet.
 *
 * Baked-in demo narratives:
 *  1. FNOL Intake Agent (Claims) — cost trending ~40% over budget after a
 *     model upgrade + storm-surge volume ramp in the last 4 weeks.
 *  2. Refund & Adjustment Agent (Support) — repeatedly violates the
 *     "escalate refunds above $5,000" policy; recent deviations still open.
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

export const DEPARTMENTS: Department[] = ['Finance', 'Support', 'Sales Ops', 'Claims', 'IT']

export const COST_CENTERS = [
  'Personal Auto',
  'Homeowners',
  'Commercial Property',
  'Workers Comp',
  'Specialty Lines',
  'Corporate',
] as const

export type CostCenter = (typeof COST_CENTERS)[number]

/** Prefixes for generated policy numbers, keyed by cost center. */
export const POLICY_NUMBER_PREFIX: Record<CostCenter, string> = {
  'Personal Auto': 'PA',
  Homeowners: 'HO',
  'Commercial Property': 'CP',
  'Workers Comp': 'WC',
  'Specialty Lines': 'SL',
  Corporate: 'CO',
}

export const BROKER_NAMES = [
  'Hartwell & Voss',
  'Cardinal Risk Partners',
  'Beacon Hill Brokerage',
  'Sterling & Mead',
  'Lakeshore Insurance Group',
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
    id: 'pol-payout-authority',
    name: 'Claims payout authority',
    rule: 'Never approve or recommend claim payouts; route all payout decisions to a licensed adjuster.',
    enforcement: 'block',
    createdDaysAgo: 280,
  },
  {
    id: 'pol-pii-minimum',
    name: 'PII minimum-necessary access',
    rule: 'Access policyholder SSNs, bank details, or medical records only when the task requires it; log every access.',
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
    rule: 'Producer licensing documents must be processed on on-prem models only; never send to cloud providers.',
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
 *  {pol} policy no.   {claim} claim no.         {inv} invoice no.
 *  {brk} broker name
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
    tools: ['SAP S/4HANA', 'Coupa', 'DocAI OCR', 'Outlook'],
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
    tools: ['SAP Concur', 'Outlook'],
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
    id: 'ag-fin-premrec',
    name: 'Premium Reconciliation Agent',
    purpose: 'Reconciles incoming premium payments against the policy ledger',
    owner: { name: 'Elena Sokolova', department: 'Finance' },
    department: 'Finance',
    status: 'paused',
    model: 'Gemini 2.5 Flash',
    modelProvider: 'Google',
    tools: ['Guidewire BillingCenter', 'Lockbox feed', 'SAP S/4HANA'],
    dataDomains: ['Premium payments', 'Policy ledger'],
    permissions: [
      'Read lockbox deposit feeds',
      'Match payments to policy accounts',
      'Create unapplied-cash worklist items',
    ],
    riskLevel: 'low',
    deployedDaysAgo: 180,
    pausedDaysAgo: 26,
    versionHistory: [
      { version: 'v1.0', daysAgo: 180, note: 'Initial deployment' },
      { version: 'v1.1', daysAgo: 60, note: 'Added multi-policy account matching' },
      { version: 'v1.1 (paused)', daysAgo: 26, note: 'Paused pending lockbox file format migration' },
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
          text: 'Matched lockbox deposit batch #{b} — {u} premium payments applied',
          process: 'Premium accounting',
          costCenters: ['Personal Auto', 'Homeowners', 'Commercial Property'],
        },
        {
          text: 'Reconciled {u} premium payments against the policy ledger, {f} unapplied',
          process: 'Premium accounting',
          costCenters: ['Personal Auto', 'Homeowners', 'Workers Comp'],
        },
      ],
    },
  },
  // ------------------------------------------------------------- Support
  {
    id: 'ag-sup-tier1',
    name: 'Tier-1 Policyholder Agent',
    purpose: 'Handles routine policyholder requests: billing questions, ID cards, address changes',
    owner: { name: 'Dana Whitfield', department: 'Support' },
    department: 'Support',
    status: 'active',
    model: 'Claude Sonnet 4.5',
    modelProvider: 'Anthropic',
    tools: ['Zendesk', 'Guidewire PolicyCenter', 'Twilio SMS'],
    dataDomains: ['Policyholder contact data', 'Billing history', 'Policy status'],
    permissions: [
      'Read policy and billing records',
      'Update contact information',
      'Issue ID cards and standard documents',
      'Send policyholder emails and SMS',
    ],
    riskLevel: 'medium',
    deployedDaysAgo: 350,
    versionHistory: [
      { version: 'v1.0', daysAgo: 350, note: 'Initial deployment on billing FAQs' },
      { version: 'v2.0', daysAgo: 190, note: 'Expanded to address changes and document issuance' },
      { version: 'v2.1', daysAgo: 80, note: 'Absorbed claim-status inquiries from retired notifier agent' },
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
          text: 'Resolved billing inquiry on policy {pol}',
          process: 'Policyholder service',
          costCenters: ['Personal Auto', 'Homeowners'],
        },
        {
          text: 'Processed address change and reissued documents for policy {pol}',
          process: 'Policyholder service',
          costCenters: ['Personal Auto', 'Homeowners'],
        },
        {
          text: 'Issued replacement ID cards for policy {pol}',
          process: 'Policyholder service',
          costCenters: ['Personal Auto'],
        },
        {
          text: 'Explained renewal premium change on policy {pol}',
          process: 'Policyholder service',
          costCenters: ['Personal Auto', 'Homeowners', 'Workers Comp'],
        },
      ],
    },
  },
  {
    id: 'ag-sup-refunds',
    name: 'Refund & Adjustment Agent',
    purpose: 'Processes premium refunds, credits, and billing adjustments',
    owner: { name: 'Tom Okafor', department: 'Support' },
    department: 'Support',
    status: 'active',
    model: 'GPT-5',
    modelProvider: 'OpenAI',
    tools: ['Guidewire BillingCenter', 'Stripe Payouts', 'Zendesk'],
    dataDomains: ['Billing history', 'Payment methods (masked)', 'Policy status'],
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
          text: 'Processed premium overpayment refund on policy {pol}',
          process: 'Billing adjustments',
          costCenters: ['Personal Auto', 'Homeowners'],
        },
        {
          text: 'Processed cancellation refund on policy {pol}',
          process: 'Billing adjustments',
          costCenters: ['Personal Auto', 'Homeowners', 'Commercial Property'],
        },
        {
          text: 'Applied billing adjustment credit on policy {pol}',
          process: 'Billing adjustments',
          costCenters: ['Personal Auto', 'Workers Comp'],
        },
      ],
    },
  },
  {
    id: 'ag-sup-complaints',
    name: 'Complaint Intake Agent',
    purpose: 'Classifies and routes inbound complaints, flags regulatory exposure',
    owner: { name: 'Dana Whitfield', department: 'Support' },
    department: 'Support',
    status: 'active',
    model: 'Gemini 2.5 Flash',
    modelProvider: 'Google',
    tools: ['Zendesk', 'Complaint registry'],
    dataDomains: ['Complaint records', 'Policyholder contact data'],
    permissions: [
      'Read inbound complaint queue',
      'Classify and route complaints',
      'Flag potential regulatory complaints',
    ],
    riskLevel: 'medium',
    deployedDaysAgo: 200,
    versionHistory: [
      { version: 'v1.0', daysAgo: 200, note: 'Initial deployment' },
      { version: 'v1.2', daysAgo: 70, note: 'Added DOI complaint detection rules' },
    ],
    monthlyBudgetUsd: 300,
    policyIds: ['pol-comm-boundary', 'pol-pii-minimum', 'pol-qa-sampling'],
    unitLabel: 'complaint',
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
          text: 'Classified and routed {u} inbound complaints, {f} flagged as regulatory',
          process: 'Complaint handling',
          costCenters: ['Personal Auto', 'Homeowners'],
        },
        {
          text: 'Triaged overnight complaint queue — {u} items routed to owners',
          process: 'Complaint handling',
          costCenters: ['Personal Auto', 'Commercial Property'],
        },
      ],
    },
  },
  // ------------------------------------------------------------- Sales Ops
  {
    id: 'ag-so-quotes',
    name: 'Quote Follow-up Agent',
    purpose: 'Chases stale broker quotes and assembles renewal comparisons',
    owner: { name: 'Jess Marino', department: 'Sales Ops' },
    department: 'Sales Ops',
    status: 'active',
    model: 'Claude Sonnet 4.5',
    modelProvider: 'Anthropic',
    tools: ['Salesforce', 'Rating engine', 'Outlook'],
    dataDomains: ['Quote pipeline', 'Broker accounts'],
    permissions: [
      'Read quote pipeline and broker records',
      'Send follow-up emails to brokers',
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
          text: 'Followed up on {u} stale quotes with {brk}',
          process: 'Quote pipeline',
          costCenters: ['Commercial Property', 'Specialty Lines'],
        },
        {
          text: 'Prepared renewal comparison pack for {brk} covering {u} policies',
          process: 'Renewal management',
          costCenters: ['Commercial Property', 'Workers Comp'],
        },
      ],
    },
  },
  {
    id: 'ag-so-broker',
    name: 'Broker Onboarding Agent',
    purpose: 'Verifies producer licensing and appointment paperwork for new brokers',
    owner: { name: 'Owen Park', department: 'Sales Ops' },
    department: 'Sales Ops',
    status: 'active',
    model: 'Llama 3.3 70B',
    modelProvider: 'On-prem',
    tools: ['NIPR gateway', 'DocAI OCR', 'Salesforce'],
    dataDomains: ['Producer licensing docs', 'Broker accounts'],
    permissions: [
      'Read producer applications and licensing documents',
      'Verify licenses against NIPR records',
      'Create onboarding checklist items',
    ],
    riskLevel: 'medium',
    deployedDaysAgo: 110,
    versionHistory: [
      { version: 'v1.0', daysAgo: 110, note: 'Initial deployment on on-prem Llama per residency policy' },
      { version: 'v1.1', daysAgo: 35, note: 'Added multi-state appointment screening' },
    ],
    monthlyBudgetUsd: 900,
    policyIds: ['pol-data-residency', 'pol-pii-minimum', 'pol-qa-sampling'],
    unitLabel: 'application',
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
          text: 'Verified licensing documents for broker application #{b}',
          process: 'Broker onboarding',
          costCenters: ['Commercial Property', 'Specialty Lines'],
        },
        {
          text: 'Screened {u} producer appointments against NIPR records, {f} flagged',
          process: 'Broker onboarding',
          costCenters: ['Specialty Lines'],
        },
      ],
    },
  },
  // ------------------------------------------------------------- Claims
  {
    id: 'ag-clm-fnol',
    name: 'FNOL Intake Agent',
    purpose: 'Triages first notice of loss, assigns severity, routes claims to adjusters',
    owner: { name: 'Sam Delgado', department: 'Claims' },
    department: 'Claims',
    status: 'active',
    model: 'Claude Opus 4.5',
    modelProvider: 'Anthropic',
    tools: ['Guidewire ClaimCenter', 'DocAI OCR', 'Geocoding API', 'Outlook'],
    dataDomains: ['Claims records', 'Policy coverage data', 'Policyholder contact data'],
    permissions: [
      'Read FNOL submissions and coverage data',
      'Create claim files and assign severity',
      'Route claims to adjuster queues',
      'Request missing documentation from policyholders',
    ],
    riskLevel: 'high',
    deployedDaysAgo: 280,
    versionHistory: [
      { version: 'v1.0', daysAgo: 280, note: 'Initial deployment on auto claims' },
      { version: 'v2.0', daysAgo: 140, note: 'Expanded to property and CAT claims' },
      { version: 'v2.1', daysAgo: 30, note: 'Upgraded to Claude Opus 4.5 for complex loss narratives' },
    ],
    // Set below the narrative ramp's trough ($5,832 across the weekly cycle)
    // so the over-budget story holds on every day the demo might be shown,
    // not just most of them. See the budget-narrative sweep test.
    monthlyBudgetUsd: 5000,
    policyIds: ['pol-payout-authority', 'pol-pii-minimum', 'pol-cost-guardrail', 'pol-qa-sampling'],
    unitLabel: 'claim',
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
          text: 'Processed FNOL intake batch #{b} — {u} claims triaged, {f} escalated to adjusters',
          process: 'FNOL intake',
          costCenters: ['Personal Auto', 'Homeowners'],
        },
        {
          text: 'Triaged storm-surge claim queue — {u} property claims severity-ranked',
          process: 'FNOL intake',
          costCenters: ['Homeowners', 'Commercial Property'],
        },
        {
          text: 'Completed coverage verification on {u} new claims, {f} sent for adjuster review',
          process: 'Coverage verification',
          costCenters: ['Personal Auto', 'Workers Comp'],
        },
      ],
    },
  },
  {
    id: 'ag-clm-docs',
    name: 'Claims Document Classifier',
    purpose: 'Sorts and indexes claim documents into adjuster folders',
    owner: { name: 'Sam Delgado', department: 'Claims' },
    department: 'Claims',
    status: 'active',
    model: 'Gemini 2.5 Flash',
    modelProvider: 'Google',
    tools: ['Guidewire ClaimCenter', 'DocAI OCR'],
    dataDomains: ['Claim documents', 'Medical records (index only)'],
    permissions: [
      'Read incoming claim documents',
      'Classify and file documents to claim folders',
      'Flag illegible or mismatched documents',
    ],
    riskLevel: 'low',
    deployedDaysAgo: 260,
    versionHistory: [
      { version: 'v1.0', daysAgo: 260, note: 'Initial deployment' },
      { version: 'v1.3', daysAgo: 100, note: 'Added medical records packet indexing' },
    ],
    monthlyBudgetUsd: 500,
    policyIds: ['pol-pii-minimum', 'pol-qa-sampling'],
    unitLabel: 'document',
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
          text: 'Classified {u} claim documents into adjuster folders',
          process: 'Claims documentation',
          costCenters: ['Personal Auto', 'Homeowners', 'Workers Comp'],
        },
        {
          text: 'Indexed medical records packet for claim {claim} — {u} pages filed',
          process: 'Claims documentation',
          costCenters: ['Workers Comp'],
        },
      ],
    },
  },
  {
    id: 'ag-clm-subro',
    name: 'Subrogation Review Agent',
    purpose: 'Scans closed claims for recoverable subrogation opportunities',
    owner: { name: 'Ingrid Bauer', department: 'Claims' },
    department: 'Claims',
    status: 'active',
    model: 'GPT-5',
    modelProvider: 'OpenAI',
    tools: ['Guidewire ClaimCenter', 'ISO ClaimSearch'],
    dataDomains: ['Closed claims', 'Recovery records'],
    permissions: [
      'Read closed claim files',
      'Flag subrogation opportunities with rationale',
      'Create recovery worklist items',
    ],
    riskLevel: 'medium',
    deployedDaysAgo: 90,
    versionHistory: [
      { version: 'v1.0', daysAgo: 90, note: 'Initial deployment on auto claims' },
      { version: 'v1.1', daysAgo: 25, note: 'Deep-review mode added for commercial claims' },
    ],
    monthlyBudgetUsd: 800,
    policyIds: ['pol-payout-authority', 'pol-pii-minimum', 'pol-cost-guardrail'],
    unitLabel: 'claim reviewed',
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
          text: 'Reviewed {u} closed claims for subrogation potential, {f} opportunities flagged',
          process: 'Subrogation review',
          costCenters: ['Personal Auto', 'Commercial Property'],
        },
        {
          text: 'Deep-reviewed claim {claim} for third-party recovery',
          process: 'Subrogation review',
          costCenters: ['Commercial Property', 'Workers Comp'],
        },
      ],
    },
  },
  {
    id: 'ag-clm-notify',
    name: 'Claim Status Notifier',
    purpose: 'Sent proactive claim status updates to policyholders (replaced by Tier-1 agent)',
    owner: { name: 'Ingrid Bauer', department: 'Claims' },
    department: 'Claims',
    status: 'retired',
    model: 'GPT-4o',
    modelProvider: 'OpenAI',
    tools: ['Guidewire ClaimCenter', 'Twilio SMS'],
    dataDomains: ['Claims status', 'Policyholder contact data'],
    permissions: ['Read claim status', 'Send status update emails and SMS'],
    riskLevel: 'low',
    deployedDaysAgo: 400,
    retiredDaysAgo: 55,
    versionHistory: [
      { version: 'v1.0', daysAgo: 400, note: 'Initial deployment' },
      { version: 'v1.2', daysAgo: 220, note: 'Added SMS channel' },
      { version: 'v1.2 (retired)', daysAgo: 55, note: 'Retired — duties absorbed by Tier-1 Policyholder Agent' },
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
          text: 'Sent claim status updates to {u} policyholders',
          process: 'Claims communication',
          costCenters: ['Personal Auto', 'Homeowners'],
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
  // --- Refund & Adjustment Agent: 9 refund-threshold violations, worsening.
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 2,
    hour: 14,
    description: 'Processed $7,200 cancellation refund without human approval (policy PA-52318)',
    status: 'open',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 4,
    hour: 10,
    description: '$5,850 refund auto-approved; threshold check skipped on a multi-policy account',
    status: 'open',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 7,
    hour: 16,
    description: '$11,400 refund on commercial policy CP-20441 processed without escalation',
    status: 'open',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 11,
    hour: 11,
    description: '$6,100 mid-term cancellation refund processed directly (policy HO-77012)',
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
    description: '$5,950 refund on policy PA-63220 processed without escalation',
    status: 'resolved',
    resolvedDaysAgo: 19,
    resolutionNote: 'Owner retrained threshold prompt; recurrence flagged for enforcement review',
  },
  {
    agentId: 'ag-sup-refunds',
    policyId: 'pol-refund-escalation',
    daysAgo: 29,
    hour: 13,
    description: '$6,700 refund processed without approval on bundled account',
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
  // --- FNOL Intake Agent: 7 deviations tied to the cost-surge narrative.
  {
    agentId: 'ag-clm-fnol',
    policyId: 'pol-cost-guardrail',
    daysAgo: 1,
    hour: 18,
    description: 'Daily run cost {cost} — {mult}× trailing average (storm-surge claim volume)',
    status: 'open',
  },
  {
    agentId: 'ag-clm-fnol',
    policyId: 'pol-cost-guardrail',
    daysAgo: 3,
    hour: 19,
    description: 'Daily run cost {cost} — {mult}× trailing average',
    status: 'open',
  },
  {
    agentId: 'ag-clm-fnol',
    policyId: 'pol-cost-guardrail',
    daysAgo: 6,
    hour: 18,
    description: 'Daily run cost {cost} — {mult}× trailing average, sustained third day',
    status: 'acknowledged',
  },
  {
    agentId: 'ag-clm-fnol',
    policyId: 'pol-cost-guardrail',
    daysAgo: 9,
    hour: 17,
    description: 'Daily run cost {cost} — {mult}× trailing average following the Opus 4.5 upgrade',
    status: 'acknowledged',
  },
  {
    agentId: 'ag-clm-fnol',
    policyId: 'pol-payout-authority',
    daysAgo: 13,
    hour: 11,
    description: 'Attempted fast-track payout recommendation on claim CLM-2026-07231; blocked by policy',
    status: 'resolved',
    resolvedDaysAgo: 12,
    resolutionNote: 'Blocked at enforcement; triage playbook clarified to exclude payout language',
  },
  {
    agentId: 'ag-clm-fnol',
    policyId: 'pol-payout-authority',
    daysAgo: 18,
    hour: 15,
    description: 'Attempted reserve estimate on claim CLM-2026-06914; blocked by policy',
    status: 'resolved',
    resolvedDaysAgo: 17,
    resolutionNote: 'Blocked at enforcement; no data exposed',
  },
  {
    agentId: 'ag-clm-fnol',
    policyId: 'pol-cost-guardrail',
    daysAgo: 24,
    hour: 18,
    description: 'Daily run cost {cost} — {mult}× trailing average',
    status: 'resolved',
    resolvedDaysAgo: 22,
    resolutionNote: 'Attributed to CAT event volume; budget review scheduled',
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
    description: 'Drafted reply addressed to a state DOI examiner; blocked and rerouted to Legal',
    status: 'resolved',
    resolvedDaysAgo: 33,
    resolutionNote: 'Blocked at enforcement; Legal handled the response',
  },
  {
    agentId: 'ag-clm-subro',
    policyId: 'pol-pii-minimum',
    daysAgo: 38,
    hour: 16,
    description: 'Accessed claimant bank details on a review task without documented need',
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
    agentId: 'ag-so-broker',
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
  Claims: { approver: 'Renee Calloway', role: 'VP Claims' },
  IT: { approver: 'Ravi Chandra', role: 'IT Director' },
}

/**
 * Approval description templates, keyed by agent. Placeholders:
 * {amt} dollar amount, {pol}/{claim}/{inv} reference numbers.
 */
export const APPROVAL_TEMPLATES: Record<string, string[]> = {
  'ag-sup-refunds': [
    'Approved refund of ${amt} on policy {pol}',
    'Approved cancellation refund of ${amt} on policy {pol}',
  ],
  'ag-clm-fnol': [
    'Authorized CAT fast-track adjuster assignment for claim {claim}',
    'Approved severity override on claim {claim}',
  ],
  'ag-fin-ap': [
    'Released invoice {inv} after duplicate-hold review',
    'Approved exception posting for invoice {inv}',
  ],
  'ag-sup-tier1': [
    'Approved policy reinstatement on {pol}',
    'Approved goodwill credit on policy {pol}',
  ],
}

export const GENERIC_APPROVAL_TEMPLATE = 'Completed human review of escalated task'
