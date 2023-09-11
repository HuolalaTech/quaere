import { InfiniteData, QueryClient } from '../vanilla'
import { ObservableInfiniteQuerySuccessResult } from '../vanilla/observableInfiniteQuery'
import { ObservableQuerySuccessResult } from '../vanilla/observableQuery'
import { useBaseQuery } from './useBaseQuery'
import { UseInfiniteQueryOptions, UseQueryOptions } from './useQuery'

export type UseSuspenseQueryOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = TFetcherData
> = Omit<
  UseQueryOptions<TFetcherData, TVars, TError, TData>,
  'suspense' | 'enabled' | 'throwOnError' | 'placeholderData'
>

export type UseSuspenseQueryResult<TData = unknown, TError = unknown> = Omit<
  ObservableQuerySuccessResult<TData, TError>,
  'isPlaceholderData'
>

export type UseSuspenseInfiniteQueryOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = InfiniteData<TFetcherData>
> = Omit<
  UseInfiniteQueryOptions<TFetcherData, TVars, TError, TData>,
  'suspense' | 'enabled' | 'throwOnError' | 'placeholderData'
>

export type UseSuspenseInfiniteQueryResult<
  TData = unknown,
  TError = unknown
> = Omit<
  ObservableInfiniteQuerySuccessResult<TData, TError>,
  'isPlaceholderData'
>

export function useSuspenseQuery<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = InfiniteData<TFetcherData>
>(
  options: UseSuspenseInfiniteQueryOptions<TFetcherData, TVars, TError, TData>,
  queryClient?: QueryClient
): UseSuspenseInfiniteQueryResult<TData, TError>
export function useSuspenseQuery<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = TFetcherData
>(
  options: UseSuspenseQueryOptions<TFetcherData, TVars, TError, TData>,
  queryClient?: QueryClient
): UseSuspenseQueryResult<TData, TError>
export function useSuspenseQuery(options: any, queryClient?: QueryClient): any {
  return useBaseQuery(
    {
      ...options,
      enabled: true,
      suspense: true,
      throwOnError: true,
    },
    queryClient
  )
}
