import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChangeEvent, MetricDelta, Patch } from '../types.ts'
import {
  DEFAULT_PATTERN_SORT,
  FALLBACK_EXTENT_WEIGHT,
  MIN_PEER_SAMPLE,
  MIN_PERCENTILE_SAMPLE,
  RECENT_PATCH_WINDOW,
  OVERVIEW_PATCH_COLUMNS,
  OVERVIEW_TOP_ROWS,
  STRUCTURAL_EXTENT_WEIGHT,
  CUMULATIVE_COUNTS_LEGEND,
  CUMULATIVE_EXTENT_LEGEND,
  LEFT_AXIS_COUNTS,
  LEFT_AXIS_PERCENTILE,
  RIGHT_AXIS_COUNTS_NET,
  RIGHT_AXIS_EXTENT,
  buildCareerRows,
  buildEntityDetail,
  buildPatternMatrix,
  careerNet,
  cellTone,
  chartEncodingLegend,
  chartLeftAxisTitle,
  chartRightAxisTitle,
  chartUsesDualAxis,
  compareCareerRows,
  cumulativeBasisLabel,
  cumulativeLineCopy,
  defaultCumulativeBasis,
  clipOverviewMatrix,
  directionRank,
  eventExtent,
  eventsForBar,
  formatDirectionLabel,
  formatPercentileLabel,
  formatRankMark,
  formatSignedValue,
  hardestHitsFromSeries,
  isStructuralChangeLine,
  matchingPatternEntities,
  percentileOpacity,
  percentileRank,
  quantile,
  rankMagnitude,
  runningSignedPercentile,
  seriesCumulativeValues,
  signedExtent,
  signedNet,
  signedPercentileDelta,
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
  it('builds per-patch buff/nerf counts with both cumulative bases available but not required', () => {
    const detail = buildEntityDetail(fixtures, 'hero', 'alpha')
    expect(detail?.name).toBe('Alpha')
    expect(detail?.kind).toBe('hero')
    expect(detail?.totals).toEqual({ buff: 4, nerf: 3, fix: 0, neutral: 0 })
    expect(detail?.series.map((point) => point.counts.buff)).toEqual([2, 2, 0])
    expect(detail?.series.map((point) => point.counts.nerf)).toEqual([0, 2, 1])
    expect(detail?.series.map((point) => point.signedNet)).toEqual([2, 0, -1])
    expect(detail?.series.map((point) => point.cumulativeNet)).toEqual([2, 2, 1])
    // Unmeasured lines use FALLBACK_EXTENT_WEIGHT (5): +10, 0, −5
    expect(detail?.series.map((point) => point.signedExtent)).toEqual([10, 0, -5])
    expect(detail?.series.map((point) => point.cumulativeExtent)).toEqual([10, 10, 5])
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

    expect(detail?.series.map((point) => point.cumulativeExtent)).toEqual([
      jan.signedExtent,
      jan.signedExtent + feb.signedExtent,
      jan.signedExtent + feb.signedExtent + mar.signedExtent,
    ])

    expect(detail?.series.every((point) => !('winRate' in point))).toBe(true)
  })
})

