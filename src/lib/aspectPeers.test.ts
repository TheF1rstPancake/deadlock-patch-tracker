import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChangeEvent, MetricDelta, Patch } from '../types.ts'
import {
  aspectForMetric,
  aspectForStat,
  buildAspectPeerIndex,
  empiricalPercentile,
  formatAspectPeerHeadline,
  formatRelativeChange,
  inferValueAspect,
  layerForEvent,
  rankEventMetrics,
  rankMetricLine,
} from './aspectPeers.ts'

function event(
  id: string,
  kind: 'hero' | 'item',
  name: string,
  slug: string,
  tag: ChangeEvent['tag'],
  metrics?: MetricDelta[],
  extra?: Partial<ChangeEvent>,
): ChangeEvent {
  return {
    id,
    section: kind === 'hero' ? 'Heroes' : 'Items',
    target: { kind, name, slug, ...extra?.target },
    tag,
    raw: extra?.raw ?? `${name} ${tag}`,
    parse: extra?.parse ?? {
      confidence: 'high',
      needsReview: false,
      source: 'mechanical',
    },
    ...(metrics ? { metrics } : {}),
    ...(extra?.display ? { display: extra.display } : {}),
    ...(extra?.clarified ? { clarified: extra.clarified } : {}),
  }
}

function patch(id: string, events: ChangeEvent[]): Patch {
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

function loadLedger(): Patch[] {
  const dir = join(process.cwd(), 'data/patches')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Patch)
}

describe('mechanical stat → aspect', () => {
  it('maps eval mechanical stats onto the closed aspect set', () => {
    expect(aspectForStat('cooldown')).toBe('cooldown')
    expect(aspectForStat('charge_time')).toBe('cooldown')
    expect(aspectForStat('delay')).toBe('cooldown')
    expect(aspectForStat('cooldown_reduction')).toBe('cooldown_reduction')
    expect(aspectForStat('duration')).toBe('duration')
    expect(aspectForStat('range')).toBe('range')
    expect(aspectForStat('falloff_range')).toBe('range')
    expect(aspectForStat('radius')).toBe('radius')
    expect(aspectForStat('spirit_scaling')).toBe('spirit_scaling')
    expect(aspectForStat('spirit_amp')).toBe('spirit_scaling')
    expect(aspectForStat('weapon_scaling')).toBe('weapon_scaling')
    expect(aspectForStat('damage')).toBe('damage')
    expect(aspectForStat('fire_rate')).toBe('damage')
    expect(aspectForStat('health')).toBe('health')
    expect(aspectForStat('bullet_resist')).toBe('resist')
    expect(aspectForStat('spirit_resist')).toBe('resist')
    expect(aspectForStat('melee_resist')).toBe('resist')
    expect(aspectForStat('sprint')).toBe('mobility')
    expect(aspectForStat('stamina')).toBe('mobility')
    expect(aspectForStat('lifesteal')).toBe('sustain')
    expect(aspectForStat('slow')).toBe('cc')
    expect(aspectForStat('silence')).toBe('cc')
    expect(aspectForStat('cost')).toBe('cost')
    expect(aspectForStat('bounty')).toBe('other')
    expect(aspectForStat('unknown_stat')).toBeUndefined()
  })

  it('uses the mechanical map when stat is not value', () => {
    expect(
      aspectForMetric({ stat: 'spirit_scaling' }, 'Heavy Melee spirit scaling'),
    ).toBe('spirit_scaling')
    expect(aspectForMetric({ stat: 'damage' }, 'Base DPS reduced')).toBe('damage')
  })
})

describe('value-stat heuristic', () => {
  it('maps unit m to range unless radius/AoE words appear', () => {
    expect(
      inferValueAspect({ unit: 'm' }, 'Captivating Read T3 increased from +1m to +2m'),
    ).toBe('range')
    expect(
      inferValueAspect({ unit: 'm' }, 'Alchemical Flask radius reduced from 6.5m to 5.5m'),
    ).toBe('radius')
    expect(
      inferValueAspect({ unit: 'm' }, 'Nova AoE increased from 4m to 5m'),
    ).toBe('radius')
  })

  it('maps % + scaling words to spirit_scaling', () => {
    expect(
      inferValueAspect({ unit: '%' }, 'Spirit Power scaling increased from 10% to 12%'),
    ).toBe('spirit_scaling')
  })

  it('uses raw keywords before unit fallback', () => {
    expect(inferValueAspect({ unit: 's' }, 'Cooldown reduced from 10s to 8s')).toBe(
      'cooldown',
    )
    expect(inferValueAspect({ unit: 's' }, 'Duration increased from 4s to 5s')).toBe(
      'duration',
    )
    expect(inferValueAspect({}, 'Spirit Power increased from +5 to +6')).toBe(
      'spirit_scaling',
    )
    expect(inferValueAspect({}, 'Puddle Punch scaling reduced from 1 to 0.8')).toBe(
      'spirit_scaling',
    )
    expect(inferValueAspect({}, 'Ammo increased from 12% to 15%')).toBe('cost')
    expect(inferValueAspect({}, 'Threshold increased from 60% to 65%')).toBe('other')
  })
})

