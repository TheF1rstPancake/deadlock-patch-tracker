import { useEffect, useMemo, useState } from 'react'
import { FilterBar, type SentimentFilter } from './components/FilterBar.tsx'
import { HeroCard } from './components/HeroCard.tsx'
import { HeroHistory } from './components/HeroHistory.tsx'
import { PatchHeader } from './components/PatchHeader.tsx'
import { sortHeroesForFriendScan } from './lib/board.ts'
import { heroHistory, matchingHeroNames } from './lib/history.ts'
import {
  loadHistoryIndex,
  loadPatchById,
} from './lib/loadPatches.ts'
import type { HeroSentiment, Patch } from './types.ts'

const EMPTY_COUNTS: Record<SentimentFilter, number> = {
  all: 0,
  buff: 0,
  nerf: 0,
  mixed: 0,
  fix: 0,
  neutral: 0,
}

function patchIdFromHash(): string {
  return window.location.hash.replace(/^#/, '')
}

export default function App() {
  const index = useMemo(() => loadHistoryIndex(), [])
  const patchSummaries = index.patches
  const latestId = patchSummaries[0]?.id ?? ''
  const [patchId, setPatchId] = useState(
    () => patchIdFromHash() || latestId,
  )
  const [patch, setPatch] = useState<Patch | null>(null)
  const [filter, setFilter] = useState<SentimentFilter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onHash = () => {
      const next = patchIdFromHash()
      if (next) setPatchId(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadPatchById(patchId).then((next) => {
      if (cancelled) return
      if (next) {
        setPatch(next)
        return
      }
      if (latestId && patchId !== latestId) setPatchId(latestId)
    })
    return () => {
      cancelled = true
    }
  }, [latestId, patchId])

  const selectPatch = (id: string) => {
    setPatchId(id)
    const url = new URL(window.location.href)
    url.hash = id
    window.history.replaceState(null, '', url)
  }

  const counts = useMemo(() => {
    const next = { ...EMPTY_COUNTS, all: patch?.heroes.length ?? 0 }
    for (const hero of patch?.heroes ?? []) {
      next[hero.sentiment] += 1
    }
    return next
  }, [patch])

  const heroes = useMemo(() => {
    if (!patch) return []
    const needle = query.trim().toLowerCase()
    const filtered = patch.heroes.filter((hero) => {
      if (filter !== 'all' && hero.sentiment !== filter) return false
      if (needle && !hero.name.toLowerCase().includes(needle)) return false
      return true
    })
    return sortHeroesForFriendScan(filtered)
  }, [filter, patch, query])

  const visibleSentiments = useMemo(() => {
    const set = new Set<HeroSentiment>()
    for (const hero of heroes) set.add(hero.sentiment)
    return set
  }, [heroes])

  const historyHeroName = useMemo(() => {
    const matches = matchingHeroNames(index, query)
    if (matches.length === 1) return matches[0]
    const exact = matches.find(
      (name) => name.toLowerCase() === query.trim().toLowerCase(),
    )
    return exact
  }, [index, query])

  const history = historyHeroName
    ? heroHistory(index, historyHeroName)
    : undefined

  if (!patch) {
    return (
      <div className="shell">
        <p className="empty">Loading patch…</p>
      </div>
    )
  }

  return (
    <div className="shell">
      <PatchHeader
        patch={patch}
        patches={patchSummaries}
        heroCount={patch.heroes.length}
        counts={counts}
        onSelectPatch={selectPatch}
      />
      <FilterBar
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        counts={counts}
      />
      {history && historyHeroName ? (
        <HeroHistory
          heroName={historyHeroName}
          history={history}
          currentPatchId={patch.id}
          onSelectPatch={selectPatch}
        />
      ) : null}
      <p className="provenance">
        Clarified = we rephrased for clarity; tap the chip to see the Steam
        line.
      </p>
      <main>
        {heroes.length === 0 ? (
          <p className="empty">No heroes match that filter.</p>
        ) : (
          <section className="hero-grid" aria-label="Heroes touched in this patch">
            {heroes.map((hero) => (
              <HeroCard key={hero.name} hero={hero} />
            ))}
          </section>
        )}
        {visibleSentiments.size > 0 && (
          <p className="legend">
            <span className="legend-buff">+ buff</span>
            <span className="legend-nerf">− nerf</span>
            <span className="legend-neutral">~ rework / unclear</span>
            <span className="legend-fix">✓ fix</span>
          </p>
        )}
      </main>
    </div>
  )
}
