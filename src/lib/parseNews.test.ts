import { describe, expect, it } from 'vitest'
import {
  detectLayout,
  joinWrappedLines,
  parseBulletLines,
  parseHeroLines,
  extractSection,
  groupLinesByHero,
  patchDateFromTitle,
  splitSections,
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

  it('detects sectioned, flat, and prose layouts', () => {
    expect(
      detectLayout('[ Heroes ]\n- Celeste: Stamina cooldown increased from 5 to 5.3'),
    ).toBe('sectioned')
    expect(
      detectLayout(
        '- Celeste: Dazzling Trick cooldown increased from 32s to 34s\n- Restorative Locket: Spirit Resistance reduced from 10% to 8%',
      ),
    ).toBe('flat')
    expect(
      detectLayout(
        "Today's update adds Hero Labs. For the full patch notes, visit the forums.",
      ),
    ).toBe('prose')
  })

  it('splits old Weapon / Vitality / Spirit item headers', () => {
    const text = [
      '[ Weapon Items ]',
      '- Close Quarters: Damage increased from 25% to 30%',
      '[ Heroes ]',
      '- Abrams: Health increased from 600 to 620',
    ].join('\n')
    const sections = splitSections(text)
    expect(sections.map((section) => section.name)).toEqual([
      'Weapon Items',
      'Heroes',
    ])
  })

  it('joins wrapped Steam bullets', () => {
    const joined = joinWrappedLines(
      '- Slows now also affect air drag (convar\nfoo_bar to toggle)',
    )
    expect(joined).toContain('convar foo_bar to toggle')
    expect(parseBulletLines(joined)).toHaveLength(1)
  })
})
