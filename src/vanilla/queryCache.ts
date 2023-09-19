import { PrimitiveQuery } from './primitiveQuery'
import { QueryClient } from './queryClient'
import {
  Action,
  FetchStatus,
  QueryInfo,
  QueryInfoOptions,
  QueryInfoState,
  createQueryInfo,
} from './queryInfo'
import type { DeepPartial, NotifyEvent, WithRequired } from './typeUtils'
import {
  UNDEFINED,
  getFullKey,
  hashKeyByOptions,
  isBoolean,
  isUndefined,
  partialMatchKey,
} from './utils'

export interface QueryCache extends ReturnType<typeof createQueryCache> {}

interface NotifyEventQueryAdded<TFetcherData, TVars, TError, TQueryData>
  extends NotifyEvent {
  type: 'added'
  queryInfo: QueryInfo<TFetcherData, TVars, TError, TQueryData>
}

interface NotifyEventQueryRemoved<TFetcherData, TVars, TError, TQueryData>
  extends NotifyEvent {
  type: 'removed'
  queryInfo: QueryInfo<TFetcherData, TVars, TError, TQueryData>
}

export interface NotifyEventQueryUpdated<
  TFetcherData,
  TVars,
  TError,
  TQueryData
> extends NotifyEvent {
  type: 'updated'
  queryInfo: QueryInfo<TFetcherData, TVars, TError, TQueryData>
  action: Action<TQueryData, TError>
}

export type QueryCacheNotifyEvent<TFetcherData, TVars, TError, TQueryData> =
  | NotifyEventQueryAdded<TFetcherData, TVars, TError, TQueryData>
  | NotifyEventQueryRemoved<TFetcherData, TVars, TError, TQueryData>
  | NotifyEventQueryUpdated<TFetcherData, TVars, TError, TQueryData>

export interface QueryStore {
  has: (queryKey: string) => boolean
  set: (queryKey: string, queryInfo: QueryInfo<any, any, any>) => void
  get: (queryKey: string) => QueryInfo<any, any, any> | undefined
  delete: (queryKey: string) => void
  values: () => IterableIterator<QueryInfo<any, any, any>>
}

type QueryCacheListeners<TFetcherData, TVars, TError, TQueryData> = (
  event: QueryCacheNotifyEvent<TFetcherData, TVars, TError, TQueryData>
) => void

