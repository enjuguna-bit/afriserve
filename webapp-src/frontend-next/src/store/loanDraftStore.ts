import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type LoanDraftValues = {
  clientId?: number
  principal?: number
  termWeeks?: number
  productId?: number
  purpose?: string
}

export const defaultLoanDraftValues: LoanDraftValues = {
  clientId: undefined,
  principal: undefined,
  termWeeks: undefined,
  productId: undefined,
  purpose: '',
}

type LoanDraftState = {
  step: number
  values: LoanDraftValues
  updatedAt: string | null
  setStep: (step: number) => void
  patchValues: (values: Partial<LoanDraftValues>) => void
  reset: () => void
}

export const useLoanDraftStore = create<LoanDraftState>()(
  persist(
    (set) => ({
      step: 0,
      values: defaultLoanDraftValues,
      updatedAt: null,
      setStep: (step) => set({ step }),
      patchValues: (values) => set((state) => ({
        values: {
          ...state.values,
          ...values,
        },
        updatedAt: new Date().toISOString(),
      })),
      reset: () => set({
        step: 0,
        values: defaultLoanDraftValues,
        updatedAt: null,
      }),
    }),
    {
      name: 'afriserve-loan-draft',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        step: state.step,
        values: state.values,
        updatedAt: state.updatedAt,
      }),
    },
  ),
)
