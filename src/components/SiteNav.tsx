import type { PatternKind } from '../lib/route.ts'

interface SiteNavProps {
  current: 'roster' | 'patterns'
  patternsKind?: PatternKind
}

export function SiteNav({ current, patternsKind = 'hero' }: SiteNavProps) {
  const patternsHref = patternsKind === 'item' ? '#patterns/items' : '#patterns'
  return (
    <nav className="site-nav" aria-label="Site">
      <a
        href="#"
        className={
          current === 'roster' ? 'site-nav-link is-current' : 'site-nav-link'
        }
        aria-current={current === 'roster' ? 'page' : undefined}
      >
        Roster
      </a>
      <a
        href={patternsHref}
        className={
          current === 'patterns' ? 'site-nav-link is-current' : 'site-nav-link'
        }
        aria-current={current === 'patterns' ? 'page' : undefined}
      >
        Patterns
      </a>
    </nav>
  )
}
