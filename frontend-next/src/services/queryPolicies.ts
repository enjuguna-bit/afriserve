export const queryPolicies = {
  auth: {
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  },
  list: {
    staleTime: 45_000,
    gcTime: 10 * 60_000,
  },
  detail: {
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
  },
  report: {
    staleTime: 90_000,
    gcTime: 10 * 60_000,
  },
} as const
