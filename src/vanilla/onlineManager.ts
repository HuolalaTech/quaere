import { createSubscribable } from './subscribable'
import { UNDEFINED, isBoolean, isServer, isUndefined } from './utils'

type Listener = (online: boolean) => void
type SetupFn = (setOnline: Listener) => (() => void) | undefined

export interface OnlineManager extends ReturnType<typeof createOnlineManager> {}

export const createOnlineManager = () => {
  let online = true
  let cleanup: (() => void) | undefined
  let setup: SetupFn = onOnline => {
    if (!isServer && window.addEventListener) {
      const onlineListener = () => onOnline(true)
      const offlineListener = () => onOnline(false)
      // Listen to online
      window.addEventListener('online', onlineListener, false)
      window.addEventListener('offline', offlineListener, false)

      return () => {
        // Be sure to unsubscribe if a new handler is set
        window.removeEventListener('online', onlineListener)
        window.removeEventListener('offline', offlineListener)
      }
    }
  }

  const [listeners, subscribe, hasListeners] = createSubscribable<Listener>(
    function onSubscribe() {
      if (!cleanup) {
        setEventListener(setup)
      }
    },
    function onUnsubscribe() {
      if (!hasListeners()) {
        cleanup?.()
        cleanup = UNDEFINED
      }
    }
  )

  const onOnline = () => {
    listeners.forEach(listener => {
      listener(online)
    })
  }

  const setEventListener = (setupFn: SetupFn) => {
    setup = setupFn
    cleanup?.()
    cleanup = setup((online?: boolean) => {
      if (isBoolean(online)) {
        setOnline(online)
      } else {
        onOnline()
      }
    })
  }

  const setOnline = (isOnline: boolean) => {
    const changed = isOnline !== online

    if (changed) {
      online = isOnline
      onOnline?.()
    }
  }

  const isOnline = () => {
    if (isBoolean(online)) {
      return online
    }

    if (isUndefined(navigator) || isUndefined(navigator.onLine)) {
      return true
    }

    return navigator.onLine
  }

  return {
    setEventListener,
    setOnline,
    isOnline,
    subscribe,
  }
}

export const onlineManager = createOnlineManager()
