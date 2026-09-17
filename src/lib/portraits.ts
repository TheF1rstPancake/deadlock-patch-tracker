import { slugifyName } from './slug.ts'

export function heroPortraitSlug(name: string): string {
  return slugifyName(name)
}

export function heroPortraitUrl(name: string): string {
  const base = import.meta.env.BASE_URL || './'
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}heroes/${heroPortraitSlug(name)}.webp`
}
