import * as React from 'react'

import {
  MutationInfo,
  MutationInfoOptions,
  getDefaultState,
} from '../vanilla/mutationInfo'
import { UNDEFINED } from '../vanilla/utils'
import { useQueryClient } from './QueryClientProvider'
import { shouldThrowError } from './utils'

export interface UseMutationOptions<
  TData = unknown,
  TVars = unknown,
  TError = Error
> extends Omit<MutationInfoOptions<TData, TVars, TError>, 'defaulted'> {
  throwOnError?: boolean | ((error: TError) => boolean)
}

export interface TriggerOptions<
  TData = unknown,
  TVars = unknown,
  TError = Error
> extends Pick<
    MutationInfoOptions<TData, TVars, TError>,
    'onError' | 'onSettled' | 'onSuccess'
  > {}

export type TriggerFn<TData = unknown, TVars = unknown, TError = Error> = (
  variables: TVars,
  mutateOptions?: TriggerOptions<TData, TVars, TError>
) => Promise<TData>

export type UseMutationResult<
  TData = unknown,
  TVars = unknown,
  TError = Error
> = {
  data?: TData
  error: TError | null
  variables?: TVars
  isMutating: boolean
  trigger: TriggerFn<TData, TVars, TError>
  reset: () => void
}

export const useMutation = <TData = unknown, TVars = unknown, TError = Error>(
  mutaionOptions: UseMutationOptions<TData, TVars, TError>
): UseMutationResult<TData, TVars, TError> => {
  const client = useQueryClient()

  const currentMutationInfoRef =
    React.useRef<MutationInfo<TData, TVars, TError>>()

  const options = client.defaultMutationOptions(mutaionOptions)
  const optionsRef = React.useRef(options)
  optionsRef.current = options

  React.useEffect(() => {
    currentMutationInfoRef.current?.setOptions(options)
  })

  const [, rerender] = React.useReducer(count => ++count, 0)

  const [trigger, reset, cleanup] = React.useMemo(() => {
    let unsubscribe: (() => void) | undefined

    const cleanup = () => {
      unsubscribe?.()
      unsubscribe = UNDEFINED
      currentMutationInfoRef.current = UNDEFINED
    }

    const trigger: TriggerFn<TData, TVars, TError> = (
      variables,
      mutateOptions
    ) => {
      cleanup()

      const currentMutationInfo = (currentMutationInfoRef.current = client
        .getMutationCache()
        .build(client, optionsRef.current))

      unsubscribe = currentMutationInfo.subscribe(rerender)

      return currentMutationInfo.trigger(variables).then(
        data => {
          mutateOptions?.onSuccess?.(data, variables, currentMutationInfo)
          mutateOptions?.onSettled?.(data, null, variables, currentMutationInfo)
          return data
        },
        error => {
          mutateOptions?.onError?.(error, variables, currentMutationInfo)
          mutateOptions?.onSettled?.(
            UNDEFINED,
            error,
            variables,
            currentMutationInfo
          )
          throw error
        }
      )
    }

    const reset = () => {
      cleanup()
      rerender()
    }

    return [trigger, reset, cleanup]
  }, [client])

  // Cleanup on unmount
  React.useEffect(() => cleanup, [cleanup])

  const state =
    currentMutationInfoRef.current?.state ??
    getDefaultState<TData, TVars, TError>()

  // Throw error if needed
  if (state.error && shouldThrowError(options.throwOnError, [state.error])) {
    throw state.error
  }

  return {
    data: state.data,
    error: state.error,
    variables: state.variables,
    isMutating: state.status === 'mutating',
    trigger,
    reset,
  }
}
