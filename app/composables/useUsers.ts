import type { Row } from '#shared/types/models'

let loading: Promise<void> | null = null

/**
 * Resolves `created_by` user ids to a name: the allowlist display name, else the Google
 * profile name, else the email. Loaded once per session.
 */
export const useUsers = () => {
  const db = useDb()
  const profiles = useState<Row<'profiles'>[]>('user-profiles', () => [])
  const displayNames = useState<Record<string, string>>('user-display-names', () => ({}))

  async function load() {
    const people = must(await db.from('profiles').select('*'))
    const allowed = must(await db.from('allowed_users').select('email, display_name'))
    profiles.value = people
    displayNames.value = Object.fromEntries(
      allowed.filter(row => row.display_name).map(row => [row.email, row.display_name!])
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
    return (profile.email && displayNames.value[profile.email]) || profile.full_name || profile.email || 'a former user'
  }

  return { nameOf, reload: load }
}