describe('layer', () => {
  it('splits hero facet vs no facet, and items as shop_item', () => {
    expect(
      layerForEvent(event('h', 'hero', 'Paige', 'paige', 'buff')),
    ).toBe('character')
    expect(
      layerForEvent(
        event('a', 'hero', 'Paige', 'paige', 'buff', undefined, {
          target: { kind: 'hero', name: 'Paige', slug: 'paige', facet: 'Heavy Melee' },
        }),
      ),
    ).toBe('ability')
    expect(layerForEvent(event('i', 'item', 'Long Range', 'long-range', 'nerf'))).toBe(
      'shop_item',
    )
  })
})

describe('empirical percentile helper', () => {
  it('is the percent of peers ≤ this value, one decimal', () => {
    expect(empiricalPercentile(5, [10, 20, 30])).toBe(0)
    expect(empiricalPercentile(10, [10, 20, 30, 40])).toBe(25)
    expect(empiricalPercentile(40, [10, 20, 30, 40])).toBe(100)
    // 44 of 52 ≤ 50 → 84.615… → 84.6 (Paige spirit_scaling eval)
    const bag = Array.from({ length: 43 }, () => 10).concat([50], Array.from({ length: 8 }, () => 80))
    expect(bag).toHaveLength(52)
    expect(empiricalPercentile(50, bag)).toBe(84.6)
    expect(empiricalPercentile(100, [100])).toBe(100)
  })
})

