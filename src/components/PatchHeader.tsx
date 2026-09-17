import { formatPatchPulse } from '../lib/board.ts'
import type { HeroSentiment, HistoryPatchSummary, Patch } from '../types.ts'
import { PatchPicker } from './PatchPicker.tsx'

interface PatchHeaderProps {
  patch: Patch
  patches: HistoryPatchSummary[]
  heroCount: number
  counts: Record<HeroSentiment, number>
  onSelectPatch: (id: string) => void
}

export function PatchHeader({
  patch,
  patches,
  heroCount,
  counts,
  onSelectPatch,
}: PatchHeaderProps) {
  const formatted = formatDate(patch.date)
  const pulse = formatPatchPulse(counts)
  const kicker =
    patches.length > 1 ? 'Hero roster · patch history' : 'Hero roster · latest patch'

  return (
    <header className="masthead">
      <p className="kicker">{kicker}</p>
      <div className="masthead-row">
        <div>
          {patches.length > 1 ? (
            <PatchPicker
              patches={patches}
              selectedId={patch.id}
              onSelect={onSelectPatch}
            />
          ) : (
            <h1>{patch.title}</h1>
          )}
          {patches.length > 1 ? <h1>{patch.title}</h1> : null}
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
