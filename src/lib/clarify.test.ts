import { describe, expect, it } from 'vitest'
import { autoClarify } from './clarify.ts'

describe('autoClarify', () => {
  it('rewrites signed cooldown-reduction talents', () => {
    const result = autoClarify(
      'Captivating Read T1 increased from -11s Cooldown to -14s',
    )
    expect(result.clarified).toBe(true)
    expect(result.display).toBe(
      'Captivating Read T1: cooldown reduction −11s → −14s (stronger CDR)',
    )
  })

  it('leaves absolute cooldown wording alone', () => {
    expect(
      autoClarify('Dazzling Trick cooldown increased from 34s to 38s'),
    ).toEqual({})
  })

  it('clarifies falloff-range and rage reworks', () => {
    expect(
      autoClarify('Gun falloff range reduced from 18m->54m to 16m->48m').display,
    ).toMatch(/shorter/)
    expect(
      autoClarify(
        'Serrated Knives while rage is full now deals 3.5% current HP damage on impact instead of ricocheting (0.01 spirit scaling)',
      ).clarified,
    ).toBe(true)
  })
})
