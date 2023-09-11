import { waitFor } from '@testing-library/react'

import {
  createQueryClient,
  focusManager,
  onlineManager,
  query,
  queryWithInfinite,
} from '..'
import type { QueryCache, QueryClient } from '..'
import { createObservableQuery } from '../observableQuery'
import { generatekey } from '../utils'
import { mockOnlineManagerIsOnline, sleep } from './utils'

describe('queryClient', () => {
  let queryClient: QueryClient
  let queryCache: QueryCache

  beforeEach(() => {
    queryClient = createQueryClient()
    queryCache = queryClient.getQueryCache()
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
    queryClient.unmount()
  })

  describe('defaultOptions', () => {
    it('should merge defaultOptions when query is added to cache', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve('data'),
      })

      const testClient = createQueryClient({
        defaultOptions: {
          queries: { gcTime: Infinity },
        },
      })

      await testClient.prefetchQuery({ query: anQuery })
      const newQuery = testClient.getQueryCache().find({ query: anQuery })
      expect(newQuery?.options.gcTime).toBe(Infinity)
    })

    it('should get defaultOptions', async () => {
      const defaultOptions = { queries: { gcTime: Infinity } }
      const testClient = createQueryClient({
        defaultOptions,
      })
      expect(testClient.getDefaultOptions()).toMatchObject(defaultOptions)
    })
  })

  describe('setQueryData', () => {
    it('should not crash if query could not be found', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve({ name: 'name' }),
      })

      expect(() => {
        queryClient.setQueryData({ query: anQuery }, prevUser => ({
          ...prevUser,
          name: 'Edvin',
        }))
      }).not.toThrow()
    })

    it('should not crash when variable is null', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: (_: { userId: null }) => Promise.resolve('data'),
      })
      queryClient.setQueryData(
        { query: anQuery, variables: { userId: null } },
        'Old Data'
      )
      expect(() => {
        queryClient.setQueryData(
          { query: anQuery, variables: { userId: null } },
          'New Data'
        )
      }).not.toThrow()
    })

    it('should use default options', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve('data'),
      })
      const testClient = createQueryClient({
        defaultOptions: { queries: { queryKeyHashFn: () => 'someKey' } },
      })
      const testCache = testClient.getQueryCache()
      testClient.setQueryData({ query: anQuery }, 'data')
      expect(testClient.getQueryData({ query: anQuery })).toBe('data')
      expect(testCache.find({ query: anQuery })).toBe(testCache.get('someKey'))
    })

    it('should create a new query if query was not found', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve('data'),
      })
      queryClient.setQueryData({ query: anQuery }, 'bar')
      expect(queryClient.getQueryData({ query: anQuery })).toBe('bar')
    })

    it('should create a new query if query was not found', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve('data'),
      })
      queryClient.setQueryData({ query: anQuery }, 'qux')
      expect(queryClient.getQueryData({ query: anQuery })).toBe('qux')
    })

    it('should not create a new query if query was not found and data is undefined', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve('data'),
      })
      expect(queryClient.getQueryCache().find({ query: anQuery })).toBe(
        undefined
      )
      queryClient.setQueryData({ query: anQuery }, undefined)
      expect(queryClient.getQueryCache().find({ query: anQuery })).toBe(
        undefined
      )
    })

    it('should not create a new query if query was not found and updater returns undefined', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve('data'),
      })
      expect(queryClient.getQueryCache().find({ query: anQuery })).toBe(
        undefined
      )
      queryClient.setQueryData({ query: anQuery }, () => undefined)
      expect(queryClient.getQueryCache().find({ query: anQuery })).toBe(
        undefined
      )
    })

    it('should not update query data if data is undefined', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve('data'),
      })
      queryClient.setQueryData({ query: anQuery }, 'qux')
      queryClient.setQueryData({ query: anQuery }, undefined)
      expect(queryClient.getQueryData({ query: anQuery })).toBe('qux')
    })

    it('should not update query data if updater returns undefined', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve('data'),
      })
      queryClient.setQueryData({ query: anQuery }, 'qux')
      queryClient.setQueryData({ query: anQuery }, () => undefined)
      expect(queryClient.getQueryData({ query: anQuery })).toBe('qux')
    })

    it('should accept an update function', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve('data'),
      })

      const updater = vi.fn(oldData => `new data + ${oldData}`)

      queryClient.setQueryData({ query: anQuery }, 'test data')
      queryClient.setQueryData({ query: anQuery }, updater)

      expect(updater).toHaveBeenCalled()
      expect(queryCache.find({ query: anQuery })!.state.data).toEqual(
        'new data + test data'
      )
    })

    it('should set the new data without comparison if structuralSharing is set to false', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve({ value: false }),
      })

      queryClient.setDefaultOptions({
        queries: {
          structuralSharing: false,
        },
      })

      const oldData = { value: true }
      const newData = { value: true }
      queryClient.setQueryData({ query: anQuery }, oldData)
      queryClient.setQueryData({ query: anQuery }, newData)

      expect(queryCache.find({ query: anQuery })!.state.data).toBe(newData)
    })

    it('should apply a custom structuralSharing function when provided', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve({ value: new Date() }),
      })

      queryClient.setDefaultOptions({
        queries: {
          structuralSharing: (
            prevData: { value: Date } | undefined,
            newData: { value: Date }
          ) => {
            if (!prevData) {
              return newData
            }
            return newData.value.getTime() === prevData.value.getTime()
              ? prevData
              : newData
          },
        },
      })

      const oldData = { value: new Date(2022, 6, 19) }
      const newData = { value: new Date(2022, 6, 19) }
      queryClient.setQueryData({ query: anQuery }, oldData)
      queryClient.setQueryData({ query: anQuery }, newData)

      expect(queryCache.find({ query: anQuery })!.state.data).toBe(oldData)

      const distinctData = { value: new Date(2021, 11, 25) }
      queryClient.setQueryData({ query: anQuery }, distinctData)

      expect(queryCache.find({ query: anQuery })!.state.data).toBe(distinctData)
    })

    it('should not set isFetching to false', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async () => {
          await sleep(10)
          return 23
        },
      })

      queryClient.prefetchQuery({
        query: anQuery,
      })
      expect(
        queryClient.getQueryState({
          query: anQuery,
        })
      ).toMatchObject({
        data: undefined,
        fetchStatus: 'fetching',
      })
      queryClient.setQueryData(
        {
          query: anQuery,
        },
        42
      )
      expect(
        queryClient.getQueryState({
          query: anQuery,
        })
      ).toMatchObject({
        data: 42,
        fetchStatus: 'fetching',
      })
      await waitFor(() =>
        expect(
          queryClient.getQueryState({
            query: anQuery,
          })
        ).toMatchObject({
          data: 23,
          fetchStatus: 'idle',
        })
      )
    })
  })

  describe('setQueriesData', () => {
    it('should update all existing, matching queries', () => {
      const anQuery1 = query({
        key: `key:1`,
        fetcher: async () => {
          return Date.now()
        },
      })
      const anQuery2 = query({
        key: `key:2`,
        fetcher: async () => {
          return Date.now()
        },
      })

      queryClient.setQueryData({ query: anQuery1 }, 1)
      queryClient.setQueryData({ query: anQuery2 }, 2)

      const result = queryClient.setQueriesData<number>(
        { predicate: q => q.query.key.startsWith('key:') },
        old => (old ? old + 5 : undefined)
      )

      expect(result).toEqual([
        [queryClient.getQueryCache().find({ query: anQuery1 }), 6],
        [queryClient.getQueryCache().find({ query: anQuery2 }), 7],
      ])
      expect(queryClient.getQueryData({ query: anQuery1 })).toBe(6)
      expect(queryClient.getQueryData({ query: anQuery2 })).toBe(7)
    })

    it('should accept queryFilters', () => {
      const anQuery1 = query({
        key: `key:1`,
        fetcher: async () => {
          return Date.now()
        },
      })
      const anQuery2 = query({
        key: `key:2`,
        fetcher: async () => {
          return Date.now()
        },
      })

      queryClient.setQueryData({ query: anQuery1 }, 1)
      queryClient.setQueryData({ query: anQuery2 }, 2)
      const query1 = queryCache.find({ query: anQuery1 })!

      const result = queryClient.setQueriesData<number>(
        { predicate: query => query === query1 },
        old => old! + 5
      )

      expect(result).toEqual([
        [queryClient.getQueryCache().find({ query: anQuery1 }), 6],
      ])
      expect(queryClient.getQueryData({ query: anQuery1 })).toBe(6)
      expect(queryClient.getQueryData({ query: anQuery2 })).toBe(2)
    })

    it('should not update non existing queries', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async () => {
          return `data`
        },
      })
      const result = queryClient.setQueriesData({ query: anQuery }, 'data')

      expect(result).toEqual([])
      expect(queryClient.getQueryData({ query: anQuery })).toBe(undefined)
    })
  })

  describe('getQueryData', () => {
    it('should return the query data if the query is found', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async (_: string) => {
          return `data`
        },
      })
      queryClient.setQueryData({ query: anQuery, variables: `id` }, 'bar')
      expect(
        queryClient.getQueryData({ query: anQuery, variables: `id` })
      ).toBe('bar')
    })

    it('should return undefined if the query is not found', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async () => {
          return `data`
        },
      })
      expect(queryClient.getQueryData({ query: anQuery })).toBeUndefined()
    })

    it('should match exact by default', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async (_: string) => {
          return `data`
        },
      })
      queryClient.setQueryData({ query: anQuery, variables: `id` }, 'bar')
      expect(
        queryClient.getQueryData({ query: anQuery } as any)
      ).toBeUndefined()
    })
  })

  describe('ensureQueryData', () => {
    it('should return the cached query data if the query is found', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async (_: string) => {
          return `data`
        },
      })

      queryClient.setQueryData({ query: anQuery, variables: `id` }, 'bar')

      await expect(
        queryClient.ensureQueryData({ query: anQuery, variables: `id` })
      ).resolves.toEqual('bar')
    })

    it('should call fetchQuery and return its results if the query is not found', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async (_: string) => {
          return `data`
        },
      })

      await expect(
        queryClient.ensureQueryData({ query: anQuery, variables: `id` })
      ).resolves.toEqual('data')
    })
  })

  describe('getQueriesData', () => {
    it('should return the query data for all matched queries', () => {
      const anQuery1 = query({
        key: `key:1`,
        fetcher: async (_: number) => {
          return Date.now()
        },
      })
      const anQuery2 = query({
        key: `key:2`,
        fetcher: async (_: number) => {
          return Date.now()
        },
      })
      queryClient.setQueryData({ query: anQuery1, variables: 1 }, 1)
      queryClient.setQueryData({ query: anQuery2, variables: 2 }, 2)
      queryClient.setQueryData({ query: anQuery2, variables: 2 }, 2)
      expect(
        queryClient.getQueriesData({
          predicate(queryInfo) {
            return queryInfo.query.key.startsWith('key:')
          },
        })
      ).toEqual([
        [
          queryClient.getQueryCache().find({ query: anQuery1, variables: 1 }),
          1,
        ],
        [
          queryClient.getQueryCache().find({ query: anQuery2, variables: 2 }),
          2,
        ],
      ])
    })

    it('should return empty array if queries are not found', () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async () => {
          return Date.now()
        },
      })
      expect(queryClient.getQueriesData({ query: anQuery })).toEqual([])
    })
  })

  describe('fetchQuery', () => {
    // https://github.com/tannerlinsley/react-query/issues/652
    it('should not retry by default', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async (): Promise<unknown> => {
          throw new Error('error')
        },
      })

      await expect(
        queryClient.fetchQuery({
          query: anQuery,
        })
      ).rejects.toEqual(new Error('error'))
    })

    it('should be able to fetch when garbage collection time is set to 0 and then be removed', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async () => {
          await sleep(10)
          return 1
        },
      })
      const result = await queryClient.fetchQuery({
        query: anQuery,
        gcTime: 0,
      })
      expect(result).toEqual(1)
      await waitFor(() =>
        expect(queryClient.getQueryData({ query: anQuery })).toEqual(undefined)
      )
    })

    it('should keep a query in cache if garbage collection time is Infinity', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async () => {
          await sleep(10)
          return 1
        },
      })
      const result = await queryClient.fetchQuery({
        query: anQuery,
        gcTime: Infinity,
      })
      const result2 = queryClient.getQueryData({ query: anQuery })
      expect(result).toEqual(1)
      expect(result2).toEqual(1)
    })

    it('should not force fetch', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve('new'),
      })

      queryClient.setQueryData({ query: anQuery }, 'og')

      const first = await queryClient.fetchQuery({
        query: anQuery,
        initialData: 'initial',
        staleTime: 100,
      })
      expect(first).toBe('og')
    })

    it('should only fetch if the data is older then the given stale time', async () => {
      let count = 0

      const anQuery = query({
        key: generatekey(),
        fetcher: () => ++count,
      })

      queryClient.setQueryData({ query: anQuery }, count)
      const first = await queryClient.fetchQuery({
        query: anQuery,
        staleTime: 100,
      })
      await sleep(11)
      const second = await queryClient.fetchQuery({
        query: anQuery,
        staleTime: 10,
      })
      const third = await queryClient.fetchQuery({
        query: anQuery,
        staleTime: 10,
      })
      await sleep(11)
      const fourth = await queryClient.fetchQuery({
        query: anQuery,
        staleTime: 10,
      })
      expect(first).toBe(0)
      expect(second).toBe(1)
      expect(third).toBe(1)
      expect(fourth).toBe(2)
    })
  })

  describe('fetchInfiniteQuery', () => {
    it('should not type-error with strict query key', async () => {
      const data = {
        pages: ['data'],
        pageParams: [0],
      } as const

      const anQuery = queryWithInfinite({
        key: generatekey(),
        initialPageParam: 0,
        fetcher: () => Promise.resolve(data.pages[0]),
        getNextPageParam: () => 1,
      })

      await expect(queryClient.fetchQuery({ query: anQuery })).resolves.toEqual(
        data
      )
    })

    it('should return infinite query data', async () => {
      const anQuery = queryWithInfinite({
        key: generatekey(),
        initialPageParam: 10,
        fetcher: (_, { pageParam }) => Number(pageParam),
        getNextPageParam: () => 1,
      })

      const result = await queryClient.fetchQuery({
        query: anQuery,
      })
      const result2 = queryClient.getQueryData({
        query: anQuery,
      })

      const expected = {
        pages: [10],
        pageParams: [10],
      }

      expect(result).toEqual(expected)
      expect(result2).toEqual(expected)
    })
  })

  describe('prefetchInfiniteQuery', () => {
    it('should not type-error with strict query key', async () => {
      const anQuery = queryWithInfinite({
        key: generatekey(),
        initialPageParam: 0,
        fetcher: () => `data`,
        getNextPageParam: () => 1,
      })

      await queryClient.prefetchQuery({ query: anQuery })

      const result = queryClient.getQueryData({ query: anQuery })

      expect(result).toEqual({
        pages: ['data'],
        pageParams: [0],
      })
    })

    it('should return infinite query data', async () => {
      const anQuery = queryWithInfinite({
        key: generatekey(),
        initialPageParam: 10,
        fetcher: (_, { pageParam }) => Number(pageParam),
        getNextPageParam: () => 1,
      })

      await queryClient.prefetchQuery({
        query: anQuery,
      })

      const result = queryClient.getQueryData({ query: anQuery })

      expect(result).toEqual({
        pages: [10],
        pageParams: [10],
      })
    })

    it('should stop prefetching if getNextPageParam returns undefined', async () => {
      const anQuery = queryWithInfinite({
        key: generatekey(),
        initialPageParam: 10,
        fetcher: (_, { pageParam }) => String(pageParam),
        getNextPageParam: (_lastPage, _pages, lastPageParam) =>
          lastPageParam >= 20 ? undefined : lastPageParam + 5,
      })
      await queryClient.prefetchQuery({
        query: anQuery,
        pages: 5,
      })

      const result = queryClient.getQueryData({ query: anQuery })

      expect(result).toEqual({
        pages: ['10', '15', '20'],
        pageParams: [10, 15, 20],
      })
    })
  })

  describe('prefetchQuery', () => {
    it('should not type-error with strict query key', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve('data'),
      })

      await queryClient.prefetchQuery({ query: anQuery })

      const result = queryClient.getQueryData({ query: anQuery })

      expect(result).toEqual('data')
    })

    it('should return undefined when an error is thrown', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async (): Promise<unknown> => {
          throw new Error('error')
        },
      })

      const result = await queryClient.prefetchQuery({
        query: anQuery,
        retry: false,
      })

      expect(result).toBeUndefined()
    })

    it('should be garbage collected after gcTime if unused', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async () => {
          return 'data'
        },
      })

      await queryClient.prefetchQuery({
        query: anQuery,
        gcTime: 10,
      })
      expect(queryCache.find({ query: anQuery })).toBeDefined()
      await sleep(15)
      expect(queryCache.find({ query: anQuery })).not.toBeDefined()
    })
  })

  describe('removeQueries', () => {
    it('should not crash when exact is provided', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async () => {
          return 'data'
        },
      })

      // check the query was added to the cache
      await queryClient.prefetchQuery({ query: anQuery })
      expect(queryCache.find({ query: anQuery })).toBeTruthy()

      // check the error doesn't occur
      expect(() =>
        queryClient.removeQueries({ query: anQuery, exact: true })
      ).not.toThrow()

      // check query was successful removed
      expect(queryCache.find({ query: anQuery })).toBeFalsy()
    })
  })

  describe('cancelQueries', () => {
    it('should revert queries to their previous state', async () => {
      const anQuery1 = query({
        key: generatekey(),
        fetcher: async () => {
          return 'data'
        },
      })
      const anQuery2 = query({
        key: generatekey(),
        fetcher: async () => {
          return Promise.reject<unknown>('err')
        },
      })

      await queryClient.fetchQuery({
        query: anQuery1,
      })
      try {
        await queryClient.fetchQuery({
          query: anQuery2,
        })
      } catch {}
      anQuery1.fetcher = async () => {
        await sleep(1000)
        return 'data2'
      }
      queryClient.fetchQuery({
        query: anQuery1,
      })
      try {
        anQuery2.fetcher = async () => {
          await sleep(1000)
          return Promise.reject<unknown>('err2') as Promise<string>
        }
        queryClient.fetchQuery({
          query: anQuery2,
        })
      } catch {}

      const anQuery3 = query({
        key: generatekey(),
        fetcher: async () => {
          await sleep(1000)
          return 'data3'
        },
      })
      queryClient.fetchQuery({
        query: anQuery3,
      })
      await sleep(10)
      await queryClient.cancelQueries()
      const state1 = queryClient.getQueryState({ query: anQuery1 })
      const state2 = queryClient.getQueryState({ query: anQuery2 })
      const state3 = queryClient.getQueryState({ query: anQuery3 })
      expect(state1).toMatchObject({
        data: 'data',
        status: 'success',
      })
      expect(state2).toMatchObject({
        data: undefined,
        error: 'err',
        status: 'error',
      })
      expect(state3).toMatchObject({
        data: undefined,
        status: 'pending',
        fetchStatus: 'idle',
      })
    })

    it('should not revert if revert option is set to false', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: async () => {
          return 'data'
        },
      })

      await queryClient.fetchQuery({
        query: anQuery,
      })
      anQuery.fetcher = async () => {
        await sleep(1000)
        return 'data2'
      }
      queryClient.fetchQuery({
        query: anQuery,
      })
      await sleep(10)
      await queryClient.cancelQueries({ query: anQuery }, { revert: false })
      const state1 = queryClient.getQueryState({ query: anQuery })
      expect(state1).toMatchObject({
        status: 'error',
      })
    })
  })

  describe('refetchQueries', () => {
    it('should not refetch if all observers are disabled', async () => {
      const queryFn = vi.fn<[undefined, any], string>().mockReturnValue('data')
      const anQuery = query({
        key: generatekey(),
        fetcher: queryFn,
      })

      await queryClient.fetchQuery({ query: anQuery })
      const observer1 = createObservableQuery(queryClient, {
        query: anQuery,
        enabled: false,
      })
      observer1.subscribe(() => undefined)
      await queryClient.refetchQueries()
      observer1.destroy()
      expect(queryFn).toHaveBeenCalledTimes(1)
    })
    it('should refetch if at least one observer is enabled', async () => {
      const queryFn = vi.fn<Array<any>, string>().mockReturnValue('data')
      const anQuery = query({
        key: generatekey(),
        fetcher: queryFn,
      })
      await queryClient.fetchQuery({ query: anQuery })
      const observer1 = createObservableQuery(queryClient, {
        query: anQuery,
        enabled: false,
      })
      const observer2 = createObservableQuery(queryClient, {
        query: anQuery,
        refetchOnMount: false,
      })
      observer1.subscribe(() => undefined)
      observer2.subscribe(() => undefined)
      await queryClient.refetchQueries()
      observer1.destroy()
      observer2.destroy()
      expect(queryFn).toHaveBeenCalledTimes(2)
    })
    it('should refetch all queries when no arguments are given', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })

      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer1 = createObservableQuery(queryClient, {
        query: anQuery1,
        staleTime: Infinity,
        initialData: 'initial',
      })
      const observer2 = createObservableQuery(queryClient, {
        query: anQuery2,
        staleTime: Infinity,
        initialData: 'initial',
      })
      observer1.subscribe(() => undefined)
      observer2.subscribe(() => undefined)
      await queryClient.refetchQueries()
      observer1.destroy()
      observer2.destroy()
      expect(queryFn1).toHaveBeenCalledTimes(2)
      expect(queryFn2).toHaveBeenCalledTimes(2)
    })

    it('should be able to refetch all fresh queries', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')
      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer = createObservableQuery(queryClient, {
        query: anQuery1,
        staleTime: Infinity,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      await queryClient.refetchQueries({ type: 'active', stale: false })
      unsubscribe()
      expect(queryFn1).toHaveBeenCalledTimes(2)
      expect(queryFn2).toHaveBeenCalledTimes(1)
    })

    it('should be able to refetch all stale queries', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer = createObservableQuery(queryClient, {
        query: anQuery1,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      queryClient.invalidateQueries({ query: anQuery1 })
      await queryClient.refetchQueries({ stale: true })
      unsubscribe()
      // fetchQuery, observer mount, invalidation (cancels observer mount) and refetch
      expect(queryFn1).toHaveBeenCalledTimes(4)
      expect(queryFn2).toHaveBeenCalledTimes(1)
    })

    it('should be able to refetch all stale and active queries', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      queryClient.invalidateQueries({ query: anQuery1 })
      const observer = createObservableQuery(queryClient, { query: anQuery1 })
      const unsubscribe = observer.subscribe(() => undefined)
      await queryClient.refetchQueries(
        { type: 'active', stale: true },
        { cancelRefetch: false }
      )
      unsubscribe()
      expect(queryFn1).toHaveBeenCalledTimes(2)
      expect(queryFn2).toHaveBeenCalledTimes(1)
    })

    it('should be able to refetch all active and inactive queries', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer = createObservableQuery(queryClient, {
        query: anQuery1,
        staleTime: Infinity,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      await queryClient.refetchQueries()
      unsubscribe()
      expect(queryFn1).toHaveBeenCalledTimes(2)
      expect(queryFn2).toHaveBeenCalledTimes(2)
    })

    it('should be able to refetch all active and inactive queries', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer = createObservableQuery(queryClient, {
        query: anQuery1,
        staleTime: Infinity,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      await queryClient.refetchQueries({ type: 'all' })
      unsubscribe()
      expect(queryFn1).toHaveBeenCalledTimes(2)
      expect(queryFn2).toHaveBeenCalledTimes(2)
    })

    it('should be able to refetch only active queries', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer = createObservableQuery(queryClient, {
        query: anQuery1,
        staleTime: Infinity,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      await queryClient.refetchQueries({ type: 'active' })
      unsubscribe()
      expect(queryFn1).toHaveBeenCalledTimes(2)
      expect(queryFn2).toHaveBeenCalledTimes(1)
    })

    it('should be able to refetch only inactive queries', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer = createObservableQuery(queryClient, {
        query: anQuery1,
        staleTime: Infinity,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      await queryClient.refetchQueries({ type: 'inactive' })
      unsubscribe()
      expect(queryFn1).toHaveBeenCalledTimes(1)
      expect(queryFn2).toHaveBeenCalledTimes(2)
    })

    it('should throw an error if throwOnError option is set to true', async () => {
      const queryFnError = () => Promise.reject<unknown>('error')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFnError,
      })

      try {
        await queryClient.fetchQuery({
          query: anQuery1,
          retry: false,
        })
      } catch {}
      let error: any
      try {
        await queryClient.refetchQueries(
          { query: anQuery1 },
          { throwOnError: true }
        )
      } catch (err) {
        error = err
      }
      expect(error).toEqual('error')
    })

    it('should resolve Promise immediately if query is paused', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      await queryClient.fetchQuery({ query: anQuery1 })
      const onlineMock = mockOnlineManagerIsOnline(false)

      await queryClient.refetchQueries({ query: anQuery1 })

      // if we reach this point, the test succeeds because the Promise was resolved immediately
      expect(queryFn1).toHaveBeenCalledTimes(1)
      onlineMock.mockRestore()
    })

    it('should refetch if query we are offline but query networkMode is always', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
        networkMode: 'always',
      })

      await queryClient.fetchQuery({ query: anQuery1 })
      const onlineMock = mockOnlineManagerIsOnline(false)

      await queryClient.refetchQueries({ query: anQuery1 })

      // initial fetch + refetch (even though we are offline)
      expect(queryFn1).toHaveBeenCalledTimes(2)
      onlineMock.mockRestore()
    })
  })

  describe('invalidateQueries', () => {
    it('should refetch active queries by default', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer = createObservableQuery(queryClient, {
        query: anQuery1,
        staleTime: Infinity,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      queryClient.invalidateQueries({ query: anQuery1 })
      unsubscribe()
      expect(queryFn1).toHaveBeenCalledTimes(2)
      expect(queryFn2).toHaveBeenCalledTimes(1)
    })

    it('should not refetch inactive queries by default', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer = createObservableQuery(queryClient, {
        query: anQuery1,
        enabled: false,
        staleTime: Infinity,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      queryClient.invalidateQueries({ query: anQuery1 })
      unsubscribe()
      expect(queryFn1).toHaveBeenCalledTimes(1)
      expect(queryFn2).toHaveBeenCalledTimes(1)
    })

    it('should not refetch active queries when "refetch" is "none"', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer = createObservableQuery(queryClient, {
        query: anQuery1,
        staleTime: Infinity,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      queryClient.invalidateQueries({
        query: anQuery1,
        refetchType: 'none',
      })
      unsubscribe()
      expect(queryFn1).toHaveBeenCalledTimes(1)
      expect(queryFn2).toHaveBeenCalledTimes(1)
    })

    it('should refetch inactive queries when "refetch" is "inactive"', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer = createObservableQuery(queryClient, {
        query: anQuery1,
        staleTime: Infinity,
        refetchOnMount: false,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      unsubscribe()

      await queryClient.invalidateQueries({
        query: anQuery1,
        refetchType: 'inactive',
      })
      expect(queryFn1).toHaveBeenCalledTimes(2)
      expect(queryFn2).toHaveBeenCalledTimes(1)
    })

    it('should refetch active and inactive queries when "refetch" is "all"', async () => {
      const queryFn1 = vi.fn<Array<any>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<any>, string>().mockReturnValue('data2')

      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })

      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })
      await queryClient.fetchQuery({ query: anQuery1 })
      await queryClient.fetchQuery({ query: anQuery2 })
      const observer = createObservableQuery(queryClient, {
        query: anQuery1,
        staleTime: Infinity,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      queryClient.invalidateQueries({
        refetchType: 'all',
      })
      unsubscribe()
      expect(queryFn1).toHaveBeenCalledTimes(2)
      expect(queryFn2).toHaveBeenCalledTimes(2)
    })

    it('should cancel ongoing fetches if cancelRefetch option is set (default value)', async () => {
      const abortFn = vi.fn()
      let fetchCount = 0
      const anQuery = query({
        key: generatekey(),
        fetcher: (_, { signal }) => {
          return new Promise(resolve => {
            fetchCount++
            setTimeout(() => resolve(5), 10)
            signal.addEventListener('abort', abortFn)
          })
        },
      })

      const observer = createObservableQuery(queryClient, {
        query: anQuery,
        initialData: 1,
      })
      observer.subscribe(() => undefined)

      await queryClient.refetchQueries()
      observer.destroy()
      expect(abortFn).toHaveBeenCalledTimes(1)
      expect(fetchCount).toBe(2)
    })

    it('should not cancel ongoing fetches if cancelRefetch option is set to false', async () => {
      const abortFn = vi.fn()
      let fetchCount = 0
      const anQuery = query({
        key: generatekey(),
        fetcher: (_, { signal }) => {
          return new Promise(resolve => {
            fetchCount++
            setTimeout(() => resolve(5), 10)
            signal.addEventListener('abort', abortFn)
          })
        },
      })
      const observer = createObservableQuery(queryClient, {
        query: anQuery,
        initialData: 1,
      })
      observer.subscribe(() => undefined)

      await queryClient.refetchQueries(undefined, { cancelRefetch: false })
      observer.destroy()
      expect(abortFn).toHaveBeenCalledTimes(0)
      expect(fetchCount).toBe(1)
    })
  })

  describe('resetQueries', () => {
    it('should notify listeners when a query is reset', async () => {
      const callback = vi.fn()

      const anQuery = query({
        key: generatekey(),
        fetcher: () => 'data',
      })

      await queryClient.prefetchQuery({ query: anQuery })

      queryCache.subscribe(callback)

      queryClient.resetQueries({ query: anQuery })

      expect(callback).toHaveBeenCalled()
    })

    it('should reset query', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => 'data',
      })

      await queryClient.prefetchQuery({ query: anQuery })

      let state = queryClient.getQueryState({ query: anQuery })
      expect(state?.data).toEqual('data')
      expect(state?.status).toEqual('success')

      queryClient.resetQueries({ query: anQuery })

      state = queryClient.getQueryState({ query: anQuery })

      expect(state).toBeTruthy()
      expect(state?.data).toBeUndefined()
      expect(state?.status).toEqual('pending')
      expect(state?.fetchStatus).toEqual('idle')
    })

    it('should reset query data to initial data if set', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => 'data',
      })

      await queryClient.prefetchQuery({
        query: anQuery,
        initialData: 'initial',
      })

      let state = queryClient.getQueryState({ query: anQuery })
      expect(state?.data).toEqual('data')

      queryClient.resetQueries({ query: anQuery })

      state = queryClient.getQueryState({ query: anQuery })

      expect(state).toBeTruthy()
      expect(state?.data).toEqual('initial')
    })

    it('should refetch all active queries', async () => {
      const queryFn1 = vi.fn<Array<unknown>, string>().mockReturnValue('data1')
      const queryFn2 = vi.fn<Array<unknown>, string>().mockReturnValue('data2')
      const anQuery1 = query({
        key: generatekey(),
        fetcher: queryFn1,
      })
      const anQuery2 = query({
        key: generatekey(),
        fetcher: queryFn2,
      })

      const observer1 = createObservableQuery(queryClient, {
        query: anQuery1,
        enabled: true,
      })
      const observer2 = createObservableQuery(queryClient, {
        query: anQuery2,
        enabled: false,
      })
      observer1.subscribe(() => undefined)
      observer2.subscribe(() => undefined)
      await queryClient.resetQueries()
      observer2.destroy()
      observer1.destroy()
      expect(queryFn1).toHaveBeenCalledTimes(2)
      expect(queryFn2).toHaveBeenCalledTimes(0)
    })
  })

  describe('focusManager and onlineManager', () => {
    it('should notify queryCache and mutationCache if focused', async () => {
      const testClient = createQueryClient()
      testClient.mount()

      const queryCacheOnFocusSpy = vi.spyOn(
        testClient.getQueryCache(),
        'onFocus'
      )
      const queryCacheOnOnlineSpy = vi.spyOn(
        testClient.getQueryCache(),
        'onOnline'
      )

      focusManager.setFocused(false)
      expect(queryCacheOnFocusSpy).not.toHaveBeenCalled()

      focusManager.setFocused(true)
      expect(queryCacheOnFocusSpy).toHaveBeenCalledTimes(1)

      expect(queryCacheOnOnlineSpy).not.toHaveBeenCalled()

      queryCacheOnFocusSpy.mockRestore()
      queryCacheOnOnlineSpy.mockRestore()
      focusManager.setFocused(undefined)
    })

    it('should notify queryCache and mutationCache if online', async () => {
      const testClient = createQueryClient()
      testClient.mount()

      const queryCacheOnFocusSpy = vi.spyOn(
        testClient.getQueryCache(),
        'onFocus'
      )
      const queryCacheOnOnlineSpy = vi.spyOn(
        testClient.getQueryCache(),
        'onOnline'
      )

      onlineManager.setOnline(false)
      expect(queryCacheOnOnlineSpy).not.toHaveBeenCalled()

      onlineManager.setOnline(true)
      expect(queryCacheOnOnlineSpy).toHaveBeenCalledTimes(1)

      expect(queryCacheOnFocusSpy).not.toHaveBeenCalled()

      queryCacheOnFocusSpy.mockRestore()
      queryCacheOnOnlineSpy.mockRestore()
      onlineManager.setOnline(true)
    })

    it('should notify queryCache and mutationCache after multiple mounts and single unmount', async () => {
      const testClient = createQueryClient()
      testClient.mount()
      testClient.mount()
      testClient.unmount()

      const queryCacheOnFocusSpy = vi.spyOn(
        testClient.getQueryCache(),
        'onFocus'
      )
      const queryCacheOnOnlineSpy = vi.spyOn(
        testClient.getQueryCache(),
        'onOnline'
      )

      onlineManager.setOnline(false)
      onlineManager.setOnline(true)
      expect(queryCacheOnOnlineSpy).toHaveBeenCalledTimes(1)

      focusManager.setFocused(true)
      expect(queryCacheOnFocusSpy).toHaveBeenCalledTimes(1)

      queryCacheOnFocusSpy.mockRestore()
      queryCacheOnOnlineSpy.mockRestore()
      focusManager.setFocused(undefined)
      onlineManager.setOnline(true)
    })

    it('should not notify queryCache and mutationCache after multiple mounts/unmounts', async () => {
      const testClient = createQueryClient()
      testClient.mount()
      testClient.mount()
      testClient.unmount()
      testClient.unmount()

      const queryCacheOnFocusSpy = vi.spyOn(
        testClient.getQueryCache(),
        'onFocus'
      )
      const queryCacheOnOnlineSpy = vi.spyOn(
        testClient.getQueryCache(),
        'onOnline'
      )

      onlineManager.setOnline(true)
      expect(queryCacheOnOnlineSpy).not.toHaveBeenCalled()

      focusManager.setFocused(true)
      expect(queryCacheOnFocusSpy).not.toHaveBeenCalled()

      queryCacheOnFocusSpy.mockRestore()
      queryCacheOnOnlineSpy.mockRestore()
      focusManager.setFocused(undefined)
      onlineManager.setOnline(true)
    })
  })
})
