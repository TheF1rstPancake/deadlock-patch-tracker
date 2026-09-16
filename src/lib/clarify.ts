const UNICODE_MINUS = '−'

function prettyMinus(value: string): string {
  return value.replace(/-/g, UNICODE_MINUS)
}

/**
 * Auto-paraphrase lines that friends routinely misread.
 * Never invent numbers — only restate what Steam already said.
 */
export function autoClarify(
  raw: string,
): { display: string; clarified: true } | { display?: undefined; clarified?: undefined } {
  const strongerCdr = raw.match(
    /^(.*?)\s+increased from\s+(-[\d.]+s)\s+Cooldown to\s+(-[\d.]+s)\s*$/i,
  )
  if (strongerCdr) {
    return {
      display: `${strongerCdr[1]}: cooldown reduction ${prettyMinus(strongerCdr[2])} → ${prettyMinus(strongerCdr[3])} (stronger CDR)`,
      clarified: true,
    }
  }

  const weakerCdr = raw.match(
    /^(.*?)\s+(?:reduced|decreased) from\s+(-[\d.]+s)\s+Cooldown to\s+(-[\d.]+s)\s*$/i,
  )
  if (weakerCdr) {
    return {
      display: `${weakerCdr[1]}: cooldown reduction ${prettyMinus(weakerCdr[2])} → ${prettyMinus(weakerCdr[3])} (weaker CDR)`,
      clarified: true,
    }
  }

  const manual = MANUAL_CLARIFICATIONS[raw]
  if (manual && manual !== raw) {
    return { display: manual, clarified: true }
  }

  return {}
}

/** Sep 16 (and similar) lines that are easy to misread as the opposite direction. */
export const MANUAL_CLARIFICATIONS: Record<string, string> = {
  'Crackshot T2 now also applies -6% Bullet Resistance for 5s':
    'Crackshot T2 also shreds 6% Bullet Resistance for 5s (on the target)',
  'Kinetic Carbine min damage multiplier reduced from 25% to 10% (max damage multiplier unaffected)':
    'Kinetic Carbine min-damage floor 25% → 10% (max unchanged)',
  'Kinetic Carbine min damage multiplier no longer gets increased by the T3':
    'Kinetic Carbine T3 no longer boosts the min-damage multiplier (close-range floor is weaker)',
  'Serrated Knives while rage is full now deals 3.5% current HP damage on impact instead of ricocheting (0.01 spirit scaling)':
    'Serrated Knives at full rage: 3.5% current HP on hit instead of ricochet (0.01 spirit scaling)',
  'Card Trick Diamond Bullet and Spirit Resist reduction reduced from -8% to -7%':
    'Card Trick Diamond Bullet / Spirit Resist shred weaker: −8% → −7%',
  'Card Trick T3 Diamond Bullet and Spirit Resist reduction reduced from -5% to -4%':
    'Card Trick T3 Diamond Bullet / Spirit Resist shred weaker: −5% → −4%',
  'Card Trick T3 Clubs slow from +20% to +15%':
    'Card Trick T3 Clubs slow weaker: +20% → +15%',
  'Seismic Impact T3 reduced from 6s Unstoppable to 5s':
    'Seismic Impact T3 Unstoppable 6s → 5s',
  'Gun falloff range reduced from 18m->54m to 16m->48m':
    'Gun falloff range shorter: 18m→54m becomes 16m→48m',
  'Splatter T1 reduced from +2m to +1.5m':
    'Splatter T1 bonus +2m → +1.5m',
  'Captivating Read T3 increased from +1m to +2m':
    'Captivating Read T3 bonus +1m → +2m',
  "Dashes and light melee's no longer pause your gun's cycle time":
    'Dashes and light melee no longer pause gun cycle time',
  'Weighted Bola now increases gravity during the debuff duration, and interrupts flying abilities (same rules as Phantom Strike)':
    'Weighted Bola now adds gravity and interrupts flight (same rules as Phantom Strike)',
}
