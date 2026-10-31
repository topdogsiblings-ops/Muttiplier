import type { Row } from '#shared/types/models'

type LibraryTable = 'hook_templates' | 'cta_templates' | 'body_templates' | 'formats' | 'angles' | 'treatments'

export const LIBRARY_SORTS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'A–Z', value: 'az' },
  { label: 'Most used', value: 'used' }
]

/**
 * List state shared by every Library tab: rows, "used in N shoots", search, sort and
 * archive / unarchive. Library rows are never hard-deleted (spec §13).
 */
export function useLibrary<T extends LibraryTable>(table: T, options: {
  /** the shoot_items kind to count usage for */
  usageKind?: 'hook' | 'body' | 'cta'
  /** the text a row is searched and A–Z sorted by */
  text: (row: Row<T>) => string
}) {
  const db = useDb()
  const run = useAction()

  const rows = ref<Row<T>[]>([]) as Ref<Row<T>[]>
  const usage = ref<Record<string, number>>({})
  const search = ref('')
  const sort = ref('newest')
  const showArchived = ref(false)

  async function reload() {
    const [list, counts] = await Promise.all([
      db.from(table as 'angles').select('*').order('created_at', { ascending: false }),
      options.usageKind
        ? db.from('template_usage').select('template_id, shoot_count').eq('kind', options.usageKind)
        : null
    ])
    rows.value = must(list) as unknown as Row<T>[]
    usage.value = Object.fromEntries((counts ? must(counts) : []).map(entry => [entry.template_id, entry.shoot_count ?? 0]))
  }

  async function setArchived(row: Row<T>, archived: boolean) {
    await run(async () => {
      must(await db.from(table as 'angles').update({ archived }).eq('id', row.id))
      await reload()
    }, archived ? 'Archived' : 'Restored')
  }

  /** Apply search, the archived toggle, a tab-specific filter, then the chosen sort. */
  function visible(filter: (row: Row<T>) => boolean = () => true): Row<T>[] {
    const term = search.value.trim().toLowerCase()
    const list = rows.value.filter(row =>
      row.archived === showArchived.value
      && (!term || options.text(row).toLowerCase().includes(term))
      && filter(row)
    )
    const by: Record<string, (a: Row<T>, b: Row<T>) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      az: (a, b) => options.text(a).localeCompare(options.text(b)),
      used: (a, b) => (usage.value[b.id] ?? 0) - (usage.value[a.id] ?? 0)
    }
    return list.sort(by[sort.value] ?? by.newest)
  }

  // Pagination over whatever `visible()` returns. Search, sort and the archived toggle go
  // back to page 1; tabs do the same for their own filters with `resetPage`.
  const page = ref(1)
  const pageSize = 20
  const resetPage = () => {
    page.value = 1
  }
  watch([search, sort, showArchived], resetPage)

  function paginate(list: Row<T>[]): Row<T>[] {
    const pages = Math.max(1, Math.ceil(list.length / pageSize))
    const current = Math.min(page.value, pages)
    return list.slice((current - 1) * pageSize, current * pageSize)
  }

  const usedLabel = (id: string) => {
    const count = usage.value[id] ?? 0
    return count ? `Used in ${count} shoot${count === 1 ? '' : 's'}` : 'Unused'
  }

  // True until the first load finishes, so lists show a spinner rather than "nothing here".
  const loading = ref(true)
  run(reload).finally(() => {
    loading.value = false
  })

  return { rows, usage, search, sort, showArchived, loading, reload, setArchived, visible, usedLabel, page, pageSize, paginate, resetPage }
}

/** Distinct tags across rows, as select options with an "all" entry first. */
export function tagOptions(rows: { tags: string[] }[]) {
  const tags = [...new Set(rows.flatMap(row => row.tags))].sort()
  return [{ label: 'All tags', value: 'all' }, ...tags.map(tag => ({ label: tag, value: tag }))]
}
