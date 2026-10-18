import type { ClipUploader } from '~/composables/useClipUpload'

// Uploads a clip from the phone straight to Dropbox (spec §12), with a short-lived token from
// /api/dropbox/token. Files go up in 8 MB pieces through an upload session (one request for
// small files), each piece retried a few times, so a patchy connection on set doesn't lose it.

const CHUNK = 8 * 1024 * 1024
const CONTENT = 'https://content.dropboxapi.com/2/files'

let access: { accessToken: string, expiresAt: number, root: string } | null = null
async function getAccess(fresh = false) {
  if (fresh || !access || access.expiresAt - 5 * 60_000 < Date.now()) {
    access = await $fetch('/api/dropbox/token', { method: 'POST' })
  }
  return access!
}

/** Dropbox-API-Arg must be ASCII: escape anything else (e.g. accents in a folder name). */
const asciiJson = (value: unknown) =>
  JSON.stringify(value).replace(/[\u007f-￿]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)

class DropboxError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** One request to the content API, with upload progress (fetch can't report it). */
function send(route: string, arg: unknown, body: Blob, token: string, onProgress: (loaded: number) => void) {
  return new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${CONTENT}/${route}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('Dropbox-API-Arg', asciiJson(arg))
    xhr.upload.onprogress = event => onProgress(event.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null)
        } catch {
          resolve(null)
        }
      } else reject(new DropboxError(xhr.status, xhr.responseText || `Dropbox error ${xhr.status}`))
    }
    xhr.onerror = () => reject(new DropboxError(0, 'Network error'))
    xhr.send(body)
  })
}

/** Retry a piece on dropped connections, rate limits and Dropbox hiccups; renew an expired token once. */
async function withRetries<T>(run: (token: string) => Promise<T>): Promise<T> {
  let renewed = false
  for (let attempt = 0; ; attempt++) {
    const { accessToken } = await getAccess()
    try {
      return await run(accessToken)
    } catch (error) {
      const status = error instanceof DropboxError ? error.status : 0
      if (status === 401 && !renewed) {
        renewed = true
        await getAccess(true)
        continue
      }
      const retryable = status === 0 || status === 429 || status >= 500
      if (!retryable || attempt >= 4) throw error
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt))
    }
  }
}

export const dropboxUploader: ClipUploader = {
  connected: true,
  async upload(file, path, keepBoth, onProgress) {
    const { root } = await getAccess()
    // named clips (H01.mov) replace what's there; b-roll keeps both, Dropbox numbering the new one
    const commit = { path: `${root}/${path}`, mode: keepBoth ? 'add' : 'overwrite', autorename: keepBoth, mute: true }
    const report = (offset: number) => (loaded: number) => onProgress(file.size ? (offset + loaded) / file.size : 1)

    let result: { path_display?: string } | null
    if (file.size <= CHUNK) {
      result = await withRetries(token => send('upload', commit, file, token, report(0))) as typeof result
    } else {
      const start = await withRetries(token => send('upload_session/start', { close: false }, file.slice(0, CHUNK), token, report(0))) as { session_id: string }
      let offset = CHUNK
      while (file.size - offset > CHUNK) {
        const from = offset
        await withRetries(token => send('upload_session/append_v2', { cursor: { session_id: start.session_id, offset: from }, close: false }, file.slice(from, from + CHUNK), token, report(from)))
        offset += CHUNK
      }
      const from = offset
      result = await withRetries(token => send('upload_session/finish', { cursor: { session_id: start.session_id, offset: from }, commit }, file.slice(from), token, report(from))) as typeof result
    }
    onProgress(1)
    return { uploaded: true, path: result?.path_display ?? commit.path }
  },

  /** Copy an uploaded file (full path) to another spot (relative to the root), replacing what's there. */
  async copy(from, to) {
    const { root } = await getAccess()
    const target = `${root}/${to}`
    const call = (route: string, body: object) => withRetries(token => $fetch<{ metadata?: { path_display?: string } }>(`https://api.dropboxapi.com/2/files/${route}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body
    }).catch((error) => {
      const status = (error as { response?: { status?: number } }).response?.status ?? 0
      throw new DropboxError(status, JSON.stringify((error as { data?: unknown }).data ?? ''))
    }))
    try {
      return (await call('copy_v2', { from_path: from, to_path: target, autorename: false })).metadata?.path_display ?? target
    } catch (error) {
      // already there (an earlier take): replace it
      if (!(error instanceof DropboxError) || !error.message.includes('conflict')) throw error
      await call('delete_v2', { path: target })
      return (await call('copy_v2', { from_path: from, to_path: target, autorename: false })).metadata?.path_display ?? target
    }
  },

  /** Write a small text file (captions) relative to the root, replacing what's there. */
  async writeText(path, text) {
    const { root } = await getAccess()
    await withRetries(token => send('upload', { path: `${root}/${path}`, mode: 'overwrite', autorename: false, mute: true }, new Blob([text], { type: 'text/plain' }), token, () => {}))
  }
}
