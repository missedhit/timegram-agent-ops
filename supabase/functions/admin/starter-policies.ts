/**
 * Starter policies every new prospect org receives at creation. Generic
 * enough to be true of any AI-agent deployment, specific enough that the
 * Policies screen is never empty and the deviation flow has real targets
 * on day one. `pol-starter-1` is the id the reference examples report
 * against — keep it first.
 */

export interface StarterPolicy {
  id: string
  name: string
  rule: string
  enforcement: 'block' | 'log-only'
  sort_order: number
}

export const STARTER_POLICIES: StarterPolicy[] = [
  {
    id: 'pol-starter-1',
    name: 'Large-transaction escalation',
    rule: 'Any transaction, payment, or commitment over $10,000 must be escalated to a human approver before the agent proceeds.',
    enforcement: 'block',
    sort_order: 1,
  },
  {
    id: 'pol-starter-2',
    name: 'PII boundary',
    rule: 'Agents must not move personally identifiable information outside the systems it was read from — no PII in prompts to third-party models, exports, or messages.',
    enforcement: 'block',
    sort_order: 2,
  },
  {
    id: 'pol-starter-3',
    name: 'External communications review',
    rule: 'Any message an agent drafts for an external recipient (customer, vendor, regulator) is reviewed by a human before it is sent.',
    enforcement: 'log-only',
    sort_order: 3,
  },
  {
    id: 'pol-starter-4',
    name: 'Approved tools only',
    rule: 'Agents may only invoke the tools and systems listed in their registry entry; reaching any other system is out of bounds.',
    enforcement: 'block',
    sort_order: 4,
  },
  {
    id: 'pol-starter-5',
    name: 'Budget overrun acknowledgment',
    rule: 'When an agent reaches 120% of its monthly budget, the owner acknowledges the overrun and either raises the budget or pauses the agent.',
    enforcement: 'log-only',
    sort_order: 5,
  },
]
