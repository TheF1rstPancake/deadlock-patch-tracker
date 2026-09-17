import { describe, expect, it } from 'vitest'
import { buildCatalogIndex, loadCatalog, lookupName } from './catalog.ts'
import { buildEvents, projectHeroes, resolveTarget } from './events.ts'
import { extractMetrics } from './metrics.ts'
import { stripSteamMarkup } from './parseNews.ts'

const catalog = buildCatalogIndex(loadCatalog())

describe('resolveTarget', () => {
  it('uses the roster on flat lists and never assumes hero', () => {
    const hero = resolveTarget('Celeste', 'Dazzling Trick cooldown increased', '', catalog)
    expect(hero.kind).toBe('hero')
    expect(hero.slug).toBe('celeste')

    const item = resolveTarget(
      'Restorative Locket',
      'Spirit Resistance reduced from 10% to 8%',
      '',
      catalog,
    )
    expect(item.kind).toBe('item')
    expect(item.slug).toBe('restorative-locket')

    const unknown = resolveTarget('Brand New Thing', 'does something', '', catalog)
    expect(unknown.kind).toBe('unknown')
  })

  it('lets catalog kind win when items are nested under [ Heroes ]', () => {
    const mystery = resolveTarget('MysteryHero', 'buffed', 'Heroes', catalog)
    expect(mystery.kind).toBe('unknown')
    const item = resolveTarget(
      'Restorative Locket',
      'Spirit Resist increased',
      'Heroes',
      catalog,
    )
    expect(item.kind).toBe('item')
    const hero = resolveTarget('Abrams', 'Health increased', 'Heroes', catalog)
    expect(hero.kind).toBe('hero')
  })

  it('maps Doorman notes onto The Doorman', () => {
    expect(lookupName('Doorman', catalog)?.name).toBe('The Doorman')
    const target = resolveTarget('Doorman', 'Doorway range reduced', '', catalog)
    expect(target.kind).toBe('hero')
    expect(target.name).toBe('The Doorman')
  })
})

describe('buildEvents', () => {
  it('parses a mixed flat list into hero and item events', () => {
    const plain = [
      '- Radiant Regeneration: Heal on cast reduced from 70 to 65',
      '- Restorative Locket: Spirit Resistance reduced from 10% to 8%',
      '- Celeste: Dazzling Trick cooldown increased from 32s to 34s',
    ].join('\n')
    const { layout, events } = buildEvents({ gid: '1', plain, catalog })
    expect(layout).toBe('flat')
    expect(events.map((event) => event.target.kind)).toEqual([
      'item',
      'item',
      'hero',
    ])
    expect(events[2]?.target.name).toBe('Celeste')
    expect(events[2]?.tag).toBe('nerf')
    expect(events.some((event) => event.target.kind === 'hero' && event.target.name === 'Restorative Locket')).toBe(false)
  })

  it('walks sectioned Heroes + Items + General', () => {
    const bbcode = [
      '[p][b]\\[ General ][/b][/p]',
      '[p]- Unstable Rift comeback resist max values now scale[/p]',
      '[p][b]\\[ Items ][/b][/p]',
      '[p]- Weakening Headshot: Bullet Resist Reduction reduced from -13% to -12%[/p]',
      '[p][b]\\[ Heroes ][/b][/p]',
      '[p]- Abrams: Infernal Resilience T3 increased from +8% to +9%[/p]',
    ].join('')
    const { layout, sectionsPresent, events } = buildEvents({
      gid: '2',
      plain: stripSteamMarkup(bbcode),
      catalog,
    })
    expect(layout).toBe('sectioned')
    expect(sectionsPresent).toEqual(['General', 'Items', 'Heroes'])
    expect(events.find((event) => event.target.kind === 'item')?.target.name).toBe(
      'Weakening Headshot',
    )
    expect(events.find((event) => event.target.kind === 'hero')?.target.name).toBe(
      'Abrams',
    )
  })

  it('marks prose patches as needsReview', () => {
    const { layout, events } = buildEvents({
      gid: '3',
      plain: "Today's update adds Hero Labs and points at the forums.",
      catalog,
    })
    expect(layout).toBe('prose')
    expect(events).toHaveLength(1)
    expect(events[0]?.parse.needsReview).toBe(true)
    expect(events[0]?.parse.confidence).toBe('low')
  })

  it('attaches card-suite lines to the previous hero instead of minting fake heroes', () => {
    const { events } = buildEvents({
      gid: '5',
      plain: [
        '[ Heroes ]',
        '- Wraith: Card Trick cards now have specific suites',
        '- Hearts: Heals you for 75 HP',
        '- Clubs: 30% Slow for 3s',
        '- Restorative Locket: Spirit Resist increased from 8% to 10%',
      ].join('\n'),
      catalog,
    })
    expect(events[1]?.target).toMatchObject({
      kind: 'hero',
      name: 'Wraith',
      facet: 'Hearts',
    })
    expect(events[2]?.target).toMatchObject({
      kind: 'hero',
      name: 'Wraith',
      facet: 'Clubs',
    })
    expect(events[3]?.target.kind).toBe('item')
    const heroes = projectHeroes(events)
    expect(heroes.map((hero) => hero.name)).toEqual(['Wraith'])
  })

  it('projects heroes[] from events for the V1 board', () => {
    const { events } = buildEvents({
      gid: '4',
      plain: [
        '[ Heroes ]',
        '- Celeste: Stamina cooldown increased from 5 to 5.3',
        '- Celeste: Light Eater spirit lifesteal reduced from 20% to 18%',
        '- Graves: Health per boon increased from 33 to 35',
      ].join('\n'),
      catalog,
    })
    const heroes = projectHeroes(events)
    expect(heroes.map((hero) => hero.name)).toEqual(['Celeste', 'Graves'])
    expect(heroes.find((hero) => hero.name === 'Celeste')?.sentiment).toBe('nerf')
    expect(heroes.find((hero) => hero.name === 'Graves')?.sentiment).toBe('buff')
  })
})

describe('extractMetrics', () => {
  it('captures from→to cooldown deltas with inverted polarity', () => {
    const metrics = extractMetrics('Dazzling Trick cooldown increased from 34s to 38s')
    expect(metrics[0]?.stat).toBe('cooldown')
    expect(metrics[0]?.from).toBe(34)
    expect(metrics[0]?.to).toBe(38)
    expect(metrics[0]?.polarity).toBe('up_is_nerf')
  })
})
