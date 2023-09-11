import { InfiniteData, InfiniteQuery, Query, QueryClient } from '../vanilla'
import { ObservableInfiniteQueryResult } from '../vanilla/observableInfiniteQuery'
import { ObservableQueryResult } from '../vanilla/observableQuery'
import { UseBseQueryOptions, useBaseQuery } from './useBaseQuery'

export interface UseQueryOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = TFetcherData
> extends UseBseQueryOptions<TFetcherData, TVars, TError, TFetcherData, TData> {
  query: Query<TFetcherData, TVars, TError>
}

export type UseQueryResult<
  TData = unknown,
  TError = unknown
> = ObservableQueryResult<TData, TError>

export interface UseInfiniteQueryOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = InfiniteData<TFetcherData>
> extends UseBseQueryOptions<
    TFetcherData,
    TVars,
    TError,
    InfiniteData<TFetcherData>,
    TData
  > {
  query: InfiniteQuery<TFetcherData, TVars, TError>
}

export type UseInfiniteQueryResult<
  TData = unknown,
  TError = unknown
> = ObservableInfiniteQueryResult<TData, TError>

export function useQuery<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = InfiniteData<TFetcherData>
>(
  options: UseInfiniteQueryOptions<TFetcherData, TVars, TError, TData>,
  queryClient?: QueryClient
): UseInfiniteQueryResult<TData, TError>
export function useQuery<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = TFetcherData
>(
  options: UseQueryOptions<TFetcherData, TVars, TError, TData>,
  queryClient?: QueryClient
): UseQueryResult<TData, TError>
export function useQuery(options: any, queryClient?: QueryClient) {
  return useBaseQuery(options, queryClient)
}
