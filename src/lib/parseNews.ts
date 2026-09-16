const STEAM_TAG =
  /\[\/?(?:p|b|i|u|h[1-6]|list|\*|img|previewyoutube|strike|spoiler)[^\]]*\]/gi

export function stripSteamMarkup(contents: string): string {
  return contents
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\[url=[^\]]*\](.*?)\[\/url\]/gis, '$1')
    .replace(STEAM_TAG, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractSection(text: string, name: string): string | null {
  const re = new RegExp(`\\[\\s*${escapeRegExp(name)}\\s*\\]`, 'i')
  const start = text.search(re)
  if (start === -1) {
    const md = new RegExp(`^#{1,3}\\s*${escapeRegExp(name)}\\s*$`, 'im')
    const mdStart = text.search(md)
    if (mdStart === -1) return null
    const afterMd = text.slice(mdStart)
    const headerEnd = afterMd.indexOf('\n')
    const body = headerEnd === -1 ? '' : afterMd.slice(headerEnd + 1)
    const next = body.search(/\n#{1,3}\s+\S/)
    return (next === -1 ? body : body.slice(0, next)).trim()
  }

  const after = text.slice(start)
  const headerEnd = after.indexOf('\n')
  const body = headerEnd === -1 ? '' : after.slice(headerEnd + 1)
  const nextHeader = body.search(/\n\s*\[[^\]]+\]/)
  return (nextHeader === -1 ? body : body.slice(0, nextHeader)).trim()
}

export interface ParsedHeroLine {
  hero: string
  text: string
}

export function parseHeroLines(section: string): ParsedHeroLine[] {
  const lines: ParsedHeroLine[] = []
  for (const raw of section.split('\n')) {
    const line = raw.replace(/^>\s*/, '').trim()
    if (!line) continue
    const m = line.match(/^[-*•]\s*(.+?):\s*(.+)$/)
    if (!m) continue
    lines.push({ hero: m[1].trim(), text: m[2].trim() })
  }
  return lines
}

export function groupLinesByHero(
  lines: ParsedHeroLine[],
): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const line of lines) {
    const existing = grouped.get(line.hero)
    if (existing) existing.push(line.text)
    else grouped.set(line.hero, [line.text])
  }
  return grouped
}

export function patchDateFromTitle(
  title: string,
  unixSeconds: number,
): string {
  const m = title.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (m) {
    const month = m[1].padStart(2, '0')
    const day = m[2].padStart(2, '0')
    return `${m[3]}-${month}-${day}`
  }
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

export function steamNewsUrl(appid: number, gid: string): string {
  return `https://store.steampowered.com/news/app/${appid}/view/${gid}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
