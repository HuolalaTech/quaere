import { focusManager } from './focusManager'
import { FetchQueryOptions, QueryClient, RefetchOptions } from './queryClient'
import {
  FetchOptions,
  QueryInfo,
  QueryInfoOptions,
  QueryInfoState,
} from './queryInfo'
import { canFetch } from './retryer'
import { createSubscribable } from './subscribable'
import {
  UNDEFINED,
  isBoolean,
  isFunction,
  isServer,
  isUndefined,
  isValidTimeout,
  noop,
  replaceData,
  shallowEqualObjects,
  timeUntilStale,
} from './utils'

export type ThrowOnError<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> =
  | boolean
  | ((
      error: unknown,
      query: QueryInfo<TFetcherData, TVars, TError, TQueryData>
    ) => boolean)

type NonFunctionGuard<T> = T extends (...args: any[]) => any ? never : T

export type PlaceholderDataFunction<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> = (
  previousData: TQueryData | undefined,
  previousQueryInfo:
    | QueryInfo<TFetcherData, TVars, TError, TQueryData>
    | undefined
) => TQueryData | undefined

export interface ObservableQueryOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData,
  TData = TQueryData
> extends Omit<
    QueryInfoOptions<TFetcherData, TVars, TError, TQueryData>,
    'pages'
  > {
  /**
   * Set this to `false` to disable automatic refetching when the query mounts or changes query keys.
   * To refetch the query, use the `refetch` method returned from the `useQuery` instance.
   * Defaults to `true`.
   */
  enabled?: boolean
  /**
   * The time in milliseconds after datcreateResulta is considered stale.
   * If set to `Infinity`, the data will never be considered stale.
   */
  staleTime?: number
  /**
   * If set to a number, the query will continuously refetch at this frequency in milliseconds.
   * If set to a function, the function will be executed with the latest data and query to compute a frequency
   * Defaults to `false`.
   */
  refetchInterval?:
    | number
    | false
    | ((
        data: TData | undefined,
        queryInfo: QueryInfo<TFetcherData, TVars, TError, TQueryData>
      ) => number | false | undefined)
  /**
   * If set to `true`, the query will continue to refetch while their tab/window is in the background.
   * Defaults to `false`.
   */
  refetchIntervalInBackground?: boolean
  /**
   * If set to `true`, the query will refetch on window focus if the data is stale.
   * If set to `false`, the query will not refetch on window focus.
   * If set to `'always'`, the query will always refetch on window focus.
   * If set to a function, the function will be executed with the latest data and query to compute the value.
   * Defaults to `true`.
   */
  refetchOnWindowFocus?:
    | boolean
    | 'always'
    | ((
        queryInfo: QueryInfo<TFetcherData, TVars, TError, TQueryData>
      ) => boolean | 'always')
  /**
   * If set to `true`, the query will refetch on reconnect if the data is stale.
   * If set to `false`, the query will not refetch on reconnect.
   * If set to `'always'`, the query will always refetch on reconnect.
   * If set to a function, the function will be executed with the latest data and query to compute the value.
   * Defaults to the value of `networkOnline` (`true`)
   */
  refetchOnReconnect?:
    | boolean
    | 'always'
    | ((
        queryInfo: QueryInfo<TFetcherData, TVars, TError, TQueryData>
      ) => boolean | 'always')
  /**
   * If set to `true`, the query will refetch on mount if the data is stale.
   * If set to `false`, will disable additional instances of a query to trigger background refetches.
   * If set to `'always'`, the query will always refetch on mount.
   * If set to a function, the function will be executed with the latest data and query to compute the value
   * Defaults to `true`.
   */
  refetchOnMount?:
    | boolean
    | 'always'
    | ((
        queryInfo: QueryInfo<TFetcherData, TVars, TError, TQueryData>
      ) => boolean | 'always')
  /**
   * If set to `false`, the query will not be retried on mount if it contains an error.
   * Defaults to `true`.
   */
  retryOnMount?: boolean
  /**
   * Whether errors should be thrown instead of setting the `error` property.
   * If set to `true` or `suspense` is `true`, all errors will be thrown to the error boundary.
   * If set to `false` and `suspense` is `false`, errors are returned as state.
   * If set to a function, it will be passed the error and the query, and it should return a boolean indicating whether to show the error in an error boundary (`true`) or return the error as state (`false`).
   * Defaults to `false`.
   */
  throwOnError?: ThrowOnError<TFetcherData, TVars, TError, TQueryData>
  /**
   * This option can be used to transform or select a part of the data returned by the query function.
   */
  select?: (data: TQueryData) => TData
  /**
   * If set to `true`, the query will suspend when `status === 'pending'`
   * and throw errors when `status === 'error'`.
   * Defaults to `false`.
   */
  suspense?: boolean
  /**
   * If set, this value will be used as the placeholder data for this particular query observer while the query is still in the `loading` data and no initialData has been provided.
   */
  placeholderData?:
    | NonFunctionGuard<TQueryData>
    | PlaceholderDataFunction<TFetcherData, TVars, TError, TQueryData>

  behavior?: (obsQuery: any) => any

  _optimisticResults?: boolean
}

