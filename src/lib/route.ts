export type PatternKind = 'hero' | 'item'
export type PatternDetailLens = 'across' | 'day'

export type AppRoute =
  | { view: 'roster'; patchId: string }
  | {
      view: 'patterns'
      kind: PatternKind
      slug?: string
      lens?: PatternDetailLens
      focusPatchId?: string
    }

function stripHash(hash: string): string {
  return decodeURIComponent(hash.replace(/^#/, '')).replace(/^\/+|\/+$/g, '')
}

function parseLens(raw: string | null): PatternDetailLens | undefined {
  if (raw === 'day' || raw === 'across') return raw
  return undefined
}

export function parseHash(hash: string): AppRoute {
  const decoded = stripHash(hash)
  const qIndex = decoded.indexOf('?')
  const raw = qIndex === -1 ? decoded : decoded.slice(0, qIndex)
  const query = qIndex === -1 ? '' : decoded.slice(qIndex + 1)
  const params = new URLSearchParams(query)

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
    const lens = parseLens(params.get('lens'))
    const focusPatchId = params.get('patch') || undefined
    return {
      view: 'patterns',
      kind,
      slug: entity[2],
      ...(lens ? { lens } : {}),
      ...(focusPatchId ? { focusPatchId } : {}),
    }
  }
  return { view: 'roster', patchId: raw }
}

export function patternsHash(
  kind: PatternKind,
  slug?: string,
  opts?: { lens?: PatternDetailLens; patch?: string },
): string {
  if (!slug) return kind === 'item' ? '#patterns/items' : '#patterns'
  const params = new URLSearchParams()
  if (opts?.lens) params.set('lens', opts.lens)
  if (opts?.patch) {
    if (!opts.lens) params.set('lens', 'day')
    params.set('patch', opts.patch)
  }
  const query = params.toString()
  return query
    ? `#patterns/${kind}/${slug}?${query}`
    : `#patterns/${kind}/${slug}`
}
