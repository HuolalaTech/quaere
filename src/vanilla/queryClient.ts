import { BaseQuery, isInfiniteQuery } from './baseQuery'
import { focusManager } from './focusManager'
import {
  MutationCache,
  MutationInfoFilters,
  createMutationCache,
} from './mutationCache'
import { MutationInfoOptions } from './mutationInfo'
import {
  ObservableInfiniteQuery,
  ObservableInfiniteQueryOptions,
  createObservableInfiniteQuery,
} from './observableInfiniteQuery'
import {
  ObservableQuery,
  ObservableQueryOptions,
  createObservableQuery,
} from './observableQuery'
import { onlineManager } from './onlineManager'
import {
  QueryCache,
  QueryInfoFilters,
  QueryInfoTypeFilter,
  createQueryCache,
} from './queryCache'
import {
  QueryInfo,
  QueryInfoOptions,
  QueryInfoState,
  SetDataOptions,
} from './queryInfo'
import { DeepPartial, GetVariables, Updater } from './typeUtils'
import { InfiniteData } from './types'
import {
  UNDEFINED,
  functionalUpdate,
  getFullKey,
  hashKeyByFn,
  isUndefined,
  noop,
} from './utils'

export interface ResultOptions {
  throwOnError?: boolean
}
export interface RefetchOptions extends ResultOptions {
  cancelRefetch?: boolean
}
export interface InvalidateOptions extends RefetchOptions {}
export interface ResetOptions extends RefetchOptions {}
export interface CancelOptions {
  revert?: boolean
  silent?: boolean
}

export interface InvalidateQueryFilters<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> extends QueryInfoFilters<TFetcherData, TVars, TError, TQueryData> {
  refetchType?: QueryInfoTypeFilter | 'none'
}

export type GetPages<TFetcherData, TQueryData> =
  TQueryData extends InfiniteData<TFetcherData> ? { pages?: number } : object

export type FetchQueryOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> = Omit<
  QueryInfoOptions<TFetcherData, TVars, TError, TQueryData>,
  'variables' | '_defaulted'
> &
  GetVariables<TVars> & {
    /**
     * The time in milliseconds after data is considered stale.
     * If the data is fresh it will be returned from the cache.
     */
    staleTime?: number
  }

export type TriggerMutationOptions<
  TData = unknown,
  TVars = unknown,
  TError = Error
> = Omit<MutationInfoOptions<TData, TVars, TError>, '_defaulted'> &
  GetVariables<TVars>

export interface DefaultOptions {
  queries?: Omit<ObservableQueryOptions<any, any, any>, 'query' | '_defaulted'>
  mutations?: Omit<MutationInfoOptions<any, any>, 'mutation' | '_defaulted'>
}

export interface QueryClientConfig {
  defaultOptions?: DefaultOptions
  queryCache?: QueryCache
  mutationCache?: MutationCache
}

export interface QueryClient extends ReturnType<typeof createQueryClient> {}

