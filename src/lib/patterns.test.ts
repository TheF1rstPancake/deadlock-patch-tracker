import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChangeEvent, MetricDelta, Patch } from '../types.ts'
import {
  DEFAULT_PATTERN_CHART_MODE,
  DEFAULT_PATTERN_SORT,
  EXTENT_SPIKE_RATIO,
  FALLBACK_EXTENT_WEIGHT,
  MIN_PEER_SAMPLE,
  RECENT_PATCH_WINDOW,
  OVERVIEW_PATCH_COLUMNS,
  OVERVIEW_TOP_ROWS,
  STRUCTURAL_EXTENT_WEIGHT,
  buildEntityDetail,
  buildPatternMatrix,
  cellTone,
  chartBarValues,
  clipOverviewMatrix,
  clippedDisplayMax,
  eventExtent,
  eventsForBar,
  formatHistoryPercentileLabel,
  formatPercentileLabel,
  isStructuralChangeLine,
  matchingPatternEntities,
  percentileForBar,
  percentileOpacity,
  percentileRank,
  quantile,
  rankMagnitude,
  signedExtent,
  signedNet,
  uniqueMatch,
  volumeOpacity,
} from './patterns.ts'
import { MAX_RELATIVE_PERCENT, metricRelativePercent, numericMetricValue } from './metrics.ts'

function event(
  id: string,
  kind: 'hero' | 'item',
  name: string,
  slug: string,
  tag: ChangeEvent['tag'],
  metrics?: MetricDelta[],
): ChangeEvent {
  return {
    id,
    section: kind === 'hero' ? 'Heroes' : 'Items',
    target: { kind, name, slug },
    tag,
    raw: `${name} ${tag}`,
    parse: { confidence: 'high', needsReview: false, source: 'mechanical' },
    ...(metrics ? { metrics } : {}),
  }
}

function patch(
  id: string,
  events: ChangeEvent[],
): Patch {
  return {
    schemaVersion: 2,
    id,
    title: id,
    date: id,
    steamUrl: 'https://example.test',
    gid: id,
    appid: 1422450,
    layout: 'sectioned',
    sectionsPresent: ['Heroes', 'Items'],
    events,
    heroes: [],
  }
}

const fixtures: Patch[] = [
  patch('2026-01-01', [
    event('a:0', 'hero', 'Alpha', 'alpha', 'buff'),
    event('a:1', 'hero', 'Alpha', 'alpha', 'buff'),
    event('a:2', 'item', 'Sword', 'sword', 'nerf'),
  ]),
  patch('2026-02-01', [
    event('b:0', 'hero', 'Alpha', 'alpha', 'buff'),
    event('b:1', 'hero', 'Alpha', 'alpha', 'buff'),
    event('b:2', 'hero', 'Alpha', 'alpha', 'nerf'),
    event('b:3', 'hero', 'Alpha', 'alpha', 'nerf'),
    event('b:4', 'hero', 'Beta', 'beta', 'fix'),
    event('b:5', 'hero', 'Beta', 'beta', 'fix'),
    event('b:6', 'hero', 'Beta', 'beta', 'neutral'),
  ]),
  patch('2026-03-01', [
    event('c:0', 'hero', 'Alpha', 'alpha', 'nerf'),
    event('c:1', 'item', 'Sword', 'sword', 'buff'),
    event('c:2', 'item', 'Sword', 'sword', 'buff'),
    event('c:3', 'item', 'Sword', 'sword', 'buff'),
  ]),
]