export interface ObservableQueryBaseResult<TData = unknown, TError = Error> {
  data: TData | undefined
  error: TError | null
  isFetching: boolean
  isLoading: boolean
  isPlaceholderData: boolean
  isStale: boolean
  refetch: (
    options?: RefetchOptions
  ) => Promise<ObservableQueryResult<TData, TError>>
}

export interface ObservableQueryLoadingResult<TData = unknown, TError = Error>
  extends ObservableQueryBaseResult<TData, TError> {
  data: undefined
  error: null
}

export interface ObservableQueryLoadingErrorResult<
  TData = unknown,
  TError = Error
> extends ObservableQueryBaseResult<TData, TError> {
  data: undefined
  error: TError
}

export interface ObservableQuerySuccessResult<TData = unknown, TError = Error>
  extends ObservableQueryBaseResult<TData, TError> {
  data: TData
  error: null
}

export type ObservableQueryResult<TData = unknown, TError = Error> =
  | ObservableQueryLoadingResult<TData, TError>
  | ObservableQueryLoadingErrorResult<TData, TError>
  | ObservableQuerySuccessResult<TData, TError>

export interface ObserverFetchOptions extends FetchOptions {
  throwOnError?: boolean
}

export interface NotifyOptions {
  listeners?: boolean
}

export interface ObservableQuery<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData,
  TData = TFetcherData
> extends ReturnType<
    typeof createObservableQuery<TFetcherData, TVars, TError, TQueryData, TData>
  > {}

type ObservableQueryListener<TData = unknown, TError = Error> = (
  result: ObservableQueryResult<TData, TError>
) => void

export const createObservableQuery = <
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData,
  TData = TQueryData
