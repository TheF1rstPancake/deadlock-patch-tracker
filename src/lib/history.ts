import type { HistoryIndex, HistoryTarget } from '../types.ts'
import { slugifyName } from './slug.ts'

export function heroHistory(
  index: HistoryIndex,
  name: string,
): HistoryTarget | undefined {
  const slug = slugifyName(name)
  return (
    index.targets[`hero:${slug}`] ??
    Object.values(index.targets).find(
      (target) =>
        target.kind === 'hero' &&
        target.name.toLowerCase() === name.trim().toLowerCase(),
    )
  )
}

export function matchingHeroNames(
  index: HistoryIndex,
  query: string,
): string[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []
  const names = Object.values(index.targets)
    .filter(
      (target) =>
        target.kind === 'hero' && target.name.toLowerCase().includes(needle),
    )
    .map((target) => target.name)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}
