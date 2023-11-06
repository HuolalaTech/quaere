import {
  PrimitiveQuery,
  PrimitiveQueryOptions,
  primitiveQuery,
} from './primitiveQuery'
import { QueryFunction } from './typeUtils'

export interface QueryOptions<
  TFetcherData = unknown,
  TVars = void,
  TError = Error
> extends Omit<
    PrimitiveQueryOptions<TFetcherData, TVars, TError>,
    '_type' | '_default'
  > {
  fetcher: QueryFunction<TFetcherData, TVars>
}

export interface Query<TFetcherData = unknown, TVars = void, TError = unknown>
  extends PrimitiveQuery<TFetcherData, TVars, TError> {
  type: 'query'
}

export function query<TFetcherData = unknown, TVars = void, TError = Error>(
  options: QueryOptions<TFetcherData, TVars, TError>
): Query<TFetcherData, TVars, TError> {
  return primitiveQuery(options) as Query<TFetcherData, TVars, TError>
}
