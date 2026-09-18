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
/**
 * Row cap used only for ranked sorts (total / recent). Alphabetical default
 * shows the full roster; “Show all” expands ranked overviews.
 */
export const OVERVIEW_TOP_ROWS = 14

/**
 * Heatmap relative percentile needs more than 3 same-kind buff/nerf entities
 * that patch (including this one). Smaller samples get “n too small”, never a
 * fake %ile. Detail chart uses `MIN_PERCENTILE_SAMPLE` instead.
 */
export const MIN_PEER_SAMPLE = 4
/**
 * Detail %ile chart: n &lt; 5 that direction shows a rank fraction (“2 of 4”),
 * not a fine percentile. Heatmap relative ranking is unchanged (n≤3).
 */
export const MIN_PERCENTILE_SAMPLE = 5
/** Loudest that-day hits listed under the entity chart. */
export const HARDEST_HITS_LIMIT = 5

export type PatternSort = 'name' | 'total' | 'recent'
export const DEFAULT_PATTERN_SORT: PatternSort = 'name'

export type PatternChartMode = 'percentile' | 'counts'
export const DEFAULT_PATTERN_CHART_MODE: PatternChartMode = 'percentile'
/**
 * Detail “how hard” lens. Both are percentile-only (never absolute Extent).
 * Default is Across patches when browsing history; heatmap cell links use That day.
 */
export type PatternLens = 'across' | 'day'
export const DEFAULT_PATTERN_LENS: PatternLens = 'across'
/** Heatmap relative tooltip unit — not a detail-chart mode. */
export type PercentileMetric = 'extent' | 'counts'

export type HeatmapColorMode = 'absolute' | 'relative'
export const DEFAULT_HEATMAP_COLOR_MODE: HeatmapColorMode = 'absolute'

/**
 * Stand-in relative-% weight when a buff/nerf line has no usable from→to
 * metrics. Plain unmeasured lines stay small so they do not impersonate a
 * 50% numeric hit.
 */
export const FALLBACK_EXTENT_WEIGHT = 5
/**
 * Heavier stand-in for identity / structural lines (`no longer`, `removed`,
 * `now grants`, hitbox, …) that have no ratio. Still a guess — not “how big
 * the identity change is” — but it must outrank a tiny numeric tweak.
 */
export const STRUCTURAL_EXTENT_WEIGHT = 20
/**
 * Detect qualitative identity changes that should use `STRUCTURAL_EXTENT_WEIGHT`
 * instead of the plain fallback when no from→to metrics parse.
 */
export const STRUCTURAL_LINE_RE =
  /\bno longer\b|\bremoved\b|\bnow grants\b|\bhitbox(?:es)?\b/i

export const RECENT_VOLATILITY_HINT =
  `Buff+nerf events in the last ${RECENT_PATCH_WINDOW} ingested patches — not a 30-day window.`

export const RELATIVE_HEATMAP_LEGEND =
  'Relative: color intensity = within-column percentile of estimated extent vs other heroes (or items) touched that patch — max(buff, nerf) extent. Hue is buff/nerf direction. n of 3 or fewer that patch: no percentile. Empty = no events. Not win-rate.'

export const ABSOLUTE_HEATMAP_LEGEND =
  'Absolute: color = signed net (buffs − nerfs); intensity + number = buff+nerf volume. Empty = no touch.'

export interface TagCounts {
  buff: number
  nerf: number
  fix: number
  neutral: number
}

/** Peer median / P90 in the same units as the active chart (counts or extent). */
export interface PeerBand {
  medianBuff: number
  p90Buff: number
  medianNerf: number
  p90Nerf: number
}

export interface PatternPatchColumn {
  id: string
  date: string
  title: string
  /** Same-kind entities with ≥1 buff/nerf that patch (including this row’s kind). */
  peerN: number
  peerCounts: PeerBand | null
  peerExtent: PeerBand | null
}

