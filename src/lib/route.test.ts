import { describe, expect, it } from 'vitest'
import { parseHash, patternsHash } from './route.ts'

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
  })
})

describe('patternsHash', () => {
  it('writes overview and detail hashes', () => {
    expect(patternsHash('hero')).toBe('#patterns')
    expect(patternsHash('item')).toBe('#patterns/items')
    expect(patternsHash('hero', 'viscous')).toBe('#patterns/hero/viscous')
  })
})
