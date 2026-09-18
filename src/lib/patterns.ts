import { metricRelativePercent } from './metrics.ts'
import { slugifyName } from './slug.ts'
import type { ChangeEvent, LineTag, Patch } from '../types.ts'
import type { PatternKind } from './route.ts'

/**
 * Recent-volatility window: last N ingested patches (newest by date, then id),
 * not a calendar span. Patch cadence is uneven — a ~30-day window often covers
 * a single notes post — so five patches is the more stable “lately” signal.
 */
export const RECENT_PATCH_WINDOW = 5
/** Overview heatmap columns (newest). “All patches” expands to the full ledger. */
export const OVERVIEW_PATCH_COLUMNS = 10
/** Overview rows by current sort. “Show all” expands the full catalog. */
export const OVERVIEW_TOP_ROWS = 14

export type PatternSort = 'total' | 'recent'
export const DEFAULT_PATTERN_SORT: PatternSort = 'recent'

export type PatternChartMode = 'counts' | 'extent'
export const DEFAULT_PATTERN_CHART_MODE: PatternChartMode = 'counts'

/**
 * Stand-in relative-% weight when a buff/nerf line has no usable from→to
 * metrics, so unmeasured lines still show on the Extent chart.
 */
export const FALLBACK_EXTENT_WEIGHT = 5

export const RECENT_VOLATILITY_HINT =
  `Buff+nerf events in the last ${RECENT_PATCH_WINDOW} ingested patches — not a 30-day window.`

export interface TagCounts {
  buff: number
  nerf: number
  fix: number
  neutral: number
}

export interface PatternPatchColumn {
  id: string
  date: string
  title: string
}

export interface PatternCell {
  patchId: string
  counts: TagCounts
  /** Buff + nerf events only. Fix/neutral do not add volume. */
  touchVolume: number
  /** Buffs − nerfs. Fix/neutral are excluded. */
  signedNet: number
  /** False when this entity has no events in that patch (sparse ≠ net 0). */
  touched: boolean
}

export type CellTone = 'empty' | 'buff' | 'nerf' | 'churn' | 'fix' | 'neutral'

export interface PatternEntity {
  kind: PatternKind
  name: string
  slug: string
  totals: TagCounts
  /** Buff + nerf events across every ingested patch. */
  totalTouches: number
  /** Buff + nerf events in the last `recentWindow` patches. */
  recentTouches: number
  cells: PatternCell[]
}

export interface PatternMatrix {
  kind: PatternKind
  patches: PatternPatchColumn[]
  recentWindow: number
  maxTouchVolume: number
  entities: PatternEntity[]
}

export interface PatternExtent {
  /** Sum of relative-% magnitudes on buff lines (always ≥ 0). */
  buff: number
  /** Sum of relative-% magnitudes on nerf lines (always ≥ 0). */
  nerf: number
  /** True when at least one buff/nerf line used `FALLBACK_EXTENT_WEIGHT`. */
  estimated: boolean
}

export interface PatternSeriesPoint {
  patchId: string
  date: string
  title: string
  counts: TagCounts
  extent: PatternExtent
  signedNet: number
  /** Buff extent − nerf extent (same sign convention as `signedNet`). */
  signedExtent: number
  cumulativeNet: number
  touched: boolean
}

export interface PatternEntityDetail {
  kind: PatternKind
  name: string
  slug: string
  totals: TagCounts
  totalTouches: number
  series: PatternSeriesPoint[]
}

export function emptyTagCounts(): TagCounts {
  return { buff: 0, nerf: 0, fix: 0, neutral: 0 }
}

export function addTag(counts: TagCounts, tag: LineTag): void {
  if (tag === 'buff' || tag === 'nerf' || tag === 'fix' || tag === 'neutral') {
    counts[tag] += 1
  }
}

export function touchVolume(counts: TagCounts): number {
  return counts.buff + counts.nerf
}

export function signedNet(counts: TagCounts): number {
  return counts.buff - counts.nerf
}

export function emptyExtent(): PatternExtent {
  return { buff: 0, nerf: 0, estimated: false }
}

export function signedExtent(extent: PatternExtent): number {
  return extent.buff - extent.nerf
}

/**
 * One buff/nerf line’s contribution to Extent: sum of usable metric relative
 * percents, or `FALLBACK_EXTENT_WEIGHT` when none parse. Fix/neutral are 0.
 */
