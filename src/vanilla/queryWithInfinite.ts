import { BaseQuery, BaseQueryOptions, baseQuery } from './baseQuery'
import { InfiniteQueryPageParamsOptions } from './infiniteQueryBehavior'
import { QueryFunction } from './typeUtils'
import { InfiniteData } from './types'

export interface QueryWithInfiniteOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error
> extends Omit<
      BaseQueryOptions<TFetcherData, TVars, TError, InfiniteData<TFetcherData>>,
      '_default'
    >,
    InfiniteQueryPageParamsOptions<TFetcherData> {
  fetcher: QueryFunction<TFetcherData, TVars, number>
}

export interface InfiniteQuery<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error
> extends BaseQuery<TFetcherData, TVars, TError, InfiniteData<TFetcherData>> {
  $inf$: true
}

export const queryWithInfinite = <
  TFetcherData = unknown,
  TVars = void,
  TError = Error
>(
  options: QueryWithInfiniteOptions<TFetcherData, TVars, TError>
): InfiniteQuery<TFetcherData, TVars, TError> => {
  return baseQuery({
    ...options,
    $inf$: true,
  }) as InfiniteQuery<TFetcherData, TVars, TError>
}