describe('pattern cell math', () => {
  it('signed net is buffs minus nerfs and ignores fix/neutral', () => {
    expect(signedNet({ buff: 5, nerf: 5, fix: 9, neutral: 3 })).toBe(0)
    expect(signedNet({ buff: 3, nerf: 1, fix: 4, neutral: 0 })).toBe(2)
    expect(signedNet({ buff: 0, nerf: 2, fix: 1, neutral: 0 })).toBe(-2)
  })

  it('does not paint untouched as a zero-net tone', () => {
    const matrix = buildPatternMatrix(fixtures, 'hero')
    const beta = matrix.entities.find((row) => row.slug === 'beta')
    const jan = beta?.cells.find((cell) => cell.patchId === '2026-01-01')
    expect(jan?.touched).toBe(false)
    expect(jan?.signedNet).toBe(0)
    expect(jan?.touchVolume).toBe(0)
    expect(cellTone(jan!)).toBe('empty')
    expect(volumeOpacity(jan!.touchVolume, matrix.maxTouchVolume)).toBe(0)
  })

  it('keeps +buff/−nerf churn visible when net is zero', () => {
    const matrix = buildPatternMatrix(fixtures, 'hero')
    const alpha = matrix.entities.find((row) => row.slug === 'alpha')
    const feb = alpha?.cells.find((cell) => cell.patchId === '2026-02-01')
    expect(feb?.touched).toBe(true)
    expect(feb?.signedNet).toBe(0)
    expect(feb?.touchVolume).toBe(4)
    expect(cellTone(feb!)).toBe('churn')
    expect(volumeOpacity(feb!.touchVolume, 4)).toBeGreaterThan(0.9)
  })

  it('tones fix-only cells as fix, not empty or net-zero churn', () => {
    const matrix = buildPatternMatrix(fixtures, 'hero')
    const beta = matrix.entities.find((row) => row.slug === 'beta')
    const feb = beta?.cells.find((cell) => cell.patchId === '2026-02-01')
    expect(feb?.touched).toBe(true)
    expect(feb?.touchVolume).toBe(0)
    expect(feb?.signedNet).toBe(0)
    expect(feb?.counts.fix).toBe(2)
    expect(cellTone(feb!)).toBe('fix')
  })
})

describe('buildPatternMatrix', () => {
  it('keeps heroes and items in separate matrices', () => {
    const heroes = buildPatternMatrix(fixtures, 'hero')
    const items = buildPatternMatrix(fixtures, 'item')
    expect(heroes.entities.map((row) => row.slug).sort()).toEqual(['alpha', 'beta'])
    expect(items.entities.map((row) => row.slug)).toEqual(['sword'])
    expect(heroes.patches.map((column) => column.id)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ])
    expect(heroes.recentWindow).toBe(RECENT_PATCH_WINDOW)
  })

  it('defaults to alphabetical and can sort by total or last-N volatility', () => {
    expect(DEFAULT_PATTERN_SORT).toBe('name')
    const extra = [
      ...fixtures,
      patch('2026-04-01', [event('d:0', 'hero', 'Gamma', 'gamma', 'buff')]),
      patch('2026-05-01', [event('e:0', 'hero', 'Gamma', 'gamma', 'buff')]),
    ]
    const byName = buildPatternMatrix(extra, 'hero')
    expect(byName.entities.map((row) => row.slug)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ])

    const byTotal = buildPatternMatrix(extra, 'hero', { sort: 'total' })
    expect(byTotal.entities.map((row) => row.slug)).toEqual([
      'alpha',
      'gamma',
      'beta',
    ])
    expect(byTotal.entities[0]?.totalTouches).toBe(7)

    const byRecent = buildPatternMatrix(extra, 'hero', {
      sort: 'recent',
      recentWindow: 3,
    })
    expect(byRecent.entities.map((row) => row.slug)).toEqual([
      'gamma',
      'alpha',
      'beta',
    ])
    expect(byRecent.entities[0]?.recentTouches).toBe(2)
    expect(byRecent.entities.find((row) => row.slug === 'alpha')?.recentTouches).toBe(
      1,
    )
  })
})

