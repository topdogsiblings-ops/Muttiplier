// Dropbox sends the admin back here after approving (or declining) the app. Swap the code for a
// refresh token, store it encrypted as the team's one connection, and return to Settings.
export default defineEventHandler(async (event) => {
  const back = (outcome: 'connected' | 'error', message?: string) => sendRedirect(event,
    `/settings?tab=dropbox&dropbox=${outcome}${message ? `&message=${encodeURIComponent(message)}` : ''}`)

  const query = getQuery(event)
  const expected = getCookie(event, 'dropbox_oauth_state')
  deleteCookie(event, 'dropbox_oauth_state', { path: '/api/dropbox' })
  if (query.error) return back('error', String(query.error_description ?? query.error))
  if (!query.code || !query.state || query.state !== expected) return back('error', 'The Dropbox sign-in expired. Try connecting again.')

  try {
    const db = await requireAdmin(event)
    const app = dropboxApp(event)
    const token = await dropboxToken(event, {
      grant_type: 'authorization_code',
      code: String(query.code),
      redirect_uri: dropboxRedirectUri(event)
    })
    if (!token.refresh_token) return back('error', 'Dropbox didn\'t return a lasting connection. Try again.')
    const account = await dropboxAccount(token.access_token)

    const { data: existing } = await db.from('dropbox_connection').select('id, root').maybeSingle()
    const row = {
      account_id: account.account_id,
      account_name: account.name.display_name,
      account_email: account.email,
      refresh_token_enc: encryptToken(token.refresh_token, app.secret)
    }
    const { error } = existing
      ? await db.from('dropbox_connection').update(row).eq('id', existing.id)
      : await db.from('dropbox_connection').insert(row)
    if (error) return back('error', error.message)
    return back('connected')
  } catch (error) {
    return back('error', (error as { statusMessage?: string, message?: string }).statusMessage ?? (error as Error).message)
  }
})
