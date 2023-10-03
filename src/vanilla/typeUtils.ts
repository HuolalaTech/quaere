export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>
    }
  : T

export type WithRequired<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>

export type WithPatrial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type Override<A, B> = { [K in keyof A]: K extends keyof B ? B[K] : A[K] }

export type GetVariablesOption<TVars> = TVars extends void
  ? { variables?: TVars }
  : { variables: TVars }

export type DataUpdateFunction<TInput, TOutput> = (input: TInput) => TOutput

export type Updater<TInput, TOutput> =
  | TOutput
  | DataUpdateFunction<TInput, TOutput>

export interface QueryMeta {
  [index: string]: unknown
}

export type FetchDirection = 'forward' | 'backward'

export type QueryFunctionContext<TPageParam = never> = [TPageParam] extends [
  never
]
  ? {
      signal: AbortSignal
      meta: QueryMeta | undefined
    }
  : {
      signal: AbortSignal
      pageParam: TPageParam
      direction: FetchDirection
      meta: QueryMeta | undefined
    }

export type QueryFunction<
  TFetcherData = unknown,
  TVars = unknown,
  TPageParam = never
> = (
  variables: TVars,
  context: QueryFunctionContext<TPageParam>
) => TFetcherData | Promise<TFetcherData>

export interface FetchMeta {
  fetchMore?: { direction: FetchDirection }
}

export type NotifyEventType = 'added' | 'removed' | 'updated'

export interface NotifyEvent {
  type: NotifyEventType
}
