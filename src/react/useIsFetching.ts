import * as React from 'react'

import type { QueryClient, QueryInfoFilters } from '../vanilla'
import { useQueryClient } from './QueryClientProvider'

export function useIsFetching(
  filters?: QueryInfoFilters,
  queryClient?: QueryClient
): number {
  const client = useQueryClient(queryClient)
  const queryCache = client.getQueryCache()

  return React.useSyncExternalStore(
    React.useCallback(
      onStoreChange => queryCache.subscribe(onStoreChange),
      [queryCache]
    ),
    () => client.isFetching(filters),
    () => client.isFetching(filters)
  )
}