describe('dual cumulative labels and career net', () => {
  it('labels the active cumulative basis and formats signed values', () => {
    expect(defaultCumulativeBasis('counts')).toBe('counts')
    expect(defaultCumulativeBasis('percentile')).toBe('extent')
    expect(cumulativeBasisLabel('counts')).toBe('Cumulative: counts')
    expect(cumulativeBasisLabel('extent')).toBe('Cumulative: approx extent')
    expect(cumulativeLineCopy('extent')).toBe(CUMULATIVE_EXTENT_LEGEND)
    expect(cumulativeLineCopy('counts')).toBe(CUMULATIVE_COUNTS_LEGEND)
    expect(formatSignedValue(12, 'counts')).toBe('+12')
    expect(formatSignedValue(-4, 'counts')).toBe('−4')
    expect(formatSignedValue(0, 'counts')).toBe('0')
    expect(formatSignedValue(12.4, 'extent')).toBe('+12%')
    expect(formatSignedValue(-4.5, 'extent')).toBe('−4.5%')
    expect(formatSignedValue(0, 'extent')).toBe('0%')
  })

  it('stacks lifetime counts and extent nets and sorts most buffed or nerfed', () => {
    const heroes = buildPatternMatrix(fixtures, 'hero')
    const items = buildPatternMatrix(fixtures, 'item')
    const heroRows = buildCareerRows(heroes, { basis: 'counts', sort: 'buffed' })
    expect(heroRows.map((row) => row.slug)).toEqual(['alpha', 'beta'])
    expect(heroRows[0]?.countsNet).toBe(1)
    expect(heroRows[0]?.extentNet).toBe(5)
    expect(heroRows[1]?.countsNet).toBe(0)
    expect(careerNet(heroRows[0]!, 'counts')).toBe(1)
    expect(careerNet(heroRows[0]!, 'extent')).toBe(5)

    const nerfed = buildCareerRows(heroes, { basis: 'counts', sort: 'nerfed' })
    expect(nerfed.map((row) => row.slug)).toEqual(['beta', 'alpha'])

    const alpha = buildCareerRows(heroes, { basis: 'extent', sort: 'name' })
    expect(alpha.map((row) => row.slug)).toEqual(['alpha', 'beta'])
    expect(compareCareerRows(heroRows[0]!, heroRows[1]!, 'extent', 'buffed')).toBeLessThan(0)

    const itemRows = buildCareerRows(items, { basis: 'counts', sort: 'buffed' })
    expect(itemRows).toHaveLength(1)
    expect(itemRows[0]?.slug).toBe('sword')
    expect(itemRows[0]?.countsNet).toBe(2)
    expect(itemRows.some((row) => row.kind === 'hero')).toBe(false)
  })

  it('keeps item career nets on the item matrix only', () => {
    const items = buildPatternMatrix(fixtures, 'item')
    const detail = buildEntityDetail(fixtures, 'item', 'sword')
    expect(detail?.series.map((point) => point.signedNet)).toEqual([-1, 0, 3])
    expect(detail?.series.map((point) => point.cumulativeNet)).toEqual([-1, -1, 2])
    expect(detail?.series.map((point) => point.cumulativeExtent)).toEqual([-5, -5, 10])
    const rows = buildCareerRows(items)
    expect(rows[0]?.countsNet).toBe(2)
    expect(rows[0]?.extentNet).toBe(10)
  })
})

describe('detail chart axis titles and encodings', () => {
  it('names percentile bars vs extent cumulative without calling the gold line a percentile', () => {
    expect(chartLeftAxisTitle('percentile')).toBe(LEFT_AXIS_PERCENTILE)
    expect(chartLeftAxisTitle('percentile')).toMatch(/percentile/i)
    expect(chartLeftAxisTitle('counts')).toBe(LEFT_AXIS_COUNTS)
    expect(chartRightAxisTitle('extent')).toBe(RIGHT_AXIS_EXTENT)
    expect(chartRightAxisTitle('extent')).toMatch(/extent/i)
    expect(chartRightAxisTitle('extent')).toMatch(/%/)
    expect(chartRightAxisTitle('extent')).not.toMatch(/percentile/i)
    expect(chartRightAxisTitle('extent').trim()).not.toBe('%')
    expect(chartRightAxisTitle('counts')).toBe(RIGHT_AXIS_COUNTS_NET)
    expect(chartUsesDualAxis('percentile', true, 'extent')).toBe(true)
    expect(chartUsesDualAxis('percentile', true, 'counts')).toBe(true)
    expect(chartUsesDualAxis('counts', true, 'extent')).toBe(true)
    expect(chartUsesDualAxis('counts', true, 'counts')).toBe(false)
    expect(chartUsesDualAxis('percentile', false, 'extent')).toBe(false)

    const heroLegend = chartEncodingLegend(
      'percentile',
      'hero',
      'across',
      true,
      'extent',
    )
    expect(heroLegend).toMatch(/bars: percentile/i)
    expect(heroLegend).toMatch(/cumulative approx extent \(%\)/i)
    expect(heroLegend).not.toMatch(/gold line:.*percentile/i)

    const itemLegend = chartEncodingLegend(
      'percentile',
      'item',
      'day',
      true,
      'extent',
    )
    expect(itemLegend).toMatch(/bars: percentile/i)
    expect(itemLegend).toMatch(/cumulative approx extent \(%\)/i)

    expect(
      chartEncodingLegend('counts', 'hero', 'across', true, 'counts'),
    ).toMatch(/cumulative counts net/i)
  })
})

