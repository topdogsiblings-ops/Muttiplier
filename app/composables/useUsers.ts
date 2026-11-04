import type { Row } from '#shared/types/models'

let loading: Promise<void> | null = null

/**
 * Resolves `created_by` user ids to a name: their display name in the org, else their profile
 * name (from Google), else the email. Loaded once per session.
 */
export const useUsers = () => {
  const db = useDb()
  const profiles = useState<Row<'profiles'>[]>('user-profiles', () => [])
  const displayNames = useState<Record<string, string>>('user-display-names', () => ({}))

  async function load() {
    const people = must(await db.from('profiles').select('*'))
    const members = must(await db.from('org_members').select('user_id, display_name'))
    profiles.value = people
    displayNames.value = Object.fromEntries(
      members.filter(row => row.display_name).map(row => [row.user_id, row.display_name!])
    )
  }

  if (import.meta.client && !loading) {
    loading = load().catch(() => {
      loading = null
    })
  }

  function nameOf(id: string | null): string {
    const profile = profiles.value.find(p => p.id === id)
    if (!profile) return 'a former user'
    return displayNames.value[profile.id] || profile.full_name || profile.email || 'a former user'
  }

  return { nameOf, reload: load }
}
