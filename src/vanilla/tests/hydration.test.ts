import { expect, vi } from 'vitest'

import { dehydrate, hydrate } from '../hydration'
import { query } from '../query'
import { createQueryCache } from '../queryCache'
import { createQueryClient } from '../queryClient'
import { sleep } from './utils'

async function fetchData<TData>(value: TData, ms?: number): Promise<TData> {
  await sleep(ms || 0)
  return value
}

describe('dehydration and rehydration', () => {
  it('should work with serializeable values', async () => {
    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })

    const stringQuery = query({
      key: 'string',
      fetcher: vi.fn().mockImplementation(() => fetchData('string')),
    })

    const numberQuery = query({
      key: 'number',
      fetcher: vi.fn().mockImplementation(() => fetchData(1)),
    })

    const booleanQuery = query({
      key: 'boolean',
      fetcher: vi.fn().mockImplementation(() => fetchData(true)),
    })

    const nullQuery = query({
      key: 'null',
      fetcher: vi.fn().mockImplementation(() => fetchData(null)),
    })

    const arrayQuery = query({
      key: 'array',
      fetcher: vi.fn().mockImplementation(() => fetchData(['string', 0])),
    })

    const nestedQuery = query({
      key: 'nested',
      fetcher: vi
        .fn()
        .mockImplementation(() => fetchData({ key: [{ nestedKey: 1 }] })),
    })

    await queryClient.prefetchQuery({ query: stringQuery })
    await queryClient.prefetchQuery({ query: numberQuery })
    await queryClient.prefetchQuery({ query: booleanQuery })
    await queryClient.prefetchQuery({ query: nullQuery })
    await queryClient.prefetchQuery({ query: arrayQuery })
    await queryClient.prefetchQuery({ query: nestedQuery })
    const dehydrated = dehydrate(queryClient)
    const stringified = JSON.stringify(dehydrated)

    // ---

    const parsed = JSON.parse(stringified)

    const hydrationCache = createQueryCache()
    const hydrationClient = createQueryClient({
      queryCache: hydrationCache,
    })
    hydrate(hydrationClient, parsed)
    expect(hydrationCache.find({ query: stringQuery })?.state.data).toBe(
      'string'
    )
    expect(hydrationCache.find({ query: numberQuery })?.state.data).toBe(1)
    expect(hydrationCache.find({ query: booleanQuery })?.state.data).toBe(true)
    expect(hydrationCache.find({ query: nullQuery })?.state.data).toBe(null)
    expect(hydrationCache.find({ query: arrayQuery })?.state.data).toEqual([
      'string',
      0,
    ])
    expect(hydrationCache.find({ query: nestedQuery })?.state.data).toEqual({
      key: [{ nestedKey: 1 }],
    })

    await hydrationClient.prefetchQuery({
      query: stringQuery,
      staleTime: 1000,
    })
    await hydrationClient.prefetchQuery({
      query: numberQuery,
      staleTime: 1000,
    })
    await hydrationClient.prefetchQuery({
      query: booleanQuery,
      staleTime: 1000,
    })
    await hydrationClient.prefetchQuery({
      query: nullQuery,
      staleTime: 1000,
    })
    await hydrationClient.prefetchQuery({
      query: arrayQuery,
      staleTime: 1000,
    })
    await hydrationClient.prefetchQuery({
      query: nestedQuery,
      staleTime: 1000,
    })
    ;[
      stringQuery,
      numberQuery,
      booleanQuery,
      nullQuery,
      arrayQuery,
      nestedQuery,
    ].forEach(query => {
      expect(query.fetcher).toHaveBeenCalledTimes(1)
    })

    queryClient.clear()
    hydrationClient.clear()
  })

  it('should not dehydrate queries if dehydrateQueries is set to false', async () => {
    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })
    const stringQuery = query({
      key: 'string',
      fetcher: () => fetchData('string'),
    })

    await queryClient.prefetchQuery({ query: stringQuery })

    const dehydrated = dehydrate(queryClient, {
      shouldDehydrateQuery: () => false,
    })

    expect(dehydrated.queries.length).toBe(0)

    queryClient.clear()
  })

  it('should use the garbage collection time from the client', async () => {
    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })
    const stringQuery = query({
      key: 'string',
      fetcher: () => fetchData('string'),
      gcTime: 50,
    })
    await queryClient.prefetchQuery({
      query: stringQuery,
    })
    const dehydrated = dehydrate(queryClient)
    const stringified = JSON.stringify(dehydrated)

    await sleep(20)

    // ---

    const parsed = JSON.parse(stringified)
    const hydrationCache = createQueryCache()
    const hydrationClient = createQueryClient({ queryCache: hydrationCache })
    hydrate(hydrationClient, parsed)
    expect(hydrationCache.find({ query: stringQuery })?.state.data).toBe(
      'string'
    )
    await sleep(100)
    expect(hydrationCache.find({ query: stringQuery })).toBeTruthy()

    queryClient.clear()
    hydrationClient.clear()
  })

  it('should be able to provide default options for the hydrated queries', async () => {
    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })
    const stringQuery = query({
      key: 'string',
      fetcher: () => fetchData('string'),
      gcTime: 50,
    })
    await queryClient.prefetchQuery({
      query: stringQuery,
    })
    const dehydrated = dehydrate(queryClient)
    const stringified = JSON.stringify(dehydrated)
    const parsed = JSON.parse(stringified)
    const hydrationCache = createQueryCache()
    const hydrationClient = createQueryClient({ queryCache: hydrationCache })
    hydrate(hydrationClient, parsed, {
      defaultOptions: { queries: { retry: 10 } },
    })
    expect(hydrationCache.find({ query: stringQuery })?.options.retry).toBe(10)
    queryClient.clear()
    hydrationClient.clear()
  })

  it('should work with variables', async () => {
    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })
    const stringQuery = query({
      key: 'string',
      fetcher: vi
        .fn()
        .mockImplementation((_variables: { key: ['string']; key2: 0 }) =>
          fetchData('string')
        ),
      gcTime: 50,
    })
    await queryClient.prefetchQuery({
      query: stringQuery,
      variables: { key: ['string'], key2: 0 },
    })
    const dehydrated = dehydrate(queryClient)
    const stringified = JSON.stringify(dehydrated)

    // ---

    const parsed = JSON.parse(stringified)
    const hydrationCache = createQueryCache()
    const hydrationClient = createQueryClient({ queryCache: hydrationCache })
    hydrate(hydrationClient, parsed)
    expect(
      hydrationCache.find({
        query: stringQuery,
        variables: { key: ['string'], key2: 0 },
      })?.state.data
    ).toBe('string')

    await hydrationClient.prefetchQuery({
      query: stringQuery,
      variables: { key: ['string'], key2: 0 },
      staleTime: 100,
    })
    expect(stringQuery.fetcher).toHaveBeenCalledTimes(1)

    queryClient.clear()
    hydrationClient.clear()
  })

  it('should only hydrate successful queries by default', async () => {
    const consoleMock = vi.spyOn(console, 'error')
    consoleMock.mockImplementation(() => undefined)

    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })
    const successQuery = query({
      key: 'success',
      fetcher: () => fetchData('success'),
    })
    const loadingQuery = query({
      key: 'loading',
      fetcher: () => fetchData('loading', 10000),
    })
    const errorQuery = query({
      key: 'error',
      fetcher: () => {
        throw new Error()
      },
    })
    await queryClient.prefetchQuery({
      query: successQuery,
    })
    queryClient.prefetchQuery({
      query: loadingQuery,
    })
    await queryClient.prefetchQuery({
      query: errorQuery,
    })
    const dehydrated = dehydrate(queryClient)
    const stringified = JSON.stringify(dehydrated)

    // ---

    const parsed = JSON.parse(stringified)
    const hydrationCache = createQueryCache()
    const hydrationClient = createQueryClient({ queryCache: hydrationCache })
    hydrate(hydrationClient, parsed)

    expect(hydrationCache.find({ query: successQuery })).toBeTruthy()
    expect(hydrationCache.find({ query: loadingQuery })).toBeFalsy()
    expect(hydrationCache.find({ query: errorQuery })).toBeFalsy()

    queryClient.clear()
    hydrationClient.clear()
    consoleMock.mockRestore()
  })

  it('should filter queries via dehydrateQuery', async () => {
    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })
    const stringQuery = query({
      key: 'string',
      fetcher: () => fetchData('string'),
    })
    const numberQuery = query({
      key: 'number',
      fetcher: () => fetchData(1),
    })

    await queryClient.prefetchQuery({
      query: stringQuery,
    })
    await queryClient.prefetchQuery({
      query: numberQuery,
    })
    const dehydrated = dehydrate(queryClient, {
      shouldDehydrateQuery: ({ query }) => query.key !== stringQuery.key,
    })

    // This is testing implementation details that can change and are not
    // part of the public API, but is important for keeping the payload small
    const dehydratedQuery = dehydrated.queries.find(
      ({ query }) => query.key === stringQuery.key
    )
    expect(dehydratedQuery).toBeUndefined()

    const stringified = JSON.stringify(dehydrated)

    // ---

    const parsed = JSON.parse(stringified)
    const hydrationCache = createQueryCache()
    const hydrationClient = createQueryClient({ queryCache: hydrationCache })
    hydrate(hydrationClient, parsed)
    expect(hydrationCache.find({ query: stringQuery })).toBeUndefined()
    expect(hydrationCache.find({ query: numberQuery })?.state.data).toBe(1)

    queryClient.clear()
    hydrationClient.clear()
  })

  it('should not overwrite query in cache if hydrated query is older', async () => {
    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })
    const stringQuery = query({
      key: 'string',
      fetcher: () => fetchData('string-older', 5),
    })
    await queryClient.prefetchQuery({
      query: stringQuery,
    })
    const dehydrated = dehydrate(queryClient)
    const stringified = JSON.stringify(dehydrated)

    // ---

    const parsed = JSON.parse(stringified)
    const hydrationCache = createQueryCache()
    const hydrationClient = createQueryClient({ queryCache: hydrationCache })
    stringQuery.fetcher = () => fetchData('string-newer', 5)
    await hydrationClient.prefetchQuery({
      query: stringQuery,
    })

    hydrate(hydrationClient, parsed)
    expect(hydrationCache.find({ query: stringQuery })?.state.data).toBe(
      'string-newer'
    )

    queryClient.clear()
    hydrationClient.clear()
  })

  it('should overwrite query in cache if hydrated query is newer', async () => {
    const hydrationCache = createQueryCache()
    const hydrationClient = createQueryClient({ queryCache: hydrationCache })
    const stringQuery = query({
      key: 'string',
      fetcher: () => fetchData('string-older', 5),
    })
    await hydrationClient.prefetchQuery({
      query: stringQuery,
    })

    // ---

    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })
    stringQuery.fetcher = () => fetchData('string-newer', 5)
    await queryClient.prefetchQuery({
      query: stringQuery,
    })
    const dehydrated = dehydrate(queryClient)
    const stringified = JSON.stringify(dehydrated)

    // ---

    const parsed = JSON.parse(stringified)
    hydrate(hydrationClient, parsed)
    expect(hydrationCache.find({ query: stringQuery })?.state.data).toBe(
      'string-newer'
    )

    queryClient.clear()
    hydrationClient.clear()
  })

  it('should not hydrate if the hydratedState is null or is not an object', async () => {
    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })

    expect(() => hydrate(queryClient, null)).not.toThrow()
    expect(() => hydrate(queryClient, 'invalid')).not.toThrow()

    queryClient.clear()
  })

  it('should set the fetchStatus to idle in all cases when dehydrating', async () => {
    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })

    let isInitialFetch = true
    let resolvePromise: (value: unknown) => void = () => undefined

    const customFetchData = () => {
      const promise = new Promise(resolve => {
        resolvePromise = resolve
      })
      // Resolve the promise in initial fetch
      // because we are awaiting the query first time
      if (isInitialFetch) {
        resolvePromise('string')
      }
      isInitialFetch = false
      return promise
    }

    const stringQuery = query({
      key: 'string',
      fetcher: () => customFetchData(),
    })

    await queryClient.prefetchQuery({
      query: stringQuery,
    })

    queryClient.refetchQueries({ query: stringQuery })

    const dehydrated = dehydrate(queryClient)
    resolvePromise('string')
    expect(
      dehydrated.queries.find(q => q.queryHash === '["string"]')?.state
        .fetchStatus
    ).toBe('fetching')
    const stringified = JSON.stringify(dehydrated)

    // ---
    const parsed = JSON.parse(stringified)
    const hydrationCache = createQueryCache()
    const hydrationClient = createQueryClient({ queryCache: hydrationCache })
    hydrate(hydrationClient, parsed)
    expect(hydrationCache.find({ query: stringQuery })?.state.fetchStatus).toBe(
      'idle'
    )
  })

  it('should dehydrate and hydrate meta for queries', async () => {
    const queryCache = createQueryCache()
    const queryClient = createQueryClient({ queryCache })
    const metaQuery = query({
      key: 'meta',
      fetcher: () => fetchData('meta'),
      meta: {
        some: 'meta',
      },
    })
    const noMetaQuery = query({
      key: 'no-meta',
      fetcher: () => fetchData('no-meta'),
    })

    await queryClient.prefetchQuery({
      query: metaQuery,
    })
    await queryClient.prefetchQuery({
      query: noMetaQuery,
    })

    const dehydrated = dehydrate(queryClient)

    expect(
      dehydrated.queries.find(q => q.queryHash === '["meta"]')?.meta
    ).toEqual({
      some: 'meta',
    })

    expect(
      dehydrated.queries.find(q => q.queryHash === '["no-meta"]')?.meta
    ).toEqual(undefined)

    expect(
      Object.keys(dehydrated.queries.find(q => q.queryHash === '["no-meta"]')!)
    ).not.toEqual(expect.arrayContaining(['meta']))

    const stringified = JSON.stringify(dehydrated)

    // ---

    const parsed = JSON.parse(stringified)
    const hydrationCache = createQueryCache()
    const hydrationClient = createQueryClient({
      queryCache: hydrationCache,
    })
    hydrate(hydrationClient, parsed)
    expect(hydrationCache.find({ query: metaQuery })?.meta).toEqual({
      some: 'meta',
    })
    expect(hydrationCache.find({ query: noMetaQuery })?.meta).toEqual(undefined)
  })
})
