import { describe, expect, it } from 'vitest'
import { buildHistoryIndex } from './indexPatches.ts'
import type { Patch } from '../types.ts'

describe('buildHistoryIndex', () => {
  it('rolls events into per-target touches and patch counts', () => {
    const patch: Patch = {
      schemaVersion: 2,
      id: '2026-09-16',
      title: 'Minor Update - 09-16-2026',
      date: '2026-09-16',
      steamUrl: 'https://example.test',
      gid: '1',
      appid: 1422450,
      layout: 'sectioned',
      sectionsPresent: ['Heroes'],
      events: [
        {
          id: '1:0',
          section: 'Heroes',
          target: { kind: 'hero', name: 'Celeste', slug: 'celeste' },
          tag: 'nerf',
          raw: 'Stamina cooldown increased from 5 to 5.3',
          parse: { confidence: 'high', needsReview: false, source: 'mechanical' },
        },
        {
          id: '1:1',
          section: 'Items',
          target: {
            kind: 'item',
            name: 'Restorative Locket',
            slug: 'restorative-locket',
          },
          tag: 'nerf',
          raw: 'Spirit Resistance reduced from 10% to 8%',
          parse: { confidence: 'high', needsReview: false, source: 'mechanical' },
        },
      ],
      heroes: [
        {
          name: 'Celeste',
          sentiment: 'nerf',
          changes: [
            { raw: 'Stamina cooldown increased from 5 to 5.3', tag: 'nerf' },
          ],
        },
      ],
    }
    const index = buildHistoryIndex([patch], '2026-09-16T00:00:00.000Z')
    expect(index.patches).toHaveLength(1)
    expect(index.patches[0]?.counts).toMatchObject({
      events: 2,
      hero: 1,
      item: 1,
      needsReview: 0,
    })
    expect(index.targets['hero:celeste']?.totals.nerf).toBe(1)
    expect(index.targets['item:restorative-locket']?.touches[0]?.patchId).toBe(
      '2026-09-16',
    )
  })
})
