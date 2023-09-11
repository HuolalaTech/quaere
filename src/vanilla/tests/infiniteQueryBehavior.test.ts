import { waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { createQueryClient, queryWithInfinite } from '..'
import type { QueryClient } from '..'
import {
  ObservableInfiniteQueryResult,
  createObservableInfiniteQuery,
} from '../observableInfiniteQuery'
import { CancelledError } from '../retryer'
import { generatekey } from '../utils'
import { sleep } from './utils'

describe('InfiniteQueryBehavior', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createQueryClient()
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('InfiniteQueryBehavior should apply the maxPages option to limit the number of pages', async () => {
    let abortSignal: AbortSignal | null = null

    const queryFnSpy = vi
      .fn()
      .mockImplementation((_, { pageParam, signal }) => {
        abortSignal = signal
        return pageParam
      })

    const anQuery = queryWithInfinite({
      key: generatekey(),
      fetcher: queryFnSpy,
      getNextPageParam: lastPage => lastPage + 1,
      getPreviousPageParam: firstPage => firstPage - 1,
      maxPages: 2,
      initialPageParam: 1,
    })

    const observer = createObservableInfiniteQuery<number>(queryClient, {
      query: anQuery,
    })

    let observerResult:
      | ObservableInfiniteQueryResult<unknown, unknown>
      | undefined

    const unsubscribe = observer.subscribe(result => {
      observerResult = result
    })

    // Wait for the first page to be fetched
    await waitFor(() =>
      expect(observerResult).toMatchObject({
        isFetching: false,
        data: { pages: [1], pageParams: [1] },
      })
    )

    expect(queryFnSpy).toHaveBeenNthCalledWith(1, undefined, {
      pageParam: 1,
      meta: undefined,
      direction: 'forward',
      signal: abortSignal,
    })

    queryFnSpy.mockClear()

    // Fetch the second page
    await observer.fetchNextPage()

    expect(queryFnSpy).toHaveBeenNthCalledWith(1, undefined, {
      pageParam: 2,
      direction: 'forward',
      meta: undefined,
      signal: abortSignal,
    })

    expect(observerResult).toMatchObject({
      isFetching: false,
      data: { pages: [1, 2], pageParams: [1, 2] },
    })

    queryFnSpy.mockClear()

    // Fetch the page before the first page
    await observer.fetchPreviousPage()

    expect(queryFnSpy).toHaveBeenNthCalledWith(1, undefined, {
      pageParam: 0,
      direction: 'backward',
      meta: undefined,
      signal: abortSignal,
    })

    // Only first two pages should be in the data
    expect(observerResult).toMatchObject({
      isFetching: false,
      data: { pages: [0, 1], pageParams: [0, 1] },
    })

    queryFnSpy.mockClear()

    // Fetch the page before
    await observer.fetchPreviousPage()

    expect(queryFnSpy).toHaveBeenNthCalledWith(1, undefined, {
      pageParam: -1,
      meta: undefined,
      direction: 'backward',
      signal: abortSignal,
    })

    expect(observerResult).toMatchObject({
      isFetching: false,
      data: { pages: [-1, 0], pageParams: [-1, 0] },
    })

    queryFnSpy.mockClear()

    // Fetch the page after
    await observer.fetchNextPage()

    expect(queryFnSpy).toHaveBeenNthCalledWith(1, undefined, {
      pageParam: 1,
      meta: undefined,
      direction: 'forward',
      signal: abortSignal,
    })

    expect(observerResult).toMatchObject({
      isFetching: false,
      data: { pages: [0, 1] },
    })

    queryFnSpy.mockClear()

    // Refetch the infinite query
    await observer.refetch()

    // Only 2 pages should be refetched
    expect(queryFnSpy).toHaveBeenCalledTimes(2)

    expect(queryFnSpy).toHaveBeenNthCalledWith(1, undefined, {
      pageParam: 0,
      meta: undefined,
      direction: 'forward',
      signal: abortSignal,
    })

    expect(queryFnSpy).toHaveBeenNthCalledWith(2, undefined, {
      pageParam: 1,
      meta: undefined,
      direction: 'forward',
      signal: abortSignal,
    })

    unsubscribe()
  })

  it('InfiniteQueryBehavior should support query cancellation', async () => {
    const key = generatekey()
    let abortSignal: AbortSignal | null = null

    const queryFnSpy = vi
      .fn()
      .mockImplementation((_, { pageParam, signal }) => {
        abortSignal = signal
        sleep(10)
        return pageParam
      })

    const anQuery = queryWithInfinite({
      key: key,
      fetcher: queryFnSpy,
      getNextPageParam: lastPage => lastPage + 1,
      getPreviousPageParam: firstPage => firstPage - 1,
      initialPageParam: 1,
    })

    const observer = createObservableInfiniteQuery<number>(queryClient, {
      query: anQuery,
    })

    let observerResult:
      | ObservableInfiniteQueryResult<unknown, unknown>
      | undefined

    const unsubscribe = observer.subscribe(result => {
      observerResult = result
    })

    observer.getCurrentQueryInfo().cancel()

    // Wait for the first page to be cancelled
    await waitFor(() =>
      expect(observerResult).toMatchObject({
        isFetching: false,
        error: new CancelledError(),
        data: undefined,
      })
    )

    expect(queryFnSpy).toHaveBeenCalledTimes(1)

    expect(queryFnSpy).toHaveBeenNthCalledWith(1, undefined, {
      pageParam: 1,
      meta: undefined,
      direction: 'forward',
      signal: abortSignal,
    })

    unsubscribe()
  })

  it('InfiniteQueryBehavior should not refetch pages if the query is cancelled', async () => {
    let abortSignal: AbortSignal | null = null

    let queryFnSpy = vi.fn().mockImplementation((_, { pageParam, signal }) => {
      abortSignal = signal
      return pageParam
    })

    const anQuery = queryWithInfinite({
      key: generatekey(),
      fetcher: queryFnSpy,
      getNextPageParam: lastPage => lastPage + 1,
      getPreviousPageParam: firstPage => firstPage - 1,
      initialPageParam: 1,
    })

    const observer = createObservableInfiniteQuery<number>(queryClient, {
      query: anQuery,
    })

    let observerResult:
      | ObservableInfiniteQueryResult<unknown, unknown>
      | undefined

    const unsubscribe = observer.subscribe(result => {
      observerResult = result
    })

    // Wait for the first page to be fetched
    await waitFor(() =>
      expect(observerResult).toMatchObject({
        isFetching: false,
        data: { pages: [1], pageParams: [1] },
      })
    )

    queryFnSpy.mockClear()

    // Fetch the second page
    await observer.fetchNextPage()

    expect(observerResult).toMatchObject({
      isFetching: false,
      data: { pages: [1, 2], pageParams: [1, 2] },
    })

    expect(queryFnSpy).toHaveBeenCalledTimes(1)

    expect(queryFnSpy).toHaveBeenNthCalledWith(1, undefined, {
      pageParam: 2,
      meta: undefined,
      direction: 'forward',
      signal: abortSignal,
    })

    queryFnSpy = vi.fn().mockImplementation(({ pageParam = 1, signal }) => {
      abortSignal = signal
      sleep(10)
      return pageParam
    })

    // Refetch the query
    observer.refetch()
    expect(observerResult).toMatchObject({
      isFetching: true,
      error: null,
    })

    // Cancel the query
    observer.getCurrentQueryInfo().cancel()

    expect(observerResult).toMatchObject({
      isFetching: false,
      error: new CancelledError(),
      data: { pages: [1, 2], pageParams: [1, 2] },
    })

    // Pages should not have been fetched
    expect(queryFnSpy).toHaveBeenCalledTimes(0)

    unsubscribe()
  })
})
