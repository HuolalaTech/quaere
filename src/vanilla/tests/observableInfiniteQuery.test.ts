import { expect, vi } from 'vitest'

import { createQueryClient, queryWithInfinite } from '..'
import type { QueryClient } from '..'
import { createObservableInfiniteQuery } from '../observableInfiniteQuery'
import { generatekey } from '../utils'
import { sleep } from './utils'

describe('ObservableInfiniteQuery', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createQueryClient()
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('ObservableInfiniteQuery should be able to fetch an infinite query with selector', async () => {
    const anQuery = queryWithInfinite({
      key: generatekey(),
      fetcher: () => 1,
      initialPageParam: 1,
      getNextPageParam: () => 2,
    })
    const observer = createObservableInfiniteQuery(queryClient, {
      query: anQuery,
      select: data => ({
        pages: data.pages.map(x => `${x}`),
        pageParams: data.pageParams,
      }),
    })
    let observerResult
    const unsubscribe = observer.subscribe(result => {
      observerResult = result
    })
    await sleep(1)
    unsubscribe()
    expect(observerResult).toMatchObject({
      data: { pages: ['1'], pageParams: [1] },
    })
  })

  it('ObservableInfiniteQuery should pass the meta option to the queryFn', async () => {
    const meta = {
      it: 'works',
    }

    const queryFn = vi.fn(() => 1)
    const anQuery = queryWithInfinite({
      key: generatekey(),
      fetcher: queryFn,
      initialPageParam: 1,
      getNextPageParam: () => 2,
      meta,
    })
    const observer = createObservableInfiniteQuery(queryClient, {
      query: anQuery,
      select: data => ({
        pages: data.pages.map(x => `${x}`),
        pageParams: data.pageParams,
      }),
    })
    let observerResult
    const unsubscribe = observer.subscribe(result => {
      observerResult = result
    })
    await sleep(1)
    unsubscribe()
    expect(observerResult).toMatchObject({
      data: { pages: ['1'], pageParams: [1] },
    })
    expect((queryFn.mock.calls[0] as any)?.[1]).toMatchObject({ meta })
  })

  it('getNextPagParam and getPreviousPageParam should receive current pageParams', async () => {
    let single: Array<string> = []
    let all: Array<string> = []
    const anQuery = queryWithInfinite({
      key: generatekey(),
      fetcher: (_, { pageParam }) => String(pageParam),
      initialPageParam: 1,
      getNextPageParam: (_, __, lastPageParam, allPageParams) => {
        single.push('next' + lastPageParam)
        all.push('next' + allPageParams.join(','))
        return lastPageParam + 1
      },
      getPreviousPageParam: (_, __, firstPageParam, allPageParams) => {
        single.push('prev' + firstPageParam)
        all.push('prev' + allPageParams.join(','))
        return firstPageParam - 1
      },
    })
    const observer = createObservableInfiniteQuery(queryClient, {
      query: anQuery,
    })

    await observer.fetchNextPage()
    await observer.fetchPreviousPage()

    expect(single).toEqual(['next1', 'prev1', 'prev1', 'next1', 'prev0'])
    expect(all).toEqual(['next1', 'prev1', 'prev1', 'next0,1', 'prev0,1'])

    single = []
    all = []

    await observer.refetch()

    expect(single).toEqual(['next0', 'next1', 'prev0'])
    expect(all).toEqual(['next0', 'next0,1', 'prev0,1'])
  })

  it('should stop refetching if undefined is returned from getNextPageParam', async () => {
    let next: number | undefined = 2
    const queryFn = vi.fn<any, any>((_, { pageParam }) => String(pageParam))
    const anQuery = queryWithInfinite({
      key: generatekey(),
      fetcher: queryFn,
      initialPageParam: 1,
      getNextPageParam: () => next,
    })
    const observer = createObservableInfiniteQuery(queryClient, {
      query: anQuery,
    })

    await observer.fetchNextPage()
    await observer.fetchNextPage()

    expect(observer.getCurrentResult().data?.pages).toEqual(['1', '2'])
    expect(queryFn).toBeCalledTimes(2)
    expect(observer.getCurrentResult().hasNextPage).toBe(true)

    next = undefined

    await observer.refetch()

    expect(observer.getCurrentResult().data?.pages).toEqual(['1'])
    expect(queryFn).toBeCalledTimes(3)
    expect(observer.getCurrentResult().hasNextPage).toBe(false)
  })

  it('should stop refetching if null is returned from getNextPageParam', async () => {
    let next: number | null = 2
    const queryFn = vi.fn<any, any>((_, { pageParam }) => String(pageParam))
    const anQuery = queryWithInfinite({
      key: generatekey(),
      fetcher: queryFn,
      initialPageParam: 1,
      getNextPageParam: () => next,
    })
    const observer = createObservableInfiniteQuery(queryClient, {
      query: anQuery,
    })

    await observer.fetchNextPage()
    await observer.fetchNextPage()

    expect(observer.getCurrentResult().data?.pages).toEqual(['1', '2'])
    expect(queryFn).toBeCalledTimes(2)
    expect(observer.getCurrentResult().hasNextPage).toBe(true)

    next = null

    await observer.refetch()

    expect(observer.getCurrentResult().data?.pages).toEqual(['1'])
    expect(queryFn).toBeCalledTimes(3)
    expect(observer.getCurrentResult().hasNextPage).toBe(false)
  })
})
