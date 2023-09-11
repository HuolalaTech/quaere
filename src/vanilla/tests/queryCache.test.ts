import { waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import {
  QueryCache,
  QueryClient,
  createQueryCache,
  createQueryClient,
  query,
} from '..'
import { createObservableQuery } from '../observableQuery'
import { generatekey } from '../utils'
import { sleep } from './utils'

describe('queryCache', () => {
  let queryClient: QueryClient
  let queryCache: QueryCache

  beforeEach(() => {
    queryClient = createQueryClient()
    queryCache = queryClient.getQueryCache()
  })

  afterEach(() => {
    queryClient.clear()
  })

  describe('subscribe', () => {
    it('should pass the correct query', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => {
          return 'data'
        },
        gcTime: 10,
      })
      const subscriber = vi.fn()
      const unsubscribe = queryCache.subscribe(subscriber)
      queryClient.setQueryData({ query: anQuery }, 'foo')
      const queryInfo = queryCache.find({ query: anQuery })
      await sleep(1)
      expect(subscriber).toHaveBeenCalledWith({ queryInfo, type: 'added' })
      unsubscribe()
    })

    it('should notify listeners when new query is added', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => {
          return 'data'
        },
      })
      const callback = vi.fn()
      queryCache.subscribe(callback)
      queryClient.prefetchQuery({ query: anQuery })
      await sleep(100)
      expect(callback).toHaveBeenCalled()
    })

    it('should notify query cache when a query becomes stale', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => {
          return 'data'
        },
        staleTime: 10,
      })
      const events: Array<string> = []
      const unsubscribe = queryCache.subscribe(event => {
        events.push(event.type)
      })

      const observer = createObservableQuery(queryClient, {
        query: anQuery,
      })

      const unsubScribeObserver = observer.subscribe(vi.fn())

      await waitFor(() => {
        expect(events.length).toBe(3)
      })

      expect(events).toEqual([
        'added', //  Query added -> loading
        'updated', //  Query updated -> fetching
        'updated', // Query updated -> success
      ])

      unsubscribe()
      unsubScribeObserver()
    })

    it('should include the queryCache and query when notifying listeners', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => {
          return 'data'
        },
      })
      const callback = vi.fn()
      queryCache.subscribe(callback)
      queryClient.prefetchQuery({ query: anQuery })
      const queryInfo = queryCache.find({ query: anQuery })
      await sleep(100)
      expect(callback).toHaveBeenCalledWith({ queryInfo, type: 'added' })
    })

    it('should notify subscribers when new query with initialData is added', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => {
          return 'data'
        },
      })
      const callback = vi.fn()
      queryCache.subscribe(callback)
      queryClient.prefetchQuery({
        query: anQuery,
        initialData: 'initial',
      })
      await sleep(100)
      expect(callback).toHaveBeenCalled()
    })

    it('should be able to limit cache size', async () => {
      const testCache = createQueryCache()

      const unsubscribe = testCache.subscribe(event => {
        if (event.type === 'added') {
          if (testCache.getAll().length > 2) {
            testCache
              .findAll({
                type: 'inactive',
                predicate: q => q !== event.queryInfo,
              })
              .forEach(query => {
                testCache.remove(query)
              })
          }
        }
      })

      const testClient = createQueryClient({ queryCache: testCache })

      await testClient.prefetchQuery({
        query: query({
          key: generatekey(),
          fetcher: () => {
            return 'data1'
          },
        }),
      })
      expect(testCache.findAll().length).toBe(1)
      await testClient.prefetchQuery({
        query: query({
          key: generatekey(),
          fetcher: () => {
            return 'data2'
          },
        }),
      })
      expect(testCache.findAll().length).toBe(2)
      await testClient.prefetchQuery({
        query: query({
          key: generatekey(),
          fetcher: () => {
            return 'data3'
          },
        }),
      })
      expect(testCache.findAll().length).toBe(1)
      expect(testCache.findAll()[0]!.state.data).toBe('data3')

      unsubscribe()
    })
  })

  describe('find', () => {
    it('find should filter correctly', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => {
          return 'data1'
        },
      })
      await queryClient.prefetchQuery({ query: anQuery })
      const queryInfo = queryCache.find({ query: anQuery })!
      expect(queryInfo).toBeDefined()
    })

    it('find should filter correctly with exact set to false', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => {
          return 'data1'
        },
      })
      await queryClient.prefetchQuery({ query: anQuery })
      const queryInfo = queryCache.find({ query: anQuery, exact: false })!
      expect(queryInfo).toBeDefined()
    })
  })

  describe('findAll', () => {
    it('should filter correctly', async () => {
      const anQuery1 = query({
        key: generatekey(),
        fetcher: () => {
          return 'data1'
        },
      })
      const anQuery2 = query({
        key: generatekey(),
        fetcher: () => {
          return 'data2'
        },
      })
      const keyFetchingQuery = query({
        key: generatekey(),
        fetcher: async () => {
          await sleep(20)
          return 'dataFetching'
        },
      })
      const abQuery = query({
        key: generatekey(),
        fetcher: (_: { a: 'a'; b: 'b' }) => {
          return 'data3'
        },
      })
      const postsQuery = query({
        key: generatekey(),
        fetcher: (_: 1) => {
          return 'data4'
        },
      })
      await queryClient.prefetchQuery({
        query: anQuery1,
      })
      await queryClient.prefetchQuery({
        query: anQuery2,
      })
      await queryClient.prefetchQuery({
        query: abQuery,
        variables: { a: 'a', b: 'b' },
      })
      await queryClient.prefetchQuery({
        query: postsQuery,
        variables: 1,
      })
      queryClient.invalidateQueries({ query: anQuery2 })
      const query1 = queryCache.find({ query: anQuery1 })!
      const query2 = queryCache.find({ query: anQuery2 })!
      const query3 = queryCache.find({
        query: abQuery,
        variables: { a: 'a', b: 'b' },
      })!
      const query4 = queryCache.find({ query: postsQuery, variables: 1 })!

      expect(queryCache.findAll({ query: anQuery1 })).toEqual([query1])
      // wrapping in an extra array doesn't yield the same results anymore since v4 because keys need to be an array
      expect(queryCache.findAll()).toEqual([query1, query2, query3, query4])
      expect(queryCache.findAll({})).toEqual([query1, query2, query3, query4])
      expect(queryCache.findAll({ query: anQuery1, type: 'inactive' })).toEqual(
        [query1]
      )
      expect(queryCache.findAll({ query: anQuery1, type: 'active' })).toEqual(
        []
      )
      expect(queryCache.findAll({ query: anQuery1, stale: true })).toEqual([])
      expect(queryCache.findAll({ query: anQuery1, stale: false })).toEqual([
        query1,
      ])
      expect(
        queryCache.findAll({ query: anQuery1, stale: false, type: 'active' })
      ).toEqual([])
      expect(
        queryCache.findAll({ query: anQuery1, stale: false, type: 'inactive' })
      ).toEqual([query1])
      expect(
        queryCache.findAll({
          query: anQuery1,
          stale: false,
          type: 'inactive',
          exact: true,
        })
      ).toEqual([query1])

      expect(queryCache.findAll({ query: anQuery2 })).toEqual([query2])
      expect(queryCache.findAll({ query: anQuery2, stale: undefined })).toEqual(
        [query2]
      )
      expect(queryCache.findAll({ query: anQuery2, stale: true })).toEqual([
        query2,
      ])
      expect(queryCache.findAll({ query: anQuery2, stale: false })).toEqual([])
      expect(
        queryCache.findAll({ query: abQuery, variables: { b: 'b' } })
      ).toEqual([query3])
      expect(
        queryCache.findAll({
          query: abQuery,
          variables: { a: 'a' },
          exact: false,
        })
      ).toEqual([query3])
      expect(
        queryCache.findAll({
          query: abQuery,
          variables: { a: 'a' },
          exact: true,
        })
      ).toEqual([])
      expect(
        queryCache.findAll({
          query: abQuery,
          variables: { a: 'a', b: 'b' },
          exact: true,
        })
      ).toEqual([query3])
      expect(
        queryCache.findAll({ query: abQuery, variables: { a: 'a', b: 'b' } })
      ).toEqual([query3])
      expect(
        queryCache.findAll({
          query: abQuery,
          // @ts-ignore
          variables: { a: 'a', b: 'b', c: 'c' },
        })
      ).toEqual([])
      expect(
        queryCache.findAll({
          query: abQuery,
          variables: { a: 'a' },
          stale: false,
        })
      ).toEqual([query3])
      expect(
        queryCache.findAll({
          query: abQuery,
          variables: { a: 'a' },
          stale: true,
        })
      ).toEqual([])
      expect(
        queryCache.findAll({
          query: abQuery,
          variables: { a: 'a' },
          type: 'active',
        })
      ).toEqual([])
      expect(
        queryCache.findAll({
          query: abQuery,
          variables: { a: 'a' },
          type: 'inactive',
        })
      ).toEqual([query3])
      expect(
        queryCache.findAll({ predicate: query => query === query3 })
      ).toEqual([query3])
      expect(queryCache.findAll({ query: postsQuery })).toEqual([query4])

      expect(queryCache.findAll({ fetchStatus: 'idle' })).toEqual([
        query1,
        query2,
        query3,
        query4,
      ])
      expect(
        queryCache.findAll({ query: anQuery2, fetchStatus: undefined })
      ).toEqual([query2])

      const promise = queryClient.prefetchQuery({
        query: keyFetchingQuery,
      })
      expect(queryCache.findAll({ fetchStatus: 'fetching' })).toEqual([
        queryCache.find({ query: keyFetchingQuery }),
      ])
      await promise
      expect(queryCache.findAll({ fetchStatus: 'fetching' })).toEqual([])
    })

    it('should return all the queries when no filters are defined', async () => {
      const anQuery1 = query({
        key: generatekey(),
        fetcher: () => {
          return 'data1'
        },
      })
      const anQuery2 = query({
        key: generatekey(),
        fetcher: () => {
          return 'data2'
        },
      })
      await queryClient.prefetchQuery({
        query: anQuery1,
      })
      await queryClient.prefetchQuery({
        query: anQuery2,
      })
      expect(queryCache.findAll().length).toBe(2)
    })
  })

  describe('QueryCacheConfig error callbacks', () => {
    it('should call onError and onSettled when a query errors', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => {
          return 'data'
        },
      })
      const onSuccess = vi.fn()
      const onSettled = vi.fn()
      const onError = vi.fn()
      const testCache = createQueryCache({ onSuccess, onError, onSettled })
      const testClient = createQueryClient({ queryCache: testCache })
      // @ts-ignore
      anQuery.fetcher = () => Promise.reject<unknown>('error')
      await testClient.prefetchQuery({
        query: anQuery,
      })
      const queryInfo = testCache.find({ query: anQuery })
      expect(onError).toHaveBeenCalledWith('error', queryInfo)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onSuccess).not.toHaveBeenCalled()
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledWith(undefined, 'error', queryInfo)
    })
  })

  describe('QueryCacheConfig success callbacks', () => {
    it('should call onSuccess and onSettled when a query is successful', async () => {
      const anQuery = query({
        key: generatekey(),
        fetcher: () => Promise.resolve({ data: 5 }),
      })
      const onSuccess = vi.fn()
      const onSettled = vi.fn()
      const onError = vi.fn()
      const testCache = createQueryCache({ onSuccess, onError, onSettled })
      const testClient = createQueryClient({ queryCache: testCache })
      await testClient.prefetchQuery({
        query: anQuery,
      })
      const queryInfo = testCache.find({ query: anQuery })
      expect(onSuccess).toHaveBeenCalledWith({ data: 5 }, queryInfo)
      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onError).not.toHaveBeenCalled()
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledWith({ data: 5 }, null, queryInfo)
    })
  })
})
