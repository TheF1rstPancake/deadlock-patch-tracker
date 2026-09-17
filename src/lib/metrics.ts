import type { MetricDelta } from '../types.ts'

const INVERTED_STATS =
  /(?:stamina\s+)?cooldown|charge time|delay|cost|respawn time/i

const STAT_PATTERNS: Array<{ re: RegExp; stat: string }> = [
  { re: /cooldown\s*reduction|\bCDR\b/i, stat: 'cooldown_reduction' },
  { re: /(?:stamina\s+)?cooldown/i, stat: 'cooldown' },
  { re: /charge time/i, stat: 'charge_time' },
  { re: /\bdelay\b/i, stat: 'delay' },
  { re: /\bcost\b/i, stat: 'cost' },
  { re: /spirit resist/i, stat: 'spirit_resist' },
  { re: /bullet resist/i, stat: 'bullet_resist' },
  { re: /melee resist/i, stat: 'melee_resist' },
  { re: /fire rate/i, stat: 'fire_rate' },
  { re: /lifesteal/i, stat: 'lifesteal' },
  { re: /spirit amp/i, stat: 'spirit_amp' },
  { re: /spirit scaling/i, stat: 'spirit_scaling' },
  { re: /weapon scaling/i, stat: 'weapon_scaling' },
  { re: /falloff range/i, stat: 'falloff_range' },
  { re: /\bradius\b/i, stat: 'radius' },
  { re: /\brange\b/i, stat: 'range' },
  { re: /duration/i, stat: 'duration' },
  { re: /health/i, stat: 'health' },
  { re: /damage/i, stat: 'damage' },
  { re: /bounty/i, stat: 'bounty' },
  { re: /sprint/i, stat: 'sprint' },
  { re: /stamina/i, stat: 'stamina' },
  { re: /silence/i, stat: 'silence' },
  { re: /slow/i, stat: 'slow' },
]

const FROM_TO =
  /\bfrom\s+([+-]?[\d.]+(?:\s*->\s*[+-]?[\d.]+)?)\s*(%|s|m|x)?\s+to\s+([+-]?[\d.]+(?:\s*->\s*[+-]?[\d.]+)?)\s*(%|s|m|x)?/i

export function extractMetrics(text: string): MetricDelta[] {
  const match = text.match(FROM_TO)
  if (!match) return []

  const fromToken = match[1].trim()
  const toToken = match[3].trim()
  const unit = (match[4] || match[2] || inferUnit(fromToken, toToken) || undefined) as
    | string
    | undefined
  const stat = inferStat(text)
  const from = coerceValue(fromToken)
  const to = coerceValue(toToken)
  const polarity = polarityFor(stat, text)

  const metric: MetricDelta = { stat, polarity }
  if (from !== undefined) metric.from = from
  if (to !== undefined) metric.to = to
  if (unit) metric.unit = unit
  return [metric]
}

function inferStat(text: string): string {
  for (const { re, stat } of STAT_PATTERNS) {
    if (re.test(text)) return stat
  }
  return 'value'
}

function polarityFor(
  stat: string,
  text: string,
): MetricDelta['polarity'] {
  if (stat === 'cooldown_reduction') return 'up_is_buff'
  if (
    stat === 'cooldown' ||
    stat === 'charge_time' ||
    stat === 'delay' ||
    stat === 'cost' ||
    INVERTED_STATS.test(text)
  ) {
    return 'up_is_nerf'
  }
  if (stat === 'value') return 'unknown'
  return 'up_is_buff'
}

function coerceValue(token: string): number | string {
  if (token.includes('->')) return token.replace(/\s+/g, '')
  const num = Number.parseFloat(token)
  return Number.isNaN(num) ? token : num
}

function inferUnit(fromToken: string, toToken: string): string | undefined {
  const combined = `${fromToken} ${toToken}`
  if (/%/.test(combined)) return '%'
  if (/s\b/i.test(combined)) return 's'
  if (/m\b/i.test(combined)) return 'm'
  return undefined
}
