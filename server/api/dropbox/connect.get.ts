import { randomBytes } from 'node:crypto'

// Settings → Dropbox → Connect: send an admin to Dropbox to approve the app. `offline` asks for a
// refresh token so the connection lasts; the state cookie guards the callback against forgery.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const app = dropboxApp(event)
  const state = randomBytes(24).toString('base64url')
  setCookie(event, 'dropbox_oauth_state', state, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/api/dropbox',
    maxAge: 600
  })
  const url = new URL('https://www.dropbox.com/oauth2/authorize')
  url.search = new URLSearchParams({
    client_id: app.key,
    response_type: 'code',
    token_access_type: 'offline',
    redirect_uri: dropboxRedirectUri(event),
    state
  }).toString()
  return sendRedirect(event, url.toString())
})
