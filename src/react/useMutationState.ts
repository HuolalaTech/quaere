import * as React from 'react'

import { MutationCache, MutationInfoFilters, QueryClient } from '../vanilla'
import { MutationInfo, MutationInfoState } from '../vanilla/mutationInfo'
import { replaceEqualDeep } from '../vanilla/utils'
import { useQueryClient } from './QueryClientProvider'

export function useIsMutating<TData = unknown, TVars = unknown, TError = Error>(
  filters?: MutationInfoFilters<TData, TVars, TError>,
  queryClient?: QueryClient
): number {
  const client = useQueryClient(queryClient)
  return useMutationState(
    { filters: { ...filters, status: 'mutating' } },
    client
  ).length
}

type MutationStateOptions<
  TData = unknown,
  TVars = unknown,
  TError = Error,
  TResult = MutationInfoState<TData, TVars, TError>
> = {
  filters?: MutationInfoFilters<TData, TVars, TError>
  select?: (mutationInfo: MutationInfo<TData, TVars, TError>) => TResult
}

function getResult<
  TData = unknown,
  TVars = unknown,
  TError = Error,
  TResult = MutationInfoState<TData, TVars, TError>
>(
  mutationCache: MutationCache,
  options: MutationStateOptions<TData, TVars, TError, TResult>
): Array<TResult> {
  return mutationCache
    .findAll(options.filters)
    .map(
      (mutation): TResult =>
        (options.select ? options.select(mutation) : mutation.state) as TResult
    )
}

export function useMutationState<
  TData = unknown,
  TVars = unknown,
  TError = Error,
  TResult = MutationInfoState<TData, TVars, TError>
>(
  options: MutationStateOptions<TData, TVars, TError, TResult> = {},
  queryClient?: QueryClient
): Array<TResult> {
  const mutationCache = useQueryClient(queryClient).getMutationCache()
  const optionsRef = React.useRef(options)
  const result = React.useRef<Array<TResult>>()
  if (!result.current) {
    result.current = getResult(mutationCache, options)
  }

  React.useEffect(() => {
    optionsRef.current = options
  })

  return React.useSyncExternalStore(
    React.useCallback(
      onStoreChange =>
        mutationCache.subscribe(() => {
          const nextResult = replaceEqualDeep(
            result.current,
            getResult(mutationCache, optionsRef.current)
          )
          if (result.current !== nextResult) {
            result.current = nextResult
            onStoreChange()
          }
        }),
      [mutationCache]
    ),
    () => result.current,
    () => result.current
  )!
}
