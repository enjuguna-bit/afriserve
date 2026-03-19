import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ClientFormValues } from '../features/clients/pages/shared/clientFormSchema'

export const defaultClientDraftValues: ClientFormValues = {
  fullName: '',
  phone: '',
  nationalId: '',
  kraPin: '',
  nextOfKinName: '',
  nextOfKinPhone: '',
  nextOfKinRelation: '',
  businessType: '',
  businessYears: undefined,
  businessLocation: '',
  residentialAddress: '',
  isActive: true,
}

type ClientDraftState = {
  step: number
  values: ClientFormValues
  updatedAt: string | null
  setStep: (step: number) => void
  patchValues: (values: Partial<ClientFormValues>) => void
  reset: () => void
}

export const useClientDraftStore = create<ClientDraftState>()(
  persist(
    (set) => ({
      step: 0,
      values: defaultClientDraftValues,
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
        values: defaultClientDraftValues,
        updatedAt: null,
      }),
    }),
    {
      name: 'afriserve-client-draft',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        step: state.step,
        values: state.values,
        updatedAt: state.updatedAt,
      }),
    },
  ),
)
