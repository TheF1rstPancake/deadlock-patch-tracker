import type { HeroPatch, HeroSentiment } from '../types.ts'

/** Friend-scan order: buffs first, then nerfs, mixed, fix, name. */
export const FRIEND_SCAN_ORDER: Record<HeroSentiment, number> = {
  buff: 0,
  nerf: 1,
  mixed: 2,
  fix: 3,
  neutral: 4,
}

const PULSE_KEYS: HeroSentiment[] = ['buff', 'nerf', 'mixed', 'fix', 'neutral']

export function sortHeroesForFriendScan<T extends Pick<HeroPatch, 'name' | 'sentiment'>>(
  heroes: readonly T[],
): T[] {
  return [...heroes].sort((a, b) => {
    const bySentiment =
      FRIEND_SCAN_ORDER[a.sentiment] - FRIEND_SCAN_ORDER[b.sentiment]
    if (bySentiment !== 0) return bySentiment
    return a.name.localeCompare(b.name)
  })
}

export function formatPatchPulse(
  counts: Partial<Record<HeroSentiment, number>>,
): string {
  return PULSE_KEYS.filter((key) => (counts[key] ?? 0) > 0)
    .map((key) => `${counts[key]} ${key}`)
    .join(' · ')
}
