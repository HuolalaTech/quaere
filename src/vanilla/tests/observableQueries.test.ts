import { waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { createQueryClient, query } from '..'
import type { QueryClient } from '..'
import { createObservableQueries } from '../observableQueries'
import { ObservableQueryResult } from '../observableQuery'
import { generatekey } from '../utils'
import { sleep } from './utils'

describe('queriesObserver', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createQueryClient()
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('should return an array with all query results', async () => {
    const query1 = query({
      fetcher: vi.fn().mockReturnValue(1),
    })
    const query2 = query({
      key: generatekey(),
      fetcher: vi.fn().mockReturnValue(2),
    })
    const observer = createObservableQueries(queryClient, [
      { query: query1 },
      { query: query2 },
    ])
    let observerResult
    const unsubscribe = observer.subscribe(result => {
      observerResult = result
    })
    await sleep(1)
    unsubscribe()
    expect(observerResult).toMatchObject([{ data: 1 }, { data: 2 }])
  })

  it('should update when a query updates', async () => {
    const query1 = query({
      key: generatekey(),
      fetcher: vi.fn().mockReturnValue(1),
    })
    const query2 = query({
      key: generatekey(),
      fetcher: vi.fn().mockReturnValue(2),
    })
    const observer = createObservableQueries(queryClient, [
      { query: query1 },
      { query: query2 },
    ])
    const results: Array<Array<ObservableQueryResult>> = []
    results.push(observer.getCurrentResult())
    const unsubscribe = observer.subscribe(result => {
      results.push(result)
    })
    await sleep(1)
    queryClient.setQueryData({ query: query2 }, 3)
    await sleep(1)
    unsubscribe()
    expect(results.length).toBe(6)
    expect(results[0]).toMatchObject([
      { isLoading: false, isFetching: false, data: undefined },
      { isLoading: false, isFetching: false, data: undefined },
    ])
    expect(results[1]).toMatchObject([
      { isLoading: true, isFetching: true, data: undefined },
      { isLoading: false, isFetching: false, data: undefined },
    ])
    expect(results[2]).toMatchObject([
      { isLoading: true, isFetching: true, data: undefined },
      { isLoading: true, isFetching: true, data: undefined },
    ])
    expect(results[3]).toMatchObject([
      { isLoading: false, isFetching: false, data: 1 },
      { isLoading: true, isFetching: true, data: undefined },
    ])
    expect(results[4]).toMatchObject([
      { isLoading: false, isFetching: false, data: 1 },
      { isLoading: false, isFetching: false, data: 2 },
    ])
    expect(results[5]).toMatchObject([
      { isLoading: false, isFetching: false, data: 1 },
      { isLoading: false, isFetching: false, data: 3 },
    ])
  })

  it('should update when a query is removed', async () => {
    const query1 = query({
      key: generatekey(),
      fetcher: vi.fn().mockReturnValue(1),
    })
    const query2 = query({
      key: generatekey(),
      fetcher: vi.fn().mockReturnValue(2),
    })
    const observer = createObservableQueries(queryClient, [
      { query: query1 },
      { query: query2 },
    ])
    const results: Array<Array<ObservableQueryResult>> = []
    results.push(observer.getCurrentResult())
    const unsubscribe = observer.subscribe(result => {
      results.push(result)
    })
    await sleep(1)
    observer.setQueries([{ query: query2 }])
    await sleep(1)
    const queryCache = queryClient.getQueryCache()
    expect(queryCache.find({ query: query1, type: 'active' })).toBeUndefined()
    expect(queryCache.find({ query: query2, type: 'active' })).toBeDefined()
    unsubscribe()
    expect(queryCache.find({ query: query1, type: 'active' })).toBeUndefined()
    expect(queryCache.find({ query: query2, type: 'active' })).toBeUndefined()
    expect(results.length).toBe(6)
    expect(results[0]).toMatchObject([
      { isLoading: false, isFetching: false, data: undefined },
      { isLoading: false, isFetching: false, data: undefined },
    ])
    expect(results[1]).toMatchObject([
      { isLoading: true, isFetching: true, data: undefined },
      { isLoading: false, isFetching: false, data: undefined },
    ])
    expect(results[2]).toMatchObject([
      { isLoading: true, isFetching: true, data: undefined },
      { isLoading: true, isFetching: true, data: undefined },
    ])
    expect(results[3]).toMatchObject([
      { isLoading: false, isFetching: false, data: 1 },
      { isLoading: true, isFetching: true, data: undefined },
    ])
    expect(results[4]).toMatchObject([
      { isLoading: false, isFetching: false, data: 1 },
      { isLoading: false, isFetching: false, data: 2 },
    ])
    expect(results[5]).toMatchObject([
      { isLoading: false, isFetching: false, data: 2 },
    ])
  })

  it('should update when a query changed position', async () => {
    const query1 = query({
      key: generatekey(),
      fetcher: vi.fn().mockReturnValue(1),
    })
    const query2 = query({
      key: generatekey(),
      fetcher: vi.fn().mockReturnValue(2),
    })
    const observer = createObservableQueries(queryClient, [
      { query: query1 },
      { query: query2 },
    ])
    const results: Array<Array<ObservableQueryResult>> = []
    results.push(observer.getCurrentResult())
    const unsubscribe = observer.subscribe(result => {
      results.push(result)
    })
    await sleep(1)
    observer.setQueries([{ query: query2 }, { query: query1 }])
    await sleep(1)
    unsubscribe()
    expect(results.length).toBe(6)
    expect(results[0]).toMatchObject([
      { isLoading: false, isFetching: false, data: undefined },
      { isLoading: false, isFetching: false, data: undefined },
    ])
    expect(results[1]).toMatchObject([
      { isLoading: true, isFetching: true, data: undefined },
      { isLoading: false, isFetching: false, data: undefined },
    ])
    expect(results[2]).toMatchObject([
      { isLoading: true, isFetching: true, data: undefined },
      { isLoading: true, isFetching: true, data: undefined },
    ])
    expect(results[3]).toMatchObject([
      { isLoading: false, isFetching: false, data: 1 },
      { isLoading: true, isFetching: true, data: undefined },
    ])
    expect(results[4]).toMatchObject([
      { isLoading: false, isFetching: false, data: 1 },
      { isLoading: false, isFetching: false, data: 2 },
    ])
    expect(results[5]).toMatchObject([
      { isLoading: false, isFetching: false, data: 2 },
      { isLoading: false, isFetching: false, data: 1 },
    ])
  })

  it('should not update when nothing has changed', async () => {
    const query1 = query({
      key: generatekey(),
      fetcher: vi.fn().mockReturnValue(1),
    })
    const query2 = query({
      key: generatekey(),
      fetcher: vi.fn().mockReturnValue(2),
    })
    const observer = createObservableQueries(queryClient, [
      { query: query1 },
      { query: query2 },
    ])
    const results: Array<Array<ObservableQueryResult>> = []
    results.push(observer.getCurrentResult())
    const unsubscribe = observer.subscribe(result => {
      results.push(result)
    })
    await sleep(1)
    observer.setQueries([{ query: query1 }, { query: query2 }])
    await sleep(1)
    unsubscribe()
    expect(results.length).toBe(5)

    expect(results[0]).toMatchObject([
      { isLoading: false, isFetching: false, data: undefined },
      { isLoading: false, isFetching: false, data: undefined },
    ])
    expect(results[1]).toMatchObject([
      { isLoading: true, isFetching: true, data: undefined },
      { isLoading: false, isFetching: false, data: undefined },
    ])
    expect(results[2]).toMatchObject([
      { isLoading: true, isFetching: true, data: undefined },
      { isLoading: true, isFetching: true, data: undefined },
    ])
    expect(results[3]).toMatchObject([
      { isFetching: false, data: 1 },
      { isLoading: true, isFetching: true, data: undefined },
    ])
    expect(results[4]).toMatchObject([
      { isFetching: false, data: 1 },
      { isFetching: false, data: 2 },
    ])
  })

  it('should trigger all fetches when subscribed', async () => {
    const query1 = query({
      key: generatekey(),
      fetcher: vi.fn().mockReturnValue(1),
    })
    const query2 = query({
      key: generatekey(),
      fetcher: vi.fn().mockReturnValue(2),
    })
    const observer = createObservableQueries(queryClient, [
      { query: query1 },
      { query: query2 },
    ])
    const unsubscribe = observer.subscribe(() => undefined)
    await sleep(1)
    unsubscribe()
    expect(query1.fetcher).toHaveBeenCalledTimes(1)
    expect(query2.fetcher).toHaveBeenCalledTimes(1)
  })

  it('should not destroy the observer if there is still a subscription', async () => {
    const query1 = query({
      key: generatekey(),
      fetcher: async () => {
        await sleep(20)
        return 1
      },
    })
    const observer = createObservableQueries(queryClient, [
      {
        query: query1 as any,
      },
    ])

    const subscription1Handler = vi.fn()
    const subscription2Handler = vi.fn()

    const unsubscribe1 = observer.subscribe(subscription1Handler)
    const unsubscribe2 = observer.subscribe(subscription2Handler)

    unsubscribe1()

    await waitFor(() => {
      // 1 call: pending
      expect(subscription1Handler).toBeCalledTimes(1)
      // 1 call: success
      expect(subscription2Handler).toBeCalledTimes(1)
    })

    // Clean-up
    unsubscribe2()
  })
})
