import type { Database } from '#shared/types/database.types'

/** The typed Supabase client. Every query runs as the signed-in user, under RLS. */
export const useDb = () => useSupabaseClient<Database>()

/** Unwrap a Supabase result, throwing on error so callers can use try/catch. */
type DbResult = { data: unknown, error: { message: string } | null }
/** The `data` type of the success branch of a Supabase response. */
type DataOf<R extends DbResult> = Extract<R, { error: null }>['data']

export function must<R extends DbResult>(result: R): DataOf<R> {
  if (result.error) throw new Error(result.error.message)
  return result.data as DataOf<R>
}

/** Like `must`, for `.single()` results: the row is guaranteed to be there. */
export function mustOne<R extends DbResult>(result: R): NonNullable<DataOf<R>> {
  const row = must(result)
  if (row === null || row === undefined) throw new Error('No row returned')
  return row
}

/** Run a mutation with a toast on failure (and optionally on success). Returns true when it succeeded. */
export function useAction() {
  const toast = useToast()
  return async function run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
    try {
      await action()
      if (success) toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' })
      return true
    } catch (error) {
      toast.add({
        title: 'Something went wrong',
        description: error instanceof Error ? error.message : String(error),
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
      return false
    }
  }
}
