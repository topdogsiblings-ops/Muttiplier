// Whether Dropbox is connected, and to which account and folder. Any allowlisted user.
export default defineEventHandler(async (event) => {
  const { db } = await requireAllowed(event)
  const configured = !!useRuntimeConfig(event).dropboxAppKey
  const { data } = await db.from('dropbox_connection').select('account_name, account_email, root, created_at').maybeSingle()
  return {
    configured,
    connected: !!data,
    accountName: data?.account_name ?? null,
    accountEmail: data?.account_email ?? null,
    root: data?.root ?? '/UGC',
    connectedAt: data?.created_at ?? null
  }
})