export interface PatternCell {
  patchId: string
  counts: TagCounts
  extent: PatternExtent
  /** Buff + nerf events only. Fix/neutral do not add volume. */
  touchVolume: number
  /** Buffs − nerfs. Fix/neutral are excluded. */
  signedNet: number
  /** False when this entity has no events in that patch (sparse ≠ net 0). */
  touched: boolean
  /**
   * Within-column percentile of max(buff, nerf) extent among same-kind
   * buff/nerf peers. Null when n≤3 or this cell is not a buff/nerf peer.
   * Heatmap Relative only — detail chart uses `buffRank` / `nerfRank`.
   */
  extentPercentile: number | null
  /** Same pooled rank rule on event counts (heatmap/debug). */
  countsPercentile: number | null
  /** That-day buff %ile vs heroes/items with ≥1 buff. Null if no buff. */
  buffRank: DirectionRank | null
  /** That-day nerf %ile vs heroes/items with ≥1 nerf. Null if no nerf. */
  nerfRank: DirectionRank | null
  /**
   * Across-patches buff %ile vs every same-kind buff touch in the ledger.
   * Null if no buff that patch.
   */
  acrossBuffRank: DirectionRank | null
  acrossNerfRank: DirectionRank | null
  events: ChangeEvent[]
}

export type CellTone = 'empty' | 'buff' | 'nerf' | 'churn' | 'fix' | 'neutral'

export type BarSide = 'buff' | 'nerf' | 'all'

/**
 * That-day rank of this entity’s buff (or nerf) extent among same-kind peers
 * who also had ≥1 buff (or ≥1 nerf) that patch. Buff and nerf are never pooled.
 */
export interface DirectionRank {
  side: 'buff' | 'nerf'
  peerN: number
  /** 1-based rank from loudest (1 = hardest that patch among that side). */
  rank: number
  /** Empirical percentile (percent of peers ≤ this). Used for bar height. */
  percentile: number
  /** True when `peerN < MIN_PERCENTILE_SAMPLE` — UI shows rank fraction. */
  smallN: boolean
}

export interface HardestHit {
  patchId: string
  date: string
  side: 'buff' | 'nerf'
  rank: DirectionRank
  extent: number
}

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
  /** True when at least one buff/nerf line used a stand-in extent weight. */
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
  events: ChangeEvent[]
  countsPercentile: number | null
  extentPercentile: number | null
  buffRank: DirectionRank | null
  nerfRank: DirectionRank | null
  acrossBuffRank: DirectionRank | null
  acrossNerfRank: DirectionRank | null
  peerN: number
  peerCounts: PeerBand | null
  peerExtent: PeerBand | null
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
 * Rank magnitude for peer percentile: the louder side of a mixed patch,
 * not |net|, so +big/−big churn still ranks as a loud hit.
 */
export function rankMagnitude(buff: number, nerf: number): number {
  return Math.max(buff, nerf)
}

export function isStructuralChangeLine(text: string): boolean {
  return STRUCTURAL_LINE_RE.test(text)
}

/**
 * One buff/nerf line’s contribution to Extent: sum of usable metric relative
 * percents, or a stand-in when none parse. Structural/qualitative lines use
 * `STRUCTURAL_EXTENT_WEIGHT`; other unmeasured lines use
 * `FALLBACK_EXTENT_WEIGHT`. Fix/neutral are 0.
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
  const text = event.display ? `${event.raw} ${event.display}` : event.raw
  const weight = isStructuralChangeLine(text)
    ? STRUCTURAL_EXTENT_WEIGHT
    : FALLBACK_EXTENT_WEIGHT
  return { weight, estimated: true }
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

/**
 * Relative heatmap intensity from a real percentile. `null` is n-too-small:
 * a fixed mid fill so hue still shows, without a fake rank.
 */
export function percentileOpacity(percentile: number | null): number {
  if (percentile === null) return 0.4
  return 0.28 + 0.72 * Math.min(1, Math.max(0, percentile / 100))
}