describe('clipOverviewMatrix', () => {
  it('keeps the newest columns and top rows, leaving full history on the source matrix', () => {
    const roster = Array.from({ length: 18 }, (_, i) => `Hero${i}`)
    const extra = Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, '0')
      const id = `2026-${month}-01`
      return patch(
        id,
        roster.map((name, n) =>
          event(`${id}:${n}`, 'hero', name, `hero-${n}`, 'buff'),
        ),
      )
    })
    const full = buildPatternMatrix(extra, 'hero', { sort: 'recent' })
    expect(full.patches).toHaveLength(12)
    expect(full.entities).toHaveLength(18)

    const clipped = clipOverviewMatrix(full)
    expect(clipped.patches.map((column) => column.id)).toEqual(
      full.patches.slice(-OVERVIEW_PATCH_COLUMNS).map((column) => column.id),
    )
    expect(clipped.entities).toHaveLength(OVERVIEW_TOP_ROWS)
    expect(clipped.entities[0]?.cells).toHaveLength(OVERVIEW_PATCH_COLUMNS)
    expect(full.entities[0]?.cells).toHaveLength(12)

    const expanded = clipOverviewMatrix(full, { allPatches: true, allRows: true })
    expect(expanded.patches).toHaveLength(12)
    expect(expanded.entities).toHaveLength(18)

    const alpha = clipOverviewMatrix(full, { sort: 'name' })
    expect(alpha.entities).toHaveLength(18)
    expect(alpha.patches).toHaveLength(OVERVIEW_PATCH_COLUMNS)
  })
})

describe('entity detail series', () => {
  it('builds per-patch buff/nerf counts with cumulative net available but not required', () => {
    const detail = buildEntityDetail(fixtures, 'hero', 'alpha')
    expect(detail?.name).toBe('Alpha')
    expect(detail?.kind).toBe('hero')
    expect(detail?.totals).toEqual({ buff: 4, nerf: 3, fix: 0, neutral: 0 })
    expect(detail?.series.map((point) => point.counts.buff)).toEqual([2, 2, 0])
    expect(detail?.series.map((point) => point.counts.nerf)).toEqual([0, 2, 1])
    expect(detail?.series.map((point) => point.signedNet)).toEqual([2, 0, -1])
    expect(detail?.series.map((point) => point.cumulativeNet)).toEqual([2, 2, 1])
  })

  it('search unique-match prefers an exact name', () => {
    const matrix = buildPatternMatrix(fixtures, 'hero')
    expect(uniqueMatch(matrix.entities, 'alp')?.slug).toBe('alpha')
    expect(uniqueMatch(matrix.entities, 'nope')).toBeUndefined()
    expect(matchingPatternEntities(matrix.entities, 'alp').map((row) => row.slug)).toEqual(
      ['alpha'],
    )
  })
})

describe('metric relative percent', () => {
  it('uses |to−from|/|from|×100 and skips non-ratio values', () => {
    expect(metricRelativePercent({ stat: 'damage', from: 190, to: 200 })).toBeCloseTo(
      (10 / 190) * 100,
    )
    expect(metricRelativePercent({ stat: 'cooldown', from: -11, to: -14 })).toBeCloseTo(
      (3 / 11) * 100,
    )
    expect(metricRelativePercent({ stat: 'value', from: 0, to: 5 })).toBeUndefined()
    expect(metricRelativePercent({ stat: 'value', from: '20->60', to: '30->90' })).toBeUndefined()
    expect(numericMetricValue('20->60')).toBeUndefined()
    expect(numericMetricValue('30+0.75')).toBeUndefined()
    expect(metricRelativePercent({ stat: 'value', from: 0.1, to: 50 })).toBe(MAX_RELATIVE_PERCENT)
  })
})

