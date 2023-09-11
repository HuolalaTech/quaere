import { focusManager } from './focusManager'
import { onlineManager } from './onlineManager'
import { UNDEFINED, isFunction, isNumber, isServer, sleep } from './utils'

export interface CancelOptions {
  revert?: boolean
  silent?: boolean
}

export type NetworkMode = 'online' | 'always' | 'offlineFirst'

// TYPES

interface RetryerConfig<TData = unknown, TError = Error> {
  fn: () => TData | Promise<TData>
  abort?: () => void
  onError?: (error: TError) => void
  onSuccess?: (data: TData) => void
  onPause?: () => void
  onContinue?: () => void
  retry?: RetryValue<TError>
  retryDelay?: RetryDelayValue<TError>
  networkMode: NetworkMode | undefined
}

export interface Retryer<TData = unknown> {
  promise: Promise<TData>
  cancel: (cancelOptions?: CancelOptions) => void
  continue: () => Promise<unknown>
  cancelRetry: () => void
  continueRetry: () => void
}

export type RetryValue<TError> = boolean | number | ShouldRetryFunction<TError>

type ShouldRetryFunction<TError> = (
  failureCount: number,
  error: TError
) => boolean

export type RetryDelayValue<TError> = number | RetryDelayFunction<TError>

type RetryDelayFunction<TError> = (
  failureCount: number,
  error: TError
) => number

const defaultRetryDelay = (failureCount: number) => {
  return Math.min(1000 * 2 ** failureCount, 30000)
}

export const canFetch = (networkMode: NetworkMode | undefined): boolean => {
  return (networkMode ?? 'online') === 'online'
    ? onlineManager.isOnline()
    : true
}

export class CancelledError {
  revert?: boolean
  silent?: boolean
  constructor(options?: CancelOptions) {
    this.revert = options?.revert
    this.silent = options?.silent
  }
}

export const isCancelledError = (value: any): value is CancelledError => {
  return value instanceof CancelledError
}

export const createRetryer = <TData = unknown, TError = Error>(
  config: RetryerConfig<TData, TError>
): Retryer<TData> => {
  let isRetryCancelled = false
  let failureCount = 0
  let isResolved = false
  let continueFn: ((value?: unknown) => boolean) | undefined
  let promiseResolve: (data: TData) => void
  let promiseReject: (error: TError) => void

  const promise = new Promise<TData>((outerResolve, outerReject) => {
    promiseResolve = outerResolve
    promiseReject = outerReject
  })

  const cancel = (cancelOptions?: CancelOptions): void => {
    if (!isResolved) {
      reject(new CancelledError(cancelOptions))

      config.abort?.()
    }
  }
  const cancelRetry = () => {
    isRetryCancelled = true
  }

  const continueRetry = () => {
    isRetryCancelled = false
  }

  const shouldPause = () =>
    !focusManager.isFocused() ||
    (config.networkMode !== 'always' && !onlineManager.isOnline())

  const resolve = (value: any) => {
    if (!isResolved) {
      isResolved = true
      config.onSuccess?.(value)
      continueFn?.()
      promiseResolve(value)
    }
  }

  const reject = (value: any) => {
    if (!isResolved) {
      isResolved = true
      config.onError?.(value)
      continueFn?.()
      promiseReject(value)
    }
  }

  const pause = () => {
    return new Promise(continueResolve => {
      continueFn = value => {
        const canContinue = isResolved || !shouldPause()
        if (canContinue) {
          continueResolve(value)
        }
        return canContinue
      }
      config.onPause?.()
    }).then(() => {
      continueFn = UNDEFINED
      if (!isResolved) {
        config.onContinue?.()
      }
    })
  }

  // Create loop function
  const run = () => {
    // Do nothing if already resolved
    if (isResolved) {
      return
    }

    let promiseOrValue: any

    // Execute query
    try {
      promiseOrValue = config.fn()
    } catch (error) {
      promiseOrValue = Promise.reject(error)
    }

    Promise.resolve(promiseOrValue)
      .then(resolve)
      .catch(error => {
        // Stop if the fetch is already resolved
        if (isResolved) {
          return
        }

        // Do we need to retry the request?
        const retry = config.retry ?? (isServer ? 0 : 3)
        const retryDelay = config.retryDelay ?? defaultRetryDelay
        const delay = isFunction(retryDelay)
          ? retryDelay(failureCount, error)
          : retryDelay
        const shouldRetry =
          retry === true ||
          (isNumber(retry) && failureCount < retry) ||
          (isFunction(retry) && retry(failureCount, error))

        if (isRetryCancelled || !shouldRetry) {
          // We are done if the query does not need to be retried
          reject(error)
          return
        }

        failureCount++

        // Delay
        sleep(delay)
          // Pause if the document is not visible or when the device is offline
          .then(() => {
            if (shouldPause()) {
              return pause()
            }
            return
          })
          .then(() => {
            if (isRetryCancelled) {
              reject(error)
            } else {
              run()
            }
          })
      })
  }

  // Start loop
  if (canFetch(config.networkMode)) {
    run()
  } else {
    pause().then(run)
  }

  return {
    promise,
    cancel,
    continue: () => {
      const didContinue = continueFn?.()
      return didContinue ? promise : Promise.resolve()
    },
    cancelRetry,
    continueRetry,
  }
}