describe('signed percentile vs extent (not the default gold line)', () => {
  it('can sum signed percentile (buff Px − nerf Px) per lens, distinct from extent', () => {
    const patches = [
      patch('2026-01-01', [
        pctEvent('a0', 'Alpha', 'alpha', 'buff', 50),
        pctEvent('b0', 'Beta', 'beta', 'buff', 40),
        pctEvent('c0', 'Gamma', 'gamma', 'buff', 30),
        pctEvent('d0', 'Delta', 'delta', 'nerf', 80),
      ]),
      patch('2026-02-01', [
        pctEvent('a1', 'Alpha', 'alpha', 'buff', 10),
        pctEvent('b1', 'Beta', 'beta', 'buff', 20),
        pctEvent('e1', 'Echo', 'echo', 'buff', 5),
        event('f1', 'hero', 'Fixer', 'fixer', 'fix'),
      ]),
    ]
    const detail = buildEntityDetail(patches, 'hero', 'alpha')
    const jan = detail!.series[0]!
    const feb = detail!.series[1]!
    expect(signedPercentileDelta(jan, 'across')).toBe(100)
    expect(signedPercentileDelta(feb, 'across')).toBe(33)
    expect(runningSignedPercentile(detail!.series, 'across')).toEqual([100, 133])
    expect(seriesCumulativeValues(detail!.series, 'counts')).toEqual(
      detail!.series.map((point) => point.cumulativeNet),
    )
    expect(seriesCumulativeValues(detail!.series, 'extent')).toEqual(
      detail!.series.map((point) => point.cumulativeExtent),
    )
    expect(runningSignedPercentile(detail!.series, 'across')).not.toEqual(
      detail!.series.map((point) => point.cumulativeExtent),
    )
  })

  it('keeps item extent cumulative on the item series', () => {
    const patches = [
      patch('2026-01-01', [
        event('s0', 'item', 'Sword', 'sword', 'buff', [
          { stat: 'damage', from: 100, to: 150 },
        ]),
        event('s1', 'item', 'Sword', 'sword', 'nerf', [
          { stat: 'damage', from: 100, to: 60 },
        ]),
        event('t0', 'item', 'Tome', 'tome', 'buff', [
          { stat: 'damage', from: 100, to: 140 },
        ]),
        event('u0', 'item', 'Urn', 'urn', 'nerf', [
          { stat: 'damage', from: 100, to: 50 },
        ]),
      ]),
    ]
    const detail = buildEntityDetail(patches, 'item', 'sword')
    const point = detail!.series[0]!
    expect(signedPercentileDelta(point, 'across')).toBe(
      (point.acrossBuffRank?.percentile ?? 0) - (point.acrossNerfRank?.percentile ?? 0),
    )
    expect(seriesCumulativeValues(detail!.series, 'extent')[0]).toBe(point.cumulativeExtent)
    expect(seriesCumulativeValues(detail!.series, 'counts')[0]).toBe(point.cumulativeNet)
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
    // Detail %ile uses the buff-only peer set (delta is nerf-only → n=3, small-N).
    expect(point.buffRank?.peerN).toBe(3)
    expect(point.buffRank?.smallN).toBe(true)
    expect(point.buffRank?.rank).toBe(1)
    expect(formatRankMark(point.buffRank!)).toBe('1 of 3')
    expect(point.nerfRank).toBeNull()
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
      'P80 extent vs 12 that patch',
    )
  })
})

function pctEvent(
  id: string,
  name: string,
  slug: string,
  tag: 'buff' | 'nerf',
  pct: number,
): ChangeEvent {
  const to = tag === 'buff' ? 100 + pct : 100 - pct
  return event(id, 'hero', name, slug, tag, [{ stat: 'damage', from: 100, to }])
}

