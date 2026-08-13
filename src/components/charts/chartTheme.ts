/**
 * Shared chart tokens. Single accent hue (validated against the light
 * surface), recessive grid and axes, text in text tokens — never series color.
 */

export const CHART = {
  accent: '#4f46e5', // indigo-600
  accentFill: 'rgba(79, 70, 229, 0.08)',
  grid: '#e2e8f0', // slate-200
  axisText: '#94a3b8', // slate-400
  reference: '#94a3b8', // slate-400, dashed reference lines
  referenceText: '#64748b', // slate-500
} as const

export const AXIS_TICK = { fill: CHART.axisText, fontSize: 11 } as const
