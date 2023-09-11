import { waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { createMutationCache, createQueryClient, mutation } from '..'
import { executeMutation, sleep } from './utils'

describe('mutationCache', () => {
  describe('MutationCacheConfig error callbacks', () => {
    it('should call onError and onSettled when a mutation errors', async () => {
      const onError = vi.fn()
      const onSuccess = vi.fn()
      const onSettled = vi.fn()
      const testCache = createMutationCache({ onError, onSuccess, onSettled })
      const testClient = createQueryClient({ mutationCache: testCache })
      const anMutation = mutation({
        fetcher: () => Promise.reject(new Error('error')),
      })

      try {
        await executeMutation(
          testClient,
          {
            mutation: anMutation,
          },
          'vars'
        )
      } catch {}

      const mutationInfo = testCache.getAll()[0]
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(
        new Error('error'),
        'vars',
        mutationInfo
      )
      expect(onSuccess).not.toHaveBeenCalled()
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledWith(
        undefined,
        new Error('error'),
        'vars',
        mutationInfo
      )
    })

    it('should be awaited', async () => {
      const anMutation = mutation({
        fetcher: () => Promise.reject(new Error('error')),
        onError: async () => {
          states.push(3)
          await sleep(1)
          states.push(4)
        },
        onSettled: async () => {
          states.push(7)
          await sleep(1)
          states.push(8)
        },
      })
      const states: Array<number> = []
      const onError = async () => {
        states.push(1)
        await sleep(1)
        states.push(2)
      }
      const onSettled = async () => {
        states.push(5)
        await sleep(1)
        states.push(6)
      }
      const testCache = createMutationCache({ onError, onSettled })
      const testClient = createQueryClient({ mutationCache: testCache })

      try {
        await executeMutation(
          testClient,
          {
            mutation: anMutation,
          },
          'vars'
        )
      } catch {}

      expect(states).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })
  })
  describe('MutationCacheConfig success callbacks', () => {
    it('should call onSuccess and onSettled when a mutation is successful', async () => {
      const anMutation = mutation({
        fetcher: () => Promise.resolve({ data: 5 }),
      })
      const onError = vi.fn()
      const onSuccess = vi.fn()
      const onSettled = vi.fn()
      const testCache = createMutationCache({ onError, onSuccess, onSettled })
      const testClient = createQueryClient({ mutationCache: testCache })

      try {
        await executeMutation(
          testClient,
          {
            mutation: anMutation,
          },
          'vars'
        )
      } catch {}

      const mutationInfo = testCache.getAll()[0]
      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSuccess).toHaveBeenCalledWith({ data: 5 }, 'vars', mutationInfo)
      expect(onError).not.toHaveBeenCalled()
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledWith(
        { data: 5 },
        null,
        'vars',
        mutationInfo
      )
    })
    it('should be awaited', async () => {
      const anMutation = mutation({
        fetcher: () => Promise.resolve({ data: 5 }),
        onSuccess: async () => {
          states.push(3)
          await sleep(1)
          states.push(4)
        },
        onSettled: async () => {
          states.push(7)
          await sleep(1)
          states.push(8)
        },
      })
      const states: Array<number> = []
      const onSuccess = async () => {
        states.push(1)
        await sleep(1)
        states.push(2)
      }
      const onSettled = async () => {
        states.push(5)
        await sleep(1)
        states.push(6)
      }
      const testCache = createMutationCache({ onSuccess, onSettled })
      const testClient = createQueryClient({ mutationCache: testCache })

      await executeMutation(
        testClient,
        {
          mutation: anMutation,
        },
        'vars'
      )

      expect(states).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })
  })

  describe('find', () => {
    it('should filter correctly', async () => {
      const anMutation = mutation({
        fetcher: () => Promise.resolve(),
      })
      const testCache = createMutationCache()
      const testClient = createQueryClient({ mutationCache: testCache })
      await executeMutation(
        testClient,
        {
          mutation: anMutation,
        },
        'vars'
      )
      const [mutationInfo] = testCache.getAll()
      expect(
        testCache.find({ mutation: anMutation, variables: 'vars' })
      ).toEqual(mutationInfo)
      expect(testCache.find({ mutation: anMutation, exact: false })).toEqual(
        mutationInfo
      )
      expect(testCache.getAll().length).toEqual(1)
      expect(
        testCache.find({
          predicate: m => m.mutation === anMutation,
        })
      ).toEqual(mutationInfo)
    })
  })

  describe('findAll', () => {
    it('should filter correctly', async () => {
      const testCache = createMutationCache()
      const testClient = createQueryClient({ mutationCache: testCache })
      const mutation1 = mutation({
        fetcher: () => Promise.resolve(),
      })
      const mutation2 = mutation({
        fetcher: () => Promise.resolve(),
      })
      const mutation3 = mutation({
        fetcher: () => Promise.resolve(),
      })

      await executeMutation(
        testClient,
        {
          mutation: mutation1,
        },
        1
      )
      await executeMutation(
        testClient,
        {
          mutation: mutation2,
        },
        2
      )
      await executeMutation(
        testClient,
        {
          mutation: mutation3,
        },
        3
      )

      const [mutationInfo1, mutationInfo2] = testCache.getAll()
      expect(
        testCache.findAll({ mutation: mutation1, exact: false })
      ).toHaveLength(1)
      expect(testCache.find({ mutation: mutation1, variables: 1 })).toEqual(
        mutationInfo1
      )
      expect(
        testCache.findAll({
          predicate: m => m.mutation === mutation2,
        })
      ).toEqual([mutationInfo2])
    })
  })

  describe('garbage collection', () => {
    it('should remove unused mutations after gcTime has elapsed', async () => {
      const testCache = createMutationCache()
      const testClient = createQueryClient({ mutationCache: testCache })
      const onSuccess = vi.fn()
      const anMutation = mutation({
        fetcher: () => Promise.resolve(),
        onSuccess,
        gcTime: 10,
      })

      await executeMutation(
        testClient,
        {
          mutation: anMutation,
        },
        1
      )

      expect(testCache.getAll()).toHaveLength(1)
      await sleep(10)
      await waitFor(() => {
        expect(testCache.getAll()).toHaveLength(0)
      })
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('should not remove mutations if there are active', async () => {
      const queryClient = createQueryClient()
      const anMutation = mutation({
        fetcher: (input: number) => Promise.resolve(input),
        gcTime: 10,
      })
      const mutationInfo = queryClient
        .getMutationCache()
        .build(queryClient, { mutation: anMutation })
      const unsubscribe = mutationInfo.subscribe(() => undefined)

      expect(queryClient.getMutationCache().getAll()).toHaveLength(1)
      mutationInfo.trigger(1)
      expect(queryClient.getMutationCache().getAll()).toHaveLength(1)
      await sleep(10)
      expect(queryClient.getMutationCache().getAll()).toHaveLength(1)
      unsubscribe?.()
      expect(queryClient.getMutationCache().getAll()).toHaveLength(1)
      await sleep(10)
      await waitFor(() => {
        expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
      })
    })

    it('should be garbage collected later when unsubscribed and mutation is pending', async () => {
      const queryClient = createQueryClient()
      const onSuccess = vi.fn()
      const anMutation = mutation({
        fetcher: async () => {
          await sleep(20)
          return 'data'
        },
        onSuccess,
        gcTime: 10,
      })
      const mutationInfo = queryClient
        .getMutationCache()
        .build(queryClient, { mutation: anMutation })

      const unsubscribe = mutationInfo.subscribe(() => undefined)
      mutationInfo.trigger(1)
      unsubscribe()
      expect(queryClient.getMutationCache().getAll()).toHaveLength(1)
      await sleep(10)
      // unsubscribe should not remove even though gcTime has elapsed b/c mutation is still pending
      expect(queryClient.getMutationCache().getAll()).toHaveLength(1)
      await sleep(10)
      // should be removed after an additional gcTime wait
      await waitFor(() => {
        expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
      })
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('should call callbacks even with gcTime 0 and mutation still pending', async () => {
      const queryClient = createQueryClient()
      const onSuccess = vi.fn()
      const anMutation = mutation({
        fetcher: async () => {
          return 'data'
        },
        onSuccess,
        gcTime: 0,
      })
      const mutationInfo = queryClient
        .getMutationCache()
        .build(queryClient, { mutation: anMutation })
      const unsubscribe = mutationInfo.subscribe(() => undefined)
      mutationInfo.trigger(1)
      unsubscribe()
      await waitFor(() => {
        expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
      })
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
  })
})