describe('that-day directional percentile (detail chart)', () => {
  it('does not invent a fine percentile when n<5; shows rank fraction instead', () => {
    expect(MIN_PERCENTILE_SAMPLE).toBe(5)
    const four = [10, 20, 30, 40]
    const mid = directionRank(30, four, 'nerf')
    expect(mid.smallN).toBe(true)
    expect(mid.peerN).toBe(4)
    expect(mid.percentile).toBe(75)
    expect(mid.rank).toBe(2)
    expect(formatRankMark(mid)).toBe('2 of 4')
    expect(formatDirectionLabel(mid)).toBe('2 of 4 nerf')
    expect(directionRank(40, four, 'nerf').rank).toBe(1)
    expect(percentileRank(30, four)).toBe(75)
  })

  it('ranks buffs among buffs and nerfs among nerfs, never pooling directions or kinds', () => {
    const day = patch('2026-06-01', [
      pctEvent('h:a', 'Alpha', 'alpha', 'buff', 50),
      pctEvent('h:b', 'Bravo', 'bravo', 'buff', 40),
      pctEvent('h:c', 'Charlie', 'charlie', 'buff', 30),
      pctEvent('h:d', 'Delta', 'delta', 'buff', 20),
      pctEvent('h:e', 'Echo', 'echo', 'buff', 10),
      pctEvent('h:e-n', 'Echo', 'echo', 'nerf', 15),
      pctEvent('h:f', 'Foxtrot', 'foxtrot', 'nerf', 80),
      pctEvent('h:g', 'Golf', 'golf', 'nerf', 35),
      pctEvent('h:h', 'Hotel', 'hotel', 'nerf', 25),
      pctEvent('h:i', 'India', 'india', 'nerf', 5),
      event('h:j', 'hero', 'Juliet', 'juliet', 'fix'),
      event('i:s', 'item', 'Sword', 'sword', 'nerf', [
        { stat: 'damage', from: 100, to: 10 },
      ]),
    ])
    const heroes = buildPatternMatrix([day], 'hero')
    const rankOf = (slug: string) => heroes.entities.find((row) => row.slug === slug)?.cells[0]

    const alpha = rankOf('alpha')
    expect(alpha?.buffRank).toMatchObject({
      side: 'buff',
      peerN: 5,
      percentile: 100,
      rank: 1,
      smallN: false,
    })
    expect(alpha?.nerfRank).toBeNull()
    expect(formatRankMark(alpha!.buffRank!)).toBe('P100')

    const echo = rankOf('echo')
    expect(echo?.buffRank).toMatchObject({ peerN: 5, percentile: 20, rank: 5, smallN: false })
    expect(echo?.nerfRank).toMatchObject({ peerN: 5, percentile: 40, rank: 4, smallN: false })

    const foxtrot = rankOf('foxtrot')
    expect(foxtrot?.buffRank).toBeNull()
    expect(foxtrot?.nerfRank).toMatchObject({
      peerN: 5,
      percentile: 100,
      rank: 1,
      smallN: false,
    })

    expect(rankOf('juliet')?.buffRank).toBeNull()
    expect(rankOf('juliet')?.nerfRank).toBeNull()
    expect(rankOf('juliet')?.extentPercentile).toBeNull()

    const items = buildPatternMatrix([day], 'item')
    expect(items.entities.find((row) => row.slug === 'sword')?.cells[0]?.nerfRank?.peerN).toBe(
      1,
    )
    expect(
      items.entities.find((row) => row.slug === 'sword')?.cells[0]?.nerfRank?.smallN,
    ).toBe(true)
  })

  it('does not let empties or the other direction dilute a peer set', () => {
    const day = patch('2026-08-01', [
      pctEvent('a', 'Alpha', 'alpha', 'nerf', 40),
      pctEvent('b', 'Beta', 'beta', 'nerf', 30),
      pctEvent('c', 'Gamma', 'gamma', 'nerf', 20),
      pctEvent('d', 'Delta', 'delta', 'nerf', 10),
      pctEvent('e', 'Echo', 'echo', 'buff', 90),
      event('f', 'hero', 'Fixer', 'fixer', 'fix'),
    ])
    const matrix = buildPatternMatrix([day], 'hero')
    const alpha = matrix.entities.find((row) => row.slug === 'alpha')?.cells[0]
    expect(alpha?.nerfRank?.peerN).toBe(4)
    expect(alpha?.nerfRank?.smallN).toBe(true)
    expect(formatRankMark(alpha!.nerfRank!)).toBe('1 of 4')
    expect(alpha?.buffRank).toBeNull()
    const echo = matrix.entities.find((row) => row.slug === 'echo')?.cells[0]
    expect(echo?.buffRank?.peerN).toBe(1)
    expect(echo?.nerfRank).toBeNull()
  })

  it('lists the loudest that-day sides under the chart, Px or rank fraction', () => {
    const patches = [
      patch('2026-01-01', [
        pctEvent('a0', 'Alpha', 'alpha', 'nerf', 50),
        pctEvent('b0', 'Beta', 'beta', 'nerf', 10),
        pctEvent('c0', 'Gamma', 'gamma', 'nerf', 8),
        pctEvent('d0', 'Delta', 'delta', 'nerf', 6),
        pctEvent('e0', 'Echo', 'echo', 'nerf', 4),
      ]),
      patch('2026-02-01', [
        pctEvent('a1', 'Alpha', 'alpha', 'buff', 12),
        pctEvent('b1', 'Beta', 'beta', 'buff', 40),
        pctEvent('c1', 'Gamma', 'gamma', 'buff', 30),
        pctEvent('d1', 'Delta', 'delta', 'buff', 20),
        pctEvent('e1', 'Echo', 'echo', 'buff', 10),
      ]),
      patch('2026-03-01', [
        pctEvent('a2', 'Alpha', 'alpha', 'nerf', 9),
        pctEvent('b2', 'Beta', 'beta', 'nerf', 8),
      ]),
    ]
    const detail = buildEntityDetail(patches, 'hero', 'alpha')
    const hits = hardestHitsFromSeries(detail!.series, 'day')
    expect(hits[0]).toMatchObject({
      patchId: '2026-01-01',
      side: 'nerf',
    })
    expect(formatRankMark(hits[0]!.rank)).toBe('P100')
    expect(hits.some((hit) => hit.patchId === '2026-02-01' && hit.side === 'buff')).toBe(
      true,
    )
    const small = hits.find((hit) => hit.patchId === '2026-03-01')
    expect(small).toBeDefined()
    expect(formatRankMark(small!.rank)).toBe('1 of 2')
    expect(hits).toHaveLength(3)
    expect(hits[2]?.patchId).toBe('2026-03-01')
  })

  it('does not let a small-N 1-of-N outrank a high percentile among a real peer set', () => {
    const patches = [
      patch('2026-05-22', [
        pctEvent('a0', 'Alpha', 'alpha', 'nerf', 40),
        pctEvent('b0', 'Beta', 'beta', 'nerf', 30),
        pctEvent('c0', 'Gamma', 'gamma', 'nerf', 20),
        pctEvent('d0', 'Delta', 'delta', 'nerf', 10),
        pctEvent('e0', 'Echo', 'echo', 'nerf', 8),
      ]),
      patch('2026-05-31', [
        pctEvent('a1', 'Alpha', 'alpha', 'buff', 12),
        pctEvent('b1', 'Beta', 'beta', 'buff', 8),
      ]),
    ]
    const detail = buildEntityDetail(patches, 'hero', 'alpha')
    const hits = hardestHitsFromSeries(detail!.series, 'day')
    expect(formatRankMark(hits[0]!.rank)).toBe('P100')
    expect(hits[0]?.patchId).toBe('2026-05-22')
    expect(formatRankMark(hits[1]!.rank)).toBe('1 of 2')
    expect(hits[1]?.patchId).toBe('2026-05-31')
  })
})

