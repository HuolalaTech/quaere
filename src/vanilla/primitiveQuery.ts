import { ObservableQueryOptions } from './observableQuery'
import { QueryFunctionContext } from './typeUtils'
import { generatekey } from './utils'

export interface PrimitiveQueryOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> extends Omit<
    ObservableQueryOptions<TFetcherData, TVars, TError, TQueryData>,
    'query' | 'variables' | 'select' | 'queryHash' | '_defaulted'
  > {
  key?: string
  fetcher: (
    variables: TVars,
    context: QueryFunctionContext<any>
  ) => Promise<TFetcherData> | TFetcherData
  /**
   * Defined by the queryWithInfinite function
   */
  $inf$?: true
}

export interface PrimitiveQuery<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> extends PrimitiveQueryOptions<TFetcherData, TVars, TError, TQueryData> {
  key: string
}

export const primitiveQuery = <
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
>(
  options: PrimitiveQueryOptions<TFetcherData, TVars, TError, TQueryData>
): PrimitiveQuery<TFetcherData, TVars, TError, TQueryData> => {
  return {
    ...options,
    key: options.key ?? generatekey(),
  }
}

export const isInfiniteQuery = (
  query: PrimitiveQuery<any, any, any, any>
): boolean => {
  return !!query.$inf$
}