>(
  client: QueryClient,
  initialOptions: ObservableQueryOptions<
    TFetcherData,
    TVars,
    TError,
    TQueryData,
    TData
  >
) => {
  let options = initialOptions
  let currentQueryInfo: QueryInfo<TFetcherData, TVars, TError, TQueryData>
  let currentResult: ObservableQueryResult<TData, TError>
  let currentResultState: QueryInfoState<TQueryData, TError>
  let currentResultOptions:
    | ObservableQueryOptions<TFetcherData, TVars, TError, TQueryData, TData>
    | undefined
  let lastQueryInfoWithDefinedData:
    | QueryInfo<TFetcherData, TVars, TError, TQueryData>
    | undefined
  let selectError: TError | null = null
  let selectResult: TData | undefined
  let staleTimeoutId: ReturnType<typeof setTimeout> | undefined
  let refetchIntervalId: ReturnType<typeof setInterval> | undefined
  let currentRefetchInterval: number | false | undefined
  let unSubscribeQueryInfo: (() => void) | undefined

  const trackedProps: Set<keyof ObservableQueryResult<TData, TError>> =
    new Set()

  const [listeners, subscribe, hasListeners] = createSubscribable<
    ObservableQueryListener<TData, TError>
  >(
    function onSubscribe() {
      if (listeners.size === 1) {
        unSubscribeQueryInfo?.()
        unSubscribeQueryInfo = currentQueryInfo.subscribe(obsQuery)

        if (shouldFetchOnMount(currentQueryInfo, options)) {
          executeFetch()
        }

        updateTimers()
      }
    },
    function onUnsubscribe() {
      if (!hasListeners()) {
        destroy()
      }
    }
  )

  const executeFetch = (
    fetchOptions?: ObserverFetchOptions
  ): Promise<TQueryData | undefined> => {
    updateQueryInfo()

    let promise: Promise<TQueryData | undefined> = currentQueryInfo.fetch(
      options as FetchQueryOptions<TFetcherData, TVars, TError, TQueryData>,
      fetchOptions
    )

    if (!fetchOptions?.throwOnError) {
      promise = promise.catch(noop)
    }

    return promise
  }

  const fetch = (
    fetchOptions?: ObserverFetchOptions
  ): Promise<ObservableQueryResult<TData, TError>> => {
    return executeFetch({
      ...fetchOptions,
      cancelRefetch: fetchOptions?.cancelRefetch ?? true,
    }).then(() => {
      updateResult()
      return currentResult
    })
  }

  const refetch: (
    options?: RefetchOptions
  ) => Promise<ObservableQueryResult<TData, TError>> = fetch

  const updateResult = (notifyOptions?: NotifyOptions): void => {
    const prevResult = currentResult
    const nextResult = obsQuery.createResult(currentQueryInfo, options)

    currentResultState = currentQueryInfo.state
    currentResultOptions = options

    // Only notify and update result if something has changed
    if (shallowEqualObjects(nextResult, prevResult)) {
      return
    }

    if (!isUndefined(currentResultState.data)) {
      lastQueryInfoWithDefinedData = currentQueryInfo
    }
    currentResult = nextResult

    // Determine which callbacks to trigger
    const defaultNotifyOptions: NotifyOptions = {}

    const shouldNotifyListeners = (): boolean => {
      if (!prevResult || !trackedProps.size) {
        return true
      }

      const includedProps = [...trackedProps]

      if (!trackedProps.has('error') && options.throwOnError) {
        includedProps.push('error')
      }

      return includedProps.some(key => prevResult[key] !== nextResult[key])
    }

    if (notifyOptions?.listeners !== false && shouldNotifyListeners()) {
      defaultNotifyOptions.listeners = true
    }

    notify({ ...defaultNotifyOptions, ...notifyOptions })
  }

  const onQueryUpdate = (): void => {
    updateResult()

    if (hasListeners()) {
      updateTimers()
    }
  }

  const updateStaleTimeout = (): void => {
    clearStaleTimeout()

    if (
      isServer ||
      currentResult.isStale ||
      !isValidTimeout(options.staleTime)
    ) {
      return
    }

    const time = timeUntilStale(
      currentQueryInfo.state.dataUpdatedAt,
      options.staleTime
    )

    // The timeout is sometimes triggered 1 ms before the stale time expiration.
    // To mitigate this issue we always add 1 ms to the timeout.
    const timeout = time + 1

    staleTimeoutId = setTimeout(() => {
      if (!currentResult.isStale) {
        updateResult()
      }
    }, timeout)
  }

  const computeRefetchInterval = () => {
    return (
      (isFunction(options.refetchInterval)
        ? options.refetchInterval(currentResult.data, currentQueryInfo)
        : options.refetchInterval) ?? false
    )
  }

  const updateRefetchInterval = (nextInterval: number | false): void => {
    clearRefetchInterval()

    currentRefetchInterval = nextInterval

    if (
      isServer ||
      options.enabled === false ||
      !isValidTimeout(currentRefetchInterval) ||
      currentRefetchInterval === 0
    ) {
      return
    }

    refetchIntervalId = setInterval(() => {
      if (options.refetchIntervalInBackground || focusManager.isFocused()) {
        executeFetch()
      }
    }, currentRefetchInterval)
  }

  const updateTimers = (): void => {
    updateStaleTimeout()
    updateRefetchInterval(computeRefetchInterval())
  }

  const clearStaleTimeout = (): void => {
    if (staleTimeoutId) {
      clearTimeout(staleTimeoutId)
      staleTimeoutId = UNDEFINED
    }
  }

  const clearRefetchInterval = (): void => {
    if (refetchIntervalId) {
      clearInterval(refetchIntervalId)
      refetchIntervalId = UNDEFINED
    }
  }

  const notify = (notifyOptions: NotifyOptions): void => {
    // First, trigger the listeners
    if (notifyOptions.listeners) {
      listeners.forEach(listener => {
        listener(currentResult)
      })
    }
  }

  const updateQueryInfo = () => {
    const queryInfo = client.getQueryCache().build(client, options)

    if (queryInfo === currentQueryInfo) {
      return
    }

    currentQueryInfo = queryInfo

    if (hasListeners()) {
      unSubscribeQueryInfo?.()
      unSubscribeQueryInfo = queryInfo.subscribe(obsQuery)
    }
  }

  const destroy = () => {
    unSubscribeQueryInfo?.()
    unSubscribeQueryInfo = UNDEFINED
    listeners.clear()
    clearStaleTimeout()
    clearRefetchInterval()
  }

  const setOptions = (
    newOptions?: Partial<
      ObservableQueryOptions<TFetcherData, TVars, TError, TQueryData, TData>
    >,
    notifyOptions?: NotifyOptions
  ) => {
    const prevOptions = options
    const prevQueryInfo = currentQueryInfo

    options = client.defaultQueryOptions(
      newOptions as ObservableQueryOptions<
        TFetcherData,
        TVars,
        TError,
        TQueryData,
        TData
      >
    )

    if (!isUndefined(options.enabled) && !isBoolean(options.enabled)) {
      throw new Error('Expected enabled to be a boolean')
    }

    // Keep previous query if the user does not supply one
    if (!options.query) {
      options.query = prevOptions.query
    }

    updateQueryInfo()

    const mounted = hasListeners()

    // Fetch if there are subscribers
    if (
      mounted &&
      shouldFetchOptionally(
        currentQueryInfo,
        prevQueryInfo,
        options,
        prevOptions
      )
    ) {
      executeFetch()
    }

    // Update result
    updateResult(notifyOptions)

    // Update stale interval if needed
    if (
      mounted &&
      (currentQueryInfo !== prevQueryInfo ||
        options.enabled !== prevOptions.enabled ||
        options.staleTime !== prevOptions.staleTime)
    ) {
      updateStaleTimeout()
    }

    const nextRefetchInterval = computeRefetchInterval()

    // Update refetch interval if needed
    if (
      mounted &&
      (currentQueryInfo !== prevQueryInfo ||
        options.enabled !== prevOptions.enabled ||
        nextRefetchInterval !== currentRefetchInterval)
    ) {
      updateRefetchInterval(nextRefetchInterval)
    }
  }

  const obsQuery = {
    subscribe,
    onQueryUpdate,
    setOptions,
    destroy,
    refetch,
    fetch,
    updateResult,

    getCurrentResult: () => currentResult,

    shouldFetchOnReconnect: () =>
      shouldFetchOn(currentQueryInfo, options, options.refetchOnReconnect),

    shouldFetchOnWindowFocus: () =>
      shouldFetchOn(currentQueryInfo, options, options.refetchOnWindowFocus),

    getCurrentQueryInfo: () => currentQueryInfo,

    getOptimisticResult: (
      options: ObservableQueryOptions<
        TFetcherData,
        TVars,
        TError,
        TQueryData,
        TData
      >
    ): ObservableQueryResult<TData, TError> => {
      const queryInfo = client.getQueryCache().build(client, options)

      const result = obsQuery.createResult(queryInfo, options)

      if (!shallowEqualObjects(currentResult, result)) {
        currentResult = result
        currentResultOptions = options
        currentResultState = currentQueryInfo.state
      }
      return result
    },

    trackResult: (
      result: ObservableQueryResult<TData, TError>
    ): ObservableQueryResult<TData, TError> => {
      const trackedResult = {} as ObservableQueryResult<TData, TError>

      Object.keys(result).forEach(key => {
        Object.defineProperty(trackedResult, key, {
          configurable: false,
          enumerable: true,
          get: () => {
            trackedProps.add(key as keyof ObservableQueryResult<TData, TError>)
            return result[key as keyof ObservableQueryResult<TData, TError>]
          },
        })
      })

      return trackedResult
    },

    fetchOptimistic(
      options: ObservableQueryOptions<
        TFetcherData,
        TVars,
        TError,
        TQueryData,
        TData
      >
    ): Promise<ObservableQueryResult<TData, TError>> {
      const defaultedOptions = client.defaultQueryOptions(options)

      const queryInfo = client.getQueryCache().build(client, defaultedOptions)
      queryInfo.setIsFetchingOptimistic(true)

      return queryInfo
        .fetch()
        .then(() => this.createResult(queryInfo, defaultedOptions))
    },

    // Expose for overwriting in inifite query
    createResult: (
      queryInfo: QueryInfo<TFetcherData, TVars, TError, TQueryData>,
      options: ObservableQueryOptions<
        TFetcherData,
        TVars,
        TError,
        TQueryData,
        TData
      >
    ): ObservableQueryResult<TData, TError> => {
      const prevQueryInfo = currentQueryInfo
      const prevOptions = options
      const prevResult = currentResult
      const prevResultState = currentResultState
      const prevResultOptions = currentResultOptions

      const { state } = queryInfo
      let { error, fetchStatus, status } = state
      let isPlaceholderData = false
      let data: TData | undefined

      if (options._optimisticResults) {
        const mounted = hasListeners()

        const fetchOnMount = !mounted && shouldFetchOnMount(queryInfo, options)

        const fetchOptionally =
          mounted &&
          shouldFetchOptionally(queryInfo, prevQueryInfo, options, prevOptions)

        if (fetchOnMount || fetchOptionally) {
          fetchStatus = canFetch(queryInfo.options.networkMode)
            ? 'fetching'
            : 'paused'
          if (!state.dataUpdatedAt) {
            status = 'pending'
          }
        }
      }

      // Select data if needed
      if (options.select && !isUndefined(state.data)) {
        // Memoize select result
        if (
          prevResult &&
          state.data === prevResultState?.data &&
          options.select === prevResultOptions?.select
        ) {
          data = selectResult
        } else {
          try {
            data = options.select(state.data)
            data = replaceData(prevResult?.data, data, options)
            selectResult = data
            selectError = null
          } catch (error) {
            selectError = error as TError
          }
        }
      }
      // Use query data
      else {
        data = state.data as unknown as TData
      }

      // Show placeholder data if needed
      if (
        !isUndefined(options.placeholderData) &&
        isUndefined(data) &&
        status === 'pending'
      ) {
        let placeholderData

        // Memoize placeholder data
        if (
          prevResult?.isPlaceholderData &&
          options.placeholderData === prevResultOptions?.placeholderData
        ) {
          placeholderData = prevResult.data
        } else {
          placeholderData = isFunction(options.placeholderData)
            ? options.placeholderData(
                lastQueryInfoWithDefinedData?.state.data,
                lastQueryInfoWithDefinedData
              )
            : options.placeholderData
          if (options.select && !isUndefined(placeholderData)) {
            try {
              placeholderData = options.select(placeholderData)
              selectError = null
            } catch (error) {
              selectError = error as TError
            }
          }
        }

        if (!isUndefined(placeholderData)) {
          status = 'success'
          data = replaceData(
            prevResult?.data,
            placeholderData,
            options
          ) as TData
          isPlaceholderData = true
        }
      }

      if (selectError) {
        error = selectError as any
        data = selectResult
        status = 'error'
      }

      const result = {
        data,
        error,
        isLoading: status === 'pending',
        isFetching: fetchStatus === 'fetching',
        isPlaceholderData,
        isStale: isStale(queryInfo, options),
        refetch,
      } as ObservableQueryResult<TData, TError>

      return result
    },

    get options() {
      return options
    },
  }

  options.behavior?.(obsQuery)

  // initialize
  setOptions(initialOptions)

  return obsQuery
}