describe('extent (estimated relative %)', () => {
  it('sums usable metric magnitudes; unmeasured buff/nerf lines get a small fallback', () => {
    const measured = event('m:0', 'hero', 'Alpha', 'alpha', 'buff', [
      { stat: 'damage', from: 100, to: 110 },
    ])
    expect(eventExtent(measured)).toEqual({ weight: 10, estimated: false })

    const twoMetrics = event('m:1', 'hero', 'Alpha', 'alpha', 'nerf', [
      { stat: 'damage', from: 200, to: 180 },
      { stat: 'range', from: 50, to: 40 },
    ])
    expect(eventExtent(twoMetrics).weight).toBeCloseTo(10 + 20)
    expect(eventExtent(twoMetrics).estimated).toBe(false)

    const missing = event('m:2', 'hero', 'Alpha', 'alpha', 'buff')
    expect(eventExtent(missing)).toEqual({
      weight: FALLBACK_EXTENT_WEIGHT,
      estimated: true,
    })

    const unusable = event('m:3', 'hero', 'Alpha', 'alpha', 'nerf', [
      { stat: 'value', from: '12->25', to: '14->30' },
    ])
    expect(eventExtent(unusable)).toEqual({
      weight: FALLBACK_EXTENT_WEIGHT,
      estimated: true,
    })

    const fix = event('m:4', 'hero', 'Alpha', 'alpha', 'fix')
    expect(eventExtent(fix)).toEqual({ weight: 0, estimated: false })
  })

  it('weights structural/qualitative identity lines above the plain fallback', () => {
    expect(STRUCTURAL_EXTENT_WEIGHT).toBeGreaterThan(FALLBACK_EXTENT_WEIGHT)
    expect(isStructuralChangeLine('Riposte no longer automatically dashes')).toBe(
      true,
    )
    expect(isStructuralChangeLine('T3 removed the lingering slow')).toBe(true)
    expect(isStructuralChangeLine('Itani now grants a parry window')).toBe(true)
    expect(isStructuralChangeLine('Flawless Advance hitbox reduced by 10%')).toBe(
      true,
    )
    expect(isStructuralChangeLine('Base regen reduced from 2 to 1')).toBe(false)

    const identity = event('q:0', 'hero', 'Alpha', 'alpha', 'nerf')
    identity.raw = 'Riposte no longer automatically dashes'
    expect(eventExtent(identity)).toEqual({
      weight: STRUCTURAL_EXTENT_WEIGHT,
      estimated: true,
    })

    const hitbox = event('q:1', 'hero', 'Alpha', 'alpha', 'nerf')
    hitbox.raw = 'Flawless Advance hitbox reduced by 10%'
    expect(eventExtent(hitbox).weight).toBe(STRUCTURAL_EXTENT_WEIGHT)

    const numeric = event('q:2', 'hero', 'Alpha', 'alpha', 'nerf', [
      { stat: 'value', from: 2, to: 1 },
    ])
    numeric.raw = 'Base regen reduced from 2 to 1'
    expect(eventExtent(numeric)).toEqual({ weight: 50, estimated: false })
    expect(eventExtent(numeric).weight).toBeGreaterThan(STRUCTURAL_EXTENT_WEIGHT)
  })

  it('plots buff extent positive and nerf extent negative, without inventing win-rate', () => {
    const patches: Patch[] = [
      patch('2026-01-01', [
        event('a:0', 'hero', 'Alpha', 'alpha', 'buff', [
          { stat: 'damage', from: 100, to: 120 },
        ]),
        event('a:1', 'hero', 'Alpha', 'alpha', 'buff'),
      ]),
      patch('2026-02-01', [
        event('b:0', 'hero', 'Alpha', 'alpha', 'nerf', [
          { stat: 'health', from: 50, to: 40 },
        ]),
        event('b:1', 'hero', 'Alpha', 'alpha', 'nerf'),
        event('b:2', 'hero', 'Alpha', 'alpha', 'fix'),
      ]),
      patch('2026-03-01', [
        event('c:0', 'hero', 'Alpha', 'alpha', 'buff', [
          { stat: 'damage', from: 10, to: 11 },
        ]),
        event('c:1', 'hero', 'Alpha', 'alpha', 'nerf', [
          { stat: 'range', from: 100, to: 90 },
        ]),
      ]),
    ]
    const detail = buildEntityDetail(patches, 'hero', 'alpha')
    expect(detail?.series).toHaveLength(3)

    const jan = detail!.series[0]
    expect(jan.extent.buff).toBeCloseTo(20 + FALLBACK_EXTENT_WEIGHT)
    expect(jan.extent.nerf).toBe(0)
    expect(jan.extent.estimated).toBe(true)
    expect(jan.signedExtent).toBeCloseTo(20 + FALLBACK_EXTENT_WEIGHT)
    expect(jan.signedExtent).toBeGreaterThan(0)

    const feb = detail!.series[1]
    expect(feb.extent.buff).toBe(0)
    expect(feb.extent.nerf).toBeCloseTo(20 + FALLBACK_EXTENT_WEIGHT)
    expect(feb.signedExtent).toBeCloseTo(-(20 + FALLBACK_EXTENT_WEIGHT))
    expect(feb.signedExtent).toBeLessThan(0)
    expect(feb.counts.fix).toBe(1)

    const mar = detail!.series[2]
    expect(mar.extent.buff).toBeCloseTo(10)
    expect(mar.extent.nerf).toBeCloseTo(10)
    expect(mar.extent.estimated).toBe(false)
    expect(signedExtent(mar.extent)).toBeCloseTo(0)

    expect(detail?.series.every((point) => !('winRate' in point))).toBe(true)
  })
})

