import { describe, expect, it } from 'vitest'
import {
  extractSection,
  groupLinesByHero,
  parseHeroLines,
  patchDateFromTitle,
  stripSteamMarkup,
} from './parseNews.ts'

const STEAM_SNIPPET = [
  '[p][b]\\[ General ][/b][/p][p]- Unrelated[/p]',
  '[p][b]\\[ Heroes ][/b][/p][p][/p]',
  '[p]- Abrams: Infernal Resilience T3 increased from +8% to +9%[/p]',
  '[p]- Abrams: Seismic Impact T3 reduced from 6s Unstoppable to 5s[/p]',
  '[p]- Rem: Fixed a bug where multiple helpers could be sent[/p]',
].join('')

describe('parseNews', () => {
  it('strips Steam markup and extracts [ Heroes ]', () => {
    const plain = stripSteamMarkup(STEAM_SNIPPET)
    expect(plain).toContain('[ Heroes ]')
    const section = extractSection(plain, 'Heroes')
    expect(section).toBeTruthy()
    const grouped = groupLinesByHero(parseHeroLines(section!))
    expect([...grouped.keys()]).toEqual(['Abrams', 'Rem'])
    expect(grouped.get('Abrams')).toHaveLength(2)
  })

  it('parses markdown Heroes sections', () => {
    const md = '## Heroes\n- Celeste: Stamina cooldown increased from 5 to 5.3\n'
    const section = extractSection(md, 'Heroes')
    expect(parseHeroLines(section ?? '')).toEqual([
      { hero: 'Celeste', text: 'Stamina cooldown increased from 5 to 5.3' },
    ])
  })

  it('reads MM-DD-YYYY titles', () => {
    expect(patchDateFromTitle('Minor Update - 09-16-2026', 0)).toBe(
      '2026-09-16',
    )
  })
})
