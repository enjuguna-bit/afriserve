import { useEffect } from 'react'
import { useUiStore } from '../../store/uiStore'

export function ThemeSync() {
  const theme = useUiStore((state) => state.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Also sync immediately on mount to avoid any flash
  // (effect runs after render, so we set it synchronously too)
  if (typeof document !== 'undefined') {
    const current = document.documentElement.getAttribute('data-theme')
    if (current !== theme) {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }

  return null
}
