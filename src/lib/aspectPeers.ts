import { metricRelativePercent } from './metrics.ts'
import type { PatternLens } from './patterns.ts'
import type { ChangeEvent, LineTag, MetricDelta, Patch } from '../types.ts'

/** Closed set of apples-to-apples buff/nerf aspects. */
export const ASPECTS = [
  'cooldown',
  'cooldown_reduction',
  'duration',
  'range',
  'radius',
  'spirit_scaling',
  'weapon_scaling',
  'damage',
  'health',
  'resist',
  'mobility',
  'sustain',
  'cc',
  'cost',
  'other',
] as const

export type Aspect = (typeof ASPECTS)[number]
export type AspectLayer = 'character' | 'ability' | 'shop_item'
export type AspectSign = 'buff' | 'nerf'

export interface AspectPeerRank {
  aspect: Aspect
  layer: AspectLayer
  sign: AspectSign
  relativePct: number
  peerPercentile: number
  peerN: number
  dayPeerPercentile: number
  dayPeerN: number
}

/**
 * Mechanical `metrics.stat` → aspect. Same map as the aspect-peer eval.
 * Unknown mechanical names fall through to `other` (never invent a bag).
 */
export const STAT_TO_ASPECT: Readonly<Record<string, Aspect>> = {
  cooldown: 'cooldown',
  cooldown_reduction: 'cooldown_reduction',
  charge_time: 'cooldown',
  delay: 'cooldown',
  duration: 'duration',
  range: 'range',
  falloff_range: 'range',
  radius: 'radius',
  spirit_scaling: 'spirit_scaling',
  spirit_amp: 'spirit_scaling',
  weapon_scaling: 'weapon_scaling',
  damage: 'damage',
  fire_rate: 'damage',
  health: 'health',
  bullet_resist: 'resist',
  spirit_resist: 'resist',
  melee_resist: 'resist',
  sprint: 'mobility',
  stamina: 'mobility',
  lifesteal: 'sustain',
  slow: 'cc',
  silence: 'cc',
  cost: 'cost',
  bounty: 'other',
}

const VALUE_ASPECT_RULES: Array<{ re: RegExp; aspect: Aspect }> = [
  { re: /cooldown\s*reduction|\bCDR\b/i, aspect: 'cooldown_reduction' },
  { re: /spirit\s+(?:power|scaling|amp)/i, aspect: 'spirit_scaling' },
  { re: /weapon\s+scaling|bullet\s+growth/i, aspect: 'weapon_scaling' },
  { re: /\bradius\b|\bAoE\b|area of effect|bullet size/i, aspect: 'radius' },
  { re: /\brange\b|\bdistance\b|falloff/i, aspect: 'range' },
  { re: /lifesteal|\bheal(?:ing)?\b/i, aspect: 'sustain' },
  { re: /resist/i, aspect: 'resist' },
  { re: /\bDPS\b|\bdamage\b/i, aspect: 'damage' },
  { re: /\bhealth\b|\bHP\b|\bregen\b|barrier/i, aspect: 'health' },
  { re: /cooldown|charge time|\bdelay\b|reload time/i, aspect: 'cooldown' },
  { re: /\bduration\b|channel time/i, aspect: 'duration' },
  { re: /stun|slow|silence|immobilize|\broot\b/i, aspect: 'cc' },
  { re: /move speed|movespeed|sprint|stamina|\bjump\b/i, aspect: 'mobility' },
  { re: /\bcost\b|\bammo\b/i, aspect: 'cost' },
  { re: /\bscaling\b/i, aspect: 'spirit_scaling' },
]

const RADIUS_WORDS = /\bradius\b|\bAoE\b|area of effect|bullet size/i

export function isAspect(value: string): value is Aspect {
  return (ASPECTS as readonly string[]).includes(value)
}

export function aspectForStat(stat: string): Aspect | undefined {
  return STAT_TO_ASPECT[stat]
}

/**
 * Light fallback when mechanical extract left `stat: value`.
 * Keyword rules first; then unit (`m` → range unless radius/AoE; `s` → duration;
 * `%` + scaling → spirit_scaling). Unrecognized leftovers stay `other`.
 */
export function inferValueAspect(
  metric: Pick<MetricDelta, 'unit'>,
  text: string,
): Aspect {
  const hay = `${text} ${metric.unit ?? ''}`
  for (const { re, aspect } of VALUE_ASPECT_RULES) {
    if (re.test(hay)) return aspect
  }
  const unit = metric.unit?.trim()
  if (unit === 'm' && !RADIUS_WORDS.test(hay)) return 'range'
  if (unit === 's') return 'duration'
  if (unit === '%' && /\bscaling\b/i.test(hay)) return 'spirit_scaling'
  return 'other'
}

export function aspectForMetric(
  metric: Pick<MetricDelta, 'stat' | 'unit'>,
  text: string,
): Aspect {
  if (metric.stat === 'value') return inferValueAspect(metric, text)
  return aspectForStat(metric.stat) ?? 'other'
}

export function layerForEvent(
  event: Pick<ChangeEvent, 'target'>,
): AspectLayer | undefined {
  if (event.target.kind === 'item') return 'shop_item'
  if (event.target.kind === 'hero') {
    return event.target.facet ? 'ability' : 'character'
  }
  return undefined
}

