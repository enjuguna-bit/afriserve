import { create } from 'zustand'

type DashboardUiState = {
  isFilterOpen: boolean
  openFilter: () => void
  closeFilter: () => void
}

export const useDashboardStore = create<DashboardUiState>((set) => ({
  isFilterOpen: false,
  openFilter: () => set({ isFilterOpen: true }),
  closeFilter: () => set({ isFilterOpen: false }),
}))