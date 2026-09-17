import { useMemo, useState } from 'react'
import { FilterBar, type SentimentFilter } from './components/FilterBar.tsx'
import { HeroCard } from './components/HeroCard.tsx'
import { PatchHeader } from './components/PatchHeader.tsx'
import { sortHeroesForFriendScan } from './lib/board.ts'
import { loadLatestPatch } from './lib/loadPatches.ts'
import type { HeroSentiment } from './types.ts'

const EMPTY_COUNTS: Record<SentimentFilter, number> = {
  all: 0,
  buff: 0,
  nerf: 0,
  mixed: 0,
  fix: 0,
  neutral: 0,
}

export default function App() {
  const patch = loadLatestPatch()
  const [filter, setFilter] = useState<SentimentFilter>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const next = { ...EMPTY_COUNTS, all: patch.heroes.length }
    for (const hero of patch.heroes) {
      next[hero.sentiment] += 1
    }
    return next
  }, [patch])

  const heroes = useMemo(() => {
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

  return (
    <div className="shell">
      <PatchHeader
        patch={patch}
        heroCount={patch.heroes.length}
        counts={counts}
      />
      <FilterBar
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        counts={counts}
      />
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
