import { createGcManager } from './gcManager'
import { createInfiniteQueryBehavior } from './infiniteQueryBehavior'
import { ObservableQuery } from './observableQuery'
import { PrimitiveQuery, isInfiniteQuery } from './primitiveQuery'
import { QueryCache } from './queryCache'
import {
  CancelOptions,
  NetworkMode,
  RetryDelayValue,
  RetryValue,
  Retryer,
  canFetch,
  createRetryer,
  isCancelledError,
} from './retryer'
import { createSubscribable } from './subscribable'
import {
  FetchMeta,
  QueryFunctionContext,
  QueryMeta,
  Updater,
  WithPatrial,
} from './typeUtils'
import {
  findSet,
  functionalUpdate,
  isFunction,
  isServer,
  isUndefined,
  noop,
  replaceData,
  timeUntilStale,
} from './utils'

export type QueryStatus = 'pending' | 'error' | 'success'
export type FetchStatus = 'fetching' | 'paused' | 'idle'

export type InitialDataFunction<T> = () => T | undefined

export interface QueryBehavior<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> {
  onFetch: (
    context: FetchContext<TFetcherData, TVars, TError, TQueryData>
  ) => void
}

export type QueryKeyHashFunction<TVars> = (queryKey: [string, TVars]) => string

export interface QueryInfoOptions<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> {
  query: PrimitiveQuery<TFetcherData, TVars, TError, TQueryData>
  variables?: TVars
  /**
   * If `false`, failed queries will not retry by default.
   * If `true`, failed queries will retry infinitely., failureCount: num
   * If set to an integer number, e.g. 3, failed queries will retry until the failed query count meets that number.
   * If set to a function `(failureCount, error) => boolean` failed queries will retry until the function returns false.
   */
  retry?: RetryValue<TError>
  retryDelay?: RetryDelayValue<TError>
  networkMode?: NetworkMode
  gcTime?: number
  queryHash?: string
  queryKeyHashFn?: QueryKeyHashFunction<TVars>
  initialData?: TQueryData | InitialDataFunction<TQueryData>
  initialDataUpdatedAt?: number | (() => number | undefined)
  /**
   * Set this to `false` to disable structural sharing between query results.
   * Set this to a function which accepts the old and new data and returns resolved data of the same type to implement custom structural sharing logic.
   * Defaults to `true`.
   */
  structuralSharing?:
    | boolean
    | ((oldData: TQueryData | undefined, newData: TQueryData) => TQueryData)
  _defaulted?: boolean
  /**
   * Additional payload to be stored on each query.
   * Use this property to pass information that can be used in other places.
   */
  meta?: QueryMeta
  /**
   * Maximum number of pages to store in the data of an infinite query.
   */
  maxPages?: number
  pages?: number
}

export interface QueryInfoConfig<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> {
  options: QueryInfoOptions<TFetcherData, TVars, TError, TQueryData>
  cache: QueryCache
  state?: QueryInfoState<TQueryData, TError>
  queryHash: string
  query: PrimitiveQuery<TFetcherData, TVars, TError, TQueryData>
  variables: TVars
}

export interface FetchContext<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> {
  query: PrimitiveQuery<TFetcherData, TVars, TError, TQueryData>
  variables: TVars
  fetchOptions?: FetchOptions
  options: QueryInfoOptions<TFetcherData, TVars, TError, TQueryData>
  state: QueryInfoState<TQueryData, TError>
  fetchFn: () => unknown | Promise<unknown>
  signal: AbortSignal
}

export interface SetDataOptions {
  updatedAt?: number
}

export interface QueryInfoState<TQueryData, TError> {
  data: TQueryData | undefined
  dataUpdatedAt: number
  error: TError | null
  errorUpdatedAt: number
  fetchMeta: FetchMeta | null
  isInvalidated: boolean
  status: QueryStatus
  fetchStatus: FetchStatus
}

export interface FetchOptions {
  cancelRefetch?: boolean
  meta?: FetchMeta
}

interface FetchAction {
  type: 'fetch'
  meta?: FetchMeta
}

interface SuccessAction<TQueryData> {
  data: TQueryData | undefined
  type: 'success'
  dataUpdatedAt?: number
  manual?: boolean
}

interface ErrorAction {
  type: 'error'
  error: unknown
}

