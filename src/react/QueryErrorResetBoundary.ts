import * as React from 'react'

import { isFunction } from '../vanilla/utils'

// CONTEXT

export interface QueryErrorResetBoundaryValue {
  clearReset: () => void
  isReset: () => boolean
  reset: () => void
}

const createValue = (): QueryErrorResetBoundaryValue => {
  let isReset = false
  return {
    clearReset: () => {
      isReset = false
    },
    reset: () => {
      isReset = true
    },
    isReset: () => {
      return isReset
    },
  }
}

const QueryErrorResetBoundaryContext = React.createContext(createValue())

// HOOK

export const useQueryErrorResetBoundary = () =>
  React.useContext(QueryErrorResetBoundaryContext)

// COMPONENT

export interface QueryErrorResetBoundaryProps {
  children:
    | ((value: QueryErrorResetBoundaryValue) => React.ReactNode)
    | React.ReactNode
}

export const QueryErrorResetBoundary = ({
  children,
}: QueryErrorResetBoundaryProps) => {
  const [value] = React.useState(() => createValue())

  return React.createElement(
    QueryErrorResetBoundaryContext.Provider,
    {
      value,
    },
    isFunction(children) ? children(value) : children
  )
}
