import { useEffect, useState } from 'react'
import { PatternsView } from './components/PatternsView.tsx'
import { RosterView } from './components/RosterView.tsx'
import { parseHash } from './lib/route.ts'

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const sync = () => setHash(window.location.hash)
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  const route = parseHash(hash)
  if (route.view === 'patterns') {
    return <PatternsView kind={route.kind} slug={route.slug} />
  }
  return <RosterView />
}