export function eventExtent(event: ChangeEvent): {
  weight: number
  estimated: boolean
} {
  if (event.tag !== 'buff' && event.tag !== 'nerf') {
    return { weight: 0, estimated: false }
  }
  let sum = 0
  let usable = 0
  for (const metric of event.metrics ?? []) {
    const mag = metricRelativePercent(metric)
    if (mag === undefined) continue
    sum += mag
    usable += 1
  }
  if (usable > 0) return { weight: sum, estimated: false }
  return { weight: FALLBACK_EXTENT_WEIGHT, estimated: true }
}

export function cellTone(cell: PatternCell): CellTone {
  if (!cell.touched) return 'empty'
  if (cell.signedNet > 0) return 'buff'
  if (cell.signedNet < 0) return 'nerf'
  if (cell.touchVolume > 0) return 'churn'
  if (cell.counts.fix > 0) return 'fix'
  return 'neutral'
}

/** Opacity for net/churn fill. Untouched cells must not call this for paint. */
export function volumeOpacity(volume: number, maxVolume: number): number {
  if (volume <= 0) return 0
  const peak = Math.max(maxVolume, 1)
  return 0.38 + 0.62 * Math.sqrt(Math.min(1, volume / peak))
}

export function compactPatchLabel(date: string): string {
  const [, month, day] = date.split('-')
  if (!month || !day) return date
  return `${Number(month)}/${Number(day)}`
}

function sortPatchesChrono(patches: readonly Patch[]): Patch[] {
  return [...patches].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.id.localeCompare(b.id)
  })
}

function cellFromCounts(patchId: string, counts: TagCounts | undefined): PatternCell {
  if (!counts) {
    return {
      patchId,
      counts: emptyTagCounts(),
      touchVolume: 0,
      signedNet: 0,
      touched: false,
    }
  }
  return {
    patchId,
    counts: { ...counts },
    touchVolume: touchVolume(counts),
    signedNet: signedNet(counts),
    touched: true,
  }
}

interface Bucket {
  name: string
  slug: string
  totals: TagCounts
  byPatch: Map<string, TagCounts>
}

function collectBuckets(patches: readonly Patch[], kind: PatternKind): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>()
  for (const patch of patches) {
    for (const event of patch.events) {
      if (event.target.kind !== kind) continue
      const slug = event.target.slug ?? slugifyName(event.target.name)
      let bucket = buckets.get(slug)
      if (!bucket) {
        bucket = {
          name: event.target.name,
          slug,
          totals: emptyTagCounts(),
          byPatch: new Map(),
        }
        buckets.set(slug, bucket)
      } else if (event.target.name.length > bucket.name.length) {
        bucket.name = event.target.name
      }
      let counts = bucket.byPatch.get(patch.id)
      if (!counts) {
        counts = emptyTagCounts()
        bucket.byPatch.set(patch.id, counts)
      }
      addTag(counts, event.tag)
      addTag(bucket.totals, event.tag)
    }
  }
  return buckets
}

function compareEntities(
  a: PatternEntity,
  b: PatternEntity,
  sort: PatternSort,
): number {
  if (sort === 'recent') {
    const byRecent = b.recentTouches - a.recentTouches
    if (byRecent !== 0) return byRecent
  }
  const byTotal = b.totalTouches - a.totalTouches
  if (byTotal !== 0) return byTotal
  return a.name.localeCompare(b.name)
}

export function buildPatternMatrix(
  patches: readonly Patch[],
  kind: PatternKind,
  options?: { recentWindow?: number; sort?: PatternSort },
): PatternMatrix {
  const chrono = sortPatchesChrono(patches)
  const recentWindow = options?.recentWindow ?? RECENT_PATCH_WINDOW
  const sort = options?.sort ?? 'total'
  const recentIds = new Set(chrono.slice(-recentWindow).map((patch) => patch.id))
  const buckets = collectBuckets(chrono, kind)

  const columns: PatternPatchColumn[] = chrono.map((patch) => ({
    id: patch.id,
    date: patch.date,
    title: patch.title,
  }))

  const entities: PatternEntity[] = [...buckets.values()].map((bucket) => {
    const cells = columns.map((column) =>
      cellFromCounts(column.id, bucket.byPatch.get(column.id)),
    )
    let recentTouches = 0
    for (const cell of cells) {
      if (recentIds.has(cell.patchId)) recentTouches += cell.touchVolume
    }
    return {
      kind,
      name: bucket.name,
      slug: bucket.slug,
      totals: { ...bucket.totals },
      totalTouches: touchVolume(bucket.totals),
      recentTouches,
      cells,
    }
  })

  entities.sort((a, b) => compareEntities(a, b, sort))

  let maxTouchVolume = 0
  for (const entity of entities) {
    for (const cell of entity.cells) {
      if (cell.touchVolume > maxTouchVolume) maxTouchVolume = cell.touchVolume
    }
  }

  return {
    kind,
    patches: columns,
    recentWindow,
    maxTouchVolume,
    entities,
  }
}

