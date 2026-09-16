import type { HeroSentiment, LineTag } from '../types.ts'

export const SENTIMENT_LABEL: Record<HeroSentiment, string> = {
  buff: 'Buff',
  nerf: 'Nerf',
  mixed: 'Mixed',
  fix: 'Fix',
  neutral: 'Neutral',
}

export const LINE_GLYPH: Record<LineTag, string> = {
  buff: '+',
  nerf: '−',
  fix: '✓',
  neutral: '~',
}

export const LINE_LABEL: Record<LineTag, string> = {
  buff: 'Buff',
  nerf: 'Nerf',
  fix: 'Fix',
  neutral: 'Neutral',
}

export function heroInitials(name: string): string {
  const parts = name.split(/\s+/).filter((part) => part !== '&')
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}
