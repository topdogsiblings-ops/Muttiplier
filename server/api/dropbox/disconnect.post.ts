// Settings → Dropbox → Disconnect: revoke the app's access and forget the connection. Clips
// already uploaded stay in Dropbox.
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const app = dropboxApp(event)
  const { data } = await db.from('dropbox_connection').select('id, refresh_token_enc').maybeSingle()
  if (!data) return { ok: true }
  try {
    const token = await dropboxToken(event, { grant_type: 'refresh_token', refresh_token: decryptToken(data.refresh_token_enc, app.secret) })
    await revokeDropboxToken(token.access_token)
  } catch { /* already revoked or unreadable: forgetting it is enough */ }
  const { error } = await db.from('dropbox_connection').delete().eq('id', data.id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true }
})
