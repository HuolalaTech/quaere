import {
  NotifyOptions,
  ObservableQuery,
  ObservableQueryOptions,
  ObservableQueryResult,
} from './observableQuery'
import { QueryClient } from './queryClient'
import { createSubscribable } from './subscribable'
import { replaceEqualDeep } from './utils'

export interface ObservableQueriesOptions<
  TCombinedResult = ObservableQueryResult[]
> {
  combine?: (result: ObservableQueryResult[]) => TCombinedResult
}

type QueryObserverMatch = {
  defaultedQueryOptions: ObservableQueryOptions
  observableQuery: ObservableQuery
}

export const createObservableQueries = <TCombinedResult = []>(
  client: QueryClient,
  initialQueries: ObservableQueryOptions[],
  initialOptions?: ObservableQueriesOptions<TCombinedResult>
) => {
  let result: ObservableQueryResult[] = []
  let combinedResult: TCombinedResult
  let queries: ObservableQueryOptions[] = []
  let obsQueries: ObservableQuery[] = []
  let options: ObservableQueriesOptions<TCombinedResult> | undefined

  const setResult = (value: ObservableQueryResult[]) => {
    result = value
    combinedResult = combineResult(value)
  }

  const setQueries = (
    newQueries: ObservableQueryOptions[],
    newOptions?: ObservableQueriesOptions<TCombinedResult>,
    notifyOptions?: NotifyOptions
  ): void => {
    queries = newQueries
    options = newOptions

    const prevObsQueries = obsQueries

    const newObserverMatches = findMatchingObservers(queries)

    // set options for the new obsQueries to notify of changes
    newObserverMatches.forEach(match =>
      match.observableQuery.setOptions(
        match.defaultedQueryOptions,
        notifyOptions
      )
    )

    const newObservers = newObserverMatches.map(match => match.observableQuery)
    const newResult = newObservers.map(obsQuery => obsQuery.getCurrentResult())

    const hasIndexChange = newObservers.some(
      (obsQuery, index) => obsQuery !== prevObsQueries[index]
    )
    if (prevObsQueries.length === newObservers.length && !hasIndexChange) {
      return
    }

    obsQueries = newObservers
    setResult(newResult)

    if (!hasListeners()) {
      return
    }

    difference(prevObsQueries, newObservers).forEach(obsQuery => {
      obsQuery.destroy()
    })

    difference(newObservers, prevObsQueries).forEach(obsQuery => {
      obsQuery.subscribe(result => {
        onUpdate(obsQuery, result)
      })
    })

    notify()
  }

  const [listeners, subscribe, hasListeners] = createSubscribable<
    (result: ObservableQueryResult[]) => void
  >(
    function onSubscribe() {
      if (listeners.size === 1) {
        obsQueries.forEach(obsQuery => {
          obsQuery.subscribe(result => {
            onUpdate(obsQuery, result)
          })
        })
      }
    },
    function onUnsubscribe() {
      if (!listeners.size) {
        destroy()
      }
    }
  )

  const destroy = (): void => {
    listeners.clear()
    obsQueries.forEach(obsQuery => {
      obsQuery.destroy()
    })
  }

  const findMatchingObservers = (
    queries: ObservableQueryOptions[]
  ): QueryObserverMatch[] => {
    const prevObsQueries = obsQueries
    const prevObserversMap = new Map(
      prevObsQueries.map(obsQuery => [obsQuery.options.queryHash, obsQuery])
    )

    const defaultedQueryOptions = queries.map(obsQueryOptions =>
      client.defaultQueryOptions(obsQueryOptions)
    )

    const matchingObservers: QueryObserverMatch[] =
      defaultedQueryOptions.flatMap(defaultedOptions => {
        const match = prevObserversMap.get(defaultedOptions.queryHash)
        if (match != null) {
          return [
            { defaultedQueryOptions: defaultedOptions, observableQuery: match },
          ]
        }
        return []
      })

    const matchedQueryHashes = new Set(
      matchingObservers.map(match => match.defaultedQueryOptions.queryHash)
    )
    const unmatchedQueries = defaultedQueryOptions.filter(
      defaultedOptions => !matchedQueryHashes.has(defaultedOptions.queryHash)
    )

    const getObservableQuery = (
      newOptions: ObservableQueryOptions
    ): ObservableQuery => {
      const defaultedOptions = client.defaultQueryOptions(newOptions)
      const currentObsQuery = obsQueries.find(
        o => o.options.queryHash === defaultedOptions.queryHash
      )
      return currentObsQuery ?? client.watchQuery(defaultedOptions)
    }

    const newOrReusedObsQueries: QueryObserverMatch[] = unmatchedQueries.map(
      options => {
        return {
          defaultedQueryOptions: options,
          observableQuery: getObservableQuery(options),
        }
      }
    )

    const sortMatchesByOrderOfQueries = (
      a: QueryObserverMatch,
      b: QueryObserverMatch
    ): number =>
      defaultedQueryOptions.indexOf(a.defaultedQueryOptions) -
      defaultedQueryOptions.indexOf(b.defaultedQueryOptions)

    return matchingObservers
      .concat(newOrReusedObsQueries)
      .sort(sortMatchesByOrderOfQueries)
  }

  const combineResult = (input: ObservableQueryResult[]): TCombinedResult => {
    const combine = options?.combine
    if (combine) {
      return replaceEqualDeep(combinedResult, combine(input))
    }
    return input as any
  }

  const onUpdate = (
    obsQuery: ObservableQuery,
    obsQueryResult: ObservableQueryResult
  ): void => {
    const index = obsQueries.indexOf(obsQuery)
    if (index !== -1) {
      setResult(replaceAt(result, index, obsQueryResult))
      notify()
    }
  }

  const notify = (): void => {
    listeners.forEach(listener => {
      listener(result)
    })
  }

  // initialize
  setResult([])
  setQueries(initialQueries, initialOptions)

  return {
    subscribe,
    destroy,
    setQueries,

    getCurrentResult: () => combinedResult,

    getQueries: () =>
      obsQueries.map(obsQuery => obsQuery.getCurrentQueryInfo()),

    getObservableQueries: () => obsQueries,

    getOptimisticResult: (
      newQueries: ObservableQueryOptions[]
    ): [
      rawResult: ObservableQueryResult[],
      combineResult: (r?: ObservableQueryResult[]) => TCombinedResult,
      trackResult: () => ObservableQueryResult[]
    ] => {
      const matches = findMatchingObservers(newQueries)
      const result = matches.map(match =>
        match.observableQuery.getOptimisticResult(match.defaultedQueryOptions)
      )

      return [
        result,
        (r?: ObservableQueryResult[]) => {
          return combineResult(r ?? result)
        },
        () => {
          return matches.map((match, index) => {
            const observerResult = result[index]!
            return match.observableQuery.trackResult(observerResult)
          })
        },
      ]
    },
  }
}

const difference = <T>(array1: T[], array2: T[]): T[] => {
  return array1.filter(x => !array2.includes(x))
}

const replaceAt = <T>(array: T[], index: number, value: T): T[] => {
  const copy = array.slice(0)
  copy[index] = value
  return copy
}