describe('peer percentile (same kind × patch)', () => {
  it('quantile interpolates and percentileRank needs n > 3', () => {
    expect(quantile([], 0.5)).toBe(0)
    expect(quantile([10], 0.9)).toBe(10)
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25)
    expect(MIN_PEER_SAMPLE).toBe(4)
    expect(percentileRank(40, [10, 20, 30])).toBeNull()
    expect(percentileRank(10, [10, 20, 30, 40])).toBe(25)
    expect(percentileRank(40, [10, 20, 30, 40])).toBe(100)
    expect(rankMagnitude(12, 40)).toBe(40)
    expect(rankMagnitude(12, 8)).toBe(12)
    expect(percentileOpacity(null)).toBe(0.4)
    expect(percentileOpacity(100)).toBeGreaterThan(percentileOpacity(0)!)
  })

  it('does not invent a percentile when n≤3 heroes are touched', () => {
    const matrix = buildPatternMatrix(fixtures, 'hero')
    const jan = matrix.patches.find((column) => column.id === '2026-01-01')
    expect(jan?.peerN).toBe(1)
    expect(jan?.peerExtent).toBeNull()
    const alphaJan = matrix.entities
      .find((row) => row.slug === 'alpha')
      ?.cells.find((cell) => cell.patchId === '2026-01-01')
    expect(alphaJan?.extentPercentile).toBeNull()
    expect(formatPercentileLabel(null, 1, 'extent')).toMatch(/n too small/)
  })

  it('ranks heroes against heroes only, using max(buff, nerf) extent', () => {
    const loud = [
      patch('2026-06-01', [
        event('h:a', 'hero', 'Alpha', 'alpha', 'buff', [
          { stat: 'damage', from: 100, to: 140 },
        ]),
        event('h:b', 'hero', 'Beta', 'beta', 'buff', [
          { stat: 'damage', from: 100, to: 110 },
        ]),
        event('h:c', 'hero', 'Gamma', 'gamma', 'buff', [
          { stat: 'damage', from: 100, to: 120 },
        ]),
        event('h:d', 'hero', 'Delta', 'delta', 'nerf', [
          { stat: 'health', from: 100, to: 70 },
        ]),
        event('h:e', 'hero', 'Echo', 'echo', 'fix'),
        event('i:s', 'item', 'Sword', 'sword', 'nerf', [
          { stat: 'damage', from: 100, to: 10 },
        ]),
        event('i:t', 'item', 'Tome', 'tome', 'buff', [
          { stat: 'damage', from: 100, to: 200 },
        ]),
      ]),
    ]
    const heroes = buildPatternMatrix(loud, 'hero')
    const items = buildPatternMatrix(loud, 'item')
    const column = heroes.patches[0]
    expect(column?.peerN).toBe(4)
    expect(column?.peerExtent).not.toBeNull()
    expect(items.patches[0]?.peerN).toBe(2)
    expect(items.patches[0]?.peerExtent).toBeNull()

    const pct = (slug: string) =>
      heroes.entities.find((row) => row.slug === slug)?.cells[0]?.extentPercentile
    // extents: alpha 40, beta 10, gamma 20, delta 30 (echo fix-only, sword/tome excluded)
    expect(pct('beta')).toBe(25)
    expect(pct('gamma')).toBe(50)
    expect(pct('delta')).toBe(75)
    expect(pct('alpha')).toBe(100)
    expect(pct('echo')).toBeNull()

    const detail = buildEntityDetail(loud, 'hero', 'alpha')
    const point = detail!.series[0]
    expect(point.extentPercentile).toBe(100)
    expect(point.peerN).toBe(4)
    expect(point.peerExtent?.p90Buff).toBeGreaterThan(point.peerExtent!.medianBuff)
    expect(point.events.map((ev) => ev.id)).toEqual(['h:a'])
    expect(point.events.some((ev) => ev.target.kind === 'item')).toBe(false)
  })

  it('keeps mixed-patch rank as max(buff, nerf), not |net|', () => {
    const mixed = [
      patch('2026-07-01', [
        event('a:b', 'hero', 'Alpha', 'alpha', 'buff', [
          { stat: 'damage', from: 100, to: 150 },
        ]),
        event('a:n', 'hero', 'Alpha', 'alpha', 'nerf', [
          { stat: 'range', from: 100, to: 50 },
        ]),
        event('b:0', 'hero', 'Beta', 'beta', 'buff', [
          { stat: 'damage', from: 100, to: 105 },
        ]),
        event('c:0', 'hero', 'Gamma', 'gamma', 'buff', [
          { stat: 'damage', from: 100, to: 108 },
        ]),
        event('d:0', 'hero', 'Delta', 'delta', 'buff', [
          { stat: 'damage', from: 100, to: 110 },
        ]),
      ]),
    ]
    const matrix = buildPatternMatrix(mixed, 'hero')
    const alpha = matrix.entities.find((row) => row.slug === 'alpha')?.cells[0]
    expect(signedExtent(alpha!.extent)).toBeCloseTo(0)
    expect(rankMagnitude(alpha!.extent.buff, alpha!.extent.nerf)).toBeCloseTo(50)
    expect(alpha?.extentPercentile).toBe(100)
  })
})

