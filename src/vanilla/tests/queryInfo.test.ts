import { waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { createQueryClient, onlineManager, query } from '..'
import type { QueryCache, QueryClient } from '..'
import {
  ObservableQueryResult,
  createObservableQuery,
} from '../observableQuery'
import { isCancelledError } from '../retryer'
import { QueryFunctionContext } from '../typeUtils'
import { generatekey } from '../utils'
import { mockVisibilityState, setIsServer, sleep } from './utils'

describe('query', () => {
  let queryClient: QueryClient
  let queryCache: QueryCache

  beforeEach(() => {
    queryClient = createQueryClient()
    queryCache = queryClient.getQueryCache()
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('should continue retry after focus regain and resolve all promises', async () => {
    // make page unfocused
    const visibilityMock = mockVisibilityState('hidden')

    let count = 0
    let result

    const anQuery = query({
      key: generatekey(),
      fetcher: async () => {
        count++

        if (count === 3) {
          return `data${count}`
        }

        throw new Error(`error${count}`)
      },
      retry: 3,
      retryDelay: 1,
    })

    const promise = queryClient.fetchQuery({
      query: anQuery,
    })

    promise.then(data => {
      result = data
    })

    // Check if we do not have a result
    expect(result).toBeUndefined()

    // Check if the query is really paused
    await sleep(50)
    expect(result).toBeUndefined()

    // Reset visibilityState to original value
    visibilityMock.mockRestore()
    window.dispatchEvent(new Event('visibilitychange'))

    // There should not be a result yet
    expect(result).toBeUndefined()

    // By now we should have a value
    await sleep(50)
    expect(result).toBe('data3')
  })

  it('should continue retry after reconnect and resolve all promises', async () => {
    onlineManager.setOnline(false)

    let count = 0
    let result

    const anQuery = query({
      key: generatekey(),
      fetcher: async () => {
        count++

        if (count === 3) {
          return `data${count}`
        }

        throw new Error(`error${count}`)
      },
      retry: 3,
      retryDelay: 1,
    })

    const promise = queryClient.fetchQuery({
      query: anQuery,
    })

    promise.then(data => {
      result = data
    })

    // Check if we do not have a result
    expect(result).toBeUndefined()

    // Check if the query is really paused
    await sleep(50)
    expect(result).toBeUndefined()

    // Reset navigator to original value
    onlineManager.setOnline(true)

    // There should not be a result yet
    expect(result).toBeUndefined()

    // Promise should eventually be resolved
    await promise
    expect(result).toBe('data3')
  })

  it('should throw a CancelledError when a paused query is cancelled', async () => {
    // make page unfocused
    const visibilityMock = mockVisibilityState('hidden')

    let count = 0
    let result

    const anQuery = query({
      key: generatekey(),
      fetcher: async (): Promise<unknown> => {
        count++
        throw new Error(`error${count}`)
      },
      retry: 3,
      retryDelay: 1,
    })

    const promise = queryClient.fetchQuery({
      query: anQuery,
    })

    promise.catch(data => {
      result = data
    })

    const queryInfo = queryCache.find({ query: anQuery })!

    // Check if the query is really paused
    await sleep(50)
    expect(result).toBeUndefined()

    // Cancel query
    queryInfo.cancel()

    // Check if the error is set to the cancelled error
    try {
      await promise
    } catch {
      expect(isCancelledError(result)).toBe(true)
    } finally {
      // Reset visibilityState to original value
      visibilityMock.mockRestore()
    }
  })

  it('should provide context to queryFn', async () => {
    const queryFn = vi
      .fn<[string, QueryFunctionContext], Promise<'data'>>()
      .mockResolvedValue('data')

    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })

    queryClient.prefetchQuery({ query: anQuery, variables: '1' })

    await sleep(10)

    expect(queryFn).toHaveBeenCalledTimes(1)
    const variables = queryFn.mock.calls[0]![0]
    const args = queryFn.mock.calls[0]![1]
    expect(args).toBeDefined()
    // @ts-expect-error page param should be undefined
    expect(args.pageParam).toBeUndefined()
    expect(variables).toEqual('1')
    expect(args.signal).toBeInstanceOf(AbortSignal)
  })

  it('should continue if cancellation is not supported and signal is not consumed', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: async () => {
        await sleep(100)
        return 'data'
      },
    })

    queryClient.prefetchQuery({
      query: anQuery,
    })

    await sleep(10)

    // Subscribe and unsubscribe to simulate cancellation because the last observer unsubscribed
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      enabled: false,
    })
    const unsubscribe = observer.subscribe(() => undefined)
    unsubscribe()

    await sleep(100)

    const queryInfo = queryCache.find({ query: anQuery })!

    expect(queryInfo.state).toMatchObject({
      data: 'data',
      status: 'success',
    })
  })

  it('should not continue when last observer unsubscribed if the signal was consumed', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: async (_, { signal }) => {
        await sleep(100)
        return signal.aborted ? 'aborted' : 'data'
      },
    })

    queryClient.prefetchQuery({
      query: anQuery,
    })

    await sleep(10)

    // Subscribe and unsubscribe to simulate cancellation because the last observer unsubscribed
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      enabled: false,
    })
    const unsubscribe = observer.subscribe(() => undefined)
    unsubscribe()

    await sleep(100)

    const queryInfo = queryCache.find({ query: anQuery })!

    expect(queryInfo.state).toMatchObject({
      data: undefined,
      status: 'pending',
      fetchStatus: 'idle',
    })
  })

  it('should provide an AbortSignal to the queryFn that provides info about the cancellation state', async () => {
    const queryFn = vi.fn<[undefined, QueryFunctionContext], Promise<unknown>>()

    const onAbort = vi.fn()
    const abortListener = vi.fn()
    let error

    queryFn.mockImplementation(async (_, { signal }) => {
      signal.onabort = onAbort
      signal.addEventListener('abort', abortListener)
      await sleep(10)
      signal.onabort = null
      signal.removeEventListener('abort', abortListener)
      throw new Error()
    })

    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })

    const promise = queryClient.fetchQuery({
      query: anQuery,
      retry: 3,
      retryDelay: 10,
    })

    promise.catch(e => {
      error = e
    })

    const queryInfo = queryCache.find({ query: anQuery })!

    expect(queryFn).toHaveBeenCalledTimes(1)

    const signal = queryFn.mock.calls[0]![1].signal
    expect(signal.aborted).toBe(false)
    expect(onAbort).not.toHaveBeenCalled()
    expect(abortListener).not.toHaveBeenCalled()

    queryInfo.cancel()

    await sleep(100)

    expect(signal.aborted).toBe(true)
    expect(onAbort).toHaveBeenCalledTimes(1)
    expect(abortListener).toHaveBeenCalledTimes(1)
    expect(isCancelledError(error)).toBe(true)
  })

  it('should not continue if explicitly cancelled', async () => {
    const queryFn = vi.fn<[undefined, unknown], unknown>()

    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })

    queryFn.mockImplementation(async () => {
      await sleep(10)
      throw new Error()
    })

    let error

    const promise = queryClient.fetchQuery({
      query: anQuery,
      retry: 3,
      retryDelay: 10,
    })

    promise.catch(e => {
      error = e
    })

    const queryInfo = queryCache.find({ query: anQuery })!
    queryInfo.cancel()

    await sleep(100)

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(isCancelledError(error)).toBe(true)
  })

  it('should not error if reset while pending', async () => {
    const queryFn = vi.fn<[undefined, unknown], unknown>()

    queryFn.mockImplementation(async () => {
      await sleep(10)
      throw new Error()
    })

    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })

    queryClient.fetchQuery({ query: anQuery, retry: 3, retryDelay: 10 })

    // Ensure the query is pending
    const queryInfo = queryCache.find({ query: anQuery })!
    expect(queryInfo.state.status).toBe('pending')

    // Reset the query while it is pending
    queryInfo.reset()

    await sleep(100)

    // The query should
    expect(queryFn).toHaveBeenCalledTimes(1) // have been called,
    expect(queryInfo.state.error).toBe(null) // not have an error, and
    expect(queryInfo.state.fetchStatus).toBe('idle') // not be loading any longer
  })

  it('should be able to refetch a cancelled query', async () => {
    const queryFn = vi.fn<[undefined, unknown], unknown>()

    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })

    queryFn.mockImplementation(async () => {
      await sleep(50)
      return 'data'
    })

    queryClient.prefetchQuery({ query: anQuery })
    const queryInfo = queryCache.find({ query: anQuery })!
    await sleep(10)
    queryInfo.cancel()
    await sleep(100)

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(isCancelledError(queryInfo.state.error)).toBe(true)
    const result = await queryInfo.fetch()
    expect(result).toBe('data')
    expect(queryInfo.state.error).toBe(null)
    expect(queryFn).toHaveBeenCalledTimes(2)
  })

  it('cancelling a resolved query should not have any effect', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: async () => 'data',
    })
    await queryClient.prefetchQuery({
      query: anQuery,
    })
    const queryInfo = queryCache.find({ query: anQuery })!
    queryInfo.cancel()
    await sleep(10)
    expect(queryInfo.state.data).toBe('data')
  })

  it('cancelling a rejected query should not have any effect', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: async (): Promise<unknown> => {
        throw error
      },
    })
    const error = new Error('error')

    await queryClient.prefetchQuery({
      query: anQuery,
    })
    const queryInfo = queryCache.find({ query: anQuery })!
    queryInfo.cancel()
    await sleep(10)

    expect(queryInfo.state.error).toBe(error)
    expect(isCancelledError(queryInfo.state.error)).toBe(false)
  })

  it('the previous query status should be kept when refetching', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => 'data',
    })

    await queryClient.prefetchQuery({ query: anQuery })
    const queryInfo = queryCache.find({ query: anQuery })!
    expect(queryInfo.state.status).toBe('success')

    anQuery.fetcher = () => Promise.reject<string>('reject')
    await queryClient.prefetchQuery({
      query: anQuery,
      retry: false,
    })
    expect(queryInfo.state.status).toBe('error')

    anQuery.fetcher = (async () => {
      await sleep(10)
      return Promise.reject<unknown>('reject')
    }) as any
    queryClient.prefetchQuery({
      query: anQuery,
      retry: false,
    })
    expect(queryInfo.state.status).toBe('error')

    await sleep(100)
    expect(queryInfo.state.status).toBe('error')
  })

  it('queries with gcTime 0 should be removed immediately after unsubscribing', async () => {
    let count = 0
    const anQuery = query({
      key: generatekey(),
      fetcher: () => {
        count++
        return 'data'
      },
      gcTime: 0,
      staleTime: Infinity,
    })

    const observer = createObservableQuery(queryClient, {
      query: anQuery,
    })
    const unsubscribe1 = observer.subscribe(() => undefined)
    unsubscribe1()
    await waitFor(() =>
      expect(queryCache.find({ query: anQuery })).toBeUndefined()
    )
    const unsubscribe2 = observer.subscribe(() => undefined)
    unsubscribe2()

    await waitFor(() =>
      expect(queryCache.find({ query: anQuery })).toBeUndefined()
    )
    expect(count).toBe(1)
  })

  it('should be garbage collected when unsubscribed to', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: async () => 'data',
      gcTime: 0,
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
    })
    expect(queryCache.find({ query: anQuery })).toBeDefined()
    const unsubscribe = observer.subscribe(() => undefined)
    expect(queryCache.find({ query: anQuery })).toBeDefined()
    unsubscribe()
    await waitFor(() =>
      expect(queryCache.find({ query: anQuery })).toBeUndefined()
    )
  })

  it('should be garbage collected later when unsubscribed and query is fetching', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: async () => {
        await sleep(20)
        return 'data'
      },
      gcTime: 10,
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      gcTime: 10,
    })
    const unsubscribe = observer.subscribe(() => undefined)
    await sleep(20)
    expect(queryCache.find({ query: anQuery })).toBeDefined()
    observer.refetch()
    unsubscribe()
    await sleep(10)
    // unsubscribe should not remove even though gcTime has elapsed b/c query is still fetching
    expect(queryCache.find({ query: anQuery })).toBeDefined()
    await sleep(10)
    // should be removed after an additional staleTime wait
    await waitFor(() =>
      expect(queryCache.find({ query: anQuery })).toBeUndefined()
    )
  })

  it('should not be garbage collected unless there are no subscribers', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: async () => 'data',
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      gcTime: 0,
    })
    expect(queryCache.find({ query: anQuery })).toBeDefined()
    const unsubscribe = observer.subscribe(() => undefined)
    await sleep(100)
    expect(queryCache.find({ query: anQuery })).toBeDefined()
    unsubscribe()
    await sleep(100)
    expect(queryCache.find({ query: anQuery })).toBeUndefined()
    queryClient.setQueryData({ query: anQuery }, 'data')
    await sleep(100)
    expect(queryCache.find({ query: anQuery })).toBeDefined()
  })

  it('should return proper count of observers', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: async () => 'data',
    })
    const observer = createObservableQuery(queryClient, { query: anQuery })
    const observer2 = createObservableQuery(queryClient, { query: anQuery })
    const observer3 = createObservableQuery(queryClient, { query: anQuery })
    const queryInfo = queryCache.find({ query: anQuery })

    expect(queryInfo?.getObserversCount()).toEqual(0)

    const unsubscribe1 = observer.subscribe(() => undefined)
    const unsubscribe2 = observer2.subscribe(() => undefined)
    const unsubscribe3 = observer3.subscribe(() => undefined)
    expect(queryInfo?.getObserversCount()).toEqual(3)

    unsubscribe3()
    expect(queryInfo?.getObserversCount()).toEqual(2)

    unsubscribe2()
    expect(queryInfo?.getObserversCount()).toEqual(1)

    unsubscribe1()
    expect(queryInfo?.getObserversCount()).toEqual(0)
  })

  it('stores meta object in query', async () => {
    const meta = {
      it: 'works',
    }

    const anQuery = query({
      key: generatekey(),
      fetcher: async () => 'data',
      meta,
    })

    await queryClient.prefetchQuery({
      query: anQuery,
      meta,
    })

    const queryInfo = queryCache.find({ query: anQuery })!

    expect(queryInfo.meta).toBe(meta)
    expect(queryInfo.options.meta).toBe(meta)
  })

  it('updates meta object on change', async () => {
    const meta = {
      it: 'works',
    }

    const anQuery = query({
      key: generatekey(),
      fetcher: () => 'data',
    })

    await queryClient.prefetchQuery({ query: anQuery, meta })

    await queryClient.prefetchQuery({ query: anQuery, meta: undefined })

    const queryInfo = queryCache.find({ query: anQuery })!

    expect(queryInfo.meta).toBeUndefined()
    expect(queryInfo.options.meta).toBeUndefined()
  })

  it('can use default meta', async () => {
    const meta = {
      it: 'works',
    }

    const anQuery = query({
      key: generatekey(),
      fetcher: () => 'data',
      meta,
    })

    await queryClient.prefetchQuery({ query: anQuery })

    const queryInfo = queryCache.find({ query: anQuery })!

    expect(queryInfo.meta).toBe(meta)
  })

  it('provides meta object inside query function', async () => {
    const meta = {
      it: 'works',
    }

    const queryFn = vi.fn(() => 'data')

    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })

    await queryClient.prefetchQuery({ query: anQuery, meta })

    const args = (queryFn.mock.calls[0] as any)[1]

    expect(args).toMatchObject({
      meta,
    })
  })

  it('should refetch the observer when online method is called', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => 'data',
    })

    const observer = createObservableQuery(queryClient, {
      query: anQuery,
    })

    const refetchSpy = vi.spyOn(observer, 'refetch')
    const unsubscribe = observer.subscribe(() => undefined)
    queryCache.onOnline()

    // Should refetch the observer
    expect(refetchSpy).toHaveBeenCalledTimes(1)

    unsubscribe()
    refetchSpy.mockRestore()
  })

  it('should not add an existing observer', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => 'data',
    })

    await queryClient.prefetchQuery({ query: anQuery })
    const queryInfo = queryCache.find({ query: anQuery })!
    expect(queryInfo.getObserversCount()).toEqual(0)

    const observer = createObservableQuery(queryClient, {
      query: anQuery,
    })
    expect(queryInfo.getObserversCount()).toEqual(0)

    queryInfo.subscribe(observer)
    expect(queryInfo.getObserversCount()).toEqual(1)

    queryInfo.subscribe(observer)
    expect(queryInfo.getObserversCount()).toEqual(1)
  })

  it('should not change state on invalidate() if already invalidated', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: async () => 'data',
    })

    await queryClient.prefetchQuery({ query: anQuery })
    const queryInfo = queryCache.find({ query: anQuery })!

    queryInfo.invalidate()
    expect(queryInfo.state.isInvalidated).toBeTruthy()

    const previousState = queryInfo.state

    queryInfo.invalidate()

    expect(queryInfo.state).toBe(previousState)
  })

  it('fetch should not dispatch "fetch" query is already fetching', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: async () => {
        await sleep(10)
        return 'data'
      },
    })

    const updates: Array<string> = []

    await queryClient.prefetchQuery({ query: anQuery })
    const queryInfo = queryCache.find({ query: anQuery })!

    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      updates.push(event.type)
    })

    void queryInfo.fetch({
      query: anQuery,
    })

    await queryInfo.fetch({
      query: anQuery,
    })

    expect(updates).toEqual([
      'updated', // type: 'fetch'
      'updated', // type: 'success'
    ])

    unsubscribe()
  })

  it('fetch should dispatch an error if the queryFn returns undefined', async () => {
    const consoleMock = vi.spyOn(console, 'error')
    consoleMock.mockImplementation(() => undefined)

    const key = generatekey()

    const anQuery = query({
      key,
      fetcher: async () => undefined,
      retry: false,
    })

    const observer = createObservableQuery(queryClient, {
      query: anQuery,
    })

    let observerResult: ObservableQueryResult<unknown, unknown> | undefined

    const unsubscribe = observer.subscribe(result => {
      observerResult = result
    })

    await sleep(10)

    const error = new Error(`${JSON.stringify([key])} data is undefined`)

    expect(observerResult).toMatchObject({
      error,
    })

    expect(consoleMock).toHaveBeenCalledWith(
      `Query data cannot be undefined. Please make sure to return a value other than undefined from your query function. Affected query key: ["${[
        key,
      ]}"]`
    )
    unsubscribe()
    consoleMock.mockRestore()
  })

  it('should not retry on the server', async () => {
    const resetIsServer = setIsServer(true)

    let count = 0

    const anQuery = query({
      key: generatekey(),
      fetcher: () => {
        count++
        return Promise.reject(new Error('error'))
      },
    })

    const observer = createObservableQuery(queryClient, {
      query: anQuery,
    })

    await observer.refetch()

    expect(count).toBe(1)

    resetIsServer()
  })

  it('constructor should call initialDataUpdatedAt if defined as a function', async () => {
    const initialDataUpdatedAtSpy = vi.fn()

    const anQuery = query({
      key: generatekey(),
      fetcher: () => 'data',
    })

    await queryClient.prefetchQuery({
      query: anQuery,
      initialData: 'initial',
      initialDataUpdatedAt: initialDataUpdatedAtSpy,
    })

    expect(initialDataUpdatedAtSpy).toHaveBeenCalled()
  })

  it('queries should be garbage collected even if they never fetched', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => 'data',
      gcTime: 10,
    })

    const fn = vi.fn()

    const unsubscribe = queryClient.getQueryCache().subscribe(fn)

    queryClient.setQueryData({ query: anQuery }, 'data')

    await waitFor(() =>
      expect(fn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'removed',
        })
      )
    )

    expect(queryClient.getQueryCache().findAll()).toHaveLength(0)

    unsubscribe()
  })
})
