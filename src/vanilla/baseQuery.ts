import { ObservableQueryOptions } from './observableQuery'
import { QueryFunctionContext } from './typeUtils'
import { generatekey } from './utils'

export interface BaseQueryOptions<
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

export interface BaseQuery<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> extends BaseQueryOptions<TFetcherData, TVars, TError, TQueryData> {
  key: string
}

export const baseQuery = <
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
>(
  options: BaseQueryOptions<TFetcherData, TVars, TError, TQueryData>
): BaseQuery<TFetcherData, TVars, TError, TQueryData> => {
  return {
    ...options,
    key: options.key ?? generatekey(),
  }
}

export const isInfiniteQuery = (
  query: BaseQuery<any, any, any, any>
): boolean => {
  return !!query.$inf$
}
