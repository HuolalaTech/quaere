import { act } from '@testing-library/react'
import { vi } from 'vitest'
import type { SpyInstance } from 'vitest'

import { QueryClient, onlineManager } from '..'
import { MutationInfoOptions } from '../mutationInfo'
import * as utils from '../utils'

export function mockVisibilityState(
  value: DocumentVisibilityState
): SpyInstance<[], DocumentVisibilityState> {
  return vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(value)
}

export function mockOnlineManagerIsOnline(
  value: boolean
): SpyInstance<[], boolean> {
  return vi.spyOn(onlineManager, 'isOnline').mockReturnValue(value)
}

export function sleep(timeout: number): Promise<void> {
  return new Promise((resolve, _reject) => {
    setTimeout(resolve, timeout)
  })
}

export function setActTimeout(fn: () => void, ms?: number) {
  return setTimeout(() => {
    act(() => {
      fn()
    })
  }, ms)
}

/**
 * Assert the parameter is of a specific type.
 */
export const expectType = <T>(_: T): void => undefined

export const executeMutation = <
  TData = unknown,
  TVars = unknown,
  TError = Error
>(
  queryClient: QueryClient,
  options: MutationInfoOptions<TData, TVars, TError>,
  variables: TVars
) => {
  return queryClient
    .getMutationCache()
    .build(queryClient, options)
    .trigger(variables)
}

// This monkey-patches the isServer-value from utils,
// so that we can pretend to be in a server environment
export function setIsServer(isServer: boolean) {
  const original = utils.isServer
  Object.defineProperty(utils, 'isServer', {
    get: () => isServer,
  })

  return () => {
    Object.defineProperty(utils, 'isServer', {
      get: () => original,
    })
  }
}
