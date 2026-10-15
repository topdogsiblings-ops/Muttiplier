/** Normalise a tag so variants group together: "Dog Walks " -> "dog-walks". */
export function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9&+-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

let loading: Promise<void> | null = null

/** Every tag used on hooks, CTAs and bodies, with how many items use it. Loaded once per session. */
export const useLibraryTags = () => {
  const db = useDb()
  const counts = useState<Record<string, number>>('library-tag-counts', () => ({}))

  async function load() {
    const next: Record<string, number> = {}
    const lists = [
      must(await db.from('hook_templates').select('tags')),
      must(await db.from('cta_templates').select('tags')),
      must(await db.from('body_templates').select('tags'))
    ]
    for (const rows of lists) for (const row of rows) for (const tag of row.tags) next[tag] = (next[tag] ?? 0) + 1
    counts.value = next
  }

  if (import.meta.client && !loading) {
    loading = load().catch(() => {
      loading = null
    })
  }

  /** Most-used first, then alphabetical. */
  const tags = computed(() => Object.keys(counts.value).sort((a, b) => (counts.value[b]! - counts.value[a]!) || a.localeCompare(b)))

  /** Remember a tag created in this session so it's suggested straight away. */
  function remember(tag: string) {
    if (!(tag in counts.value)) counts.value = { ...counts.value, [tag]: 0 }
  }

  return { tags, counts, remember, reload: load }
}
