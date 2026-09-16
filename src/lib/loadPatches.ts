import type { Patch } from '../types.ts'

const modules = import.meta.glob('../../data/patches/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Patch>

export function loadAllPatches(): Patch[] {
  return Object.values(modules).sort((a, b) => b.date.localeCompare(a.date))
}

export function loadLatestPatch(): Patch {
  const patches = loadAllPatches()
  if (patches.length === 0) {
    throw new Error('No patch JSON found in data/patches')
  }
  return patches[0]
}
