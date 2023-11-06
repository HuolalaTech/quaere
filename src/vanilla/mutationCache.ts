import { Mutation } from './mutation'
import {
  Action,
  MutationInfo,
  MutationInfoOptions,
  MutationStatus,
  createMutationInfo,
} from './mutationInfo'
import { QueryClient } from './queryClient'
import { DeepPartial, NotifyEvent } from './typeUtils'
import { UNDEFINED, getFullKey, hashKey, partialMatchKey } from './utils'

export interface MutationCache extends ReturnType<typeof createMutationCache> {}

export interface MutationCacheConfig {
  onSuccess?: (
    data: unknown,
    variables: unknown,
    mutationInfo: MutationInfo
  ) => Promise<unknown> | unknown
  onError?: (
    error: unknown,
    variables: unknown,
    mutationInfo: MutationInfo
  ) => Promise<unknown> | unknown
  onSettled?: (
    data: unknown,
    error: unknown | null,
    variables: unknown,
    mutationInfo: MutationInfo
  ) => Promise<unknown> | unknown
}

interface NotifyEventMutationAdded<TData, TVars, TError> extends NotifyEvent {
  type: 'added'
  mutationInfo: MutationInfo<TData, TVars, TError>
}
interface NotifyEventMutationRemoved<TData, TVars, TError> extends NotifyEvent {
  type: 'removed'
  mutationInfo: MutationInfo<TData, TVars, TError>
}

interface NotifyEventMutationUpdated<TData, TVars, TError> extends NotifyEvent {
  type: 'updated'
  mutationInfo: MutationInfo<TData, TVars, TError>
  action: Action<TData, TVars, TError>
}

export type MutationCacheNotifyEvent<TData, TVars, TError> =
  | NotifyEventMutationAdded<TData, TVars, TError>
  | NotifyEventMutationRemoved<TData, TVars, TError>
  | NotifyEventMutationUpdated<TData, TVars, TError>

export type MutationCacheListener<TData, TVars, TError> = (
  event: MutationCacheNotifyEvent<TData, TVars, TError>
) => void

export const createMutationCache = (config: MutationCacheConfig = {}) => {
  let mutations: MutationInfo<any, any, any>[] = []
  let lastUpdated = Date.now()

  const getLastUpdated = () => lastUpdated

  const listeners = new Set<MutationCacheListener<any, any, any>>()

  function subscribe<TData = unknown, TVars = unknown, TError = Error>(
    filters: MutationInfoFilters<TData, TVars, TError>,
    listener: MutationCacheListener<TData, TVars, TError>
  ): () => void
  function subscribe<TData = unknown, TVars = unknown, TError = Error>(
    listener: MutationCacheListener<TData, TVars, TError>
  ): () => void
  function subscribe(...args: any) {
    const [filters, listener] = args.length === 2 ? args : [UNDEFINED, args[0]]

    const wrappedListener = (
      event: MutationCacheNotifyEvent<any, any, any>
    ) => {
      if (!filters || matchMutationInfo(filters, event.mutationInfo)) {
        listener(event)
      }
    }

    listeners.add(wrappedListener)

    return () => {
      listeners.delete(wrappedListener)
    }
  }

  const notify = <TData, TVars, TError>(
    event: MutationCacheNotifyEvent<TData, TVars, TError>
  ) => {
    lastUpdated = Date.now()
    listeners.forEach(listener => listener(event))
  }

  const build = <TData = unknown, TVars = unknown, TError = Error>(
    client: QueryClient,
    options: MutationInfoOptions<TData, TVars, TError>
  ): MutationInfo<TData, TVars, TError> => {
    const mutationInfo = createMutationInfo({
      cache,
      options: client.defaultMutationOptions(options),
    })

    mutations.push(mutationInfo)

    notify({
      type: 'added',
      mutationInfo,
    })

    return mutationInfo
  }

  const remove = (mutationInfo: MutationInfo<any, any, any>): void => {
    mutations = mutations.filter(x => x !== mutationInfo)
    notify({
      type: 'removed',
      mutationInfo,
    })
  }

  const clear = (): void => {
    mutations.forEach(mutationInfo => {
      notify({
        type: 'removed',
        mutationInfo,
      })
    })
    mutations = []
  }

  const getAll = (): MutationInfo[] => {
    return mutations
  }

  const find = <TData = unknown, TVars = unknown, TError = Error>(
    filters: MutationInfoFilters<TData, TVars, TError>
  ): MutationInfo<TData, TVars, TError> | undefined => {
    return mutations.find(mutationInfo =>
      matchMutationInfo(filters, mutationInfo)
    ) as MutationInfo<TData, TVars, TError> | undefined
  }

  const findAll = <TData = unknown, TVars = unknown, TError = Error>(
    filters: MutationInfoFilters<TData, TVars, TError> = {}
  ): MutationInfo<TData, TVars, TError>[] => {
    return mutations.filter(mutation =>
      matchMutationInfo(filters, mutation)
    ) as unknown as MutationInfo<TData, TVars, TError>[]
  }

  const cache = {
    build,
    remove,
    clear,
    getAll,
    find,
    findAll,
    subscribe,
    notify,
    config,
    getLastUpdated,
  }

  return cache
}

export interface MutationInfoFilters<
  TData = unknown,
  TVars = unknown,
  TError = Error
> {
  /**
   * Include mutations matching this predicate function
   */
  predicate?: (mutationInfo: MutationInfo<TData, TVars, TError>) => boolean
  /**
   * Include mutations matching this mutation key
   */
  mutation?: Mutation<TData, TVars, TError>
  /**
   * Filter by mutation status
   */
  status?: MutationStatus
  /**
   * Filter by mutation variables
   */
  variables?: DeepPartial<TVars>
  /**
   * Match mutation key exactly
   */
  exact?: boolean
}

const matchMutationInfo = (
  filters: MutationInfoFilters<any, any, any>,
  mutationInfo: MutationInfo<any, any, any>
): boolean => {
  const { status, variables, predicate, mutation, exact } = filters

  if (mutation) {
    if (exact) {
      if (
        hashKey(getFullKey(mutation.key, variables)) !==
        hashKey(
          getFullKey(mutationInfo.mutation.key, mutationInfo.state.variables)
        )
      ) {
        return false
      }
    } else if (
      !partialMatchKey(
        getFullKey(mutationInfo.mutation.key, mutationInfo.state.variables),
        getFullKey(mutation.key, variables)
      )
    ) {
      return false
    }
  }

  if (status && mutationInfo.state.status !== status) {
    return false
  }

  if (predicate && !predicate(mutationInfo)) {
    return false
  }

  return true
}
