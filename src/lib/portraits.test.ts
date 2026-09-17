import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { heroPortraitSlug, heroPortraitUrl } from './portraits.ts'
import type { Patch } from '../types.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const patchPath = resolve(root, 'data/patches/2026-09-16.json')

describe('hero portraits', () => {
  const patch = JSON.parse(readFileSync(patchPath, 'utf8')) as Patch

  it('slugs display names for public/heroes files', () => {
    expect(heroPortraitSlug('Abrams')).toBe('abrams')
    expect(heroPortraitSlug('Lady Geist')).toBe('lady-geist')
    expect(heroPortraitUrl('Lady Geist')).toMatch(/heroes\/lady-geist\.webp$/)
  })

  it('vendors a card image for every Sep 16 hero', () => {
    expect(patch.heroes.length).toBeGreaterThan(0)
    for (const hero of patch.heroes) {
      const file = resolve(
        root,
        'public/heroes',
        `${heroPortraitSlug(hero.name)}.webp`,
      )
      expect(existsSync(file), file).toBe(true)
    }
  })
})
