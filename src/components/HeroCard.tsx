import type { HeroPatch } from '../types.ts'
import { changeDisplay, changeRaw } from '../types.ts'
import { SENTIMENT_LABEL, LINE_GLYPH, LINE_LABEL, heroInitials } from '../lib/labels.ts'

interface HeroCardProps {
  hero: HeroPatch
}

export function HeroCard({ hero }: HeroCardProps) {
  const changeLabel = hero.changes.length === 1 ? 'change' : 'changes'

  return (
    <article className={`hero-card sentiment-${hero.sentiment}`}>
      <header className="hero-card-head">
        <div className="monogram" aria-hidden="true">
          {heroInitials(hero.name)}
        </div>
        <div className="hero-card-titles">
          <h2>{hero.name}</h2>
          <p className="hero-meta">
            {hero.changes.length} {changeLabel}
          </p>
        </div>
        <span className={`badge badge-${hero.sentiment}`}>
          {SENTIMENT_LABEL[hero.sentiment]}
        </span>
      </header>
      <ul className="change-list">
        {hero.changes.map((change) => {
          const raw = changeRaw(change)
          return (
            <li key={raw} className={`change change-${change.tag}`}>
              <span className="glyph" aria-hidden="true">
                {LINE_GLYPH[change.tag]}
              </span>
              <span className="change-text">
                <span className="sr-only">{LINE_LABEL[change.tag]}: </span>
                {changeDisplay(change)}
                {change.clarified ? (
                  <details className="clarified">
                    <summary title={`Steam: ${raw}`}>Clarified</summary>
                    <p>Steam: {raw}</p>
                  </details>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
