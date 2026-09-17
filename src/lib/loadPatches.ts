import type { HistoryIndex, Patch } from '../types.ts'
import historyIndex from '../../data/index.json'

const patchLoaders = import.meta.glob('../../data/patches/*.json', {
  import: 'default',
}) as Record<string, () => Promise<Patch>>

export function loadHistoryIndex(): HistoryIndex {
  return historyIndex as HistoryIndex
}

export function listPatchIds(): string[] {
  return loadHistoryIndex()
    .patches.slice()
    .sort((a, b) => {
      const byDate = b.date.localeCompare(a.date)
      if (byDate !== 0) return byDate
      return b.id.localeCompare(a.id)
    })
    .map((patch) => patch.id)
}

function loaderFor(id: string): (() => Promise<Patch>) | undefined {
  const path = Object.keys(patchLoaders).find((file) =>
    file.endsWith(`/${id}.json`),
  )
  return path ? patchLoaders[path] : undefined
}

export async function loadPatchById(id: string): Promise<Patch | undefined> {
  const load = loaderFor(id)
  if (!load) return undefined
  return load()
}

export async function loadAllPatches(): Promise<Patch[]> {
  const ids = listPatchIds()
  const patches = await Promise.all(ids.map((id) => loadPatchById(id)))
  return patches.filter((patch): patch is Patch => Boolean(patch))
}

export async function loadLatestPatch(): Promise<Patch> {
  const ids = listPatchIds()
  for (const id of ids) {
    const patch = await loadPatchById(id)
    if (patch) return patch
  }
  throw new Error('No patch JSON found in data/patches')
}
