import { MutationFunctionContext, MutationInfoOptions } from './mutationInfo'
import { generatekey } from './utils'

export interface MutationOptions<
  TData = unknown,
  TVars = void,
  TError = Error
> extends Omit<MutationInfoOptions<TData, TVars, TError>, 'mutation'> {
  fetcher: (
    variables: TVars,
    context: MutationFunctionContext
  ) => Promise<TData>
}

export interface Mutation<TData = unknown, TVars = void, TError = Error>
  extends MutationOptions<TData, TVars, TError> {
  key: string
}

export const mutation = <TData = unknown, TVars = void, TError = Error>(
  options: MutationOptions<TData, TVars, TError>
): Mutation<TData, TVars, TError> => {
  return {
    ...options,
    key: generatekey(),
  }
}
