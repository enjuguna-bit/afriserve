export const queryPolicies = {
  auth: {
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  },
  list: {
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    retry: 1,
  },
  detail: {
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
  },
  report: {
    staleTime: 90_000,
    gcTime: 10 * 60_000,
    // Reports are expensive — don't silently retry on failure.
    // Show the error immediately so the user can decide whether to retry.
    retry: false,
  },
} as const