describe('bar event list', () => {
  it('returns the lines in a buff/nerf bar, or the whole patch group', () => {
    const detail = buildEntityDetail(fixtures, 'hero', 'alpha')
    const feb = detail!.series.find((point) => point.patchId === '2026-02-01')
    expect(feb?.events).toHaveLength(4)
    expect(eventsForBar(feb!.events, 'buff').map((ev) => ev.tag)).toEqual([
      'buff',
      'buff',
    ])
    expect(eventsForBar(feb!.events, 'nerf').every((ev) => ev.tag === 'nerf')).toBe(
      true,
    )
    expect(eventsForBar(feb!.events, 'all')).toHaveLength(4)
    expect(formatPercentileLabel(92, 12, 'counts')).toBe(
      'P92 counts vs 12 that patch',
    )
    expect(formatPercentileLabel(80, 12, 'extent')).toBe(
      'P80 of 12 same-kind hits in the ledger',
    )
    expect(formatPercentileLabel(92, 12, 'peers')).toMatch(/P92 vs 12 that patch only/)
    expect(formatHistoryPercentileLabel(82, 40, 'nerf')).toBe(
      'P82 of 40 nerfs in the ledger',
    )
    expect(DEFAULT_PATTERN_CHART_MODE).toBe('extent')
  })
})

