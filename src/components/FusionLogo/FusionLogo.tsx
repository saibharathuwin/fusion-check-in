import fusionLogoImg from '../../assets/fusion_logo_exact_transparent.png'

interface FusionLogoProps {
  /** 'light' = sits on a dark background, so the navy wordmark is wrapped in a white chip. 'dark' = sits directly on a light background. */
  variant?: 'light' | 'dark'
  width?: number
  className?: string
}

export function FusionLogo({ variant = 'light', width = 160, className = '' }: FusionLogoProps) {
  const img = (
    <img
      src={fusionLogoImg}
      alt="Fusion — Innovation & Entrepreneurship Network"
      style={{ width }}
      className="block h-auto"
    />
  )

  if (variant === 'light') {
    return <div className={`inline-flex items-center rounded-xl bg-white px-4 py-3 ${className}`}>{img}</div>
  }

  return <div className={className}>{img}</div>
}
