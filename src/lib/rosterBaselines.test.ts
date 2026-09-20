import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Patch } from '../types.ts'
import { aspectForMetric, eventAspectText } from './aspectPeers.ts'
import {
  NO_ROSTER_BASELINE_CHIP,
  formatRosterHeadline,
  pickFamily,
  scoreAbsolute,
  scoreMetricAbsolute,
  type RosterBaselinesFile,
  type RosterFamilyBag,
} from './rosterBaselines.ts'

function bag(values: number[]): RosterFamilyBag {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    n: sorted.length,
    min: sorted[0]!,
    p50: sorted[Math.floor(sorted.length / 2)]!,
    max: sorted[sorted.length - 1]!,
    values: sorted,
  }
}

/** Compact stand-in whose median spirit coeff is 0.65, bonus range max 12. */
function fixtureBags(): RosterBaselinesFile {
  return {
    generatedAt: 'test',
    source: { heroes: '', items: '' },
    minSampleSize: 5,
    families: {
      spirit_coeff: bag([
        0.1, 0.2, 0.3, 0.35, 0.45, 0.5, 0.65, 0.7, 0.8, 0.9, 1.0, 1.3, 1.5, 2,
      ]),
      range_bonus_m: bag([1, 4, 6, 8, 10, 10, 10, 12]),
      range_base_m: bag([8, 12, 15, 20, 24, 30, 40, 50]),
      cooldown_s: bag([4, 8, 12, 20, 26, 32, 40, 60]),
      damage_pct: bag([5, 10, 12, 20, 25, 40, 50, 80]),
      damage_flat: bag([8, 20, 40, 50, 70, 90, 120, 200]),
      fire_rate_pct: bag([5, 10, 15, 25, 30, 40, 50, 80]),
    },
  }
}

function loadLedger(): Patch[] {
  const dir = join(process.cwd(), 'data/patches')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Patch)
}

describe('pickFamily', () => {
  const bags = fixtureBags()

  it('sends spirit scaling to spirit_coeff and small meter range to bonus pack', () => {
    expect(
      pickFamily('spirit_scaling', undefined, 0.3, 0.45, 'spirit scaling', bags),
    ).toBe('spirit_coeff')
    expect(
      pickFamily(
        'range',
        'm',
        1,
        2,
        'Captivating Read T3 increased from +1m to +2m',
        bags,
      ),
    ).toBe('range_bonus_m')
    expect(
      pickFamily(
        'range',
        'm',
        20,
        28,
        'Pain Battery range increased from 20m to 28m',
        bags,
      ),
    ).toBe('range_base_m')
  })

  it('does not invent a bag for leftover other/cost lines', () => {
    expect(pickFamily('other', undefined, 75, 100, 'Spirit Shield', bags)).toBeUndefined()
    expect(pickFamily('cost', undefined, 2, 3, 'ammo cost increased', bags)).toBeUndefined()
  })

  it('splits damage percent vs flat and fire rate from raw', () => {
    expect(
      pickFamily('damage', '%', 12, 10, 'Weapon Damage reduced from 12% to 10%.', bags),
    ).toBe('damage_pct')
    expect(
      pickFamily('damage', undefined, 70, 40, 'Damage reduced from 70 to 40.', bags),
    ).toBe('damage_flat')
    expect(
      pickFamily('damage', '%', 6, 7, 'Fire Rate increased from 6% to 7%.', bags),
    ).toBe('fire_rate_pct')
  })
})

describe('scoreAbsolute', () => {
  const bags = fixtureBags()

  it('Paige-like spirit 0.3→0.45 lands below median with small ΔP', () => {
    const score = scoreAbsolute(0.3, 0.45, 'spirit_coeff', bags)
    expect(score.status).toBe('ok')
    expect(score.familyP50).toBeGreaterThan(0.45)
    expect(score.pBefore).toBeLessThan(50)
    expect(score.pAfter).toBeLessThan(50)
    expect(score.deltaP).toBeGreaterThan(0)
    expect(score.deltaP).toBeLessThan(20)
    expect(formatRosterHeadline(score)).toMatch(
      /^Roster P\d+ → P\d+ \(ΔP \+\d+\) · spirit coeff$/,
    )
  })

  it('range bonus 1→2 stays low vs the bonus pack', () => {
    const score = scoreAbsolute(1, 2, 'range_bonus_m', bags)
    expect(score.status).toBe('ok')
    expect(score.pBefore).toBeLessThan(25)
    expect(score.pAfter).toBeLessThan(25)
    expect(Math.abs(score.deltaP ?? 99)).toBeLessThan(5)
  })

  it('spirit 0.4→1.3 is a roster spike', () => {
    const score = scoreAbsolute(0.4, 1.3, 'spirit_coeff', bags)
    expect(score.status).toBe('ok')
    expect(score.pAfter).toBeGreaterThan(50)
    expect(score.deltaP).toBeGreaterThan(30)
  })

  it('returns no_roster_baseline when the family is missing or tiny', () => {
    expect(scoreAbsolute(2, 3, undefined, bags).status).toBe('no_roster_baseline')
    const tiny: RosterBaselinesFile = {
      ...bags,
      families: { spirit_coeff: bag([0.2, 0.3, 0.4]) },
    }
    expect(scoreAbsolute(0.3, 0.45, 'spirit_coeff', tiny).status).toBe(
      'no_roster_baseline',
    )
    expect(NO_ROSTER_BASELINE_CHIP).toBe('No roster baseline')
  })
})

