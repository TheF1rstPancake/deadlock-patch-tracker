export type LineTag = 'buff' | 'nerf' | 'neutral' | 'fix'
export type HeroSentiment = 'buff' | 'nerf' | 'mixed' | 'neutral' | 'fix'

export interface HeroChange {
  /** Exact Steam / changelog wording. */
  raw: string
  /** Clarified line for the board. When omitted, UI shows `raw`. */
  display?: string
  /** True when `display` is our paraphrase, not Valve’s text. */
  clarified?: boolean
  tag: LineTag
  /** When true, ingest will keep this tag on refresh. */
  override?: boolean
}

export interface HeroPatch {
  name: string
  sentiment: HeroSentiment
  /** When true, ingest will keep this sentiment on refresh. */
  override?: boolean
  changes: HeroChange[]
}

export interface Patch {
  id: string
  title: string
  date: string
  steamUrl: string
  gid: string
  appid: number
  heroes: HeroPatch[]
}

export function changeRaw(change: HeroChange): string {
  return change.raw
}

export function changeDisplay(change: HeroChange): string {
  return change.display ?? change.raw
}
