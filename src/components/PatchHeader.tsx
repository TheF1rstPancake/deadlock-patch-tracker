import { formatPatchPulse } from '../lib/board.ts'
import type { HeroSentiment, Patch } from '../types.ts'

interface PatchHeaderProps {
  patch: Patch
  heroCount: number
  counts: Record<HeroSentiment, number>
}

export function PatchHeader({ patch, heroCount, counts }: PatchHeaderProps) {
  const formatted = formatDate(patch.date)
  const pulse = formatPatchPulse(counts)

  return (
    <header className="masthead">
      <p className="kicker">Hero roster · latest patch</p>
      <div className="masthead-row">
        <div>
          <h1>{patch.title}</h1>
          <p className="lede">
            {formatted} · {heroCount} {heroCount === 1 ? 'hero' : 'heroes'}{' '}
            touched
          </p>
          {pulse ? (
            <p className="pulse" aria-label="Patch shape">
              {pulse}
            </p>
          ) : null}
        </div>
        <a
          className="steam-link"
          href={patch.steamUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open on Steam
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </header>
  )
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}
