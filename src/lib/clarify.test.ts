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
})
