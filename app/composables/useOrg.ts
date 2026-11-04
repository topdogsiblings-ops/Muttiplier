export interface MyOrg {
  id: string
  name: string
  slug: string
  role: string
  display_name: string | null
  is_current: boolean
  has_chosen: boolean
  /** its subscription (or trial) is live, or it's billing-exempt */
  entitled: boolean
  /** how it has Klip: bought, billing-exempt, for the length of its trial, or not at all */
  klip_access: 'purchased' | 'exempt' | 'trial' | 'none'
}

/**
 * The signed-in user's orgs (spec §3). The org pays and its admins invite members; everything a
 * request reads or writes belongs to its current org, which the database works out, so queries
 * don't filter on it. Someone in several orgs picks one, and switching reloads the app so nothing
 * from the last org lingers on screen.
 */
export const useOrg = () => {
  const db = useDb()
  const orgs = useState<MyOrg[]>('orgs', () => [])
  const currentOrg = computed(() => orgs.value.find(org => org.is_current) ?? null)
  /** in several orgs and hasn't chosen one yet */
  const needsPicker = computed(() => orgs.value.length > 1 && !orgs.value.some(org => org.has_chosen))

  async function load() {
    const { data, error } = await db.rpc('my_orgs')
    if (error) throw error
    orgs.value = (data ?? []) as MyOrg[]
    return orgs.value
  }

  async function enter(path = '/shoots') {
    // a new access token carries the new org, once the token hook is on
    await db.auth.refreshSession()
    window.location.assign(path)
  }

  async function switchOrg(id: string) {
    const { error } = await db.rpc('set_active_org', { p_org_id: id })
    if (error) throw error
    await enter()
  }

  /** Start an org; its profile (what AI drafting is told about it) is saved with it. */
  async function createOrg(name: string, slug: string, profile?: OrgProfile) {
    const { error } = await db.rpc('create_org', { p_name: name, p_slug: slug, p_profile: profile ? { ...profile } : {} })
    if (error) throw error
    // a new org starts by subscribing (with its free trial), in Settings → Profile
    await enter('/settings?tab=profile')
  }

  /** whether someone can start a new org; closed until billing exists */
  async function signupOpen() {
    const { data } = await db.rpc('org_signup_open')
    return !!data
  }

  return { orgs, currentOrg, needsPicker, load, switchOrg, createOrg, signupOpen }
}