export const createQueryClient = (config: QueryClientConfig = {}) => {
  let mountCount = 0
  let unsubscribeFocus: (() => void) | undefined
  let unsubscribeOnline: (() => void) | undefined
  let defaultOptions = config.defaultOptions

  const mount = (): void => {
    mountCount++
    if (mountCount !== 1) return

    unsubscribeFocus = focusManager.subscribe(() => {
      if (focusManager.isFocused()) {
        queryCache.onFocus()
      }
    })
    unsubscribeOnline = onlineManager.subscribe(() => {
      if (onlineManager.isOnline()) {
        queryCache.onOnline()
      }
    })
  }

  const unmount = (): void => {
    mountCount--
    if (mountCount !== 0) return

    unsubscribeFocus?.()
    unsubscribeFocus = UNDEFINED

    unsubscribeOnline?.()
    unsubscribeOnline = UNDEFINED
  }

  const queryCache = config.queryCache ?? createQueryCache()

  const mutationCache = config.mutationCache ?? createMutationCache()

  const getQueryCache = () => queryCache

  const getMutationCache = () => mutationCache

  const getDefaultOptions = () => defaultOptions

  const setDefaultOptions = (options: DefaultOptions): void => {
    defaultOptions = options
  }

  const fetchQuery = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    options: FetchQueryOptions<TFetcherData, TVars, TError, TQueryData>
  ): Promise<TQueryData> => {
    const defaultedOptions = defaultQueryOptions(options)

    if (isUndefined(defaultedOptions.retry)) {
      defaultedOptions.retry = false
    }

    const queryInfo = queryCache.build(client, defaultedOptions)

    return queryInfo.isStaleByTime(defaultedOptions.staleTime)
      ? queryInfo.fetch(defaultedOptions)
      : Promise.resolve(queryInfo.state.data!)
  }

  const prefetchQuery = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    options: FetchQueryOptions<TFetcherData, TVars, TError, TQueryData>
  ) => {
    return fetchQuery(options).then(noop).catch(noop)
  }

  const refetchQueries = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters?: QueryInfoFilters<TFetcherData, TVars, TError, TQueryData>,
    options?: RefetchOptions
  ): Promise<void> => {
    const fetchOptions = {
      ...options,
      cancelRefetch: options?.cancelRefetch ?? true,
    }
    const promises = queryCache
      .findAll(filters)
      .filter(query => !query.isDisabled())
      .map(query => {
        let promise = query.fetch(undefined, fetchOptions)
        if (!fetchOptions.throwOnError) {
          promise = promise.catch(noop) as Promise<TQueryData>
        }
        return query.state.fetchStatus === 'paused'
          ? Promise.resolve()
          : promise
      })

    return Promise.all(promises).then(noop)
  }

  const getQueryState = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters: {
      query: BaseQuery<TFetcherData, TVars, TError, TQueryData>
    } & GetVariables<TVars>
  ): QueryInfoState<TQueryData, TError> | undefined => {
    return queryCache.find(
      filters as {
        query: BaseQuery<TFetcherData, TVars, TError, TQueryData>
        variables: DeepPartial<TVars>
      }
    )?.state
  }

  const getQueryData = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters: {
      query: BaseQuery<TFetcherData, TVars, TError, TQueryData>
    } & GetVariables<TVars>
  ): TQueryData | undefined => {
    return getQueryState(filters)?.data
  }

  const setQueryData = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters: {
      query: BaseQuery<TFetcherData, TVars, TError, TQueryData>
    } & GetVariables<TVars>,
    updater: Updater<TQueryData | undefined, TQueryData | undefined>,
    setDataOptions?: SetDataOptions
  ) => {
    const defaultedOptions = defaultQueryOptions(filters)
    const queryInfo = queryCache.get<TFetcherData, TVars, TError, TQueryData>(
      defaultedOptions.queryHash!
    )
    const prevData = queryInfo?.state.data
    const data = functionalUpdate(updater, prevData)

    return isUndefined(data)
      ? UNDEFINED
      : queryCache.build(client, defaultedOptions).setData(data, setDataOptions)
  }

  const getQueriesData = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters: QueryInfoFilters<TFetcherData, TVars, TError, TQueryData>
  ): [
    QueryInfo<TFetcherData, TVars, TError, TQueryData>,
    TQueryData | undefined
  ][] => {
    return queryCache
      .findAll(filters)
      .map(queryInfo => [queryInfo, queryInfo.state.data])
  }

  const setQueriesData = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters: QueryInfoFilters<TFetcherData, TVars, TError, TQueryData>,
    updater: Updater<TQueryData | undefined, TQueryData | undefined>,
    options?: SetDataOptions
  ) => {
    return queryCache
      .findAll(filters)
      .map(queryInfo => [
        queryInfo,
        setQueryData(queryInfo as any, updater, options),
      ])
  }

  const removeQueries = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters: QueryInfoFilters<TFetcherData, TVars, TError, TQueryData>
  ) => {
    queryCache
      .findAll(filters)
      .forEach(queryInfo => queryCache.remove(queryInfo))
  }

  const resetQueries = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters?: QueryInfoFilters<TFetcherData, TVars, TError, TQueryData>,
    options?: ResetOptions
  ): Promise<void> => {
    const refetchFilters: QueryInfoFilters<
      TFetcherData,
      TVars,
      TError,
      TQueryData
    > = {
      type: 'active',
      ...filters,
    }

    queryCache.findAll(filters).forEach(queryInfo => {
      queryInfo.reset()
    })
    return refetchQueries(refetchFilters, options)
  }

  const invalidateQueries = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters: InvalidateQueryFilters<
      TFetcherData,
      TVars,
      TError,
      TQueryData
    > = {},
    options: InvalidateOptions = {}
  ): Promise<void> => {
    queryCache.findAll(filters).forEach(q => {
      q.invalidate()
    })

    if (filters.refetchType === 'none') {
      return Promise.resolve()
    }
    const refetchFilters: QueryInfoFilters<
      TFetcherData,
      TVars,
      TError,
      TQueryData
    > = {
      ...filters,
      type: filters.refetchType ?? filters.type ?? 'active',
    }
    return refetchQueries(refetchFilters, options)
  }

  const cancelQueries = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters: QueryInfoFilters<TFetcherData, TVars, TError, TQueryData> = {},
    cancelOptions: CancelOptions = {}
  ): Promise<void> => {
    const defaultedCancelOptions = { revert: true, ...cancelOptions }

    const promises = queryCache
      .findAll(filters)
      .map(queryInfo => queryInfo.cancel(defaultedCancelOptions))

    return Promise.all(promises).then(noop).catch(noop)
  }

  const defaultQueryOptions = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData,
    TData = TQueryData
  >(
    options?: ObservableQueryOptions<
      TFetcherData,
      TVars,
      TError,
      TQueryData,
      TData
    >
  ): ObservableQueryOptions<TFetcherData, TVars, TError, TQueryData, TData> => {
    if (options?._defaulted) {
      return options as ObservableQueryOptions<
        TFetcherData,
        TVars,
        TError,
        TQueryData,
        TData
      >
    }

    const defaultedOptions = {
      ...defaultOptions?.queries,
      ...options?.query,
      ...options,
      _defaulted: true,
    } as ObservableQueryOptions<TFetcherData, TVars, TError, TQueryData, TData>

    // dependent default values
    if (isUndefined(defaultedOptions.refetchOnReconnect)) {
      defaultedOptions.refetchOnReconnect =
        defaultedOptions.networkMode !== 'always'
    }
    if (isUndefined(defaultedOptions.throwOnError)) {
      defaultedOptions.throwOnError = !!defaultedOptions.suspense
    }

    if (defaultedOptions.query && !defaultedOptions.queryHash) {
      defaultedOptions.queryHash = hashKeyByFn(
        getFullKey(defaultedOptions.query.key, defaultedOptions.variables),
        defaultedOptions.queryKeyHashFn
      )
    }

    return defaultedOptions
  }

  const defaultMutationOptions = <T extends MutationInfoOptions<any, any, any>>(
    options?: T
  ): T => {
    if (options?._defaulted) {
      return options
    }

    return {
      ...defaultOptions?.mutations,
      ...options?.mutation,
      ...options,
      _defaulted: true,
    } as T
  }

  const ensureQueryData = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    options: FetchQueryOptions<TFetcherData, TVars, TError, TQueryData>
  ): Promise<TQueryData> => {
    const cachedData = getQueryData(options)
    return cachedData ? Promise.resolve(cachedData) : fetchQuery(options)
  }

  const triggerMutation = <TData = unknown, TVars = unknown, TError = Error>(
    options: TriggerMutationOptions<TData, TVars, TError>
  ) => {
    return mutationCache.build(client, options).trigger(options.variables!)
  }

  const isMutating = <TData = unknown, TVars = unknown, TError = Error>(
    filters?: MutationInfoFilters<TData, TVars, TError>
  ): number => {
    return mutationCache.findAll({ ...filters, status: 'mutating' }).length
  }

  const isFetching = (filters?: QueryInfoFilters): number => {
    return queryCache.findAll({ ...filters, fetchStatus: 'fetching' }).length
  }

  const clear = (): void => {
    queryCache.clear()
    mutationCache.clear()
  }

  function watchQuery<
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TData = InfiniteData<TFetcherData>
  >(
    options: ObservableInfiniteQueryOptions<TFetcherData, TVars, TError, TData>
  ): ObservableInfiniteQuery<TFetcherData, TVars, TError, TData>
  function watchQuery<
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData,
    TData = TQueryData
  >(
    options: ObservableQueryOptions<
      TFetcherData,
      TVars,
      TError,
      TQueryData,
      TData
    >
  ): ObservableQuery<TFetcherData, TVars, TError, TQueryData, TData>
  function watchQuery(options: any): any {
    return isInfiniteQuery(options.query)
      ? createObservableInfiniteQuery(client, options)
      : createObservableQuery(client, options)
  }

  const client = {
    getMutationCache,
    defaultQueryOptions,
    defaultMutationOptions,
    getDefaultOptions,
    setDefaultOptions,
    getQueryCache,
    fetchQuery,
    prefetchQuery,
    refetchQueries,
    invalidateQueries,
    resetQueries,
    cancelQueries,
    setQueryData,
    setQueriesData,
    removeQueries,
    getQueryState,
    getQueryData,
    getQueriesData,
    ensureQueryData,
    triggerMutation,
    isMutating,
    isFetching,
    watchQuery,
    mount,
    unmount,
    clear,
  }

  return client
}
