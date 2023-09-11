// This defines the `UseQueryOptions` that are accepted in `QueriesOptions` & `GetOptions`.
import * as React from 'react'

import { InfiniteData, InfiniteQuery, Query, QueryClient } from '../vanilla'
import {
  ObservableQueriesOptions,
  createObservableQueries,
} from '../vanilla/observableQueries'
import { useQueryClient } from './QueryClientProvider'
import { useQueryErrorResetBoundary } from './QueryErrorResetBoundary'
import {
  ensurePreventErrorBoundaryRetry,
  getHasError,
  useClearResetErrorBoundary,
} from './errorBoundaryUtils'
import {
  ensureStaleTime,
  fetchOptimistic,
  shouldSuspend,
  willFetch,
} from './suspense'
import {
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseQueryOptions,
  UseQueryResult,
} from './useQuery'

type QueriesPlaceholderDataFunction<TQueryData> = () => TQueryData | undefined

// `placeholderData` function does not have a parameter
type UseQueryOptionsForUseQueries<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = TFetcherData
> = Omit<
  UseQueryOptions<TFetcherData, TVars, TError, TData>,
  'placeholderData' | 'suspense'
> & {
  placeholderData?: TFetcherData | QueriesPlaceholderDataFunction<TFetcherData>
}

type UseInfiniteQueryOptionsForUseQueries<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = InfiniteData<TFetcherData>
> = Omit<
  UseInfiniteQueryOptions<TFetcherData, TVars, TError, TData>,
  'placeholderData' | 'suspense'
> & {
  placeholderData?:
    | InfiniteData<TFetcherData>
    | QueriesPlaceholderDataFunction<InfiniteData<TFetcherData>>
}

// Avoid TS depth-limit error in case of large array literal
type MAXIMUM_DEPTH = 20

type GetOptions<T> = T extends {
  query: InfiniteQuery<infer TFetcherData, infer TVars, infer TError>
  select: (data: any) => infer TData
}
  ? UseInfiniteQueryOptionsForUseQueries<TFetcherData, TVars, TError, TData>
  : T extends {
      query: InfiniteQuery<infer TFetcherData, infer TVars, infer TError>
    }
  ? UseInfiniteQueryOptionsForUseQueries<TFetcherData, TVars, TError>
  : T extends {
      query: Query<infer TFetcherData, infer TVars, infer TError>
      select: (data: any) => infer TData
    }
  ? UseQueryOptionsForUseQueries<TFetcherData, TVars, TError, TData>
  : T extends {
      query: Query<infer TFetcherData, infer TVars, infer TError>
    }
  ? UseQueryOptionsForUseQueries<TFetcherData, TVars, TError, TFetcherData>
  : UseQueryOptionsForUseQueries

type GetResults<T> = T extends {
  query: InfiniteQuery<any, any, infer TError>
  select: (data: any) => infer TData
}
  ? UseInfiniteQueryResult<TData, TError>
  : T extends {
      query: InfiniteQuery<infer TFetcherData, any, infer TError>
    }
  ? UseInfiniteQueryResult<InfiniteData<TFetcherData>, TError>
  : T extends {
      query: Query<any, any, infer TError>
      select: (data: any) => infer TData
    }
  ? UseQueryResult<TData, TError>
  : T extends {
      query: Query<infer TFetcherData, any, infer TError>
    }
  ? UseQueryResult<TFetcherData, TError>
  : UseQueryResult

/**
 * QueriesOptions reducer recursively unwraps function arguments to infer/enforce type param
 */
export type QueriesOptions<
  T extends any[],
  Result extends any[] = [],
  Depth extends ReadonlyArray<number> = []
> = Depth['length'] extends MAXIMUM_DEPTH
  ? UseQueryOptionsForUseQueries[]
  : T extends []
  ? []
  : T extends [infer Head]
  ? [...Result, GetOptions<Head>]
  : T extends [infer Head, ...infer Tail]
  ? QueriesOptions<[...Tail], [...Result, GetOptions<Head>], [...Depth, 1]>
  : unknown[] extends T
  ? T
  : // If T is *some* array but we couldn't assign unknown[] to it, then it must hold some known/homogenous type!
  // use this to infer the param types in the case of Array.map() argument
  T extends UseQueryOptionsForUseQueries<
      infer TFetcherData,
      infer TVars,
      infer TError
    >[]
  ? UseQueryOptionsForUseQueries<TFetcherData, TVars, TError>[]
  : // Fallback
    UseQueryOptionsForUseQueries[]

