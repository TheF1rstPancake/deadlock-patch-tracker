export type LineTag = 'buff' | 'nerf' | 'neutral' | 'fix'
export type HeroSentiment = 'buff' | 'nerf' | 'mixed' | 'neutral' | 'fix'

export interface HeroChange {
  text: string
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
