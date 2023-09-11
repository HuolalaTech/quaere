import { type QueryClient, createQueryClient, mutation } from '..'
import { type MutationInfoState } from '../mutationInfo'
import { sleep } from './utils'

describe('mutations', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createQueryClient()
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('mutate should accept null values', async () => {
    let variables

    const anMutation = mutation({
      fetcher: async (vars: unknown) => {
        variables = vars
        return vars
      },
    })

    const mutationInfo = queryClient.getMutationCache().build(queryClient, {
      mutation: anMutation,
    })

    await mutationInfo.trigger(null)

    expect(variables).toBe(null)
  })

  it('mutation should set correct success states', async () => {
    const anMutation = mutation({
      fetcher: async (text: string) => {
        await sleep(10)
        return text
      },
    })

    const mutationInfo = queryClient.getMutationCache().build(queryClient, {
      mutation: anMutation,
    })

    expect(mutationInfo.state).toEqual({
      data: undefined,
      error: null,
      variables: undefined,
      status: 'idle',
    })

    const states: Array<MutationInfoState<string, string>> = []

    mutationInfo.subscribe(state => {
      states.push(state)
    })

    mutationInfo.trigger('todo')

    await sleep(0)

    expect(states[0]).toEqual({
      data: undefined,
      error: null,
      status: 'mutating',
      variables: 'todo',
    })

    await sleep(20)

    expect(states[1]).toEqual({
      data: 'todo',
      error: null,
      status: 'success',
      variables: 'todo',
    })
  })

  it('mutation should set correct error states', async () => {
    const anMutation = mutation({
      fetcher: async (_: string) => {
        await sleep(20)
        return Promise.reject(new Error('err'))
      },
      retry: 1,
      retryDelay: 1,
    })

    const mutationInfo = queryClient.getMutationCache().build(queryClient, {
      mutation: anMutation,
    })

    const states: Array<MutationInfoState<string, string>> = []

    mutationInfo.subscribe(state => {
      states.push(state)
    })

    mutationInfo.trigger('todo').catch(() => undefined)

    await sleep(0)

    expect(states[0]).toEqual({
      data: undefined,
      error: null,
      status: 'mutating',
      variables: 'todo',
    })

    await sleep(60)

    expect(states[1]).toEqual({
      data: undefined,
      error: new Error('err'),
      status: 'error',
      variables: 'todo',
    })
  })
})
