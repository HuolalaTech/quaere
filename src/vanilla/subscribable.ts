type Listener = () => void

export const createSubscribable = <TListener = Listener>(
  onSubscribe?: () => void,
  onUnsubscribe?: () => void
) => {
  const listeners = new Set<TListener>()

  const subscribe = (listener: TListener) => {
    listeners.add(listener)

    onSubscribe?.()

    return () => {
      listeners.delete(listener)
      onUnsubscribe?.()
    }
  }

  const hasListeners = () => listeners.size > 0

  return [listeners, subscribe, hasListeners] as const
}
