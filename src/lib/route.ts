export type PatternKind = 'hero' | 'item'

export type AppRoute =
  | { view: 'roster'; patchId: string }
  | { view: 'patterns'; kind: PatternKind; slug?: string }

function stripHash(hash: string): string {
  return decodeURIComponent(hash.replace(/^#/, '')).replace(/^\/+|\/+$/g, '')
}

export function parseHash(hash: string): AppRoute {
  const raw = stripHash(hash)
  if (
    raw === 'patterns' ||
    raw === 'patterns/heroes' ||
    raw === 'patterns/hero'
  ) {
    return { view: 'patterns', kind: 'hero' }
  }
  if (raw === 'patterns/items' || raw === 'patterns/item') {
    return { view: 'patterns', kind: 'item' }
  }
  const entity = raw.match(/^patterns\/(heroes|items|hero|item)\/([^/]+)$/)
  if (entity) {
    const kind: PatternKind =
      entity[1] === 'items' || entity[1] === 'item' ? 'item' : 'hero'
    return { view: 'patterns', kind, slug: entity[2] }
  }
  return { view: 'roster', patchId: raw }
}

export function patternsHash(kind: PatternKind, slug?: string): string {
  if (slug) return `#patterns/${kind}/${slug}`
  return kind === 'item' ? '#patterns/items' : '#patterns'
}
