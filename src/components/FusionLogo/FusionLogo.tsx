import fusionLogoImg from '../../assets/fusion_logo.png'

interface FusionLogoProps {
  /**
   * 'light' = sits on a dark background, so the navy wordmark is wrapped in a white chip.
   * 'dark' = sits directly on a light background, logo rendered as-is.
   * 'white' = sits directly on a dark background with no chip — the logo image itself has no
   * white variant on disk, so this recolors it to solid white via a CSS filter instead (loses the
   * yellow/blue accent colors, but stays legible with no visual "box" behind it).
   */
  variant?: 'light' | 'dark' | 'white'
  width?: number
  className?: string
}

export function FusionLogo({ variant = 'light', width = 160, className = '' }: FusionLogoProps) {
  const img = (
    <img
      src={fusionLogoImg}
      alt="Fusion: Innovation & Entrepreneurship Network"
      style={variant === 'white' ? { width, filter: 'brightness(0) invert(1)' } : { width }}
      className="block h-auto"
    />
  )

  if (variant === 'light') {
    return <div className={`inline-flex items-center rounded-xl bg-white px-4 py-3 ${className}`}>{img}</div>
  }

  return <div className={className}>{img}</div>
}
