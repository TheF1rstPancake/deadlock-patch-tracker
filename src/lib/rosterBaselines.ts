import rosterBaselinesJson from '../../data/roster-baselines.json'
import {
  aspectForMetric,
  empiricalPercentile,
  type Aspect,
} from './aspectPeers.ts'
import { numericMetricValue } from './metrics.ts'
import type { MetricDelta } from '../types.ts'

/** Closed set of live roster property families used for absolute extent. */
export const ROSTER_FAMILIES = [
  'spirit_coeff',
  'spirit_coeff_damage',
  'spirit_coeff_melee',
  'cooldown_s',
  'duration_s',
  'range_base_m',
  'range_bonus_m',
  'radius_m',
  'damage_flat',
  'damage_pct',
  'health_flat',
  'resist_pct',
  'sustain_pct',
  'sustain_flat',
  'mobility_speed',
  'mobility_stamina',
  'fire_rate_pct',
  'cc_pct',
  'melee_damage_flat',
  'tech_duration_mult',
  'tech_range_mult',
  'hero_scaling_scale',
] as const

export type RosterFamily = (typeof ROSTER_FAMILIES)[number]

/** Families with fewer than 5 live samples are not a comparable pack. */
export const MIN_ROSTER_SAMPLE = 5

export const ROSTER_HINT = 'vs live ability/hero property pack'
export const NO_ROSTER_BASELINE_CHIP = 'No roster baseline'

export type AbsoluteNormStatus = 'ok' | 'no_roster_baseline'

export interface RosterFamilyBag {
  n: number
  min: number
  p50: number
  max: number
  values: number[]
}

export interface RosterBaselinesFile {
  generatedAt: string
  source: { heroes: string; items: string }
  minSampleSize: number
  families: Record<string, RosterFamilyBag>
}

export interface AbsoluteNormScore {
  pBefore?: number
  pAfter?: number
  deltaP?: number
  family?: RosterFamily
  familyN?: number
  familyP50?: number
  status: AbsoluteNormStatus
}

const FIRE_RATE_RE = /fire\s*rate/i
const STAMINA_RE = /\bstamina\b/i
const PCT_RE = /%/

function asFile(raw: unknown): RosterBaselinesFile {
  return raw as RosterBaselinesFile
}

export function loadRosterBaselines(
  data: RosterBaselinesFile = asFile(rosterBaselinesJson),
): RosterBaselinesFile {
  return data
}

export function isRosterFamily(value: string): value is RosterFamily {
  return (ROSTER_FAMILIES as readonly string[]).includes(value)
}

export function familyBag(
  family: string | undefined,
  bags: RosterBaselinesFile = loadRosterBaselines(),
): RosterFamilyBag | undefined {
  if (!family) return undefined
  const bag = bags.families[family]
  if (!bag || bag.n < MIN_ROSTER_SAMPLE || bag.values.length < MIN_ROSTER_SAMPLE) {
    return undefined
  }
  return bag
}

function looksPercent(unit: string | undefined, raw: string): boolean {
  if (unit?.trim() === '%') return true
  return PCT_RE.test(raw)
}

function bothWithin(from: number, to: number, bag: RosterFamilyBag): boolean {
  const a = Math.abs(from)
  const b = Math.abs(to)
  return a >= bag.min && a <= bag.max && b >= bag.min && b <= bag.max
}

/**
 * Map a from→to line onto a live property family. Prefers the existing
 * aspect (from `aspectPeers`) plus unit / raw hints — never invents a bag
 * for leftover `other` / `cost` lines.
 */
export function pickFamily(
  aspect: Aspect,
  unit: string | undefined,
  from: number,
  to: number,
  raw: string,
  bags: RosterBaselinesFile = loadRosterBaselines(),
): RosterFamily | undefined {
  const usable = (name: RosterFamily): RosterFamily | undefined =>
    familyBag(name, bags) ? name : undefined

  switch (aspect) {
    case 'spirit_scaling':
      return usable('spirit_coeff')
    case 'weapon_scaling':
      return usable('spirit_coeff_damage') ?? usable('spirit_coeff')
    case 'cooldown':
    case 'cooldown_reduction':
      return usable('cooldown_s')
    case 'duration':
      return usable('duration_s')
    case 'range': {
      const bonus = familyBag('range_bonus_m', bags)
      if (bonus && bothWithin(from, to, bonus)) return 'range_bonus_m'
      return usable('range_base_m')
    }
    case 'radius':
      return usable('radius_m')
    case 'damage': {
      if (FIRE_RATE_RE.test(raw)) return usable('fire_rate_pct')
      return looksPercent(unit, raw) ? usable('damage_pct') : usable('damage_flat')
    }
    case 'health':
      return usable('health_flat')
    case 'resist':
      return usable('resist_pct')
    case 'mobility':
      return STAMINA_RE.test(raw)
        ? usable('mobility_stamina')
        : usable('mobility_speed')
    case 'sustain': {
      if (looksPercent(unit, raw)) return usable('sustain_pct') ?? usable('sustain_flat')
      const mag = Math.max(Math.abs(from), Math.abs(to))
      if (mag >= 100) return usable('sustain_flat') ?? usable('sustain_pct')
      return usable('sustain_pct') ?? usable('sustain_flat')
    }
    case 'cc':
      return usable('cc_pct')
    case 'cost':
    case 'other':
      return undefined
  }
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10
}

/** Score from/to as empirical percentiles in a live family bag. */
export function scoreAbsolute(
  from: number,
  to: number,
  family: RosterFamily | undefined,
  bags: RosterBaselinesFile = loadRosterBaselines(),
): AbsoluteNormScore {
  const bag = familyBag(family, bags)
  if (!family || !bag) {
    return { status: 'no_roster_baseline', family }
  }
  const pBefore = empiricalPercentile(from, bag.values)
  const pAfter = empiricalPercentile(to, bag.values)
  return {
    status: 'ok',
    pBefore,
    pAfter,
    deltaP: roundTenth(pAfter - pBefore),
    family,
    familyN: bag.n,
    familyP50: bag.p50,
  }
}

export function scoreMetricAbsolute(
  metric: Pick<MetricDelta, 'stat' | 'unit' | 'from' | 'to'>,
  text: string,
  bags: RosterBaselinesFile = loadRosterBaselines(),
): AbsoluteNormScore {
  const from = numericMetricValue(metric.from)
  const to = numericMetricValue(metric.to)
  if (from === undefined || to === undefined) {
    return { status: 'no_roster_baseline' }
  }
  const aspect = aspectForMetric(metric, text)
  const family = pickFamily(aspect, metric.unit, from, to, text, bags)
  return scoreAbsolute(from, to, family, bags)
}

export function formatFamilyLabel(family: RosterFamily): string {
  return family.replace(/_/g, ' ')
}

function formatRosterMark(percentile: number): string {
  return `P${Math.round(percentile)}`
}

function formatDeltaP(delta: number): string {
  const rounded = Math.round(delta)
  if (rounded > 0) return `ΔP +${rounded}`
  if (rounded < 0) return `ΔP ${rounded}`
  return 'ΔP 0'
}

/** Headline when a roster baseline exists: `Roster P25 → P32 (ΔP +6) · spirit coeff`. */
export function formatRosterHeadline(score: AbsoluteNormScore): string {
  if (score.status !== 'ok' || score.family === undefined) return ''
  const before = formatRosterMark(score.pBefore ?? 0)
  const after = formatRosterMark(score.pAfter ?? 0)
  const delta = formatDeltaP(score.deltaP ?? 0)
  return `Roster ${before} → ${after} (${delta}) · ${formatFamilyLabel(score.family)}`
}