export function compactPatchLabel(date: string): string {
  const [, month, day] = date.split('-')
  if (!month || !day) return date
  return `${Number(month)}/${Number(day)}`
}

/** Linear interpolation quantile on a copy. Empty → 0. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]!
  const t = Math.min(1, Math.max(0, q)) * (sorted.length - 1)
  const lo = Math.floor(t)
  const hi = Math.ceil(t)
  const a = sorted[lo]!
  const b = sorted[hi]!
  if (lo === hi) return a
  return a + (b - a) * (t - lo)
}

/**
 * Empirical percentile of `value` in `sample` (percent of values ≤ this one).
 * Null when the sample is too small to rank (heatmap: n&lt;4).
 */
export function percentileRank(
  value: number,
  sample: readonly number[],
): number | null {
  if (sample.length < MIN_PEER_SAMPLE) return null
  let lessOrEqual = 0
  for (const item of sample) {
    if (item <= value) lessOrEqual += 1
  }
  return Math.round((100 * lessOrEqual) / sample.length)
}

/**
 * Rank `value` inside a same-direction peer sample. Always returns a
 * percentile for bar height; `smallN` tells the UI to show “2 of 4” instead.
 */
export function directionRank(
  value: number,
  sample: readonly number[],
  side: 'buff' | 'nerf',
): DirectionRank {
  const peerN = sample.length
  let lessOrEqual = 0
  let strictlyGreater = 0
  for (const item of sample) {
    if (item <= value) lessOrEqual += 1
    if (item > value) strictlyGreater += 1
  }
  const percentile =
    peerN === 0 ? 0 : Math.round((100 * lessOrEqual) / peerN)
  return {
    side,
    peerN,
    rank: strictlyGreater + 1,
    percentile,
    smallN: peerN < MIN_PERCENTILE_SAMPLE,
  }
}

/** `P92` or `2 of 4` — no unit, for the Hardest hits list. */
export function formatRankMark(rank: DirectionRank): string {
  if (rank.smallN) return `${rank.rank} of ${rank.peerN}`
  return `P${rank.percentile}`
}

/** `P92 nerf` / `2 of 4 buff` */
export function formatDirectionLabel(rank: DirectionRank): string {
  return `${formatRankMark(rank)} ${rank.side}`
}

export function formatPercentileLabel(
  percentile: number | null,
  peerN: number,
  metric: PercentileMetric,
): string {
  const unit = metric === 'extent' ? 'extent' : 'counts'
  if (peerN < MIN_PEER_SAMPLE) {
    return `${unit} percentile: n too small (${peerN} that patch)`
  }
  if (percentile === null) {
    return `no ${unit} percentile (no buff/nerf that patch)`
  }
  return `P${percentile} ${unit} vs ${peerN} that patch`
}

export function ranksForLens(
  point: Pick<
    PatternSeriesPoint,
    'buffRank' | 'nerfRank' | 'acrossBuffRank' | 'acrossNerfRank'
  >,
  lens: PatternLens,
): { buff: DirectionRank | null; nerf: DirectionRank | null } {
  if (lens === 'across') {
    return { buff: point.acrossBuffRank, nerf: point.acrossNerfRank }
  }
  return { buff: point.buffRank, nerf: point.nerfRank }
}

export function peerSetCopy(kind: PatternKind, lens: PatternLens): string {
  if (lens === 'across') {
    const unit = kind === 'hero' ? 'hero' : 'item'
    return `Among every ${unit} buff (or nerf) in the ledger.`
  }
  const peers = kind === 'hero' ? 'heroes' : 'items'
  return `Among ${peers} nerfed (or buffed) that same patch.`
}