describe('clipped extent display scale', () => {
  it('does not clip a compact series', () => {
    expect(clippedDisplayMax([10, 20, 30, 50, 70])).toEqual({
      max: 70,
      clipped: false,
    })
    expect(clippedDisplayMax([])).toEqual({ max: 1, clipped: false })
  })

  it('clips a single stacked-% spike so the rest of history stays readable', () => {
    const scale = clippedDisplayMax([10, 20, 30, 50, 70, 400])
    expect(scale.clipped).toBe(true)
    expect(scale.max).toBe(70)
    expect(400).toBeGreaterThan(scale.max * EXTENT_SPIKE_RATIO)
    // 5/22-sized bar (~70) should occupy most of the clipped axis, not a sliver.
    expect(70 / scale.max).toBeGreaterThan(0.9)
  })
})

describe('vs Peers (within-patch rank) bars', () => {
  it('plots nerf percentile near the top for a #3-of-patch identity hit, ignoring a later stacked-% spike', () => {
    const loud = [
      patch('2026-03-06', [
        event('spike', 'hero', 'Alpha', 'alpha', 'buff', [
          { stat: 'damage', from: 10, to: 50 },
          { stat: 'range', from: 10, to: 50 },
        ]),
        event('s:b', 'hero', 'Beta', 'beta', 'buff', [
          { stat: 'damage', from: 100, to: 110 },
        ]),
        event('s:c', 'hero', 'Gamma', 'gamma', 'buff', [
          { stat: 'damage', from: 100, to: 108 },
        ]),
        event('s:d', 'hero', 'Delta', 'delta', 'nerf', [
          { stat: 'health', from: 100, to: 90 },
        ]),
      ]),
      patch('2026-05-22', [
        event('a:regen', 'hero', 'Alpha', 'alpha', 'nerf', [
          { stat: 'value', from: 2, to: 1 },
        ]),
        (() => {
          const line = event('a:rip', 'hero', 'Alpha', 'alpha', 'nerf')
          line.raw = 'Riposte no longer automatically dashes'
          return line
        })(),
        (() => {
          const line = event('a:aura', 'hero', 'Alpha', 'alpha', 'nerf')
          line.raw = 'Riposte no longer triggers on damage auras'
          return line
        })(),
        (() => {
          const line = event('a:obj', 'hero', 'Alpha', 'alpha', 'nerf')
          line.raw = 'Riposte no longer triggers off of objective damage'
          return line
        })(),
        (() => {
          const line = event('a:hit', 'hero', 'Alpha', 'alpha', 'nerf')
          line.raw = 'Flawless Advance hitbox reduced by 10%'
          return line
        })(),
        event('b:0', 'hero', 'Beta', 'beta', 'nerf', [
          { stat: 'health', from: 100, to: 40 },
        ]),
        event('c:0', 'hero', 'Gamma', 'gamma', 'nerf', [
          { stat: 'health', from: 100, to: 50 },
        ]),
        event('d:0', 'hero', 'Delta', 'delta', 'nerf', [
          { stat: 'health', from: 100, to: 95 },
        ]),
        event('e:0', 'hero', 'Echo', 'echo', 'buff', [
          { stat: 'damage', from: 100, to: 105 },
        ]),
      ]),
    ]
    const detail = buildEntityDetail(loud, 'hero', 'alpha')
    const may = detail!.series.find((point) => point.patchId === '2026-05-22')
    const mar = detail!.series.find((point) => point.patchId === '2026-03-06')
    expect(may?.counts.nerf).toBe(5)
    expect(may?.extent.nerf).toBeCloseTo(50 + 4 * STRUCTURAL_EXTENT_WEIGHT)
    expect(may?.peerN).toBeGreaterThanOrEqual(MIN_PEER_SAMPLE)
    expect(may?.extentNerfPercentile).toBeGreaterThanOrEqual(75)
    expect(may?.extentBuffPercentile).toBeNull()

    const peerBars = chartBarValues(may!, 'peers')
    expect(peerBars.down).toBe(may!.extentNerfPercentile)
    expect(peerBars.down).toBeGreaterThanOrEqual(75)
    expect(peerBars.up).toBe(0)

    const extentBars = chartBarValues(may!, 'extent')
    expect(extentBars.down).toBeCloseTo(may!.extent.nerf)
    const scale = clippedDisplayMax([
      mar!.extent.buff,
      mar!.extent.nerf,
      may!.extent.buff,
      may!.extent.nerf,
    ])
    expect(scale.clipped).toBe(true)
    expect(may!.extent.nerf / scale.max).toBeGreaterThan(0.9)

    expect(percentileForBar(may!, 'peers', 'nerf')).toBe(may!.extentNerfPercentile)
    expect(percentileForBar(may!, 'peers', 'buff')).toBeNull()
    expect(percentileForBar(may!, 'extent', 'nerf')).toBe(may!.historyNerfPercentile)
    expect(may!.historyNerfPercentile).toBeGreaterThanOrEqual(75)
    expect(chartBarValues(may!, 'extent').down).toBeCloseTo(may!.extent.nerf)
  })

  it('does not invent a vs-Peers rank when n≤3', () => {
    const tiny = [
      patch('2026-05-22', [
        event('a:0', 'hero', 'Alpha', 'alpha', 'nerf', [
          { stat: 'value', from: 2, to: 1 },
        ]),
        event('b:0', 'hero', 'Beta', 'beta', 'nerf', [
          { stat: 'health', from: 100, to: 90 },
        ]),
      ]),
    ]
    const detail = buildEntityDetail(tiny, 'hero', 'alpha')
    const point = detail!.series[0]
    expect(point.peerN).toBe(2)
    expect(point.extentNerfPercentile).toBeNull()
    expect(chartBarValues(point, 'peers')).toEqual({ up: 0, down: 0 })
    expect(formatPercentileLabel(null, 2, 'peers')).toMatch(/n too small/)
  })
})

