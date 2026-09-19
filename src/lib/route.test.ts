import { describe, expect, it } from 'vitest'
import { careerHash, parseHash, patternsHash } from './route.ts'

describe('parseHash', () => {
  it('treats a patch id as the roster home', () => {
    expect(parseHash('#2026-09-16')).toEqual({
      view: 'roster',
      patchId: '2026-09-16',
    })
    expect(parseHash('')).toEqual({ view: 'roster', patchId: '' })
  })

  it('routes patterns overview and entity detail without mixing kinds', () => {
    expect(parseHash('#patterns')).toEqual({ view: 'patterns', kind: 'hero' })
    expect(parseHash('#patterns/items')).toEqual({
      view: 'patterns',
      kind: 'item',
    })
    expect(parseHash('#patterns/hero/paige')).toEqual({
      view: 'patterns',
      kind: 'hero',
      slug: 'paige',
    })
    expect(parseHash('#patterns/item/shadow-weave')).toEqual({
      view: 'patterns',
      kind: 'item',
      slug: 'shadow-weave',
    })
    expect(parseHash('#patterns/hero/apollo?lens=day&patch=2026-05-22')).toEqual({
      view: 'patterns',
      kind: 'hero',
      slug: 'apollo',
      lens: 'day',
      focusPatchId: '2026-05-22',
    })
    expect(parseHash('#patterns/career')).toEqual({
      view: 'patterns',
      kind: 'hero',
      board: 'career',
    })
    expect(parseHash('#patterns/career/items')).toEqual({
      view: 'patterns',
      kind: 'item',
      board: 'career',
    })
    expect(parseHash('#patterns/career/heroes')).toEqual({
      view: 'patterns',
      kind: 'hero',
      board: 'career',
    })
  })
})

describe('patternsHash', () => {
  it('writes overview and detail hashes', () => {
    expect(patternsHash('hero')).toBe('#patterns')
    expect(patternsHash('item')).toBe('#patterns/items')
    expect(patternsHash('hero', 'viscous')).toBe('#patterns/hero/viscous')
    expect(patternsHash('hero', 'apollo', { lens: 'day', patch: '2026-05-22' })).toBe(
      '#patterns/hero/apollo?lens=day&patch=2026-05-22',
    )
    expect(careerHash('hero')).toBe('#patterns/career')
    expect(careerHash('item')).toBe('#patterns/career/items')
  })
})
