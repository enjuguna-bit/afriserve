type AfriserveLogoProps = {
  alt?: string
  className?: string
}

export function AfriserveLogo({ alt = 'Afriserve', className }: AfriserveLogoProps) {
  return <img src="/afriserve-logo.svg" alt={alt} className={className} />
}