describe('across-patches directional percentile', () => {
  it('ranks this patch’s buff among every same-kind buff touch in the ledger', () => {
    const patches = [
      patch('2026-01-01', [
        pctEvent('a0', 'Alpha', 'alpha', 'buff', 50),
        pctEvent('b0', 'Beta', 'beta', 'buff', 40),
        pctEvent('c0', 'Gamma', 'gamma', 'buff', 30),
        pctEvent('d0', 'Delta', 'delta', 'nerf', 80),
      ]),
      patch('2026-02-01', [
        pctEvent('a1', 'Alpha', 'alpha', 'buff', 10),
        pctEvent('b1', 'Beta', 'beta', 'buff', 20),
        pctEvent('e1', 'Echo', 'echo', 'buff', 5),
        event('f1', 'hero', 'Fixer', 'fixer', 'fix'),
      ]),
    ]
    const detail = buildEntityDetail(patches, 'hero', 'alpha')
    const jan = detail!.series[0]
    const feb = detail!.series[1]
    // Buff touches: 50, 40, 30, 10, 20, 5 → n=6 (nerfs/fixes excluded)
    expect(jan.acrossBuffRank).toMatchObject({
      peerN: 6,
      percentile: 100,
      rank: 1,
      smallN: false,
    })
    expect(jan.acrossNerfRank).toBeNull()
    expect(jan.buffRank?.peerN).toBe(3)
    expect(feb.acrossBuffRank).toMatchObject({ peerN: 6, percentile: 33, smallN: false })
    expect(feb.buffRank?.peerN).toBe(3)

    const acrossHits = hardestHitsFromSeries(detail!.series, 'across')
    const dayHits = hardestHitsFromSeries(detail!.series, 'day')
    expect(acrossHits[0]?.patchId).toBe('2026-01-01')
    expect(formatRankMark(acrossHits[0]!.rank)).toBe('P100')
    expect(dayHits[0]?.rank.smallN).toBe(true)
  })

  it('does not mix items into hero across-ledger ranks', () => {
    const patches = [
      patch('2026-01-01', [
        pctEvent('a', 'Alpha', 'alpha', 'nerf', 20),
        event('s', 'item', 'Sword', 'sword', 'nerf', [
          { stat: 'damage', from: 100, to: 10 },
        ]),
      ]),
    ]
    const heroes = buildEntityDetail(patches, 'hero', 'alpha')
    expect(heroes!.series[0]?.acrossNerfRank?.peerN).toBe(1)
    const items = buildEntityDetail(patches, 'item', 'sword')
    expect(items!.series[0]?.acrossNerfRank?.peerN).toBe(1)
  })
})

