import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '#shared/types/database.types'

// Dropbox (spec §12): one team connection, made by an admin in Settings. The server keeps the
// refresh token (encrypted in public.dropbox_connection) and hands signed-in phones short-lived
// access tokens, so clips upload from the phone straight to Dropbox.

const API = 'https://api.dropboxapi.com'

export function dropboxApp(event: H3Event) {
  const config = useRuntimeConfig(event)
  if (!config.dropboxAppKey || !config.dropboxAppSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Dropbox isn\'t configured. Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET.' })
  }
  return { key: config.dropboxAppKey, secret: config.dropboxAppSecret }
}

/** Where Dropbox sends the admin back to: this deployment's own callback (registered in the App Console). */
export function dropboxRedirectUri(event: H3Event) {
  return `${getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin}/api/dropbox/callback`
}

// --- the refresh token, encrypted at rest -------------------------------------------------

const keyFrom = (secret: string) => createHash('sha256').update(`muttiplier-dropbox:${secret}`).digest()

export function encryptToken(token: string, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv)
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map(part => part.toString('base64')).join('.')
}

export function decryptToken(sealed: string, secret: string) {
  const [iv, tag, body] = sealed.split('.').map(part => Buffer.from(part, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), iv!)
  decipher.setAuthTag(tag!)
  return Buffer.concat([decipher.update(body!), decipher.final()]).toString('utf8')
}

// --- who's asking ---------------------------------------------------------------------------

/** The signed-in user's Supabase client, if they're on the allowlist; `admin` from their role. */
export async function requireAllowed(event: H3Event) {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.email) throw createError({ statusCode: 401, statusMessage: 'Sign in first' })
  const db = await serverSupabaseClient<Database>(event)
  const { data } = await db.from('allowed_users').select('role').eq('email', user.email.toLowerCase()).maybeSingle()
  if (!data) throw createError({ statusCode: 403, statusMessage: 'No access' })
  return { db, admin: data.role === 'admin' }
}

export async function requireAdmin(event: H3Event) {
  const access = await requireAllowed(event)
  if (!access.admin) throw createError({ statusCode: 403, statusMessage: 'Only admins can connect Dropbox' })
  return access.db
}

// --- Dropbox calls --------------------------------------------------------------------------

type TokenResponse = { access_token: string, expires_in: number, refresh_token?: string, account_id?: string }

export async function dropboxToken(event: H3Event, params: Record<string, string>): Promise<TokenResponse> {
  const app = dropboxApp(event)
  return await $fetch<TokenResponse>(`${API}/oauth2/token`, {
    method: 'POST',
    body: new URLSearchParams({ ...params, client_id: app.key, client_secret: app.secret })
  })
}

export async function dropboxAccount(accessToken: string) {
  return await $fetch<{ account_id: string, email: string, name: { display_name: string } }>(`${API}/2/users/get_current_account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }
  })
}

export async function revokeDropboxToken(accessToken: string) {
  await $fetch(`${API}/2/auth/token/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => {})
}

/** A fresh access token and the root folder, from the team's stored connection. */
export async function dropboxAccess(event: H3Event, db: Awaited<ReturnType<typeof serverSupabaseClient<Database>>>) {
  const app = dropboxApp(event)
  const { data } = await db.from('dropbox_connection').select('refresh_token_enc, root').maybeSingle()
  if (!data) throw createError({ statusCode: 409, statusMessage: 'Dropbox isn\'t connected. An admin can connect it in Settings.' })
  try {
    const token = await dropboxToken(event, { grant_type: 'refresh_token', refresh_token: decryptToken(data.refresh_token_enc, app.secret) })
    return { accessToken: token.access_token, expiresIn: token.expires_in, root: data.root }
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'The Dropbox connection has stopped working. An admin needs to reconnect it in Settings.' })
  }
}

/** Dropbox-API-Arg must be ASCII: escape anything else (e.g. accents in a folder name). */
export const dropboxArg = (value: unknown) =>
  JSON.stringify(value).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)

/** Every file under a Dropbox folder, as paths relative to it ("hooks/joe/H01.mov"); none if it isn't there. */
export async function dropboxFiles(accessToken: string, folder: string): Promise<string[]> {
  type Entry = { '.tag': string, path_display: string }
  type Page = { entries: Entry[], cursor: string, has_more: boolean }
  const call = (route: string, body: object) => $fetch<Page>(`${API}/2/files/${route}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body
  })
  let page: Page
  try {
    page = await call('list_folder', { path: folder, recursive: true, limit: 2000 })
  } catch (error) {
    // not created yet: nothing in it
    if (JSON.stringify((error as { data?: unknown }).data ?? '').includes('not_found')) return []
    throw error
  }
  const files: string[] = []
  const prefix = `${folder.toLowerCase()}/`
  for (;;) {
    for (const entry of page.entries) {
      if (entry['.tag'] !== 'file') continue
      const path = entry.path_display
      if (path.toLowerCase().startsWith(prefix)) files.push(path.slice(prefix.length))
    }
    if (!page.has_more) break
    page = await call('list_folder/continue', { cursor: page.cursor })
  }
  return files.sort()
}

/** Upload a small text file (JSON, CSV), replacing what's there. */
export async function dropboxWriteText(accessToken: string, path: string, text: string) {
  await $fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': dropboxArg({ path, mode: 'overwrite', mute: true })
    },
    body: text
  })
}

/** Create one folder; fine if it's already there. */
export async function dropboxEnsureFolder(accessToken: string, path: string) {
  await $fetch(`${API}/2/files/create_folder_v2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { path, autorename: false }
  }).catch((error) => {
    if (!JSON.stringify((error as { data?: unknown }).data ?? '').includes('conflict')) throw error
  })
}
