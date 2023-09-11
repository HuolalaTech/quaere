import { InfiniteData, InfiniteQuery, Query, QueryClient } from '../vanilla'
import {
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryResult,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from './useSuspenseQuery'

// Avoid TS depth-limit error in case of large array literal
type MAXIMUM_DEPTH = 20

type GetOptions<T> = T extends {
  query: InfiniteQuery<infer TFetcherData, infer TVars, infer TError>
  select: (data: any) => infer TData
}
  ? UseSuspenseInfiniteQueryOptions<TFetcherData, TVars, TError, TData>
  : T extends {
      query: InfiniteQuery<infer TFetcherData, infer TVars, infer TError>
    }
  ? UseSuspenseInfiniteQueryOptions<TFetcherData, TVars, TError>
  : T extends {
      query: Query<infer TFetcherData, infer TVars, infer TError>
      select: (data: any) => infer TData
    }
  ? UseSuspenseQueryOptions<TFetcherData, TVars, TError, TData>
  : T extends {
      query: Query<infer TFetcherData, infer TVars, infer TError>
    }
  ? UseSuspenseQueryOptions<TFetcherData, TVars, TError, TFetcherData>
  : UseSuspenseQueryOptions

type GetResults<T> = T extends {
  query: InfiniteQuery<any, any, infer TError>
  select: (data: any) => infer TData
}
  ? UseSuspenseInfiniteQueryResult<TData, TError>
  : T extends {
      query: InfiniteQuery<infer TFetcherData, any, infer TError>
    }
  ? UseSuspenseInfiniteQueryResult<InfiniteData<TFetcherData>, TError>
  : T extends {
      query: Query<any, any, infer TError>
      select: (data: any) => infer TData
    }
  ? UseSuspenseQueryResult<TData, TError>
  : T extends {
      query: Query<infer TFetcherData, any, infer TError>
    }
  ? UseSuspenseQueryResult<TFetcherData, TError>
  : UseSuspenseQueryResult

/**
 * QueriesOptions reducer recursively unwraps function arguments to infer/enforce type param
 */
export type QueriesOptions<
  T extends any[],
  Result extends any[] = [],
  Depth extends ReadonlyArray<number> = []
> = Depth['length'] extends MAXIMUM_DEPTH
  ? UseSuspenseQueryOptions[]
  : T extends []
  ? []
  : T extends [infer Head]
  ? [...Result, GetOptions<Head>]
  : T extends [infer Head, ...infer Tail]
  ? QueriesOptions<[...Tail], [...Result, GetOptions<Head>], [...Depth, 1]>
  : unknown[] extends T
  ? T
  : // If T is *some* array but we couldn't assign unknown[] to it, then it must hold some known/homogenous type!
  // use this to infer the param types in the case of Array.map() argument
  T extends UseSuspenseQueryOptions<
      infer TFetcherData,
      infer TVars,
      infer TError
    >[]
  ? UseSuspenseQueryOptions<TFetcherData, TVars, TError>[]
  : // Fallback
    UseSuspenseQueryOptions[]

/**
 * QueriesResults reducer recursively maps type param to results
 */
export type QueriesResults<
  T extends any[],
  Result extends any[] = [],
  Depth extends ReadonlyArray<number> = []
> = Depth['length'] extends MAXIMUM_DEPTH
  ? UseSuspenseQueryOptions[]
  : T extends []
  ? []
  : T extends [infer Head]
  ? [...Result, GetResults<Head>]
  : T extends [infer Head, ...infer Tail]
  ? QueriesResults<[...Tail], [...Result, GetResults<Head>], [...Depth, 1]>
  : T extends UseSuspenseQueryOptions<
      infer TFetcherData,
      any,
      infer TError,
      any
    >[]
  ? // Dynamic-size (homogenous) UseQueryOptions array: map directly to array of results
    UseSuspenseQueryResult<TFetcherData, TError>[]
  : // Fallback
    UseSuspenseQueryResult[]

export function useSuspenseQueries<
  T extends any[],
  TCombinedResult = QueriesResults<T>
>(
  options: {
    queries: readonly [...QueriesOptions<T>]
    combine?: (result: QueriesResults<T>) => TCombinedResult
  },
  queryClient?: QueryClient
): TCombinedResult {
  return useSuspenseQueries(
    {
      ...options,
      queries: options.queries.map(query => ({
        ...query,
        suspense: true,
        throwOnError: true,
        enabled: true,
      })),
    } as any,
    queryClient
  )
}
