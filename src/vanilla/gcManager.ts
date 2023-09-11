import { UNDEFINED, isServer, isValidTimeout } from './utils'

export const createGcManager = (onRemove: () => void) => {
  let gcTime: number
  let gcTimeout: ReturnType<typeof setTimeout> | undefined

  const scheduleGc = () => {
    clearGcTimeout()

    if (isValidTimeout(gcTime)) {
      gcTimeout = setTimeout(() => {
        onRemove()
      }, gcTime)
    }
  }

  const updateGcTime = (newGcTime: number | undefined) => {
    // Default to 5 minutes (Infinity for server-side) if no gcTime is set
    gcTime = Math.max(
      gcTime || 0,
      newGcTime ?? (isServer ? Infinity : 5 * 60 * 1000)
    )
  }

  const clearGcTimeout = () => {
    if (gcTimeout) {
      clearTimeout(gcTimeout)
      gcTimeout = UNDEFINED
    }
  }

  return [updateGcTime, scheduleGc, clearGcTimeout] as const
}
