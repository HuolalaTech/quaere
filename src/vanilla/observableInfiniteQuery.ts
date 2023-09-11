import {
  InfiniteQueryPageParamsOptions,
  hasNextPage,
  hasPreviousPage,
} from './infiniteQueryBehavior'
import {
  ObservableQuery,
  ObservableQueryBaseResult,
  ObservableQueryOptions,
  createObservableQuery,
} from './observableQuery'
import { QueryClient, ResultOptions } from './queryClient'
import { QueryInfo } from './queryInfo'
import { InfiniteQuery } from './queryWithInfinite'
import { Override } from './typeUtils'
import { InfiniteData } from './types'

export interface FetchNextPageOptions extends ResultOptions {
  cancelRefetch?: boolean
}

export interface FetchPreviousPageOptions extends ResultOptions {
  cancelRefetch?: boolean
}

export interface ObservableInfiniteQueryOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = InfiniteData<TFetcherData>
> extends ObservableQueryOptions<
    TFetcherData,
    TVars,
    TError,
    InfiniteData<TFetcherData>,
    TData
  > {
  query: InfiniteQuery<TFetcherData, TVars, TError>
}

export interface ObservableInfiniteQueryBaseResult<
  TData = unknown,
  TError = Error
> extends ObservableQueryBaseResult<TData, TError> {
  fetchNextPage: (
    options?: FetchNextPageOptions
  ) => Promise<ObservableInfiniteQueryResult<TData, TError>>
  fetchPreviousPage: (
    options?: FetchPreviousPageOptions
  ) => Promise<ObservableInfiniteQueryResult<TData, TError>>
  hasNextPage: boolean
  hasPreviousPage: boolean
  isFetchingNextPage: boolean
  isFetchingPreviousPage: boolean
}

export interface ObservableInfiniteQueryLoadingResult<
  TData = unknown,
  TError = Error
> extends ObservableInfiniteQueryBaseResult<TData, TError> {
  data: undefined
  error: null
}

export interface ObservableInfiniteQueryLoadingErrorResult<
  TData = unknown,
  TError = Error
> extends ObservableInfiniteQueryBaseResult<TData, TError> {
  data: undefined
  error: TError
}

export interface ObservableInfiniteQuerySuccessResult<
  TData = unknown,
  TError = Error
> extends ObservableInfiniteQueryBaseResult<TData, TError> {
  data: TData
  error: null
}

export type ObservableInfiniteQueryResult<TData = unknown, TError = Error> =
  | ObservableInfiniteQueryLoadingResult<TData, TError>
  | ObservableInfiniteQueryLoadingErrorResult<TData, TError>
  | ObservableInfiniteQuerySuccessResult<TData, TError>

type ObservableInfiniteQueryListener<TData = unknown, TError = Error> = (
  result: ObservableInfiniteQueryResult<TData, TError>
) => void

export interface ObservableInfiniteQuery<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = InfiniteData<TFetcherData>
> extends Override<
    ObservableQuery<
      TFetcherData,
      TVars,
      TError,
      InfiniteData<TFetcherData>,
      TData
    >,
    {
      subscribe: (
        listener?: ObservableInfiniteQueryListener<TData, TError>
      ) => () => void

      createResult: (
        queryInfo: QueryInfo<
          TFetcherData,
          TVars,
          TError,
          InfiniteData<TFetcherData>
        >,
        options: ObservableInfiniteQueryOptions<
          TFetcherData,
          TVars,
          TError,
          TData
        >
      ) => ObservableInfiniteQueryResult<TData, TError>

      getCurrentResult: () => ObservableInfiniteQueryResult<TData, TError>

      getOptimisticResult: (
        options: ObservableInfiniteQueryOptions<
          TFetcherData,
          TVars,
          TError,
          TData
        >
      ) => ObservableInfiniteQueryResult<TData, TError>
    }
  > {
  fetchNextPage: (
    options?: FetchNextPageOptions
  ) => Promise<ObservableInfiniteQueryResult<TData, TError>>
  fetchPreviousPage: (
    options?: FetchPreviousPageOptions
  ) => Promise<ObservableInfiniteQueryResult<TData, TError>>
}

export const createObservableInfiniteQuery = <
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TData = InfiniteData<TFetcherData>
>(
  client: QueryClient,
  initialOptions: ObservableInfiniteQueryOptions<
    TFetcherData,
    TVars,
    TError,
    TData
  >
): ObservableInfiniteQuery<TFetcherData, TVars, TError, TData> => {
  initialOptions.behavior = (
    obsQuery: ObservableInfiniteQuery<TFetcherData, TVars, TError, TData>
  ) => {
    const { fetch, createResult } = obsQuery

    const fetchNextPage = (options?: FetchNextPageOptions) =>
      fetch({
        ...options,
        meta: {
          fetchMore: { direction: 'forward' },
        },
      }) as Promise<ObservableInfiniteQueryResult<TData, TError>>

    const fetchPreviousPage = (options?: FetchPreviousPageOptions) =>
      fetch({
        ...options,
        meta: {
          fetchMore: { direction: 'backward' },
        },
      }) as Promise<ObservableInfiniteQueryResult<TData, TError>>

    Object.assign(obsQuery, {
      fetchNextPage,
      fetchPreviousPage,
      createResult: (
        queryInfo: QueryInfo<
          TFetcherData,
          TVars,
          TError,
          InfiniteData<TFetcherData>
        >,
        options: ObservableInfiniteQueryOptions<
          TFetcherData,
          TVars,
          TError,
          TData
        >
      ): ObservableInfiniteQueryResult<TData, TError> => {
        const { state } = queryInfo
        const result = createResult(queryInfo, options)

        const { isFetching } = result

        const isFetchingNextPage =
          isFetching && state.fetchMeta?.fetchMore?.direction === 'forward'

        const isFetchingPreviousPage =
          isFetching && state.fetchMeta?.fetchMore?.direction === 'backward'

        return {
          ...result,
          fetchNextPage,
          fetchPreviousPage,
          hasNextPage: hasNextPage(
            options as unknown as InfiniteQueryPageParamsOptions,
            state.data
          ),
          hasPreviousPage: hasPreviousPage(
            options as unknown as InfiniteQueryPageParamsOptions,
            state.data
          ),
          isFetchingNextPage,
          isFetchingPreviousPage,
        }
      },
    })
  }

  return createObservableQuery(
    client,
    initialOptions
  ) as ObservableInfiniteQuery<TFetcherData, TVars, TError, TData>
}