describe('Apollo ledger (how-hard chart)', () => {
  it('keeps 2026-05-22 loud on Across patches and correctly ranked on That day', () => {
    const dir = join(process.cwd(), 'data/patches')
    const patches = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Patch)
    const detail = buildEntityDetail(patches, 'hero', 'apollo')
    expect(detail).toBeDefined()
    const may = detail!.series.find((point) => point.patchId === '2026-05-22')
    const mar = detail!.series.find((point) => point.patchId === '2026-03-06')
    expect(may?.counts.nerf).toBe(5)
    expect(may?.peerN).toBeGreaterThanOrEqual(MIN_PEER_SAMPLE)

    // That day: within-patch rank among heroes touched 5/22 only.
    expect(may?.extentNerfPercentile).toBeGreaterThanOrEqual(75)
    expect(chartBarValues(may!, 'peers').down).toBeGreaterThanOrEqual(75)

    // Across patches: absolute % stays comparable; clipped Y must not crush 5/22.
    const heights = detail!.series.flatMap((point) => [
      point.extent.buff,
      point.extent.nerf,
    ])
    const scale = clippedDisplayMax(heights)
    expect(chartBarValues(may!, 'extent').down).toBeCloseTo(may!.extent.nerf)
    expect(may!.extent.nerf / scale.max).toBeGreaterThan(0.25)
    if (mar && Math.max(mar.extent.buff, mar.extent.nerf) > may!.extent.nerf * 2) {
      expect(scale.clipped).toBe(true)
    }
    expect(may!.historyNerfPercentile).not.toBeNull()
    expect(may!.historyNerfN).toBeGreaterThanOrEqual(MIN_PEER_SAMPLE)
  })
})
