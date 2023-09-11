import { vi } from 'vitest'

import { createQueryClient, focusManager, query } from '..'
import type { QueryClient } from '..'
import {
  ObservableQueryResult,
  createObservableQuery,
} from '../observableQuery'
import { generatekey } from '../utils'
import { expectType, sleep } from './utils'

describe('observableQuery', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createQueryClient()
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('should trigger a fetch when subscribed', async () => {
    const queryFn = vi.fn<Array<any>, string>().mockReturnValue('data')
    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })
    const observer = createObservableQuery(queryClient, { query: anQuery })
    const unsubscribe = observer.subscribe(() => undefined)
    await sleep(1)
    unsubscribe()
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('should notify when switching query', async () => {
    const anQuery1 = query({
      key: generatekey(),
      fetcher: () => 1,
    })
    const anQuery2 = query({
      key: generatekey(),
      fetcher: () => 2,
    })
    const results: Array<ObservableQueryResult> = []
    const observer = createObservableQuery(queryClient, {
      query: anQuery1,
    })
    const unsubscribe = observer.subscribe(result => {
      results.push(result)
    })
    await sleep(1)
    observer.setOptions({ query: anQuery2 })
    await sleep(1)
    unsubscribe()
    expect(results.length).toBe(4)
    expect(results[0]).toMatchObject({
      data: undefined,
      isLoading: true,
      isFetching: true,
    })
    expect(results[1]).toMatchObject({
      data: 1,
      isLoading: false,
      isFetching: false,
    })
    expect(results[2]).toMatchObject({
      data: undefined,
      isLoading: true,
      isFetching: true,
    })
    expect(results[3]).toMatchObject({
      data: 2,
      isLoading: false,
      isFetching: false,
    })
  })

  it('should be able to fetch with a selector', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => ({ count: 1 }),
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select: data => ({ myCount: data.count }),
    })
    let observerResult
    const unsubscribe = observer.subscribe(result => {
      expectType<ObservableQueryResult<{ myCount: number }>>(result)
      observerResult = result
    })
    await sleep(1)
    unsubscribe()
    expect(observerResult).toMatchObject({ data: { myCount: 1 } })
  })

  it('should be able to fetch with a selector using the fetch method', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => ({ count: 1 }),
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select: data => ({ myCount: data.count }),
    })
    const observerResult = await observer.refetch()
    expectType<{ myCount: number } | undefined>(observerResult.data)
    expect(observerResult.data).toMatchObject({ myCount: 1 })
  })

  it('should be able to fetch with a selector and object syntax', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => ({ count: 1 }),
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select: data => ({ myCount: data.count }),
    })
    let observerResult
    const unsubscribe = observer.subscribe(result => {
      observerResult = result
    })
    await sleep(1)
    unsubscribe()
    expect(observerResult).toMatchObject({ data: { myCount: 1 } })
  })

  it('should run the selector again if the data changed', async () => {
    let count = 0
    const anQuery = query({
      key: generatekey(),
      fetcher: () => ({ count }),
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select: data => {
        count++
        return { myCount: data.count }
      },
    })
    const observerResult1 = await observer.refetch()
    const observerResult2 = await observer.refetch()
    expect(count).toBe(2)
    expect(observerResult1.data).toMatchObject({ myCount: 0 })
    expect(observerResult2.data).toMatchObject({ myCount: 1 })
  })

  it('should run the selector again if the selector changed', async () => {
    let count = 0
    const results: Array<ObservableQueryResult> = []
    const queryFn = () => ({ count: 1 })
    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })
    const select1 = (data: ReturnType<typeof queryFn>) => {
      count++
      return { myCount: data.count }
    }
    const select2 = (_data: ReturnType<typeof queryFn>) => {
      count++
      return { myCount: 99 }
    }
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select: select1,
    })
    const unsubscribe = observer.subscribe(result => {
      results.push(result)
    })
    await sleep(1)
    observer.setOptions({
      query: anQuery,
      select: select2,
    })
    await sleep(1)
    await observer.refetch()
    unsubscribe()
    expect(count).toBe(2)
    expect(results.length).toBe(5)
    expect(results[0]).toMatchObject({
      isLoading: true,
      isFetching: true,
      data: undefined,
    })
    expect(results[1]).toMatchObject({
      isLoading: false,
      isFetching: false,
      data: { myCount: 1 },
    })
    expect(results[2]).toMatchObject({
      isLoading: false,
      isFetching: false,
      data: { myCount: 99 },
    })
    expect(results[3]).toMatchObject({
      isLoading: false,
      isFetching: true,
      data: { myCount: 99 },
    })
    expect(results[4]).toMatchObject({
      isLoading: false,
      isFetching: false,
      data: { myCount: 99 },
    })
  })

  it('should not run the selector again if the data and selector did not change', async () => {
    let count = 0
    const results: Array<ObservableQueryResult> = []
    const queryFn = () => ({ count: 1 })
    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })
    const select = (data: ReturnType<typeof queryFn>) => {
      count++
      return { myCount: data.count }
    }
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select,
    })
    const unsubscribe = observer.subscribe(result => {
      results.push(result)
    })
    await sleep(1)
    observer.setOptions({
      query: anQuery,
      select,
    })
    await sleep(1)
    await observer.refetch()
    unsubscribe()
    expect(count).toBe(1)
    expect(results.length).toBe(4)
    expect(results[0]).toMatchObject({
      isLoading: true,
      isFetching: true,
      data: undefined,
    })
    expect(results[1]).toMatchObject({
      isLoading: false,
      isFetching: false,
      data: { myCount: 1 },
    })
    expect(results[2]).toMatchObject({
      isLoading: false,
      isFetching: true,
      data: { myCount: 1 },
    })
    expect(results[3]).toMatchObject({
      isLoading: false,
      isFetching: false,
      data: { myCount: 1 },
    })
  })

  it('should not run the selector again if the data did not change', async () => {
    let count = 0
    const anQuery = query({
      key: generatekey(),
      fetcher: () => ({ count: 1 }),
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select: data => {
        count++
        return { myCount: data.count }
      },
    })
    const observerResult1 = await observer.refetch()
    const observerResult2 = await observer.refetch()
    expect(count).toBe(1)
    expect(observerResult1.data).toMatchObject({ myCount: 1 })
    expect(observerResult2.data).toMatchObject({ myCount: 1 })
  })

  it('should always run the selector again if selector throws an error and selector is not referentially stable', async () => {
    const results: Array<ObservableQueryResult> = []
    const anQuery = query({
      key: generatekey(),
      fetcher: () => ({ count: 1 }),
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select: () => {
        throw new Error('selector error')
      },
    })
    const unsubscribe = observer.subscribe(result => {
      results.push(result)
    })
    await sleep(50)
    await observer.refetch()
    unsubscribe()
    expect(results[0]).toMatchObject({
      isLoading: true,
      isFetching: true,
      data: undefined,
    })
    expect(results[1]).toMatchObject({
      error: new Error('selector error'),
      isFetching: false,
      data: undefined,
    })
    expect(results[2]).toMatchObject({
      error: new Error('selector error'),
      isFetching: true,
      data: undefined,
    })
    expect(results[3]).toMatchObject({
      error: new Error('selector error'),
      isFetching: false,
      data: undefined,
    })
  })

  it('should return stale data if selector throws an error', async () => {
    const results: Array<ObservableQueryResult> = []
    let shouldError = false
    const error = new Error('select error')
    const anQuery = query({
      key: generatekey(),
      fetcher: async () => {
        await sleep(10)
        return shouldError ? 2 : 1
      },
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      retry: 0,

      select: num => {
        if (shouldError) {
          throw error
        }
        shouldError = true
        return String(num)
      },
    })

    const unsubscribe = observer.subscribe(result => {
      results.push(result)
    })
    await sleep(50)
    await observer.refetch()
    unsubscribe()

    expect(results[0]).toMatchObject({
      isLoading: true,
      isFetching: true,
      data: undefined,
      error: null,
    })
    expect(results[1]).toMatchObject({
      isLoading: false,
      isFetching: false,
      data: '1',
      error: null,
    })
    expect(results[2]).toMatchObject({
      isLoading: false,
      isFetching: true,
      data: '1',
      error: null,
    })
    expect(results[3]).toMatchObject({
      isFetching: false,
      data: '1',
      error,
    })
  })

  it('should structurally share the selector', async () => {
    let count = 0
    const anQuery = query({
      key: generatekey(),
      fetcher: () => ({ count: ++count }),
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select: () => ({ myCount: 1 }),
    })
    const observerResult1 = await observer.refetch()
    const observerResult2 = await observer.refetch()
    expect(count).toBe(2)
    expect(observerResult1.data).toBe(observerResult2.data)
  })

  it('should not trigger a fetch when subscribed and disabled', async () => {
    const queryFn = vi.fn<Array<unknown>, string>().mockReturnValue('data')
    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      enabled: false,
    })
    const unsubscribe = observer.subscribe(() => undefined)
    await sleep(1)
    unsubscribe()
    expect(queryFn).toHaveBeenCalledTimes(0)
  })

  it('should not trigger a fetch when not subscribed', async () => {
    const queryFn = vi.fn<Array<unknown>, string>().mockReturnValue('data')
    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })
    createObservableQuery(queryClient, { query: anQuery })
    await sleep(1)
    expect(queryFn).toHaveBeenCalledTimes(0)
  })

  it('should be able to watch a query without defining a query function', async () => {
    const queryFn = vi.fn<Array<any>, string>().mockReturnValue('data')
    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })
    const callback = vi.fn()
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      enabled: false,
    })
    const unsubscribe = observer.subscribe(callback)
    await queryClient.fetchQuery({ query: anQuery })
    unsubscribe()
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('should accept unresolved query config in update function', async () => {
    const queryFn = vi.fn<Array<any>, string>().mockReturnValue('data')
    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      enabled: false,
    })
    const results: Array<ObservableQueryResult<unknown>> = []
    const unsubscribe = observer.subscribe(x => {
      results.push(x)
    })
    observer.setOptions({ enabled: false, staleTime: 10 })
    await queryClient.fetchQuery({ query: anQuery })
    await sleep(100)
    unsubscribe()
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(results.length).toBe(3)
    expect(results[0]).toMatchObject({ isStale: true })
    expect(results[1]).toMatchObject({ isStale: false })
    expect(results[2]).toMatchObject({ isStale: true })
  })

  it('should be able to handle multiple subscribers', async () => {
    const queryFn = vi.fn<Array<any>, string>().mockReturnValue('data')
    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })
    const observer = createObservableQuery<string>(queryClient, {
      query: anQuery,
      enabled: false,
    })
    const results1: Array<ObservableQueryResult<string>> = []
    const results2: Array<ObservableQueryResult<string>> = []
    const unsubscribe1 = observer.subscribe(x => {
      results1.push(x)
    })
    const unsubscribe2 = observer.subscribe(x => {
      results2.push(x)
    })
    await queryClient.fetchQuery({ query: anQuery })
    await sleep(50)
    unsubscribe1()
    unsubscribe2()
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(results1.length).toBe(2)
    expect(results2.length).toBe(2)
    expect(results1[0]).toMatchObject({ data: undefined })
    expect(results1[1]).toMatchObject({ data: 'data' })
    expect(results2[0]).toMatchObject({ data: undefined })
    expect(results2[1]).toMatchObject({ data: 'data' })
  })

  it('should stop retry when unsubscribing', async () => {
    let count = 0
    const anQuery = query({
      key: generatekey(),
      fetcher: () => {
        count++
        return Promise.reject<unknown>('reject')
      },
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      retry: 10,
      retryDelay: 50,
    })
    const unsubscribe = observer.subscribe(() => undefined)
    await sleep(70)
    unsubscribe()
    await sleep(200)
    expect(count).toBe(2)
  })

  it('should clear interval when unsubscribing to a refetchInterval query', async () => {
    let count = 0

    const fetchData = () => {
      count++
      return Promise.resolve('data')
    }

    const anQuery = query({
      key: generatekey(),
      fetcher: fetchData,
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      gcTime: 0,
      refetchInterval: 10,
    })
    const unsubscribe = observer.subscribe(() => undefined)
    expect(count).toBe(1)
    await sleep(15)
    expect(count).toBe(2)
    unsubscribe()
    await sleep(10)
    expect(queryClient.getQueryCache().find({ query: anQuery })).toBeUndefined()
    expect(count).toBe(2)
  })

  it('uses placeholderData as non-cache data when pending a query with no data', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => 'data',
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      placeholderData: 'placeholder',
    })

    expect(observer.getCurrentResult()).toMatchObject({
      isFetching: false,
      data: 'placeholder',
    })

    const results: Array<ObservableQueryResult<unknown>> = []

    const unsubscribe = observer.subscribe(x => {
      results.push(x)
    })

    await sleep(10)
    unsubscribe()

    expect(results.length).toBe(2)
    expect(results[0]).toMatchObject({ data: 'placeholder' })
    expect(results[1]).toMatchObject({ data: 'data' })
  })

  it('should structurally share placeholder data', async () => {
    const anQuery = query<any>({
      key: generatekey(),
      fetcher: () => 'data',
    })
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      enabled: false,
      placeholderData: {},
    })

    const firstData = observer.getCurrentResult().data

    observer.setOptions({ placeholderData: {} })

    const secondData = observer.getCurrentResult().data

    expect(firstData).toBe(secondData)
  })

  it('should throw an error if enabled option type is not valid', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => 'data',
    })

    expect(() =>
      createObservableQuery(queryClient, {
        query: anQuery,
        //@ts-expect-error
        enabled: null,
      })
    ).toThrowError('Expected enabled to be a boolean')
  })

  it('getCurrentQuery should return the current query', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => 'data',
    })

    const observer = createObservableQuery(queryClient, {
      query: anQuery,
    })

    expect(observer.getCurrentQueryInfo().query).toEqual(anQuery)
  })

  it('should throw an error if throwOnError option is true', async () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => Promise.reject<unknown>('error'),
    })

    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      retry: false,
    })

    let error: string | null = null
    try {
      await observer.refetch({ throwOnError: true })
    } catch (err) {
      error = err as string
    }

    expect(error).toEqual('error')
  })

  it('should not refetch in background if refetchIntervalInBackground is false', async () => {
    const queryFn = vi.fn<Array<unknown>, string>().mockReturnValue('data')

    const anQuery = query({
      key: generatekey(),
      fetcher: queryFn,
    })

    focusManager.setFocused(false)
    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      refetchIntervalInBackground: false,
      refetchInterval: 10,
    })

    const unsubscribe = observer.subscribe(() => undefined)
    await sleep(30)

    expect(queryFn).toHaveBeenCalledTimes(1)

    // Clean-up
    unsubscribe()
    focusManager.setFocused(true)
  })

  it('should not use replaceEqualDeep for select value when structuralSharing option is true', async () => {
    const data = { value: 'data' }
    const selectedData = { value: 'data' }

    const anQuery = query({
      key: generatekey(),
      fetcher: () => data,
    })

    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select: () => data,
    })

    const unsubscribe = observer.subscribe(() => undefined)

    await sleep(10)
    expect(observer.getCurrentResult().data).toBe(data)

    observer.setOptions({
      query: anQuery,
      structuralSharing: false,
      select: () => selectedData,
    })

    await observer.refetch()
    expect(observer.getCurrentResult().data).toBe(selectedData)

    unsubscribe()
  })

  it('should not use replaceEqualDeep for select value when structuralSharing option is true and placeholderdata is defined', () => {
    const data = { value: 'data' }
    const selectedData1 = { value: 'data' }
    const selectedData2 = { value: 'data' }
    const placeholderData1 = { value: 'data' }
    const placeholderData2 = { value: 'data' }

    const anQuery = query({
      key: generatekey(),
      fetcher: () => data,
    })

    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select: () => data,
    })

    observer.setOptions({
      query: anQuery,
      select: () => {
        return selectedData1
      },
      placeholderData: placeholderData1,
    })

    observer.setOptions({
      query: anQuery,
      select: () => {
        return selectedData2
      },
      placeholderData: placeholderData2,
      structuralSharing: false,
    })

    expect(observer.getCurrentResult().data).toBe(selectedData2)
  })

  it('should not use an undefined value returned by select as placeholderdata', () => {
    const anQuery = query({
      key: generatekey(),
      fetcher: () => data,
    })

    const data = { value: 'data' }
    const selectedData = { value: 'data' }
    const placeholderData1 = { value: 'data' }
    const placeholderData2 = { value: 'data' }

    const observer = createObservableQuery(queryClient, {
      query: anQuery,
      select: () => data,
    })

    observer.setOptions({
      query: anQuery,
      select: () => {
        return selectedData
      },
      placeholderData: placeholderData1,
    })

    expect(observer.getCurrentResult().isPlaceholderData).toBe(true)

    observer.setOptions({
      query: anQuery,
      //@ts-expect-error
      select: () => undefined,
      placeholderData: placeholderData2,
    })

    expect(observer.getCurrentResult().isPlaceholderData).toBe(false)
  })

  it('should pass the correct previous queryKey (from prevQuery) to placeholderData function params with select', async () => {
    const results: Array<ObservableQueryResult> = []
    const queries: Array<any> = []

    const data1 = { value: 'data1' }
    const data2 = { value: 'data2' }
    const anQuery1 = query({
      key: generatekey(),
      fetcher: () => data1,
    })
    const anQuery2 = query({
      key: generatekey(),
      fetcher: () => data2,
    })

    const observer = createObservableQuery(queryClient, {
      query: anQuery1,
      placeholderData: (prev, prevQuery) => {
        queries.push(prevQuery?.query || null)
        return prev
      },
      select: data => data.value,
    })

    const unsubscribe = observer.subscribe(result => {
      results.push(result)
    })

    await sleep(1)

    observer.setOptions({
      query: anQuery2,
      placeholderData: (prev, prevQuery) => {
        queries.push(prevQuery?.query || null)
        return prev
      },
      select: data => data.value,
    })

    await sleep(1)
    unsubscribe()
    expect(results.length).toBe(4)
    expect(queries.length).toBe(3)
    expect(queries[0]).toBe(null) // First Query - status: 'pending', fetchStatus: 'idle'
    expect(queries[1]).toBe(null) // First Query - status: 'pending', fetchStatus: 'fetching'
    expect(queries[2]).toBe(anQuery1) // Second Query - status: 'pending', fetchStatus: 'fetching'

    expect(results[0]).toMatchObject({
      data: undefined,
      isLoading: true,
      isFetching: true,
    }) // Initial fetch
    expect(results[1]).toMatchObject({
      data: 'data1',
      isLoading: false,
      isFetching: false,
    }) // Successful fetch
    expect(results[2]).toMatchObject({
      data: 'data1',
      isLoading: false,
      isFetching: true,
    }) // Fetch for new key, but using previous data as placeholder
    expect(results[3]).toMatchObject({
      data: 'data2',
      isLoading: false,
      isFetching: false,
    }) // Successful fetch for new key
  })

  it('should pass the correct previous data to placeholderData function params when select function is used in conjunction', async () => {
    const results: Array<ObservableQueryResult> = []

    const data1 = { value: 'data1' }
    const data2 = { value: 'data2' }
    const anQuery1 = query({
      key: generatekey(),
      fetcher: () => data1,
    })
    const anQuery2 = query({
      key: generatekey(),
      fetcher: () => data2,
    })

    const observer = createObservableQuery(queryClient, {
      query: anQuery1,
      placeholderData: prev => prev,
      select: data => data.value,
    })

    console.log(`result`, observer.getCurrentResult())

    const unsubscribe = observer.subscribe(result => {
      results.push(result)
    })

    await sleep(1)

    observer.setOptions({
      query: anQuery2,
      placeholderData: prev => prev,
      select: data => data.value,
    })

    await sleep(1)
    unsubscribe()

    expect(results.length).toBe(4)
    expect(results[0]).toMatchObject({
      data: undefined,
      isLoading: true,
      isFetching: true,
    }) // Initial fetch
    expect(results[1]).toMatchObject({
      data: 'data1',
      isLoading: false,
      isFetching: false,
    }) // Successful fetch
    expect(results[2]).toMatchObject({
      data: 'data1',
      isLoading: false,
      isFetching: true,
    }) // Fetch for new key, but using previous data as placeholder
    expect(results[3]).toMatchObject({
      data: 'data2',
      isLoading: false,
      isFetching: false,
    }) // Successful fetch for new key
  })
})