interface InvalidateAction {
  type: 'invalidate'
}

interface PauseAction {
  type: 'pause'
}

interface ContinueAction {
  type: 'continue'
}

interface SetStateAction<TQueryData, TError> {
  type: 'setState'
  state: Partial<QueryInfoState<TQueryData, TError>>
  setStateOptions?: SetStateOptions
}

export interface SetStateOptions {
  meta?: any
}

export type Action<TQueryData, TError> =
  | ContinueAction
  | ErrorAction
  | FetchAction
  | InvalidateAction
  | PauseAction
  | SetStateAction<TQueryData, TError>
  | SuccessAction<TQueryData>

export interface QueryInfo<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
> extends ReturnType<
    typeof createQueryInfo<TFetcherData, TVars, TError, TQueryData>
  > {}

export function createQueryInfo<
  TFetcherData = unknown,
  TVars = unknown,
  TError = Error,
  TQueryData = TFetcherData
>(config: QueryInfoConfig<TFetcherData, TVars, TError, TQueryData>) {
  const { cache, queryHash, variables } = config

  const [updateGcTime, scheduleGc, clearGcTimeout] = createGcManager(
    function onRemove() {
      if (!hasListeners() && state.fetchStatus === 'idle') {
        cache.remove(queryInfo)
      }
    }
  )

  let options = {} as QueryInfoOptions<TFetcherData, TVars, TError, TQueryData>

  const setOptions = (
    newOptions: WithPatrial<
      QueryInfoOptions<TFetcherData, TVars, TError, TQueryData>,
      'query'
    >
  ) => {
    options = {
      ...options.query,
      ...newOptions,
    } as QueryInfoOptions<TFetcherData, TVars, TError, TQueryData>

    updateGcTime(options.gcTime)
  }

  // initialize
  setOptions(config.options)
  scheduleGc()

  let state = config.state || getDefaultState(options)

  let revertState: QueryInfoState<TQueryData, TError>

  const setState = (
    state: Partial<QueryInfoState<TQueryData, TError>>,
    setStateOptions?: SetStateOptions
  ): void => {
    dispatch({ type: 'setState', state, setStateOptions })
  }

  let abortSignalConsumed = false

  let retryer: Retryer<TQueryData> | undefined

  const [listeners, subscribe, hasListeners] = createSubscribable<
    ObservableQuery<TFetcherData, TVars, TError, TQueryData, any>
  >(
    function onSubscribe() {
      clearGcTimeout()
    },
    function onUnsubscribe() {
      if (!hasListeners()) {
        // If the transport layer does not support cancellation
        // we'll let the query continue so the result can be cached
        if (retryer) {
          if (abortSignalConsumed) {
            retryer.cancel({ revert: true })
          } else {
            retryer.cancelRetry()
          }
        }

        scheduleGc()
      }
    }
  )

  let promise: Promise<TQueryData> | undefined
  let isFetchingOptimistic: boolean | undefined
  const setIsFetchingOptimistic = (value: boolean) => {
    isFetchingOptimistic = value
  }

  const fetch = (
    newOptions?: QueryInfoOptions<TFetcherData, TVars, TError, TQueryData>,
    fetchOptions?: FetchOptions
  ): Promise<TQueryData> => {
    if (state.fetchStatus !== 'idle') {
      if (state.dataUpdatedAt && fetchOptions?.cancelRefetch) {
        // Silently cancel current fetch if the user wants to cancel refetches
        cancel({ silent: true })
      } else if (promise) {
        // make sure that retries that were potentially cancelled due to unmounts can continue
        retryer?.continueRetry()
        // Return current promise if we are already fetching
        return promise
      }
    }

    // Update config if passed, otherwise the config from the last execution is used
    if (newOptions) {
      setOptions(newOptions)
    }

    const abortController = new AbortController()

    // Create query function context
    const queryFunctionContext: Omit<QueryFunctionContext, 'signal'> = {
      meta: options.meta,
    }

    // Adds an enumerable signal property to the object that
    // which sets abortSignalConsumed to true when the signal
    // is read.
    const addSignalProperty = (object: unknown) => {
      Object.defineProperty(object, 'signal', {
        enumerable: true,
        get: () => {
          if (abortController) {
            abortSignalConsumed = true
            return abortController.signal
          }
        },
      })
    }

    addSignalProperty(queryFunctionContext)

    // Create fetch function
    const fetchFn = () => {
      if (process.env.NODE_ENV !== 'production') {
        if (isServer && !config.query.key) {
          return Promise.reject(
            new Error(
              `Missing key: If making a request on the server-side, please ensure that the 'key' option has been passed.`
            )
          )
        }
      }

      if (!options.query.fetcher) {
        return Promise.reject(new Error(`Missing queryFn: '${queryHash}'`))
      }

      abortSignalConsumed = false
      return options.query.fetcher(
        variables,
        queryFunctionContext as QueryFunctionContext<any>
      )
    }

    // Trigger behavior hook
    const context: Omit<
      FetchContext<TFetcherData, TVars, TError, TQueryData>,
      'signal'
    > = {
      query: options.query,
      variables,
      fetchOptions,
      options,
      state,
      fetchFn,
    }

    addSignalProperty(context)

    if (isInfiniteQuery(options.query)) {
      createInfiniteQueryBehavior(newOptions?.pages).onFetch(
        context as FetchContext<any, any, any, any>
      )
    }

    // Store state in case the current fetch needs to be reverted
    revertState = state

    // Set to fetching state if not already in it
    if (
      state.fetchStatus === 'idle' ||
      state.fetchMeta !== context.fetchOptions?.meta
    ) {
      dispatch({ type: 'fetch', meta: context.fetchOptions?.meta })
    }

    const onError = (error: TError | { silent?: boolean }) => {
      // Optimistically update state if needed
      if (!(isCancelledError(error) && error.silent)) {
        dispatch({
          type: 'error',
          error: error,
        })
      }

      if (!isCancelledError(error)) {
        // Notify cache callback
        cache.config.onError?.(
          error as any,
          queryInfo as QueryInfo<any, any, any>
        )
        cache.config.onSettled?.(
          state.data,
          error as any,
          queryInfo as QueryInfo<any, any, any>
        )
      }

      if (!isFetchingOptimistic) {
        // Schedule query gc after fetching
        scheduleGc()
      }
      setIsFetchingOptimistic(false)
    }

    // Try to fetch the data
    retryer = createRetryer({
      fn: context.fetchFn as () => Promise<TQueryData>,
      abort: abortController?.abort.bind(abortController),
      onSuccess: data => {
        if (isUndefined(data)) {
          if (process.env.NODE_ENV !== 'production') {
            console.error(
              `Query data cannot be undefined. Please make sure to return a value other than undefined from your query function. Affected query key: ${queryHash}`
            )
          }
          onError(new Error(`${queryHash} data is undefined`) as any)
          return
        }

        setData(data)

        // Notify cache callback
        cache.config.onSuccess?.(data, queryInfo as QueryInfo<any, any, any>)
        cache.config.onSettled?.(
          data,
          state.error as any,
          queryInfo as QueryInfo<any, any, any>
        )

        if (!isFetchingOptimistic) {
          // Schedule query gc after fetching
          scheduleGc()
        }
        setIsFetchingOptimistic(false)
      },
      onError,
      onPause: () => {
        dispatch({ type: 'pause' })
      },
      onContinue: () => {
        dispatch({ type: 'continue' })
      },
      retry: context.options.retry,
      retryDelay: context.options.retryDelay,
      networkMode: context.options.networkMode,
    })

    promise = retryer.promise

    return promise
  }

  const cancel = (cancelOptions?: CancelOptions): Promise<void> => {
    retryer?.cancel(cancelOptions)
    return promise ? promise.then(noop).catch(noop) : Promise.resolve()
  }

  const destroy = () => {
    clearGcTimeout()
    cancel({ silent: true })
  }

  const reset = () => {
    destroy()
    setState(getDefaultState(options))
  }

  const setData = (
    updater: Updater<TQueryData | undefined, TQueryData | undefined>,
    setDataoptions?: SetDataOptions & { manual: boolean }
  ) => {
    const newData = functionalUpdate(updater, state.data)
    const data = replaceData(state.data, newData, options)

    // Set data and mark it as cached
    dispatch({
      data,
      type: 'success',
      dataUpdatedAt: setDataoptions?.updatedAt,
      manual: setDataoptions?.manual,
    })

    return data
  }

  const invalidate = () => {
    if (!state.isInvalidated) {
      dispatch({ type: 'invalidate' })
    }
  }

  const dispatch = (action: Action<TQueryData, TError>): void => {
    const reducer = (): QueryInfoState<TQueryData, TError> => {
      switch (action.type) {
        case 'pause':
          return {
            ...state,
            fetchStatus: 'paused',
          }
        case 'continue':
          return {
            ...state,
            fetchStatus: 'fetching',
          }
        case 'fetch':
          return {
            ...state,
            fetchMeta: action.meta ?? null,
            fetchStatus: canFetch(options.networkMode) ? 'fetching' : 'paused',
            ...(!state.dataUpdatedAt && {
              error: null,
              status: 'pending',
            }),
          }
        case 'success':
          return {
            ...state,
            data: action.data,
            dataUpdatedAt: action.dataUpdatedAt ?? Date.now(),
            error: null,
            isInvalidated: false,
            status: 'success',
            ...(!action.manual && {
              fetchStatus: 'idle',
            }),
          }
        case 'error': {
          const error = action.error as TError

          if (isCancelledError(error) && error.revert && revertState) {
            return { ...revertState }
          }

          return {
            ...state,
            error,
            errorUpdatedAt: Date.now(),
            fetchStatus: 'idle',
            status: 'error',
          }
        }
        case 'invalidate':
          return {
            ...state,
            isInvalidated: true,
          }
        case 'setState':
          return {
            ...state,
            ...action.state,
          }
      }
    }
    state = reducer()

    listeners.forEach(l => l.onQueryUpdate())

    cache.notify({ queryInfo, type: 'updated', action })
  }

  const isStaleByTime = (staleTime = 0): boolean => {
    return (
      state.isInvalidated ||
      !state.dataUpdatedAt ||
      !timeUntilStale(state.dataUpdatedAt, staleTime)
    )
  }

  const isStale = (): boolean => {
    return (
      state.isInvalidated ||
      !state.dataUpdatedAt ||
      !!findSet(listeners, l => l.getCurrentResult().isStale)
    )
  }

  const onOnline = (): void => {
    const listener = findSet(listeners, l => l.shouldFetchOnReconnect())

    listener?.refetch?.({ cancelRefetch: false })

    // Continue fetch if currently paused
    retryer?.continue()
  }

  const onFocus = (): void => {
    const listener = findSet(listeners, l => l.shouldFetchOnWindowFocus())

    listener?.refetch?.({ cancelRefetch: false })

    // Continue fetch if currently paused
    retryer?.continue()
  }

  const isActive = (): boolean => {
    return !!findSet(listeners, l => l.options.enabled !== false)
  }

  const queryInfo = {
    subscribe,
    scheduleGc,
    setState,
    setIsFetchingOptimistic,
    fetch,
    reset,
    cancel,
    destroy,
    invalidate,
    queryHash,
    variables,
    isStaleByTime,
    isStale,
    onOnline,
    onFocus,
    isActive,

    isDisabled(): boolean {
      return hasListeners() && !isActive()
    },

    setData: (
      updater: Updater<TQueryData | undefined, TQueryData | undefined>,
      options?: SetDataOptions
    ) => setData(updater, { ...options, manual: true }),

    getObserversCount() {
      return listeners.size
    },

    get meta() {
      return options.meta
    },

    get options() {
      return options
    },
    get state() {
      return state
    },
    get query() {
      return options.query
    },
  }

  return queryInfo
}

const getDefaultState = <TFetcherData, TVars, TError, TQueryData>(
  options: QueryInfoOptions<TFetcherData, TVars, TError, TQueryData>
): QueryInfoState<TQueryData, TError> => {
  const data = isFunction(options.initialData)
    ? (options.initialData as InitialDataFunction<TQueryData>)()
    : options.initialData

  const hasData = !isUndefined(data)

  const initialDataUpdatedAt = hasData
    ? isFunction(options.initialDataUpdatedAt)
      ? (options.initialDataUpdatedAt as () => number | undefined)()
      : options.initialDataUpdatedAt
    : 0

  return {
    data,
    dataUpdatedAt: hasData ? initialDataUpdatedAt ?? Date.now() : 0,
    error: null,
    errorUpdatedAt: 0,
    fetchMeta: null,
    isInvalidated: false,
    status: hasData ? 'success' : 'pending',
    fetchStatus: 'idle',
  }
}