export function hardestHitsFromSeries(
  series: readonly PatternSeriesPoint[],
  lens: PatternLens = DEFAULT_PATTERN_LENS,
  limit = HARDEST_HITS_LIMIT,
): HardestHit[] {
  const hits: HardestHit[] = []
  for (const point of series) {
    const ranks = ranksForLens(point, lens)
    if (ranks.buff) {
      hits.push({
        patchId: point.patchId,
        date: point.date,
        side: 'buff',
        rank: ranks.buff,
        extent: point.extent.buff,
      })
    }
    if (ranks.nerf) {
      hits.push({
        patchId: point.patchId,
        date: point.date,
        side: 'nerf',
        rank: ranks.nerf,
        extent: point.extent.nerf,
      })
    }
  }
  hits.sort((a, b) => {
    // Small-N maxes empirical %ile at 100 (“1 of 3”). Keep those readable in
    // the list, but don’t let them outrank a real peer-set hit.
    if (a.rank.smallN !== b.rank.smallN) return a.rank.smallN ? 1 : -1
    const byPct = b.rank.percentile - a.rank.percentile
    if (byPct !== 0) return byPct
    const byExtent = b.extent - a.extent
    if (byExtent !== 0) return byExtent
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return a.side.localeCompare(b.side)
  })
  return hits.slice(0, Math.max(0, limit))
}

export function eventsForBar(
  events: readonly ChangeEvent[],
  side: BarSide,
): ChangeEvent[] {
  if (side === 'all') return [...events]
  return events.filter((event) => event.tag === side)
}

function sortPatchesChrono(patches: readonly Patch[]): Patch[] {
  return [...patches].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.id.localeCompare(b.id)
  })
}

function emptyCell(patchId: string): PatternCell {
  return {
    patchId,
    counts: emptyTagCounts(),
    extent: emptyExtent(),
    touchVolume: 0,
    signedNet: 0,
    touched: false,
    extentPercentile: null,
    countsPercentile: null,
    buffRank: null,
    nerfRank: null,
    acrossBuffRank: null,
    acrossNerfRank: null,
    events: [],
  }
}

function cellFromBucket(patchId: string, bucket: PatchBucket | undefined): PatternCell {
  if (!bucket) return emptyCell(patchId)
  return {
    patchId,
    counts: { ...bucket.counts },
    extent: { ...bucket.extent },
    touchVolume: touchVolume(bucket.counts),
    signedNet: signedNet(bucket.counts),
    touched: true,
    extentPercentile: null,
    countsPercentile: null,
    buffRank: null,
    nerfRank: null,
    acrossBuffRank: null,
    acrossNerfRank: null,
    events: [...bucket.events],
  }
}

interface PatchBucket {
  counts: TagCounts
  extent: PatternExtent
  events: ChangeEvent[]
}

interface Bucket {
  name: string
  slug: string
  totals: TagCounts
  byPatch: Map<string, PatchBucket>
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
      let patchBucket = bucket.byPatch.get(patch.id)
      if (!patchBucket) {
        patchBucket = {
          counts: emptyTagCounts(),
          extent: emptyExtent(),
          events: [],
        }
        bucket.byPatch.set(patch.id, patchBucket)
      }
      addTag(patchBucket.counts, event.tag)
      addTag(bucket.totals, event.tag)
      patchBucket.events.push(event)
      if (event.tag === 'buff' || event.tag === 'nerf') {
        const { weight, estimated } = eventExtent(event)
        patchBucket.extent[event.tag] += weight
        if (estimated) patchBucket.extent.estimated = true
      }
    }
  }
  return buckets
}

function compareEntities(
  a: PatternEntity,
  b: PatternEntity,
  sort: PatternSort,
): number {
  if (sort === 'name') {
    const byName = a.name.localeCompare(b.name)
    if (byName !== 0) return byName
    return a.slug.localeCompare(b.slug)
  }
  if (sort === 'recent') {
    const byRecent = b.recentTouches - a.recentTouches
    if (byRecent !== 0) return byRecent
  }
  const byTotal = b.totalTouches - a.totalTouches
  if (byTotal !== 0) return byTotal
  return a.name.localeCompare(b.name)
}

