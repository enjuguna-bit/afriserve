import { create } from 'zustand'

type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'ui_theme'

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'dark' ? 'dark' : 'light'
}

function readInitialSidebarOpen(): boolean {
  if (typeof window === 'undefined') {
    return true
  }
  return window.innerWidth > 900
}

type UiState = {
  sidebarOpen: boolean
  theme: Theme
  toggleSidebar: () => void
  setTheme: (theme: Theme) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: readInitialSidebarOpen(),
  theme: readStoredTheme(),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
    set({ theme })
  },
}))
