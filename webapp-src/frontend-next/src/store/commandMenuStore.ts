import { create } from 'zustand'

type CommandMenuState = {
  isOpen: boolean
  query: string
  open: () => void
  close: () => void
  toggle: () => void
  setQuery: (query: string) => void
  reset: () => void
}

export const useCommandMenuStore = create<CommandMenuState>((set) => ({
  isOpen: false,
  query: '',
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setQuery: (query) => set({ query }),
  reset: () => set({ isOpen: false, query: '' }),
}))