export function signForTag(tag: LineTag): AspectSign | undefined {
  if (tag === 'buff' || tag === 'nerf') return tag
  return undefined
}

export function eventAspectText(event: Pick<ChangeEvent, 'raw' | 'display'>): string {
  return event.display ? `${event.raw} ${event.display}` : event.raw
}

/**
 * Empirical percentile: percent of `sample` values ≤ `value`, one decimal.
 * Empty sample → 0. The line itself must already be in `sample`.
 */
export function empiricalPercentile(
  value: number,
  sample: readonly number[],
): number {
  if (sample.length === 0) return 0
  let lessOrEqual = 0
  for (const item of sample) {
    if (item <= value) lessOrEqual += 1
  }
  return Math.round((1000 * lessOrEqual) / sample.length) / 10
}

export function bagKey(
  layer: AspectLayer,
  aspect: Aspect,
  sign: AspectSign,
): string {
  return `${layer}|${aspect}|${sign}`
}

export function dayBagKey(
  patchId: string,
  layer: AspectLayer,
  aspect: Aspect,
  sign: AspectSign,
): string {
  return `${patchId}|${bagKey(layer, aspect, sign)}`
}

export interface AspectPeerIndex {
  all: ReadonlyMap<string, readonly number[]>
  byDay: ReadonlyMap<string, readonly number[]>
}

interface MeasurableLine {
  layer: AspectLayer
  aspect: Aspect
  sign: AspectSign
  relativePct: number
}

function measurableLine(
  event: ChangeEvent,
  metric: MetricDelta,
): MeasurableLine | undefined {
  const layer = layerForEvent(event)
  const sign = signForTag(event.tag)
  const rawPct = metricRelativePercent(metric)
  if (!layer || !sign || rawPct === undefined) return undefined
  return {
    layer,
    aspect: aspectForMetric(metric, eventAspectText(event)),
    sign,
    relativePct: Math.round(rawPct * 100) / 100,
  }
}

function pushBag(bags: Map<string, number[]>, key: string, value: number): void {
  const bag = bags.get(key)
  if (bag) bag.push(value)
  else bags.set(key, [value])
}

/** Peer bags from every loaded hero/item buff/nerf metric line. */
export function buildAspectPeerIndex(
  patches: readonly Patch[],
): AspectPeerIndex {
  const all = new Map<string, number[]>()
  const byDay = new Map<string, number[]>()
  for (const patch of patches) {
    for (const event of patch.events) {
      for (const metric of event.metrics ?? []) {
        const line = measurableLine(event, metric)
        if (!line) continue
        pushBag(all, bagKey(line.layer, line.aspect, line.sign), line.relativePct)
        pushBag(
          byDay,
          dayBagKey(patch.id, line.layer, line.aspect, line.sign),
          line.relativePct,
        )
      }
    }
  }
  return { all, byDay }
}

export function rankMetricLine(
  index: AspectPeerIndex,
  event: ChangeEvent,
  metric: MetricDelta,
  patchId: string,
): AspectPeerRank | undefined {
  const line = measurableLine(event, metric)
  if (!line) return undefined
  const all = index.all.get(bagKey(line.layer, line.aspect, line.sign)) ?? []
  const day =
    index.byDay.get(dayBagKey(patchId, line.layer, line.aspect, line.sign)) ?? []
  return {
    aspect: line.aspect,
    layer: line.layer,
    sign: line.sign,
    relativePct: line.relativePct,
    peerPercentile: empiricalPercentile(line.relativePct, all),
    peerN: all.length,
    dayPeerPercentile: empiricalPercentile(line.relativePct, day),
    dayPeerN: day.length,
  }
}

export function rankEventMetrics(
  index: AspectPeerIndex,
  event: ChangeEvent,
  patchId: string,
): AspectPeerRank[] {
  const ranks: AspectPeerRank[] = []
  for (const metric of event.metrics ?? []) {
    const rank = rankMetricLine(index, event, metric, patchId)
    if (rank) ranks.push(rank)
  }
  return ranks
}

export function formatAspectLabel(aspect: Aspect): string {
  if (aspect === 'cc') return 'CC'
  return aspect
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function formatLayerLabel(layer: AspectLayer): string {
  return layer === 'shop_item' ? 'item' : layer
}

export function formatPeerMark(percentile: number): string {
  const rounded = Math.round(percentile * 10) / 10
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `P${body}`
}

export function formatRelativeChange(pct: number): string {
  const body = pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)
  return `${body.replace(/\.0$/, '')}% relative change on this number`
}

/**
 * Headline for a line card. Across patches vs That day uses the same lens
 * as the Patterns detail entity percentiles.
 */
export function formatAspectPeerHeadline(
  rank: AspectPeerRank,
  lens: PatternLens,
): string {
  const percentile = lens === 'day' ? rank.dayPeerPercentile : rank.peerPercentile
  const n = lens === 'day' ? rank.dayPeerN : rank.peerN
  const aspectPhrase = rank.aspect === 'cc' ? 'CC' : rank.aspect.replace(/_/g, ' ')
  const noun = `${formatLayerLabel(rank.layer)} ${aspectPhrase} ${rank.sign}${n === 1 ? '' : 's'}`
  const day = lens === 'day' ? ' that day' : ''
  return `${formatAspectLabel(rank.aspect)} · ${formatPeerMark(percentile)} of ${n} ${noun}${day}`
}
