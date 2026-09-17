import { useState } from 'react'
import { heroInitials } from '../lib/labels.ts'
import { heroPortraitUrl } from '../lib/portraits.ts'

interface HeroPortraitProps {
  name: string
}

export function HeroPortrait({ name }: HeroPortraitProps) {
  const [failed, setFailed] = useState(false)
  const src = heroPortraitUrl(name)

  if (failed) {
    return (
      <div className="monogram" aria-hidden="true">
        {heroInitials(name)}
      </div>
    )
  }

  return (
    <div className="portrait">
      <img
        src={src}
        alt=""
        width={64}
        height={80}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
