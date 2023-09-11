import { QueryBehavior } from './queryInfo'
import { QueryFunctionContext } from './typeUtils'
import { InfiniteData } from './types'
import { addToEnd, addToStart } from './utils'

export type GetPreviousPageParamFunction<TFetcherData = unknown> = (
  firstPage: TFetcherData,
  allPages: TFetcherData[],
  firstPageParam: number,
  allPageParams: number[]
) => number | undefined | null

export type GetNextPageParamFunction<TFetcherData = unknown> = (
  lastPage: TFetcherData,
  allPages: TFetcherData[],
  lastPageParam: number,
  allPageParams: number[]
) => number | undefined | null

export interface InfiniteQueryPageParamsOptions<TFetcherData = unknown> {
  /**
   * This function can be set to automatically get the previous cursor for infinite queries.
   * The result will also be used to determine the value of `hasPreviousPage`.
   */
  getPreviousPageParam?: GetPreviousPageParamFunction<TFetcherData>
  /**
   * This function can be set to automatically get the next cursor for infinite queries.
   * The result will also be used to determine the value of `hasNextPage`.
   */
  getNextPageParam: GetNextPageParamFunction<TFetcherData>

  initialPageParam: number
}

export const createInfiniteQueryBehavior = <TFetcherData, TVars, TError, TData>(
  pages?: number
): QueryBehavior<TFetcherData, TVars, TError, InfiniteData<TData>> => {
  return {
    onFetch: context => {
      context.fetchFn = async () => {
        const options =
          context.options as unknown as InfiniteQueryPageParamsOptions<TFetcherData>
        const direction = context.fetchOptions?.meta?.fetchMore?.direction
        const oldPages = context.state.data?.pages || []
        const oldPageParams = context.state.data?.pageParams || []
        const empty = { pages: [], pageParams: [] }
        let cancelled = false

        const addSignalProperty = (object: unknown) => {
          Object.defineProperty(object, 'signal', {
            enumerable: true,
            get: () => {
              if (context.signal.aborted) {
                cancelled = true
              } else {
                context.signal.addEventListener('abort', () => {
                  cancelled = true
                })
              }
              return context.signal
            },
          })
        }

        // Get query function
        const fetcher =
          context.query.fetcher ||
          (() =>
            Promise.reject(
              new Error(`Missing fetcher: '${context.options.queryHash}'`)
            ))

        // Create function to fetch a page
        const fetchPage = async (
          data: InfiniteData<unknown>,
          param: number,
          previous?: boolean
        ): Promise<InfiniteData<unknown>> => {
          if (cancelled) {
            return Promise.reject()
          }

          if (param == null && data.pages.length) {
            return Promise.resolve(data)
          }

          const queryFnContext: Omit<QueryFunctionContext<number>, 'signal'> = {
            pageParam: param,
            direction: previous ? 'backward' : 'forward',
            meta: context.options.meta,
          }

          addSignalProperty(queryFnContext)

          const page = await fetcher(
            context.variables,
            queryFnContext as QueryFunctionContext<number>
          )

          const { maxPages } = context.options
          const addTo = previous ? addToStart : addToEnd

          return {
            pages: addTo(data.pages, page, maxPages),
            pageParams: addTo(data.pageParams, param, maxPages),
          }
        }

        let result: InfiniteData<unknown>

        // fetch next / previous page?
        if (direction && oldPages.length) {
          const previous = direction === 'backward'
          const pageParamFn = previous ? getPreviousPageParam : getNextPageParam
          const oldData = {
            pages: oldPages,
            pageParams: oldPageParams,
          }
          const param = pageParamFn(options, oldData)

          result = await fetchPage(oldData, param!, previous)
        } else {
          // Fetch first page
          result = await fetchPage(
            empty,
            oldPageParams[0] ?? options.initialPageParam
          )

          const remainingPages = pages ?? oldPages.length

          // Fetch remaining pages
          for (let i = 1; i < remainingPages; i++) {
            const param = getNextPageParam(options, result)
            result = await fetchPage(result, param!)
          }
        }

        return result
      }
    },
  }
}

const getNextPageParam = (
  options: InfiniteQueryPageParamsOptions<any>,
  { pages, pageParams }: InfiniteData<unknown>
): number | undefined | null => {
  const lastIndex = pages.length - 1
  return options.getNextPageParam(
    pages[lastIndex],
    pages,
    pageParams[lastIndex]!,
    pageParams
  )
}

const getPreviousPageParam = (
  options: InfiniteQueryPageParamsOptions<any>,
  { pages, pageParams }: InfiniteData<unknown>
): number | undefined | null => {
  return options.getPreviousPageParam?.(
    pages[0],
    pages,
    pageParams[0]!,
    pageParams
  )
}

/**
 * Checks if there is a next page.
 */
export const hasNextPage = (
  options: InfiniteQueryPageParamsOptions<any>,
  data?: InfiniteData<unknown>
): boolean => {
  if (!data) return false
  return getNextPageParam(options, data) != null
}

/**
 * Checks if there is a previous page.
 */
export const hasPreviousPage = (
  options: InfiniteQueryPageParamsOptions<any>,
  data?: InfiniteData<unknown>
): boolean => {
  if (!data || !options.getPreviousPageParam) return false
  return getPreviousPageParam(options, data) != null
}
