// The folders inside a Dropbox folder (?path=, "" for the top), for choosing the root folder in
// Settings. Admins only.
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const app = dropboxApp(event)
  const { data } = await db.from('dropbox_connection').select('refresh_token_enc').maybeSingle()
  if (!data) throw createError({ statusCode: 409, statusMessage: 'Connect Dropbox first' })
  const path = String(getQuery(event).path ?? '')

  const token = await dropboxToken(event, { grant_type: 'refresh_token', refresh_token: decryptToken(data.refresh_token_enc, app.secret) })
  type Entry = { '.tag': string, name: string, path_display: string }
  type Page = { entries: Entry[], cursor: string, has_more: boolean }
  const call = (route: string, body: object) => $fetch<Page>(`https://api.dropboxapi.com/2/files/${route}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.access_token}` },
    body
  })

  try {
    let page = await call('list_folder', { path, limit: 2000 })
    const entries = [...page.entries]
    while (page.has_more && entries.length < 5000) {
      page = await call('list_folder/continue', { cursor: page.cursor })
      entries.push(...page.entries)
    }
    return {
      path,
      folders: entries
        .filter(entry => entry['.tag'] === 'folder')
        .map(entry => ({ name: entry.name, path: entry.path_display }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    }
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'That folder couldn\'t be opened in Dropbox' })
  }
})
