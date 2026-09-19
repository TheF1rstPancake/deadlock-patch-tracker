export type LineTag = 'buff' | 'nerf' | 'neutral' | 'fix'
export type HeroSentiment = 'buff' | 'nerf' | 'mixed' | 'neutral' | 'fix'
export type TargetKind = 'hero' | 'item' | 'general' | 'system' | 'unknown'
export type Layout = 'sectioned' | 'flat' | 'prose'
export type ParseConfidence = 'high' | 'medium' | 'low'
export type ParseSource = 'mechanical' | 'cursor' | 'manual' | 'typesafe-jev'

export interface HeroChange {
  /** Exact Steam / changelog wording. */
  raw: string
  /** Clarified line for the board. When omitted, UI shows `raw`. */
  display?: string
  /** True when `display` is our paraphrase, not Valve’s text. */
  clarified?: boolean
  tag: LineTag
  /** When true, ingest will keep this tag on refresh. */
  override?: boolean
}

export interface HeroPatch {
  name: string
  sentiment: HeroSentiment
  /** When true, ingest will keep this sentiment on refresh. */
  override?: boolean
  changes: HeroChange[]
}

export interface MetricDelta {
  stat: string
  from?: number | string
  to?: number | string
  unit?: string
  polarity?: 'up_is_buff' | 'up_is_nerf' | 'unknown'
}

export interface ChangeTarget {
  kind: TargetKind
  name: string
  slug?: string
  facet?: string
}

export interface ChangeParse {
  confidence: ParseConfidence
  needsReview: boolean
  source: ParseSource
  /** TypeSafe Jev model score when `source` is `typesafe-jev`. */
  jevConfidence?: number
  /** Mechanical (or prior) tag when Jev flipped the classification. */
  priorTag?: LineTag
}

export interface ChangeEvent {
  id: string
  section: string
  target: ChangeTarget
  tag: LineTag
  metrics?: MetricDelta[]
  raw: string
  display?: string
  clarified?: boolean
  override?: boolean
  parse: ChangeParse
}

export interface PatchV2 {
  schemaVersion: 2
  id: string
  title: string
  date: string
  steamUrl: string
  gid: string
  appid: number
  layout: Layout
  sectionsPresent: string[]
  events: ChangeEvent[]
  /** V1 board projection of `events` where `target.kind === 'hero'`. */
  heroes: HeroPatch[]
}

/** On-disk / UI patch document. V2 is the source of truth. */
export type Patch = PatchV2

export interface HistoryPatchSummary {
  id: string
  date: string
  title: string
  gid: string
  layout: Layout
  counts: {
    events: number
    hero: number
    item: number
    general: number
    system: number
    unknown: number
    needsReview: number
  }
}

export interface HistoryTargetTouch {
  patchId: string
  tagSummary: HeroSentiment
  eventIds: string[]
}

export interface HistoryTarget {
  kind: TargetKind
  name: string
  slug: string
  touches: HistoryTargetTouch[]
  totals: { buff: number; nerf: number; fix: number; neutral: number }
}

export interface HistoryIndex {
  schemaVersion: 1
  generatedAt: string
  patches: HistoryPatchSummary[]
  targets: Record<string, HistoryTarget>
}

export function changeRaw(change: HeroChange): string {
  return change.raw
}

export function changeDisplay(change: HeroChange): string {
  return change.display ?? change.raw
}

export function targetKey(kind: TargetKind, slug: string): string {
  return `${kind}:${slug}`
}
