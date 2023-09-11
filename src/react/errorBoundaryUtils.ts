import * as React from 'react'

import {
  ObservableQueryOptions,
  ObservableQueryResult,
  ThrowOnError,
} from '../vanilla/observableQuery'
import { QueryInfo } from '../vanilla/queryInfo'
import type { QueryErrorResetBoundaryValue } from './QueryErrorResetBoundary'
import { shouldThrowError } from './utils'

export const ensurePreventErrorBoundaryRetry = (
  options: ObservableQueryOptions<any, any, any>,
  errorResetBoundary: QueryErrorResetBoundaryValue
) => {
  if (options.suspense || options.throwOnError) {
    // Prevent retrying failed query if the error boundary has not been reset yet
    if (!errorResetBoundary.isReset()) {
      options.retryOnMount = false
    }
  }
}

export const useClearResetErrorBoundary = (
  errorResetBoundary: QueryErrorResetBoundaryValue
) => {
  React.useEffect(() => {
    errorResetBoundary.clearReset()
  }, [errorResetBoundary])
}

export const getHasError = (
  result: ObservableQueryResult<any, any>,
  errorResetBoundary: QueryErrorResetBoundaryValue,
  queryInfo: QueryInfo<any, any, any>,
  throwOnError?: ThrowOnError<any, any, any>
) => {
  return (
    queryInfo.state.status === 'error' &&
    !errorResetBoundary.isReset() &&
    !result.isFetching &&
    shouldThrowError(throwOnError, [result.error, queryInfo])
  )
}
