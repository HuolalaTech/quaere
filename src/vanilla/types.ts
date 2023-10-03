import { Mutation } from './mutation'
import { PrimitiveQuery } from './primitiveQuery'

export interface InfiniteData<TFetcherData> {
  pages: TFetcherData[]
  pageParams: number[]
}

export type inferVariables<T> = T extends PrimitiveQuery<
  any,
  infer TVariables,
  any,
  any
>
  ? TVariables
  : T extends Mutation<any, infer TVariables, any>
  ? TVariables
  : never

export type inferData<T> = T extends PrimitiveQuery<infer TData, any, any, any>
  ? TData
  : T extends Mutation<infer TData, any, any>
  ? TData
  : never

export type inferError<T> = T extends PrimitiveQuery<
  any,
  any,
  infer TError,
  any
>
  ? TError
  : T extends Mutation<any, any, infer TError>
  ? TError
  : never
