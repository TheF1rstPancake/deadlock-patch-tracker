import type { HeroSentiment } from '../types.ts'
import { SENTIMENT_LABEL } from '../lib/labels.ts'

export type SentimentFilter = 'all' | HeroSentiment

const FILTERS: SentimentFilter[] = [
  'all',
  'buff',
  'nerf',
  'mixed',
  'fix',
  'neutral',
]

interface FilterBarProps {
  filter: SentimentFilter
  onFilter: (next: SentimentFilter) => void
  query: string
  onQuery: (next: string) => void
  counts: Record<SentimentFilter, number>
}

export function FilterBar({
  filter,
  onFilter,
  query,
  onQuery,
  counts,
}: FilterBarProps) {
  return (
    <div className="toolbar">
      <div className="chips" role="tablist" aria-label="Filter by net change">
        {FILTERS.map((key) => {
          const label = key === 'all' ? 'All' : SENTIMENT_LABEL[key]
          const count = counts[key]
          const selected = filter === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`chip chip-${key}`}
              onClick={() => onFilter(key)}
            >
              {label}
              <span className="chip-count">{count}</span>
            </button>
          )
        })}
      </div>
      <label className="search">
        <span className="sr-only">Search heroes</span>
        <input
          type="search"
          value={query}
          placeholder="Find a hero"
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
    </div>
  )
}