describe('Viscous 3/6 rework spike (career copy)', () => {
  it('lets 2026-03-06 dominate Viscous extent more than counts', () => {
    const dir = join(process.cwd(), 'data/patches')
    const patches = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Patch)
    const detail = buildEntityDetail(patches, 'hero', 'viscous')
    expect(detail).toBeDefined()
    const mar = detail!.series.find((point) => point.patchId === '2026-03-06')
    expect(mar).toBeDefined()
    expect(Math.abs(mar!.signedExtent)).toBeGreaterThan(Math.abs(mar!.signedNet) * 3)
    const last = detail!.series[detail!.series.length - 1]
    expect(Math.abs(last!.cumulativeExtent)).toBeGreaterThan(Math.abs(last!.cumulativeNet))
    const matrix = buildPatternMatrix(patches, 'hero')
    const rows = buildCareerRows(matrix, { basis: 'extent', sort: 'buffed' })
    const viscous = rows.find((row) => row.slug === 'viscous')
    expect(viscous).toBeDefined()
    expect(Math.abs(viscous!.extentNet)).toBeGreaterThan(Math.abs(viscous!.countsNet))
  })
})

describe('Abrams 3/6 percentile vs extent (ledger)', () => {
  it('lets 2026-03-06 jump on extent while Across bars stay near-even', () => {
    const dir = join(process.cwd(), 'data/patches')
    const patches = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Patch)
    const detail = buildEntityDetail(patches, 'hero', 'abrams')
    expect(detail).toBeDefined()
    const idx = detail!.series.findIndex((point) => point.patchId === '2026-03-06')
    expect(idx).toBeGreaterThanOrEqual(0)
    const mar = detail!.series[idx]!
    const delta = signedPercentileDelta(mar, 'across')
    expect(mar.acrossBuffRank?.percentile).toBeGreaterThanOrEqual(90)
    expect(mar.acrossNerfRank?.percentile).toBeGreaterThanOrEqual(90)
    expect(Math.abs(delta)).toBeLessThan(20)
    expect(Math.abs(mar.signedExtent)).toBeGreaterThan(80)
    const running = seriesCumulativeValues(detail!.series, 'extent')
    const prev = idx > 0 ? running[idx - 1]! : 0
    expect(running[idx]! - prev).toBeCloseTo(mar.signedExtent)
    expect(Math.abs(running[idx]! - prev)).toBeGreaterThan(80)
    expect(
      Math.abs(
        mar.cumulativeExtent -
          (idx > 0 ? detail!.series[idx - 1]!.cumulativeExtent : 0),
      ),
    ).toBeGreaterThan(80)
  })
})

describe('Apollo ledger (percentile lenses)', () => {
  it('keeps 2026-05-22 loud on That day and ranked on Across patches', () => {
    const dir = join(process.cwd(), 'data/patches')
    const patches = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Patch)
    const detail = buildEntityDetail(patches, 'hero', 'apollo')
    expect(detail).toBeDefined()
    const may = detail!.series.find((point) => point.patchId === '2026-05-22')
    expect(may?.counts.nerf).toBe(5)
    expect(may?.nerfRank?.smallN).toBe(false)
    expect(may?.nerfRank?.percentile).toBeGreaterThanOrEqual(75)
    expect(may?.acrossNerfRank?.smallN).toBe(false)
    expect(may?.acrossNerfRank?.percentile).toBeGreaterThanOrEqual(50)
    expect(may?.buffRank).toBeNull()
    expect(may?.acrossBuffRank).toBeNull()

    const dayHits = hardestHitsFromSeries(detail!.series, 'day')
    expect(dayHits.some((hit) => hit.patchId === '2026-05-22' && hit.side === 'nerf')).toBe(
      true,
    )
    const acrossHits = hardestHitsFromSeries(detail!.series, 'across')
    expect(acrossHits.length).toBeGreaterThan(0)
    expect(acrossHits[0]?.rank.smallN).toBe(false)
  })
})