function bandFrom(buffs: readonly number[], nerfs: readonly number[]): PeerBand {
  return {
    medianBuff: quantile(buffs, 0.5),
    p90Buff: quantile(buffs, 0.9),
    medianNerf: quantile(nerfs, 0.5),
    p90Nerf: quantile(nerfs, 0.9),
  }
}

/**
 * Rank each cell against same-kind buff/nerf peers in that column.
 * Heatmap Relative keeps a pooled max(buff, nerf) rank (empties/fix-only
 * excluded). Detail %ile uses separate buff and nerf peer sets.
 */
function attachPeerRanks(
  entities: PatternEntity[],
  columns: PatternPatchColumn[],
): PatternPatchColumn[] {
  return columns.map((column, colIndex) => {
    const peerCells: PatternCell[] = []
    const buffCells: PatternCell[] = []
    const nerfCells: PatternCell[] = []
    for (const entity of entities) {
      const cell = entity.cells[colIndex]
      if (!cell) continue
      if (cell.touchVolume > 0) peerCells.push(cell)
      if (cell.counts.buff > 0) buffCells.push(cell)
      if (cell.counts.nerf > 0) nerfCells.push(cell)
    }
    const n = peerCells.length
    const tooSmall = n < MIN_PEER_SAMPLE
    const extentMags = peerCells.map((cell) =>
      rankMagnitude(cell.extent.buff, cell.extent.nerf),
    )
    const countMags = peerCells.map((cell) =>
      rankMagnitude(cell.counts.buff, cell.counts.nerf),
    )
    const peerExtent = tooSmall
      ? null
      : bandFrom(
          peerCells.map((cell) => cell.extent.buff),
          peerCells.map((cell) => cell.extent.nerf),
        )
    const peerCounts = tooSmall
      ? null
      : bandFrom(
          peerCells.map((cell) => cell.counts.buff),
          peerCells.map((cell) => cell.counts.nerf),
        )
    const buffExtents = buffCells.map((cell) => cell.extent.buff)
    const nerfExtents = nerfCells.map((cell) => cell.extent.nerf)

    for (const entity of entities) {
      const cell = entity.cells[colIndex]
      if (!cell) continue
      if (tooSmall || cell.touchVolume <= 0) {
        cell.extentPercentile = null
        cell.countsPercentile = null
      } else {
        cell.extentPercentile = percentileRank(
          rankMagnitude(cell.extent.buff, cell.extent.nerf),
          extentMags,
        )
        cell.countsPercentile = percentileRank(
          rankMagnitude(cell.counts.buff, cell.counts.nerf),
          countMags,
        )
      }
      cell.buffRank =
        cell.counts.buff > 0
          ? directionRank(cell.extent.buff, buffExtents, 'buff')
          : null
      cell.nerfRank =
        cell.counts.nerf > 0
          ? directionRank(cell.extent.nerf, nerfExtents, 'nerf')
          : null
    }

    return { ...column, peerN: n, peerCounts, peerExtent }
  })
}

/**
 * Rank each non-zero same-sign extent against every same-kind touch of that
 * sign in the ledger (Across patches). Buffs never pool with nerfs; empties
 * and the other direction do not dilute.
 */
function attachAcrossRanks(entities: PatternEntity[]): void {
  const buffs: number[] = []
  const nerfs: number[] = []
  for (const entity of entities) {
    for (const cell of entity.cells) {
      if (cell.counts.buff > 0) buffs.push(cell.extent.buff)
      if (cell.counts.nerf > 0) nerfs.push(cell.extent.nerf)
    }
  }
  for (const entity of entities) {
    for (const cell of entity.cells) {
      cell.acrossBuffRank =
        cell.counts.buff > 0
          ? directionRank(cell.extent.buff, buffs, 'buff')
          : null
      cell.acrossNerfRank =
        cell.counts.nerf > 0
          ? directionRank(cell.extent.nerf, nerfs, 'nerf')
          : null
    }
  }
}

