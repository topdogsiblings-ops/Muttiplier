export interface DropboxStatus {
  configured: boolean
  connected: boolean
  accountName: string | null
  accountEmail: string | null
  /** the folder everything goes under, e.g. "/UGC" */
  root: string
  connectedAt: string | null
}

/** Whether Dropbox is connected (spec §12). Loaded once per session; Settings refreshes it. */
export const useDropbox = () => {
  const status = useState<DropboxStatus | null>('dropbox-status', () => null)
  async function refresh() {
    status.value = await $fetch<DropboxStatus>('/api/dropbox/status')
    return status.value
  }
  async function ensure() {
    return status.value ?? await refresh().catch(() => null)
  }
  return { status, refresh, ensure }
}