export const createQueryCache = (
  config: {
    onError?: (error: Error, queryInfo: QueryInfo) => void
    onSuccess?: (data: unknown, query: QueryInfo) => void
    onSettled?: (data: unknown, error: Error, query: QueryInfo) => void
    createStore?: () => QueryStore
  } = {}
) => {
  const queries: QueryStore = config?.createStore?.() ?? new Map()

  const listeners = new Set<QueryCacheListeners<any, any, any, any>>()

  function subscribe<
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters: QueryInfoFilters<TFetcherData, TVars, TError, TQueryData>,
    listener: QueryCacheListeners<TFetcherData, TVars, TError, TQueryData>
  ): () => void
  function subscribe<
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    listener: QueryCacheListeners<TFetcherData, TVars, TError, TQueryData>
  ): () => void
  function subscribe(...args: any) {
    const [filters, listener] = args.length === 2 ? args : [UNDEFINED, args[0]]

    const wrappedListener = (
      event: QueryCacheNotifyEvent<any, any, any, any>
    ) => {
      if (!filters || matchQueryInfo(filters, event.queryInfo)) {
        listener(event)
      }
    }

    listeners.add(wrappedListener)

    return () => {
      listeners.delete(wrappedListener)
    }
  }

  const getAll = (): QueryInfo<any, any, any, any>[] => {
    return Array.from(queries.values())
  }

  const find = <TFetcherData, TVars, TError = Error, TQueryData = TFetcherData>(
    filters: WithRequired<
      QueryInfoFilters<TFetcherData, TVars, TError, TQueryData>,
      'query'
    >
  ): QueryInfo<TFetcherData, TVars, TError, TQueryData> | undefined => {
    const defaultedFilters = { exact: true, ...filters }
    return getAll().find(queryInfo =>
      matchQueryInfo(defaultedFilters, queryInfo)
    )
  }

  const findAll = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    filters: QueryInfoFilters<TFetcherData, TVars, TError, TQueryData> = {}
  ): QueryInfo<TFetcherData, TVars, TError, TQueryData>[] => {
    return Object.keys(filters).length
      ? getAll().filter(queryInfo => matchQueryInfo(filters, queryInfo))
      : getAll()
  }

  const notify = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    event: QueryCacheNotifyEvent<TFetcherData, TVars, TError, TQueryData>
  ) => {
    listeners.forEach(listener => listener(event))
  }

  const remove = (queryInfo: QueryInfo<any, any, any, any>) => {
    const queryInfoInMap = queries.get(queryInfo.queryHash)

    if (queryInfoInMap) {
      queryInfoInMap.destroy()

      if (queryInfoInMap === queryInfo) {
        queries.delete(queryInfo.queryHash)
      }

      notify({ type: 'removed', queryInfo })
    }
  }

  const build = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    client: QueryClient,
    options: QueryInfoOptions<TFetcherData, TVars, TError, TQueryData>,
    state?: QueryInfoState<TQueryData, TError>
  ): QueryInfo<TFetcherData, TVars, TError, TQueryData> => {
    const queryHash =
      options.queryHash ??
      hashKeyByOptions(
        getFullKey(options.query.key, options.variables),
        options
      )
    let queryInfo = get<TFetcherData, TVars, TError, TQueryData>(queryHash)

    if (!queryInfo) {
      queryInfo = createQueryInfo({
        query: options.query,
        variables: options.variables!,
        options: client.defaultQueryOptions(options),
        cache: queryCache,
        queryHash,
        state,
      })
      queries.set(queryHash, queryInfo)

      notify({
        type: 'added',
        queryInfo,
      })
    }

    return queryInfo
  }

  const get = <
    TFetcherData = unknown,
    TVars = unknown,
    TError = Error,
    TQueryData = TFetcherData
  >(
    queryHash: string
  ): QueryInfo<TFetcherData, TVars, TError, TQueryData> | undefined => {
    return queries.get(queryHash)
  }

  const onFocus = (): void => {
    getAll().forEach(queryInfo => queryInfo.onFocus())
  }

  const onOnline = (): void => {
    getAll().forEach(queryInfo => queryInfo.onOnline())
  }

  const clear = (): void => {
    getAll().forEach(query => remove(query))
  }

  const queryCache = {
    build,
    getAll,
    find,
    findAll,
    remove,
    get,
    onFocus,
    onOnline,
    subscribe,
    notify,
    clear,
    config,
  }

  return queryCache
}

export type QueryInfoTypeFilter = 'all' | 'active' | 'inactive'

export interface QueryInfoFilters<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> {
  /**
   * Filter to active queries, inactive queries or all queries
   */
  type?: QueryInfoTypeFilter
  /**
   * Match query key exactly
   */
  exact?: boolean
  /**
   * Include queries matching this predicate function
   */
  predicate?: (
    queryInfo: QueryInfo<TFetcherData, TVars, TError, TQueryData>
  ) => boolean
  query?: PrimitiveQuery<TFetcherData, TVars, TError, TQueryData>
  variables?: DeepPartial<TVars>
  fetchStatus?: FetchStatus
  stale?: boolean
}

const matchQueryInfo = (
  filters: QueryInfoFilters<any, any, any, any>,
  queryInfo: QueryInfo<any, any, any, any>
): boolean => {
  const {
    type = 'all',
    exact,
    predicate,
    query,
    variables,
    stale,
    fetchStatus,
  } = filters

  if (query) {
    if (exact) {
      if (
        queryInfo.queryHash !==
        hashKeyByOptions(getFullKey(query.key, variables), queryInfo.options)
      ) {
        return false
      }
    } else if (
      !partialMatchKey(
        getFullKey(queryInfo.query.key, queryInfo.variables),
        getFullKey(query.key, variables)
      )
    ) {
      return false
    }
  }

  if (type !== 'all') {
    const isActive = queryInfo.isActive()
    if (type === 'active' && !isActive) {
      return false
    }
    if (type === 'inactive' && isActive) {
      return false
    }
  }

  if (isBoolean(stale) && queryInfo.isStale() !== stale) {
    return false
  }

  if (
    !isUndefined(fetchStatus) &&
    fetchStatus !== queryInfo.state.fetchStatus
  ) {
    return false
  }

  if (predicate && !predicate(queryInfo)) {
    return false
  }

  return true
}