export function buildPatternMatrix(
  patches: readonly Patch[],
  kind: PatternKind,
  options?: { recentWindow?: number; sort?: PatternSort },
): PatternMatrix {
  const chrono = sortPatchesChrono(patches)
  const recentWindow = options?.recentWindow ?? RECENT_PATCH_WINDOW
  const sort = options?.sort ?? DEFAULT_PATTERN_SORT
  const recentIds = new Set(chrono.slice(-recentWindow).map((patch) => patch.id))
  const buckets = collectBuckets(chrono, kind)

  const columns: PatternPatchColumn[] = chrono.map((patch) => ({
    id: patch.id,
    date: patch.date,
    title: patch.title,
    peerN: 0,
    peerCounts: null,
    peerExtent: null,
  }))

  const entities: PatternEntity[] = [...buckets.values()].map((bucket) => {
    const cells = columns.map((column) =>
      cellFromBucket(column.id, bucket.byPatch.get(column.id)),
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

  const rankedColumns = attachPeerRanks(entities, columns)
  attachAcrossRanks(entities)
  entities.sort((a, b) => compareEntities(a, b, sort))

  let maxTouchVolume = 0
  for (const entity of entities) {
    for (const cell of entity.cells) {
      if (cell.touchVolume > maxTouchVolume) maxTouchVolume = cell.touchVolume
    }
  }

  return {
    kind,
    patches: rankedColumns,
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
    sort?: PatternSort
  } = {},
): PatternMatrix {
  const needle = options.query?.trim().toLowerCase() ?? ''
  let entities = needle
    ? matchingPatternEntities(matrix.entities, needle)
    : [...matrix.entities]

  // Alphabetical overview is the full catalog; ranked sorts may top-slice.
  const skipRowClip =
    Boolean(options.allRows) || Boolean(needle) || options.sort === 'name'
  if (!skipRowClip) {
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

export function buildEntityDetail(
  patches: readonly Patch[],
  kind: PatternKind,
  slug: string,
): PatternEntityDetail | undefined {
  const matrix = buildPatternMatrix(patches, kind, { sort: 'name' })
  const entity = matrix.entities.find((row) => row.slug === slug)
  if (!entity) return undefined

  let running = 0
  const series: PatternSeriesPoint[] = entity.cells.map((cell, index) => {
    running += cell.signedNet
    const column = matrix.patches[index]
    return {
      patchId: cell.patchId,
      date: column?.date ?? cell.patchId,
      title: column?.title ?? cell.patchId,
      counts: cell.counts,
      extent: { ...cell.extent },
      signedNet: cell.signedNet,
      signedExtent: signedExtent(cell.extent),
      cumulativeNet: running,
      touched: cell.touched,
      events: cell.events,
      countsPercentile: cell.countsPercentile,
      extentPercentile: cell.extentPercentile,
      buffRank: cell.buffRank,
      nerfRank: cell.nerfRank,
      acrossBuffRank: cell.acrossBuffRank,
      acrossNerfRank: cell.acrossNerfRank,
      peerN: column?.peerN ?? 0,
      peerCounts: column?.peerCounts ?? null,
      peerExtent: column?.peerExtent ?? null,
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

export function cellSummary(
  cell: PatternCell,
  date: string,
  peerN = 0,
  colorMode: HeatmapColorMode = 'absolute',
): string {
  if (!cell.touched) return `${date}: no touch`
  const parts = [`${cell.counts.buff} buff`, `${cell.counts.nerf} nerf`]
  if (cell.counts.fix > 0) parts.push(`${cell.counts.fix} fix`)
  if (cell.counts.neutral > 0) parts.push(`${cell.counts.neutral} other`)
  const net =
    cell.touchVolume > 0 ? `net ${cell.signedNet > 0 ? '+' : ''}${cell.signedNet}` : 'net n/a'
  const line = `${date}: ${parts.join(' · ')} (${net})`
  if (cell.touchVolume <= 0) return line
  if (colorMode === 'relative') {
    return `${line}. ${formatPercentileLabel(cell.extentPercentile, peerN, 'extent')}`
  }
  return line
}