describe('Paige-like fixture (0.3→0.45 spirit_scaling vs 1→2 range)', () => {
  const melee = event(
    'paige-melee',
    'hero',
    'Paige',
    'paige',
    'buff',
    [{ stat: 'spirit_scaling', polarity: 'up_is_buff', from: 0.3, to: 0.45 }],
    {
      raw: 'Heavy Melee spirit scaling increased from 0.3 to 0.45',
      target: { kind: 'hero', name: 'Paige', slug: 'paige', facet: 'Heavy Melee' },
    },
  )
  const read = event(
    'paige-read',
    'hero',
    'Paige',
    'paige',
    'buff',
    [{ stat: 'value', polarity: 'unknown', from: 1, to: 2, unit: 'm' }],
    {
      raw: 'Captivating Read T3 increased from +1m to +2m',
      display: 'Captivating Read T3 bonus +1m → +2m',
      target: { kind: 'hero', name: 'Paige', slug: 'paige', facet: 'Captivating Read T3' },
    },
  )
  const patches = [
    patch('2026-09-16', [
      melee,
      read,
      event(
        'same-day-scale',
        'hero',
        'Viscous',
        'viscous',
        'buff',
        [{ stat: 'spirit_scaling', from: 0.2, to: 0.25 }],
        { target: { kind: 'hero', name: 'Viscous', slug: 'viscous', facet: 'Puddle Punch' } },
      ),
      event(
        'item-range',
        'item',
        'Rescue Beam',
        'rescue-beam',
        'buff',
        [{ stat: 'range', from: 8, to: 16 }],
        { raw: 'Ability Range increased from +8% to +16%' },
      ),
    ]),
    patch('2026-03-06', [
      event(
        'older-range',
        'hero',
        'Lady Geist',
        'lady-geist',
        'buff',
        [{ stat: 'range', from: 10, to: 12 }],
        {
          raw: 'Essence Bomb range increased from 10m to 12m',
          target: { kind: 'hero', name: 'Lady Geist', slug: 'lady-geist', facet: 'Essence Bomb' },
        },
      ),
      event(
        'older-scale-small',
        'hero',
        'Wraith',
        'wraith',
        'buff',
        [{ stat: 'spirit_scaling', from: 1, to: 1.1 }],
        { target: { kind: 'hero', name: 'Wraith', slug: 'wraith', facet: 'Card Trick' } },
      ),
      event(
        'older-scale-big',
        'hero',
        'Infernus',
        'infernus',
        'buff',
        [{ stat: 'spirit_scaling', from: 0.2, to: 0.5 }],
        { target: { kind: 'hero', name: 'Infernus', slug: 'infernus', facet: 'Flame Dash' } },
      ),
    ]),
  ]

  it('keeps the 50% spirit scaling and 100% range lines in different peer bags', () => {
    const index = buildAspectPeerIndex(patches)
    const scale = rankMetricLine(index, melee, melee.metrics![0]!, '2026-09-16')
    const range = rankMetricLine(index, read, read.metrics![0]!, '2026-09-16')
    expect(scale).toMatchObject({
      aspect: 'spirit_scaling',
      layer: 'ability',
      sign: 'buff',
      relativePct: 50,
    })
    expect(range).toMatchObject({
      aspect: 'range',
      layer: 'ability',
      sign: 'buff',
      relativePct: 100,
    })
    // Range bag: Paige 100 + Lady Geist 20. Item 100% range is shop_item, not mixed.
    expect(range?.peerN).toBe(2)
    expect(range?.peerPercentile).toBe(100)
    expect(range?.dayPeerN).toBe(1)
    expect(range?.dayPeerPercentile).toBe(100)
    // Spirit bag: 50 (Paige), 25 (same day), 10, 150 (older). Paige is 3 of 4.
    expect(scale?.peerN).toBe(4)
    expect(scale?.peerPercentile).toBe(75)
    expect(scale?.dayPeerN).toBe(2)
    expect(scale?.dayPeerPercentile).toBe(100)
    expect(formatAspectPeerHeadline(range!, 'across')).toBe(
      'Range · P100 of 2 ability range buffs',
    )
    expect(formatAspectPeerHeadline(scale!, 'across')).toBe(
      'Spirit Scaling · P75 of 4 ability spirit scaling buffs',
    )
    expect(formatAspectPeerHeadline(range!, 'day')).toBe(
      'Range · P100 of 1 ability range buff that day',
    )
    expect(formatRelativeChange(50)).toBe('50% relative change on this number')
    expect(formatRelativeChange(100)).toBe('100% relative change on this number')
  })

  it('does not mix item lines into hero ability bags', () => {
    const index = buildAspectPeerIndex(patches)
    const item = patches[0]!.events.find((row) => row.id === 'item-range')!
    const rank = rankMetricLine(index, item, item.metrics![0]!, '2026-09-16')
    expect(rank).toMatchObject({
      layer: 'shop_item',
      aspect: 'range',
      peerN: 1,
      peerPercentile: 100,
    })
    expect(formatAspectPeerHeadline(rank!, 'across')).toBe(
      'Range · P100 of 1 item range buff',
    )
  })
})

describe('Paige 2026-09-16 ledger', () => {
  it('classifies Heavy Melee as spirit_scaling and Captivating Read T3 as range', () => {
    const patches = loadLedger()
    const index = buildAspectPeerIndex(patches)
    const sept = patches.find((row) => row.id === '2026-09-16')
    expect(sept).toBeDefined()
    const melee = sept!.events.find((row) => row.id === '1844115010490072:81')
    const read = sept!.events.find((row) => row.id === '1844115010490072:83')
    expect(melee?.raw).toMatch(/Heavy Melee spirit scaling/)
    expect(read?.raw).toMatch(/Captivating Read T3/)
    const scale = rankEventMetrics(index, melee!, '2026-09-16')[0]
    const range = rankEventMetrics(index, read!, '2026-09-16')[0]
    expect(scale).toMatchObject({
      aspect: 'spirit_scaling',
      layer: 'ability',
      sign: 'buff',
      relativePct: 50,
    })
    expect(range).toMatchObject({
      aspect: 'range',
      layer: 'ability',
      sign: 'buff',
      relativePct: 100,
    })
    expect(scale!.peerN).toBeGreaterThan(1)
    expect(range!.peerN).toBeGreaterThan(1)
    expect(range!.peerPercentile).toBeGreaterThanOrEqual(scale!.peerPercentile)
    expect(formatAspectPeerHeadline(range!, 'across')).toMatch(
      /Range · P\d+(?:\.\d)? of \d+ ability range buffs/,
    )
    expect(formatAspectPeerHeadline(scale!, 'across')).toMatch(
      /Spirit Scaling · P\d+(?:\.\d)? of \d+ ability spirit scaling buffs/,
    )
  })
})
