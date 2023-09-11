import { createSubscribable } from './subscribable'
import { UNDEFINED, isBoolean, isServer } from './utils'

type SetupFn = (
  setFocused: (focused?: boolean) => void
) => (() => void) | undefined

export interface FocusManager extends ReturnType<typeof createFocusManager> {}

export const createFocusManager = () => {
  let focused: boolean | undefined
  let cleanup: (() => void) | undefined
  let setup: SetupFn = onFocus => {
    // addEventListener does not exist in React Native, but window does
    if (!isServer && window.addEventListener) {
      const listener = () => onFocus()
      // Listen to visibilitychange
      window.addEventListener('visibilitychange', listener, false)

      return () => {
        // Be sure to unsubscribe if a new handler is set
        window.removeEventListener('visibilitychange', listener)
      }
    }
  }

  const [listeners, subscribe, hasListeners] = createSubscribable(
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

  const onFocus = () => {
    listeners.forEach(listener => {
      listener()
    })
  }

  const setFocused = (isFocused?: boolean) => {
    const changed = isFocused !== focused

    if (changed) {
      focused = isFocused
      onFocus()
    }
  }

  const setEventListener = (setupFn: SetupFn) => {
    setup = setupFn
    cleanup?.()
    cleanup = setup((focused?: boolean) => {
      if (isBoolean(focused)) {
        setFocused(focused)
      } else {
        onFocus()
      }
    })
  }

  const isFocused = (): boolean => {
    if (isBoolean(focused)) {
      return focused
    }

    return globalThis.document?.visibilityState !== 'hidden'
  }

  return {
    setEventListener,
    setFocused,
    isFocused,
    subscribe,
  }
}

export const focusManager = createFocusManager()
