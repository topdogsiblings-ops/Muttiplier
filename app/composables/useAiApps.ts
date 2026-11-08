export type AiGrant = { client: { id: string, name: string, uri: string, logo_uri: string }, granted_at: string }

/**
 * The AI apps the signed-in person has connected to Kreate's connector (spec §11), shared by
 * Settings → Connect your AI and the sidebar (whose Connect your AI button goes once one is).
 */
export const useAiApps = () => {
  const supabase = useSupabaseClient()
  const grants = useState<AiGrant[]>('ai-grants', () => [])
  /** false until the first load */
  const loaded = useState('ai-grants-loaded', () => false)
  const loadError = useState('ai-grants-error', () => '')

  async function load() {
    const { data, error } = await supabase.auth.oauth.listGrants()
    loadError.value = error?.message ?? ''
    grants.value = Array.isArray(data) ? data : []
    loaded.value = true
  }

  return { grants, loaded, loadError, load }
}
