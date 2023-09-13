import { BaseQuery } from './baseQuery'
import { ObservableQueryOptions } from './observableQuery'
import type { QueryClient } from './queryClient'
import type { QueryInfo, QueryInfoState } from './queryInfo'
import { QueryMeta } from './typeUtils'
import { isGeneratedKey, isPlainObject } from './utils'

// TYPES

export interface DehydrateOptions {
  shouldDehydrateQuery?: (queryInfo: QueryInfo) => boolean
}

export interface HydrateOptions {
  defaultOptions?: {
    queries?: Omit<
      ObservableQueryOptions<any, any, any>,
      'query' | '_defaulted'
    >
  }
}

interface DehydratedQuery {
  query: BaseQuery
  variables?: any
  queryHash: string
  state: QueryInfoState<any, any>
  meta?: QueryMeta
}

export type DehydratedState = {
  queries: DehydratedQuery[]
}

// Most config is not dehydrated but instead meant to configure again when
// consuming the de/rehydrated data, typically with useQuery on the client.
// Sometimes it might make sense to prefetch data on the server and include
// in the html-payload, but not consume it on the initial render.
const dehydrateQuery = ({
  query,
  queryHash,
  state,
  variables,
  meta,
}: QueryInfo): DehydratedQuery => {
  return {
    query: {
      key: query.key,
      ...(query.$inf$ && { $inf$: true }),
    } as BaseQuery,
    queryHash,
    state,
    ...(typeof variables !== 'undefined' && { variables }),
    ...(meta && { meta }),
  }
}

export const defaultShouldDehydrateQuery = (queryInfo: QueryInfo) => {
  return queryInfo.state.status === 'success'
}

export const dehydrate = (
  client: QueryClient,
  options: DehydrateOptions = {}
): DehydratedState => {
  const filterQuery =
    options.shouldDehydrateQuery ?? defaultShouldDehydrateQuery

  const queries = client
    .getQueryCache()
    .getAll()
    .flatMap(queryInfo =>
      !isGeneratedKey(queryInfo.query.key) && filterQuery(queryInfo)
        ? [dehydrateQuery(queryInfo)]
        : []
    )

  return { queries }
}

export const hydrate = (
  client: QueryClient,
  dehydratedState: unknown,
  options?: HydrateOptions
): void => {
  if (!isPlainObject(dehydratedState)) {
    return
  }

  const queryCache = client.getQueryCache()

  const { queries } = (dehydratedState as DehydratedState) || {}

  queries.forEach(({ state, ...queryOptions }) => {
    const queryInfo = queryCache.get(queryOptions.queryHash)

    // Reset fetch status to idle in the dehydrated state to avoid
    // queryInfo being stuck in fetching state upon hydration
    const dehydratedQueryState = {
      ...state,
      fetchStatus: 'idle' as const,
    }

    // Do not hydrate if an existing queryInfo exists with newer data
    if (queryInfo) {
      if (queryInfo.state.dataUpdatedAt < dehydratedQueryState.dataUpdatedAt) {
        queryInfo.setState(dehydratedQueryState)
      }
      return
    }

    // Restore queryInfo
    queryCache.build(
      client,
      {
        ...options?.defaultOptions?.queries,
        ...queryOptions,
      },
      dehydratedQueryState
    )
  })
}