describe('live roster-baselines.json', () => {
  it('Paige-like spirit 0.3→0.45 is catch-up below median', () => {
    const melee = scoreMetricAbsolute(
      { stat: 'spirit_scaling', from: 0.3, to: 0.45 },
      'Heavy Melee spirit scaling increased from 0.3 to 0.45',
    )
    expect(melee.status).toBe('ok')
    expect(melee.family).toBe('spirit_coeff')
    expect(melee.familyP50).toBeGreaterThan(0.45)
    expect(melee.pAfter).toBeLessThan(50)
    expect(melee.deltaP).toBeGreaterThan(0)
    expect(melee.deltaP).toBeLessThan(15)
    expect(formatRosterHeadline(melee)).toMatch(/spirit coeff/)
  })

  it('Captivating Read +1m→+2m stays tiny on range_bonus_m', () => {
    const read = scoreMetricAbsolute(
      { stat: 'value', from: 1, to: 2, unit: 'm' },
      'Captivating Read T3 increased from +1m to +2m',
    )
    expect(
      aspectForMetric({ stat: 'value', unit: 'm' }, 'Captivating Read T3 +1m to +2m'),
    ).toBe('range')
    expect(read.status).toBe('ok')
    expect(read.family).toBe('range_bonus_m')
    expect(read.pBefore).toBeLessThan(15)
    expect(read.pAfter).toBeLessThan(15)
    expect(Math.abs(read.deltaP ?? 99)).toBeLessThan(5)
  })

  it('spirit 0.4→1.3 (Viscous-like) shows a large ΔP', () => {
    const spike = scoreMetricAbsolute(
      { stat: 'spirit_scaling', from: 0.4, to: 1.3 },
      'Splatter T3 spirit scaling increased from +0.4 to +1.3',
    )
    expect(spike.status).toBe('ok')
    expect(spike.deltaP).toBeGreaterThan(30)
    expect(spike.pAfter).toBeGreaterThan(50)
  })

  it('cost/other measurable lines have no roster baseline', () => {
    const ammo = scoreMetricAbsolute(
      { stat: 'cost', from: 2, to: 3 },
      'Alt fire ammo cost increased from 2 to 3',
    )
    expect(ammo.status).toBe('no_roster_baseline')
  })

  it('item ability-range lines use the same bonus pack as hero meter bonuses', () => {
    const item = scoreMetricAbsolute(
      { stat: 'range', from: 10, to: 8, unit: '%' },
      'Ability Range reduced from 10% to 8%',
    )
    expect(item.status).toBe('ok')
    expect(item.family).toBe('range_bonus_m')
  })
})

describe('Paige 2026-09-16 ledger', () => {
  it('scores Heavy Melee catch-up and Captivating Read still-tiny bonus', () => {
    const patches = loadLedger()
    const sept = patches.find((row) => row.id === '2026-09-16')
    expect(sept).toBeDefined()
    const melee = sept!.events.find((row) => row.id === '1844115010490072:81')
    const read = sept!.events.find((row) => row.id === '1844115010490072:83')
    expect(melee?.raw).toMatch(/Heavy Melee spirit scaling/)
    expect(read?.raw).toMatch(/Captivating Read T3/)
    const scale = scoreMetricAbsolute(melee!.metrics![0]!, eventAspectText(melee!))
    const range = scoreMetricAbsolute(read!.metrics![0]!, eventAspectText(read!))
    expect(scale).toMatchObject({ status: 'ok', family: 'spirit_coeff' })
    expect(range).toMatchObject({ status: 'ok', family: 'range_bonus_m' })
    expect(scale.familyP50).toBeGreaterThan(0.45)
    expect(scale.pAfter).toBeLessThan(50)
    expect(range.pAfter).toBeLessThan(15)
    expect(formatRosterHeadline(scale)).toMatch(
      /^Roster P\d+ → P\d+ \(ΔP \+\d+\) · spirit coeff$/,
    )
    expect(formatRosterHeadline(range)).toMatch(/range bonus m/)
  })
})
