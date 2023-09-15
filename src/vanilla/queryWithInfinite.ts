import { InfiniteQueryPageParamsOptions } from './infiniteQueryBehavior'
import {
  PrimitiveQuery,
  PrimitiveQueryOptions,
  primitiveQuery,
} from './primitiveQuery'
import { QueryFunction } from './typeUtils'
import { InfiniteData } from './types'

export interface QueryWithInfiniteOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error
> extends Omit<
      PrimitiveQueryOptions<
        TFetcherData,
        TVars,
        TError,
        InfiniteData<TFetcherData>
      >,
      '_default'
    >,
    InfiniteQueryPageParamsOptions<TFetcherData> {
  fetcher: QueryFunction<TFetcherData, TVars, number>
}

export interface InfiniteQuery<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error
> extends PrimitiveQuery<
    TFetcherData,
    TVars,
    TError,
    InfiniteData<TFetcherData>
  > {
  $inf$: true
}

export const queryWithInfinite = <
  TFetcherData = unknown,
  TVars = void,
  TError = Error
>(
  options: QueryWithInfiniteOptions<TFetcherData, TVars, TError>
): InfiniteQuery<TFetcherData, TVars, TError> => {
  return primitiveQuery({
    ...options,
    $inf$: true,
  }) as InfiniteQuery<TFetcherData, TVars, TError>
}
