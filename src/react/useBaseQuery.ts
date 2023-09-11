import * as React from 'react'

import { QueryClient } from '../vanilla'
import { BaseQuery } from '../vanilla/baseQuery'
import {
  ObservableQueryOptions,
  ObservableQueryResult,
} from '../vanilla/observableQuery'
import { useQueryClient } from './QueryClientProvider'
import { useQueryErrorResetBoundary } from './QueryErrorResetBoundary'
import {
  ensurePreventErrorBoundaryRetry,
  getHasError,
  useClearResetErrorBoundary,
} from './errorBoundaryUtils'
import { ensureStaleTime, fetchOptimistic, shouldSuspend } from './suspense'

export type UseBseQueryOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData,
  TData = TFetcherData
> = ObservableQueryOptions<TFetcherData, TVars, TError, TQueryData, TData> & {
  query: BaseQuery<TFetcherData, TVars, TError, TQueryData>
}

export type UseBaseQueryResult<
  TData = unknown,
  TError = unknown
> = ObservableQueryResult<TData, TError>

export function useBaseQuery<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData,
  TData = TQueryData
>(
  options: UseBseQueryOptions<TFetcherData, TVars, TError, TQueryData, TData>,
  queryClient?: QueryClient
) {
  const client = useQueryClient(queryClient)
  const errorResetBoundary = useQueryErrorResetBoundary()
  const defaultedOptions = client.defaultQueryOptions(options)

  defaultedOptions._optimisticResults = true

  ensureStaleTime(defaultedOptions)
  ensurePreventErrorBoundaryRetry(defaultedOptions, errorResetBoundary)

  useClearResetErrorBoundary(errorResetBoundary)

  const [obsQuery] = React.useState(() => client.watchQuery(defaultedOptions))

  const result = obsQuery.getOptimisticResult(defaultedOptions)

  React.useSyncExternalStore(
    React.useCallback(
      onStoreChange => {
        const unsubscribe = obsQuery.subscribe(onStoreChange)

        // Update result to make sure we did not miss any query updates
        // between creating the observer and subscribing to it.
        obsQuery.updateResult()

        return unsubscribe
      },
      [obsQuery]
    ),
    () => obsQuery.getCurrentResult(),
    () => obsQuery.getCurrentResult()
  )

  React.useEffect(() => {
    // Do not notify on updates because of changes in the options because
    // these changes should already be reflected in the optimistic result.
    obsQuery.setOptions(defaultedOptions, { listeners: false })
  }, [defaultedOptions, obsQuery])

  // Handle suspense
  if (shouldSuspend(defaultedOptions, result)) {
    throw fetchOptimistic(defaultedOptions, obsQuery, errorResetBoundary)
  }

  // Handle error boundary
  if (
    getHasError(
      result,
      errorResetBoundary,
      obsQuery.getCurrentQueryInfo(),
      defaultedOptions.throwOnError
    )
  ) {
    throw result.error
  }

  // Handle result property usage tracking
  return obsQuery.trackResult(result)
}