const shouldLoadOnMount = (
  queryInfo: QueryInfo<any, any, any, any>,
  options: ObservableQueryOptions<any, any, any, any>
): boolean => {
  return (
    options.enabled !== false &&
    !queryInfo.state.dataUpdatedAt &&
    !(queryInfo.state.status === 'error' && options.retryOnMount === false)
  )
}

const shouldFetchOnMount = (
  queryInfo: QueryInfo<any, any, any, any>,
  options: ObservableQueryOptions<any, any, any, any>
): boolean => {
  return (
    shouldLoadOnMount(queryInfo, options) ||
    (queryInfo.state.dataUpdatedAt > 0 &&
      shouldFetchOn(queryInfo, options, options.refetchOnMount))
  )
}

const shouldFetchOn = (
  queryInfo: QueryInfo<any, any, any, any>,
  options: ObservableQueryOptions<any, any, any, any>,
  field: (typeof options)['refetchOnMount'] &
    (typeof options)['refetchOnWindowFocus'] &
    (typeof options)['refetchOnReconnect']
) => {
  if (options.enabled !== false) {
    const value = isFunction(field) ? field(queryInfo) : field

    return (
      value === 'always' || (value !== false && isStale(queryInfo, options))
    )
  }
  return false
}

const shouldFetchOptionally = (
  queryInfo: QueryInfo<any, any, any, any>,
  prevQueryInfo: QueryInfo<any, any, any, any>,
  options: ObservableQueryOptions<any, any, any, any>,
  prevOptions: ObservableQueryOptions<any, any, any, any>
): boolean => {
  return (
    options.enabled !== false &&
    (queryInfo !== prevQueryInfo || prevOptions.enabled === false) &&
    (!options.suspense || queryInfo.state.status !== 'error') &&
    isStale(queryInfo, options)
  )
}

const isStale = (
  queryInfo: QueryInfo<any, any, any, any>,
  options: ObservableQueryOptions<any, any, any, any>
): boolean => {
  return queryInfo.isStaleByTime(options.staleTime)
}