export function clipOverviewMatrix(
  matrix: PatternMatrix,
  options: {
    allPatches?: boolean
    allRows?: boolean
    query?: string
  } = {},
): PatternMatrix {
  const needle = options.query?.trim().toLowerCase() ?? ''
  let entities = needle
    ? matchingPatternEntities(matrix.entities, needle)
    : [...matrix.entities]

  if (!options.allRows && !needle) {
    entities = entities.slice(0, OVERVIEW_TOP_ROWS)
  }

  let patches = matrix.patches
  if (!options.allPatches && patches.length > OVERVIEW_PATCH_COLUMNS) {
    patches = patches.slice(-OVERVIEW_PATCH_COLUMNS)
    const keep = new Set(patches.map((column) => column.id))
    entities = entities.map((entity) => ({
      ...entity,
      cells: entity.cells.filter((cell) => keep.has(cell.patchId)),
    }))
  }

  let maxTouchVolume = 0
  for (const entity of entities) {
    for (const cell of entity.cells) {
      if (cell.touchVolume > maxTouchVolume) maxTouchVolume = cell.touchVolume
    }
  }

  return { ...matrix, patches, entities, maxTouchVolume }
}

function collectExtentByPatch(
  patches: readonly Patch[],
  kind: PatternKind,
  slug: string,
): Map<string, PatternExtent> {
  const byPatch = new Map<string, PatternExtent>()
  for (const patch of patches) {
    for (const event of patch.events) {
      if (event.target.kind !== kind) continue
      const eventSlug = event.target.slug ?? slugifyName(event.target.name)
      if (eventSlug !== slug) continue
      if (event.tag !== 'buff' && event.tag !== 'nerf') continue
      let extent = byPatch.get(patch.id)
      if (!extent) {
        extent = emptyExtent()
        byPatch.set(patch.id, extent)
      }
      const { weight, estimated } = eventExtent(event)
      extent[event.tag] += weight
      if (estimated) extent.estimated = true
    }
  }
  return byPatch
}

export function buildEntityDetail(
  patches: readonly Patch[],
  kind: PatternKind,
  slug: string,
): PatternEntityDetail | undefined {
  const matrix = buildPatternMatrix(patches, kind, { sort: 'total' })
  const entity = matrix.entities.find((row) => row.slug === slug)
  if (!entity) return undefined

  const extentByPatch = collectExtentByPatch(patches, kind, slug)
  let running = 0
  const series: PatternSeriesPoint[] = entity.cells.map((cell, index) => {
    running += cell.signedNet
    const column = matrix.patches[index]
    const extent = extentByPatch.get(cell.patchId) ?? emptyExtent()
    return {
      patchId: cell.patchId,
      date: column?.date ?? cell.patchId,
      title: column?.title ?? cell.patchId,
      counts: cell.counts,
      extent: { ...extent },
      signedNet: cell.signedNet,
      signedExtent: signedExtent(extent),
      cumulativeNet: running,
      touched: cell.touched,
    }
  })

  return {
    kind: entity.kind,
    name: entity.name,
    slug: entity.slug,
    totals: entity.totals,
    totalTouches: entity.totalTouches,
    series,
  }
}

export function matchingPatternEntities(
  entities: readonly PatternEntity[],
  query: string,
): PatternEntity[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...entities]
  return entities.filter((entity) => entity.name.toLowerCase().includes(needle))
}

export function uniqueMatch(
  entities: readonly PatternEntity[],
  query: string,
): PatternEntity | undefined {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return undefined
  const matches = matchingPatternEntities(entities, needle)
  if (matches.length === 1) return matches[0]
  return matches.find((entity) => entity.name.toLowerCase() === needle)
}

export function formatTotalsLine(totals: TagCounts): string {
  return `${totals.buff} buff · ${totals.nerf} nerf · ${totals.fix} fix · ${totals.neutral} other`
}

export function cellSummary(cell: PatternCell, date: string): string {
  if (!cell.touched) return `${date}: no touch`
  const parts = [
    `${cell.counts.buff} buff`,
    `${cell.counts.nerf} nerf`,
  ]
  if (cell.counts.fix > 0) parts.push(`${cell.counts.fix} fix`)
  if (cell.counts.neutral > 0) parts.push(`${cell.counts.neutral} other`)
  const net =
    cell.touchVolume > 0 ? `net ${cell.signedNet > 0 ? '+' : ''}${cell.signedNet}` : 'net n/a'
  return `${date}: ${parts.join(' · ')} (${net})`
}
