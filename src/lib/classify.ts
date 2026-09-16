import type { HeroSentiment, LineTag } from '../types.ts'

const FIX_RE =
  /\b(?:fix(?:ed|es)?|bugfix|hotfix)\b|\bbug\b|collision issues/i

const UI_QOL_RE =
  /\b(?:target ui|ui when|hud|indicator|tooltip|visual(?:s)? cue)\b/i

const INVERTED_STAT_BEFORE_VERB =
  /\b(?:stamina\s+)?cooldown\b(?!\s+reduction)|\bcharge time\b|\bdelay\b|\bcost\b/i

/**
 * Classify a single changelog line (the text after `Hero:`).
 *
 * Order matters — see README "Classification heuristic".
 */
export function classifyLine(text: string): LineTag {
  const t = text.trim()
  if (!t) return 'neutral'

  if (FIX_RE.test(t)) return 'fix'
  if (UI_QOL_RE.test(t)) return 'fix'

  // Reworks that swap one behavior for another are not a clear +/-.
  if (/\binstead of\b/i.test(t)) return 'neutral'

  if (/\bcan only\b/i.test(t)) return 'nerf'

  if (/\bno longer\b/i.test(t)) {
    // Removing a downside (pause, restart, getting stuck) is a buff.
    if (
      /\bno longer\s+(?:pause|restart|cancel|interrupt your|get(?:s|ting)? caught)/i.test(
        t,
      )
    ) {
      return 'buff'
    }
    return 'nerf'
  }

  const signedCdr = matchSignedCooldownReduction(t)
  if (signedCdr) return signedCdr

  const cooldownVerb = matchInvertedStatVerb(t)
  if (cooldownVerb) return cooldownVerb

  if (/\b(?:increased|raised)\b/i.test(t)) return 'buff'
  if (/\b(?:reduced|decreased|lowered|nerfed)\b/i.test(t)) return 'nerf'

  const fromTo = t.match(
    /\bfrom\s+([+-]?[\d.]+)\s*%?\s+to\s+([+-]?[\d.]+)/i,
  )
  if (fromTo) {
    const from = Number.parseFloat(fromTo[1])
    const to = Number.parseFloat(fromTo[2])
    if (!Number.isNaN(from) && !Number.isNaN(to) && from !== to) {
      return to > from ? 'buff' : 'nerf'
    }
  }

  if (
    /\bnow also\b/i.test(t) ||
    /\bnow works\b/i.test(t) ||
    /\bcan now\b/i.test(t) ||
    /\bnow scales\b/i.test(t) ||
    /\bnow grants\b/i.test(t) ||
    /\bnow increases\b/i.test(t) ||
    /\bnow deals\b/i.test(t) ||
    /\bnow builds\b/i.test(t) ||
    /\bnow also applies\b/i.test(t)
  ) {
    return 'buff'
  }

  return 'neutral'
}

/**
 * Signed talent CDR: −11s → −14s is a stronger reduction (buff).
 * Absolute ability CD (positive seconds) is handled by matchInvertedStatVerb.
 */
function matchSignedCooldownReduction(text: string): LineTag | null {
  if (!/\bcooldown\b/i.test(text)) return null
  const m = text.match(
    /from\s+(-[\d.]+)\s*s?\s+.*?to\s+(-[\d.]+)\s*s?/i,
  )
  if (!m) return null
  const from = Number.parseFloat(m[1])
  const to = Number.parseFloat(m[2])
  if (Number.isNaN(from) || Number.isNaN(to) || from >= 0 || to >= 0) {
    return null
  }
  return to < from ? 'buff' : 'nerf'
}

/**
 * "Dazzling Trick cooldown increased" → the cooldown itself changed (inverted).
 * "Captivating Read T1 increased from -11s Cooldown" → signed CDR (handled above).
 */
function matchInvertedStatVerb(text: string): LineTag | null {
  const increased = /\bincreased\b/i
  const decreased = /\b(?:reduced|decreased|lowered)\b/i

  const cooldownIdx = indexOf(text, INVERTED_STAT_BEFORE_VERB)
  if (cooldownIdx === -1) return null

  const incIdx = indexOf(text, increased)
  const decIdx = indexOf(text, decreased)

  const verbIsAfterStat = (verbIdx: number) =>
    verbIdx !== -1 && verbIdx > cooldownIdx

  if (verbIsAfterStat(incIdx) && (decIdx === -1 || incIdx < decIdx)) {
    return 'nerf'
  }
  if (verbIsAfterStat(decIdx) && (incIdx === -1 || decIdx < incIdx)) {
    return 'buff'
  }
  return null
}

function indexOf(text: string, re: RegExp): number {
  const flags = re.flags.replace('g', '')
  const copy = new RegExp(re.source, flags)
  const m = copy.exec(text)
  return m ? m.index : -1
}

/**
 * Roll line tags up to a hero card sentiment.
 *
 * - Buff + nerf (fixes ignored for direction) → mixed
 * - Only buffs (fixes/neutrals allowed) → buff
 * - Only nerfs → nerf
 * - Bugfixes / UI alone (no combat direction) → fix, not buff
 * - Only neutrals → neutral
 */
export function netSentiment(tags: readonly LineTag[]): HeroSentiment {
  const hasBuff = tags.includes('buff')
  const hasNerf = tags.includes('nerf')
  if (hasBuff && hasNerf) return 'mixed'
  if (hasBuff) return 'buff'
  if (hasNerf) return 'nerf'

  const hasFix = tags.includes('fix')
  const remainder = tags.filter((t) => t !== 'fix' && t !== 'neutral')
  if (hasFix && remainder.length === 0) return 'fix'
  if (tags.every((t) => t === 'neutral') || tags.length === 0) return 'neutral'
  return 'neutral'
}
