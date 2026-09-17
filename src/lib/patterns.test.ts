import { describe, expect, it } from 'vitest'
import type { ChangeEvent, Patch } from '../types.ts'
import {
  RECENT_PATCH_WINDOW,
  buildEntityDetail,
  buildPatternMatrix,
  cellTone,
  matchingPatternEntities,
  signedNet,
  uniqueMatch,
  volumeOpacity,
} from './patterns.ts'

function event(
  id: string,
  kind: 'hero' | 'item',
  name: string,
  slug: string,
  tag: ChangeEvent['tag'],
): ChangeEvent {
  return {
    id,
    section: kind === 'hero' ? 'Heroes' : 'Items',
    target: { kind, name, slug },
    tag,
    raw: `${name} ${tag}`,
    parse: { confidence: 'high', needsReview: false, source: 'mechanical' },
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

  it('defaults to total buff+nerf sort and can sort by last-N volatility', () => {
    const extra = [
      ...fixtures,
      patch('2026-04-01', [event('d:0', 'hero', 'Gamma', 'gamma', 'buff')]),
      patch('2026-05-01', [event('e:0', 'hero', 'Gamma', 'gamma', 'buff')]),
    ]
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
