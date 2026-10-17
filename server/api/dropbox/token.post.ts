// A short-lived Dropbox access token (about 4 hours) for a signed-in phone to upload its clips
// with, straight from the phone. The refresh token never leaves the server.
export default defineEventHandler(async (event) => {
  const { db } = await requireAllowed(event)
  const app = dropboxApp(event)
  const { data } = await db.from('dropbox_connection').select('refresh_token_enc, root').maybeSingle()
  if (!data) throw createError({ statusCode: 409, statusMessage: 'Dropbox isn\'t connected. An admin can connect it in Settings.' })

  try {
    const token = await dropboxToken(event, { grant_type: 'refresh_token', refresh_token: decryptToken(data.refresh_token_enc, app.secret) })
    return { accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000, root: data.root }
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'The Dropbox connection has stopped working. An admin needs to reconnect it in Settings.' })
  }
})
