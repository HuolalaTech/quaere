import {
  ObservableQuery,
  ObservableQueryOptions,
  ObservableQueryResult,
} from '../vanilla/observableQuery'
import { isNumber } from '../vanilla/utils'
import type { QueryErrorResetBoundaryValue } from './QueryErrorResetBoundary'

export const suspenseOptions: Partial<ObservableQueryOptions> = {
  suspense: true,
  enabled: true,
  throwOnError: (_error, queryInfo) => queryInfo.state.data === undefined,
}

export const ensureStaleTime = (
  defaultedOptions: ObservableQueryOptions<any, any, any>
) => {
  if (defaultedOptions.suspense) {
    // Always set stale time when using suspense to prevent
    // fetching again when directly mounting after suspending
    if (!isNumber(defaultedOptions.staleTime)) {
      defaultedOptions.staleTime = 1000
    }
  }
}

export const willFetch = (result: ObservableQueryResult<any, any>) =>
  result.isLoading && result.isFetching

export const shouldSuspend = (
  defaultedOptions: ObservableQueryOptions<any, any, any> | undefined,
  result: ObservableQueryResult<any, any>
) => defaultedOptions?.suspense && willFetch(result)

export const fetchOptimistic = (
  defaultedOptions: ObservableQueryOptions<any, any, any, any>,
  obsQuery: ObservableQuery<any, any, any, any, any>,
  errorResetBoundary: QueryErrorResetBoundaryValue
) => {
  return obsQuery.fetchOptimistic(defaultedOptions).catch(() => {
    errorResetBoundary.clearReset()
  })
}
