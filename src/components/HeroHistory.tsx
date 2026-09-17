import type { HistoryTarget } from '../types.ts'
import { SENTIMENT_LABEL } from '../lib/labels.ts'

interface HeroHistoryProps {
  heroName: string
  history: HistoryTarget
  currentPatchId: string
  onSelectPatch: (id: string) => void
}

export function HeroHistory({
  heroName,
  history,
  currentPatchId,
  onSelectPatch,
}: HeroHistoryProps) {
  const touches = [...history.touches].sort((a, b) =>
    b.patchId.localeCompare(a.patchId),
  )
  if (touches.length === 0) return null

  return (
    <section className="hero-history" aria-label={`Patch history for ${heroName}`}>
      <p className="hero-history-lede">
        <strong>{heroName}</strong> touched in {touches.length}{' '}
        {touches.length === 1 ? 'patch' : 'patches'}
        <span className="hero-history-totals">
          {history.totals.buff} buff · {history.totals.nerf} nerf ·{' '}
          {history.totals.fix} fix · {history.totals.neutral} other
        </span>
      </p>
      <ul className="hero-history-list">
        {touches.map((touch) => (
          <li key={touch.patchId}>
            <button
              type="button"
              className={
                touch.patchId === currentPatchId
                  ? 'history-chip is-current'
                  : 'history-chip'
              }
              onClick={() => onSelectPatch(touch.patchId)}
            >
              {touch.patchId}
              <span className={`history-tag history-tag-${touch.tagSummary}`}>
                {SENTIMENT_LABEL[touch.tagSummary]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
