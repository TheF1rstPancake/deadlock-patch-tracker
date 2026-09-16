import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatPatchPulse, sortHeroesForFriendScan } from './board.ts'
import type { Patch } from '../types.ts'

const patchPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/patches/2026-09-16.json',
)

describe('Sep 16 board', () => {
  const patch = JSON.parse(readFileSync(patchPath, 'utf8')) as Patch

  it('is the latest minor update with 20 heroes', () => {
    expect(patch.title).toMatch(/Minor Update/i)
    expect(patch.date).toBe('2026-09-16')
    expect(patch.heroes).toHaveLength(20)
  })

  it('matches the V1 sanity sentiments', () => {
    const byName = Object.fromEntries(
      patch.heroes.map((hero) => [hero.name, hero.sentiment]),
    )
    expect(byName.Viscous).toBe('mixed')
    expect(byName.Celeste).toBe('nerf')
    expect(byName.Graves).toBe('buff')
    expect(byName.Rem).toBe('fix')
  })

  it('keeps Paige Captivating Read T1 as a CDR buff and marks it clarified', () => {
    const paige = patch.heroes.find((hero) => hero.name === 'Paige')
    const t1 = paige?.changes.find((change) =>
      change.raw.includes('Captivating Read T1'),
    )
    expect(t1?.tag).toBe('buff')
    expect(t1?.clarified).toBe(true)
    expect(t1?.display).toMatch(/cooldown reduction/)
    expect(t1?.display).toMatch(/stronger CDR/)
  })

  it('keeps Celeste Dazzling Trick as an absolute cooldown nerf', () => {
    const celeste = patch.heroes.find((hero) => hero.name === 'Celeste')
    const trick = celeste?.changes.find((change) =>
      change.raw.includes('Dazzling Trick'),
    )
    expect(trick?.tag).toBe('nerf')
    expect(celeste?.sentiment).toBe('nerf')
  })

  it('uses raw/display provenance on clarified lines', () => {
    const clarified = patch.heroes.flatMap((hero) => hero.changes).filter(
      (change) => change.clarified,
    )
    expect(clarified.length).toBeGreaterThan(0)
    for (const change of clarified) {
      expect(change.raw).toBeTruthy()
      expect(change.display).toBeTruthy()
      expect(change.display).not.toBe(change.raw)
    }
  })

  it('clarifies Shiv Serrated Knives rework without inventing numbers', () => {
    const shiv = patch.heroes.find((hero) => hero.name === 'Shiv')
    const knives = shiv?.changes.find((change) =>
      change.raw.includes('Serrated Knives'),
    )
    expect(knives?.clarified).toBe(true)
    expect(knives?.display).toMatch(/3\.5% current HP/)
    expect(knives?.display).toMatch(/ricochet/)
    expect(knives?.raw).toMatch(/ricocheting/)
  })

  it('pulses the patch shape from sentiment tallies', () => {
    const counts = { buff: 0, nerf: 0, mixed: 0, fix: 0, neutral: 0 }
    for (const hero of patch.heroes) counts[hero.sentiment] += 1
    expect(formatPatchPulse(counts)).toBe('9 buff · 5 nerf · 5 mixed · 1 fix')
    expect(formatPatchPulse({ buff: 12, nerf: 5, mixed: 3, fix: 2 })).toBe(
      '12 buff · 5 nerf · 3 mixed · 2 fix',
    )
    expect(
      formatPatchPulse({ buff: 0, nerf: 0, mixed: 0, fix: 0, neutral: 0 }),
    ).toBe('')
  })

  it('sorts the board buffs-first for a friend scan', () => {
    const sorted = sortHeroesForFriendScan(patch.heroes)
    expect(sorted.slice(0, 9).map((hero) => hero.name)).toEqual([
      'Graves',
      'Haze',
      'Holliday',
      'Kelvin',
      'Lady Geist',
      'Paige',
      'Shiv',
      'Venator',
      'Yamato',
    ])
    const ranks = { buff: 0, nerf: 1, mixed: 2, fix: 3, neutral: 4 }
    for (let i = 1; i < sorted.length; i++) {
      const prev = ranks[sorted[i - 1].sentiment]
      const next = ranks[sorted[i].sentiment]
      expect(next).toBeGreaterThanOrEqual(prev)
    }
    expect(sorted[sorted.length - 1].name).toBe('Rem')
    const abramsIndex = sorted.findIndex((hero) => hero.name === 'Abrams')
    const gravesIndex = sorted.findIndex((hero) => hero.name === 'Graves')
    const remIndex = sorted.findIndex((hero) => hero.name === 'Rem')
    expect(gravesIndex).toBeLessThan(abramsIndex)
    expect(abramsIndex).toBeLessThan(remIndex)
  })
})
