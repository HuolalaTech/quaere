import { createGcManager } from './gcManager'
import { Mutation } from './mutation'
import { MutationCache } from './mutationCache'
import {
  NetworkMode,
  RetryDelayValue,
  RetryValue,
  Retryer,
  createRetryer,
} from './retryer'
import { createSubscribable } from './subscribable'
import { QueryMeta } from './typeUtils'
import { UNDEFINED } from './utils'

export type MutationFunctionContext = {
  meta: QueryMeta | undefined
}

export interface MutationInfoConfig<
  TData = unknown,
  TVars = unknown,
  TError = Error
> {
  options: MutationInfoOptions<TData, TVars, TError>
  cache: MutationCache
}

export type MutationStatus = 'idle' | 'mutating' | 'success' | 'error'

export interface MutationInfoState<
  TData = unknown,
  TVars = unknown,
  TError = Error
> {
  data?: TData
  error: TError | null
  status: MutationStatus
  variables?: TVars
}

export interface MutationInfoOptions<
  TData = unknown,
  TVars = unknown,
  TError = Error
> {
  mutation: Mutation<TData, TVars, TError>
  onSuccess?: (
    data: TData,
    variables: TVars,
    mutationInfo: MutationInfo<TData, TVars, TError>
  ) => Promise<unknown> | unknown
  onError?: (
    error: unknown,
    variables: TVars,
    mutationInfo: MutationInfo<TData, TVars, TError>
  ) => Promise<unknown> | unknown
  onSettled?: (
    data: TData | undefined,
    error: unknown | null,
    variables: TVars,
    mutationInfo: MutationInfo<TData, TVars, TError>
  ) => Promise<unknown> | unknown
  retry?: RetryValue<TError>
  retryDelay?: RetryDelayValue<TError>
  networkMode?: NetworkMode
  gcTime?: number
  _defaulted?: boolean
  meta?: QueryMeta
}

interface MutatingAction<TVars> {
  type: 'mutating'
  variables?: TVars
}

interface SuccessAction<TData> {
  type: 'success'
  data: TData
}

interface ErrorAction<TError> {
  type: 'error'
  error: TError
}

export type Action<TData, TVars, TError> =
  | ErrorAction<TError>
  | MutatingAction<TVars>
  | SuccessAction<TData>

export interface MutationInfo<TData = unknown, TVars = unknown, TError = Error>
  extends ReturnType<typeof createMutationInfo<TData, TVars, TError>> {}

type MutationInfoListener<TData, TVars, TError> = (
  state: MutationInfoState<TData, TVars, TError>
) => void

export function createMutationInfo<
  TData = unknown,
  TVars = unknown,
  TError = Error
>(config: MutationInfoConfig<TData, TVars, TError>) {
  const { cache } = config

  let state = getDefaultState<TData, TVars, TError>()

  const [updateGcTime, scheduleGc, clearGcTimeout] = createGcManager(
    function onRemove() {
      if (!hasListeners()) {
        if (state.status === 'mutating') {
          scheduleGc()
        } else {
          cache.remove(mutationInfo)
        }
      }
    }
  )

  const [listeners, subscribe, hasListeners] = createSubscribable<
    MutationInfoListener<TData, TVars, TError>
  >(
    function onSubscribe() {
      // Stop the mutation from being garbage collected
      clearGcTimeout()
    },
    function onUnsubscribe() {
      scheduleGc()
    }
  )

  let options = {} as Mutation<TData, TVars, TError> & {
    mutation?: Mutation<TData, TVars, TError>
  }
  const setOptions = (
    newOptions?: MutationInfoOptions<TData, TVars, TError>
  ) => {
    options = {
      ...config.options.mutation,
      ...newOptions,
    }

    updateGcTime(options.gcTime)
  }
  setOptions(config.options)
  scheduleGc()

  const dispatch = (action: Action<TData, TVars, TError>): void => {
    const reducer = (): MutationInfoState<TData, TVars, TError> => {
      switch (action.type) {
        case 'mutating':
          return {
            ...state,
            data: UNDEFINED,
            error: null,
            status: 'mutating',
            variables: action.variables,
          }
        case 'success':
          return {
            ...state,
            data: action.data,
            error: null,
            status: 'success',
          }
        case 'error':
          return {
            ...state,
            data: UNDEFINED,
            error: action.error,
            status: 'error',
          }
      }
    }
    state = reducer()

    listeners.forEach(l => l(state))

    cache.notify({
      mutationInfo,
      type: 'updated',
      action,
    })
  }

  let retryer: Retryer | undefined

  const trigger = async (variables: TVars): Promise<TData> => {
    const executeMutation = () => {
      retryer = createRetryer({
        fn: () => {
          if (process.env.NODE_ENV !== 'production') {
            if (!options.fetcher) {
              return Promise.reject(new Error('No fetcher found'))
            }
          }

          const mutationFunctionContext: MutationFunctionContext = {
            meta: options.meta,
          }

          return options.fetcher(variables, mutationFunctionContext)
        },
        retry: options.retry ?? 0,
        retryDelay: options.retryDelay,
        networkMode: options.networkMode,
      })

      return retryer.promise
    }

    const restored = state.status === 'mutating'

    try {
      if (!restored) {
        dispatch({ type: 'mutating', variables })
      }
      const data = (await executeMutation()) as TData

      await cache.config.onSuccess?.(data, variables, mutationInfo as any)
      await options.onSuccess?.(data, variables, mutationInfo)
      await cache.config.onSettled?.(data, null, variables, mutationInfo as any)
      await options.onSettled?.(data, null, variables, mutationInfo)

      dispatch({ type: 'success', data })
      return data
    } catch (error) {
      try {
        await cache.config.onError?.(error, variables, mutationInfo as any)
        await options.onError?.(error, variables, mutationInfo)
        await cache.config.onSettled?.(
          UNDEFINED,
          error,
          variables,
          mutationInfo as any
        )
        await options.onSettled?.(UNDEFINED, error, variables, mutationInfo)

        throw error
      } finally {
        dispatch({ type: 'error', error: error as TError })
      }
    }
  }

  const mutationInfo = {
    subscribe,
    trigger,
    setOptions,
    get state() {
      return state
    },
    get meta() {
      return options.meta
    },
    get mutation() {
      return options.mutation!
    },
  }

  return mutationInfo
}

export const getDefaultState = <TData, TVars, TError>(): MutationInfoState<
  TData,
  TVars,
  TError
> => {
  return {
    data: UNDEFINED,
    error: null,
    status: 'idle',
    variables: UNDEFINED,
  }
}