/**
 * QueriesResults reducer recursively maps type param to results
 */
export type QueriesResults<
  T extends any[],
  Result extends any[] = [],
  Depth extends ReadonlyArray<number> = []
> = Depth['length'] extends MAXIMUM_DEPTH
  ? UseQueryOptionsForUseQueries[]
  : T extends []
  ? []
  : T extends [infer Head]
  ? [...Result, GetResults<Head>]
  : T extends [infer Head, ...infer Tail]
  ? QueriesResults<[...Tail], [...Result, GetResults<Head>], [...Depth, 1]>
  : T extends UseQueryOptionsForUseQueries<
      infer TFetcherData,
      any,
      infer TError,
      any
    >[]
  ? // Dynamic-size (homogenous) UseQueryOptions array: map directly to array of results
    UseQueryResult<TFetcherData, TError>[]
  : // Fallback
    UseQueryResult[]

export function useQueries<
  T extends any[],
  TCombinedResult = QueriesResults<T>
>(
  {
    queries,
    ...options
  }: {
    queries: readonly [...QueriesOptions<T>]
    combine?: (result: QueriesResults<T>) => TCombinedResult
  },
  queryClient?: QueryClient
): TCombinedResult {
  const client = useQueryClient(queryClient)
  const errorResetBoundary = useQueryErrorResetBoundary()

  const defaultedQueries = React.useMemo(
    () =>
      queries.map(opts => {
        const defaultedOptions = client.defaultQueryOptions(opts)
        defaultedOptions._optimisticResults = true
        return defaultedOptions
      }),
    [queries, client]
  )

  defaultedQueries.forEach(query => {
    ensureStaleTime(query)
    ensurePreventErrorBoundaryRetry(query, errorResetBoundary)
  })

  useClearResetErrorBoundary(errorResetBoundary)

  const [obsQueries] = React.useState(() =>
    createObservableQueries<TCombinedResult>(
      client,
      defaultedQueries,
      options as ObservableQueriesOptions<TCombinedResult>
    )
  )

  const [optimisticResult, getCombinedResult, trackResult] =
    obsQueries.getOptimisticResult(defaultedQueries)

  React.useSyncExternalStore(
    React.useCallback(
      onStoreChange => obsQueries.subscribe(onStoreChange),
      [obsQueries]
    ),
    () => obsQueries.getCurrentResult(),
    () => obsQueries.getCurrentResult()
  )

  React.useEffect(() => {
    // Do not notify on updates because of changes in the options because
    // these changes should already be reflected in the optimistic result.
    obsQueries.setQueries(
      defaultedQueries,
      options as ObservableQueriesOptions<TCombinedResult>,
      {
        listeners: false,
      }
    )
  }, [defaultedQueries, options, obsQueries])

  const shouldAtLeastOneSuspend = optimisticResult.some((result, index) =>
    shouldSuspend(defaultedQueries[index], result)
  )

  const suspensePromises = shouldAtLeastOneSuspend
    ? optimisticResult.flatMap((result, index) => {
        const opts = defaultedQueries[index]
        const queryObserver = obsQueries.getObservableQueries()[index]

        if (opts && queryObserver) {
          if (shouldSuspend(opts, result)) {
            return fetchOptimistic(opts, queryObserver, errorResetBoundary)
          } else if (willFetch(result)) {
            void fetchOptimistic(opts, queryObserver, errorResetBoundary)
          }
        }
        return []
      })
    : []

  if (suspensePromises.length > 0) {
    throw Promise.all(suspensePromises)
  }
  const observableQueries = obsQueries.getQueries()
  const firstSingleResultWhichShouldThrow = optimisticResult.find(
    (result, index) =>
      getHasError(
        result,
        errorResetBoundary,
        observableQueries[index]!,
        defaultedQueries[index]?.throwOnError ?? false
      )
  )

  if (firstSingleResultWhichShouldThrow?.error) {
    throw firstSingleResultWhichShouldThrow.error
  }

  return getCombinedResult(trackResult())
}
