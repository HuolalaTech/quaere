import * as React from 'react'

import { QueryClient, createQueryClient } from '../vanilla'

const QueryClientContext = React.createContext<QueryClient>(createQueryClient())

export const useQueryClient = (queryClient?: QueryClient): QueryClient => {
  const client = React.useContext(QueryClientContext)
  return queryClient ?? client
}

export interface QueryClientProviderProps {
  client: QueryClient
  children?: React.ReactNode
}

export const QueryClientProvider = ({
  client,
  children,
}: QueryClientProviderProps): JSX.Element => {
  React.useEffect(() => {
    client.mount()
    return () => {
      client.unmount()
    }
  }, [client])

  return React.createElement(
    QueryClientContext.Provider,
    {
      value: client,
    },
    children
  )
}
