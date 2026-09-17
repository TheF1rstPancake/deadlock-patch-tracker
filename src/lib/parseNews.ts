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

export interface ChangelogSection {
  name: string
  body: string
}

export type ChangelogLayout = 'sectioned' | 'flat' | 'prose'

export interface BulletLine {
  section: string
  raw: string
  name?: string
  text: string
}

const KNOWN_SECTION =
  /\b(?:heroes?|items?|general|weapon|vitality|spirit|gameplay|shop|map|movement|camera|brawl|urn|soul|sprint|misc|feel|optimi|build|quickbuy|damage report|sinner)/i

export function joinWrappedLines(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed) {
      out.push('')
      continue
    }
    const isHeader =
      /^\[[^\]]+\]$/.test(trimmed) || /^#{1,3}\s+\S/.test(trimmed)
    const isBullet = /^[-*•]\s+/.test(trimmed)
    const prev = out.length > 0 ? out[out.length - 1] : ''
    if (
      !isHeader &&
      !isBullet &&
      prev &&
      !/^\[[^\]]+\]$/.test(prev.trim()) &&
      !/^#{1,3}\s+/.test(prev.trim())
    ) {
      out[out.length - 1] = `${prev.trimEnd()} ${trimmed}`
    } else {
      out.push(trimmed)
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

export function listSectionHeaders(text: string): string[] {
  const headers: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    const bracket = trimmed.match(/^\[\s*([^\]]+?)\s*\]$/)
    if (bracket) {
      headers.push(collapseWs(bracket[1]))
      continue
    }
    const md = trimmed.match(/^#{1,3}\s+(.+)$/)
    if (md) headers.push(collapseWs(md[1]))
  }
  return unique(headers)
}

export function detectLayout(text: string): ChangelogLayout {
  const headers = listSectionHeaders(text)
  if (headers.some((name) => KNOWN_SECTION.test(name) || name.length <= 40)) {
    if (headers.some((name) => KNOWN_SECTION.test(name))) return 'sectioned'
  }
  if (hasBullet(text)) return 'flat'
  return 'prose'
}

export function splitSections(text: string): ChangelogSection[] {
  const normalized = joinWrappedLines(text)
  const lines = normalized.split('\n')
  const sections: ChangelogSection[] = []
  let current: ChangelogSection | null = null
  const preamble: string[] = []

  const push = (section: ChangelogSection | null) => {
    if (!section) return
    const body = section.body.trim()
    if (body) sections.push({ name: section.name, body })
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const header = matchSectionHeader(trimmed)
    if (header) {
      push(current)
      current = { name: header, body: '' }
      continue
    }
    if (current) {
      current.body += `${line}\n`
    } else if (trimmed) {
      preamble.push(line)
    }
  }
  push(current)

  if (sections.length === 0) {
    return [{ name: '', body: normalized.trim() }]
  }
  if (preamble.length > 0) {
    return [{ name: '', body: preamble.join('\n').trim() }, ...sections]
  }
  return sections
}

export function parseBulletLines(
  text: string,
  section = '',
): BulletLine[] {
  const bullets: BulletLine[] = []
  for (const rawLine of joinWrappedLines(text).split('\n')) {
    const line = rawLine.replace(/^>\s*/, '').trim()
    if (!line) continue
    const bullet = line.match(/^[-*•]\s+(.+)$/)
    if (!bullet) continue
    const body = bullet[1].trim()
    if (!body) continue
    const named = body.match(/^(.{1,80}?):\s+(.+)$/)
    if (named) {
      bullets.push({
        section,
        raw: body,
        name: named[1].trim(),
        text: named[2].trim(),
      })
    } else {
      bullets.push({ section, raw: body, text: body })
    }
  }
  return bullets
}

export function hasBullet(text: string): boolean {
  return /^[-*•]\s+\S/m.test(text)
}

function matchSectionHeader(trimmed: string): string | null {
  const bracket = trimmed.match(/^\[\s*([^\]]+?)\s*\]$/)
  if (bracket) return collapseWs(bracket[1])
  const md = trimmed.match(/^#{1,3}\s+(.+)$/)
  if (md) return collapseWs(md[1])
  return null
}

function collapseWs(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
