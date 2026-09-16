import { describe, expect, it } from 'vitest'
import { classifyLine, netSentiment } from './classify.ts'

describe('classifyLine', () => {
  it('tags numeric buffs and nerfs', () => {
    expect(
      classifyLine('Infernal Resilience T3 increased from +8% to +9%'),
    ).toBe('buff')
    expect(
      classifyLine('Seismic Impact T3 reduced from 6s Unstoppable to 5s'),
    ).toBe('nerf')
    expect(classifyLine('Stamina cooldown increased from 5 to 5.3')).toBe(
      'nerf',
    )
    expect(
      classifyLine('Splatter detonation cooldown reduced from 0.15 to 0.12'),
    ).toBe('buff')
  })

  it('treats signed talent CDR as buff/nerf by magnitude, not the word increased', () => {
    expect(
      classifyLine('Captivating Read T1 increased from -11s Cooldown to -14s'),
    ).toBe('buff')
    expect(
      classifyLine('Captivating Read T1 Cooldown increased from -11s to -14s'),
    ).toBe('buff')
    expect(
      classifyLine('Captivating Read T1 reduced from -14s Cooldown to -11s'),
    ).toBe('nerf')
  })

  it('treats absolute ability cooldown increases as nerfs', () => {
    expect(
      classifyLine('Dazzling Trick cooldown increased from 34s to 38s'),
    ).toBe('nerf')
  })

  it('tags bugfixes as fix, not buff', () => {
    expect(
      classifyLine(
        'Fixed a bug where multiple helpers could be sent to follow a single player for no effect',
      ),
    ).toBe('fix')
    expect(
      classifyLine('Fixed some collision issues with Rallying Charge'),
    ).toBe('fix')
  })

  it('tags UI QoL as fix', () => {
    expect(
      classifyLine(
        'Lil Helpers now have a target UI when instant cast mode is selected',
      ),
    ).toBe('fix')
  })

  it('tags restrictions, reworks, and new effects', () => {
    expect(
      classifyLine('Boot Kick can only target heroes and objectives now'),
    ).toBe('nerf')
    expect(
      classifyLine(
        'Serrated Knives while rage is full now deals 3.5% current HP damage on impact instead of ricocheting (0.01 spirit scaling)',
      ),
    ).toBe('neutral')
    expect(
      classifyLine(
        'Crackshot T2 now also applies -6% Bullet Resistance for 5s',
      ),
    ).toBe('buff')
    expect(
      classifyLine(
        "Dashes and light melee's no longer pause your gun's cycle time",
      ),
    ).toBe('buff')
    expect(
      classifyLine(
        'Kinetic Carbine min damage multiplier no longer gets increased by the T3',
      ),
    ).toBe('nerf')
    expect(classifyLine('Card Trick T3 Clubs slow from +20% to +15%')).toBe(
      'nerf',
    )
  })
})

describe('netSentiment', () => {
  it('maps mixed, buff, nerf, and fix-only boards', () => {
    expect(netSentiment(['buff', 'nerf'])).toBe('mixed')
    expect(netSentiment(['buff', 'fix'])).toBe('buff')
    expect(netSentiment(['nerf', 'nerf'])).toBe('nerf')
    expect(netSentiment(['fix', 'fix'])).toBe('fix')
    expect(netSentiment(['fix', 'neutral'])).toBe('fix')
    expect(netSentiment(['neutral'])).toBe('neutral')
  })
})
