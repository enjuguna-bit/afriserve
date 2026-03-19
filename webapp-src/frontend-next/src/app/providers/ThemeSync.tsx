import { useEffect } from 'react'
import { useUiStore } from '../../store/uiStore'

export function ThemeSync() {
  const theme = useUiStore((state) => state.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return null
}
