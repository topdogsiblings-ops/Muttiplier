interface Access {
  id: string
  email: string
  role: string
  display_name: string | null
}

/**
 * The signed-in user's allowlist entry (spec §3). RLS only returns a row from
 * allowed_users to allowlisted users, so "no row" means "no access".
 */
export const useAccess = () => {
  const db = useDb()
  const access = useState<Access | null>('access', () => null)
  const checkedFor = useState<string | null>('access-checked-for', () => null)

  async function ensure(email: string | null | undefined): Promise<boolean> {
    if (!email) return false
    if (checkedFor.value === email) return !!access.value
    const { data, error } = await db
      .from('allowed_users')
      .select('id, email, role, display_name')
      .eq('email', email.toLowerCase())
      .maybeSingle()
    // A failed lookup (e.g. a network blip on set) is not a denial. RLS still guards the data.
    if (error) return true
    access.value = data
    checkedFor.value = email
    return !!data
  }

  function reset() {
    access.value = null
    checkedFor.value = null
  }

  const isAdmin = computed(() => access.value?.role === 'admin')

  return { access, isAdmin, ensure, reset }
}
