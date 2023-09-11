import { BaseQuery, BaseQueryOptions, baseQuery } from './baseQuery'
import { QueryFunction } from './typeUtils'

export interface QueryOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error
> extends Omit<
    BaseQueryOptions<TFetcherData, TVars, TError>,
    '_type' | '_default'
  > {
  fetcher: QueryFunction<TFetcherData, TVars>
}

export interface Query<
  TFetcherData = unknown,
  TVars = unknown,
  TError = unknown
> extends BaseQuery<TFetcherData, TVars, TError> {
  type: 'query'
}

export function query<TFetcherData = unknown, TVars = void, TError = Error>(
  options: QueryOptions<TFetcherData, TVars, TError>
): Query<TFetcherData, TVars, TError> {
  return baseQuery(options) as Query<TFetcherData, TVars, TError>
}
