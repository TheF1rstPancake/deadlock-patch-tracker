import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
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
})
