import { QueryInfoOptions } from './queryInfo'
import { DataUpdateFunction, Updater } from './typeUtils'

export * from './utils/generateKey'

export const getFullKey = (key: string, variables?: any) => {
  return (isUndefined(variables) ? [key] : [key, variables]) as [string, any]
}

export const hashKeyByFn = (
  fullKey: [string, any],
  hashKeyFn = hashKey
): string => {
  return hashKeyFn(fullKey)
}

export const hashKey = (fullKey: [string, any]): string => {
  return JSON.stringify(fullKey, (_, val) =>
    isPlainObject(val)
      ? Object.keys(val)
          .sort()
          .reduce((result, key) => {
            result[key] = val[key]
            return result
          }, {} as any)
      : val
  )
}

const hasObjectPrototype = (o: any): boolean => {
  return Object.prototype.toString.call(o) === '[object Object]'
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
export const isPlainObject = (o: any): boolean => {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has modified constructor
  const ctor = o.constructor
  if (isUndefined(ctor)) {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false
  }

  // Most likely a plain Object
  return true
}

/**
 * Checks if key `b` partially matches with key `a`.
 */
export const partialMatchKey = (a: any, b: any): boolean => {
  if (a === b) {
    return true
  }

  if (typeof a !== typeof b) {
    return false
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return !Object.keys(b).some(key => !partialMatchKey(a[key], b[key]))
  }

  return false
}

export const isValidTimeout = (value: unknown): value is number => {
  return isNumber(value) && value >= 0 && value !== Infinity
}

export const sleep = (timeout: number): Promise<void> => {
  return new Promise(resolve => {
    setTimeout(resolve, timeout)
  })
}

export const isPlainArray = (value: unknown) => {
  return Array.isArray(value) && value.length === Object.keys(value).length
}

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */
export function replaceEqualDeep<T>(a: unknown, b: T): T
export function replaceEqualDeep(a: any, b: any): any {
  if (a === b) {
    return a
  }

  const array = isPlainArray(a) && isPlainArray(b)

  if (array || (isPlainObject(a) && isPlainObject(b))) {
    const aSize = array ? a.length : Object.keys(a).length
    const bItems = array ? b : Object.keys(b)
    const bSize = bItems.length
    const copy: any = array ? [] : {}

    let equalItems = 0

    for (let i = 0; i < bSize; i++) {
      const key = array ? i : bItems[i]
      copy[key] = replaceEqualDeep(a[key], b[key])
      if (copy[key] === a[key]) {
        equalItems++
      }
    }

    return aSize === bSize && equalItems === aSize ? a : copy
  }

  return b
}

export const replaceData = <
  TData,
  TOptions extends QueryInfoOptions<any, any, any>
>(
  prevData: TData | undefined,
  data: TData,
  options: TOptions
): TData => {
  if (isFunction(options.structuralSharing)) {
    return options.structuralSharing(prevData, data)
  } else if (options.structuralSharing !== false) {
    // Structurally share data between prev and new data if needed
    return replaceEqualDeep(prevData, data)
  }
  return data
}

export const isPromiseLike = (x: unknown): x is PromiseLike<unknown> => {
  return isFunction((x as any)?.then)
}

export const noop: () => undefined = () => {}

export const UNDEFINED = /*#__NOINLINE__*/ noop() as undefined

export const isUndefined = (v: any): v is undefined => {
  return v === UNDEFINED
}

export const isServer = typeof window === 'undefined' || 'Deno' in window

export const isFunction = (v: any): v is (...args: any[]) => any => {
  return typeof v === 'function'
}

export const isBoolean = (value?: any): value is boolean => {
  return typeof value === 'boolean'
}

export const isNumber = (value?: any): value is number => {
  return typeof value === 'number'
}

export const timeUntilStale = (
  updatedAt: number,
  staleTime?: number
): number => {
  return Math.max(updatedAt + (staleTime || 0) - Date.now(), 0)
}

export const addToEnd = <T>(items: T[], item: T, max = 0): T[] => {
  const newItems = [...items, item]
  return max && newItems.length > max ? newItems.slice(1) : newItems
}

export const addToStart = <T>(items: T[], item: T, max = 0): T[] => {
  const newItems = [item, ...items]
  return max && newItems.length > max ? newItems.slice(0, -1) : newItems
}

export const functionalUpdate = <TInput, TOutput>(
  updater: Updater<TInput, TOutput>,
  input: TInput
): TOutput => {
  return (
    isFunction(updater)
      ? (updater as DataUpdateFunction<TInput, TOutput>)(input)
      : updater
  ) as TOutput
}

export const findSet = <T>(
  listeners: Set<T>,
  predicate: (listener: T) => boolean | undefined
): T | undefined => {
  for (const listener of listeners) {
    if (predicate(listener)) {
      return listener
    }
  }
}

/**
 * Shallow compare objects. Only works with objects that always have the same properties.
 */
export const shallowEqualObjects = <T>(a: T, b: T): boolean => {
  if ((a && !b) || (b && !a)) {
    return false
  }

  for (const key in a) {
    if (a[key] !== b[key]) {
      return false
    }
  }

  return true
}

export const getAbortController = (): AbortController | undefined => {
  if (typeof AbortController === 'function') {
    return new AbortController()
  }
  return
}