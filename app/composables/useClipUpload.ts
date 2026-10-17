// Clips added on set are saved on the phone first and only sent to Dropbox when someone
// presses Upload after the shoot is ended (spec §12). Saving a clip is what ticks a
// deliverable off. Saved clips live in IndexedDB, so they survive reloads, closing the app
// and a flat battery; each one is deleted from the phone once its upload is confirmed.

/** saved: on this phone, waiting to be uploaded. failed: the upload didn't go through; retried with the rest. */
export type ClipState = 'saved' | 'uploading' | 'uploaded' | 'failed'

export interface AttachedClip {
  /** the shoot code it was filmed for */
  shoot: string
  /** when it was saved on this phone (ms); clips saved before the shoot was reverted are dropped */
  savedAt?: number
  name: string
  type: string
  size: number
  /** the clip itself until it's uploaded; null afterwards */
  file: Blob | null
  /** object URL for the preview; empty for a clip uploaded in an earlier session */
  url: string
  /**
   * Where it goes in Dropbox, as a file without extension: `…/raw/hooks/joe/H01`, or for b-roll
   * the clip's own name in its folder. Named clips replace what's there; b-roll never overwrites.
   */
  dest: string
  /** b-roll: keep both if the name's taken (Dropbox adds a number) instead of replacing */
  keepBoth?: boolean
  state: ClipState
  /** upload progress, 0 to 1 */
  progress: number
  path: string | null
  /** what the sanity checks measured, e.g. "1080×1920 · 9:16 · 30 fps" */
  details: string | null
  /** what looked wrong (saved anyway) */
  issues: string[]
}

/** Where a clip goes: Dropbox once it's connected (utils/dropboxUploader.ts), else the test-mode stub. */
export interface ClipUploader {
  connected: boolean
  /**
   * `path` is the full Dropbox path, extension included. An existing file there is replaced,
   * or with `keepBoth` kept, the upload getting a numbered name instead.
   */
  upload(file: Blob, path: string, keepBoth: boolean, onProgress: (fraction: number) => void): Promise<{ uploaded: boolean, path: string | null }>
}

/**
 * Test mode until Dropbox is connected (spec §12): pretend to upload for about a second and
 * report success, so the end-of-shoot upload behaves as it will for real. Nothing leaves the phone.
 */
const stubUploader: ClipUploader = {
  connected: false,
  upload(_file, path, _keepBoth, onProgress) {
    return new Promise((resolve) => {
      let step = 0
      const timer = setInterval(() => {
        onProgress(++step / 10)
        if (step < 10) return
        clearInterval(timer)
        resolve({ uploaded: true, path })
      }, 100)
    })
  }
}

/** One clip per target: a shoot item, or one required clip of a b-roll shot for one channel. */
export const clipTarget = {
  item: (itemId: string) => `item:${itemId}`,
  broll: (shotId: string, channelId: string | null, index: number) => `broll:${shotId}:${channelId ?? 'shared'}:${index}`
}

/** The clip's own extension (".mov", ".m4a"…), kept when it's renamed to its code. */
export function extensionOf(name: string, type: string) {
  const dot = name.lastIndexOf('.')
  if (dot > 0 && dot > name.length - 7) return name.slice(dot).toLowerCase()
  const subtype = type.split('/')[1]?.split(';')[0]
  return subtype === 'quicktime' ? '.mov' : subtype === 'mpeg' ? '.mp3' : subtype ? `.${subtype}` : ''
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// --- on-phone storage (IndexedDB) -------------------------------------------------

interface StoredClip extends Omit<AttachedClip, 'url' | 'progress' | 'state'> {
  target: string
  state: 'saved' | 'uploaded'
}

const STORE = 'clips'
let database: Promise<IDBDatabase> | null = null

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('muttiplier-clips', 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'target' }).createIndex('shoot', 'shoot')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return database
}

async function inStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const request = run(transaction.objectStore(STORE))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function toStored(target: string, clip: AttachedClip): StoredClip {
  // IndexedDB can't store Vue's reactive proxies
  const { url: _url, progress: _progress, state, issues, ...rest } = toRaw(clip)
  return { ...rest, issues: [...issues], target, state: state === 'uploaded' ? 'uploaded' : 'saved' }
}

// --- state, shared across the checklist ----------------------------------------------

const clips = shallowReactive(new Map<string, AttachedClip>())
const loadedShoots = new Set<string>()

// --- shared with every phone (public.shoot_clips) ---------------------------------------
// Which deliverables have footage, and on whose phone, so nobody films one twice. Kept live
// over Supabase Realtime while the checklist is open.

export interface SharedClip {
  shootId: string
  fileName: string
  state: string
  /** who added it, i.e. whose phone it's on */
  byId: string | null
  by: string | null
}

const shared = shallowReactive(new Map<string, SharedClip>())
/** shoot code -> id, for the shared rows */
const shootIds = new Map<string, string>()
const names = new Map<string, string>()

/** The end-of-shoot upload, for the progress panel. */
const uploadRun = reactive({ active: false, shoot: '', total: 0, done: 0, failed: 0, error: '' })

export const useClipUpload = () => {
  const db = useDb()
  const dropbox = useDropbox()
  /** Dropbox is connected, so uploads are real (otherwise test mode) */
  const connected = computed(() => !!dropbox.status.value?.connected)

  type SharedRow = { target: string, shoot_id: string, file_name: string, state: string, created_by: string | null }
  const setShared = (row: SharedRow) => shared.set(row.target, {
    shootId: row.shoot_id,
    fileName: row.file_name,
    state: row.state,
    byId: row.created_by,
    by: row.created_by ? names.get(row.created_by) ?? null : null
  })

  /** (Re)load which deliverables of a shoot have footage on any phone. */
  async function fetchShared(shoot: { code: string, id: string }) {
    const [profiles, rows] = await Promise.all([
      db.from('profiles').select('id, full_name, email'),
      db.from('shoot_clips').select('target, shoot_id, file_name, state, created_by').eq('shoot_id', shoot.id)
    ])
    for (const profile of profiles.data ?? []) names.set(profile.id, profile.full_name?.split(' ')[0] || profile.email || 'someone')
    if (rows.error) return
    for (const [target, clip] of shared) if (clip.shootId === shoot.id) shared.delete(target)
    for (const row of rows.data ?? []) setShared(row)
    // clips saved while offline get their shared row now
    for (const [target, clip] of clips) {
      if (clip.shoot === shoot.code && !shared.has(target)) share(target, clip).catch(() => {})
    }
  }

  /**
   * Bring back the clips saved on this phone for a shoot (once per session), load which
   * deliverables have footage on any phone, and keep that live. `onRemoteChange` runs when
   * another phone adds, removes or uploads a clip. Returns a function to stop listening.
   */
  async function load(shoot: { code: string, id: string, revertedAt?: string | null }, onRemoteChange?: () => void) {
    // ask iOS to keep the clips rather than clear them when space runs low
    navigator.storage?.persist?.().catch(() => {})
    dropbox.ensure()
    shootIds.set(shoot.code, shoot.id)
    if (!loadedShoots.has(shoot.code)) {
      loadedShoots.add(shoot.code)
      const stored = await inStore<StoredClip[]>('readonly', store => store.index('shoot').getAll(shoot.code))
      for (const { target, ...clip } of stored) {
        if (clips.has(target)) continue
        // saved before clips were named by code: keep their own name in the old folder
        const legacy = clip as StoredClip & { folder?: string }
        const dest = clip.dest ?? `${legacy.folder}/${clip.name.replace(/\.[^.]+$/, '')}`
        clips.set(target, reactive<AttachedClip>({ ...clip, dest, url: clip.file ? URL.createObjectURL(clip.file) : '', progress: clip.state === 'uploaded' ? 1 : 0 }))
      }
    }
    await discardBefore(shoot.code, shoot.revertedAt)

    await fetchShared(shoot)

    const channel = db.channel(`shoot-clips-${shoot.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shoot_clips', filter: `shoot_id=eq.${shoot.id}` }, (payload) => {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Partial<SharedRow>
        if (!row.target) return
        if (payload.eventType === 'DELETE') shared.delete(row.target)
        else setShared(row as SharedRow)
        // our own changes come back too; only another phone's need the checklist reloaded
        if (!clips.has(row.target)) onRemoteChange?.()
      })
      .subscribe()
    return () => {
      db.removeChannel(channel)
    }
  }

  /** Tell every phone this target has footage here (replacing anyone else's claim). */
  async function share(target: string, clip: AttachedClip) {
    const shootId = shootIds.get(clip.shoot)
    if (!shootId) return
    // delete + insert rather than upsert, so the row is stamped with whoever added it now
    must(await db.from('shoot_clips').delete().eq('shoot_id', shootId).eq('target', target))
    const row = must(await db.from('shoot_clips')
      .insert({ shoot_id: shootId, target, file_name: clip.name, size: clip.size, state: clip.state === 'uploaded' ? 'uploaded' : 'saved', path: clip.path })
      .select('target, shoot_id, file_name, state, created_by')
      .single())
    if (row) setShared(row)
  }

  /** The shoot was reverted: drop this phone's clips saved before then, so they're not shared or uploaded. */
  async function discardBefore(shoot: string, revertedAt?: string | null) {
    if (!revertedAt) return
    const cutoff = Date.parse(revertedAt)
    for (const [target, clip] of [...clips]) {
      if (clip.shoot !== shoot || (clip.savedAt ?? 0) >= cutoff) continue
      if (clip.url) URL.revokeObjectURL(clip.url)
      clips.delete(target)
      shared.delete(target)
      await inStore('readwrite', store => store.delete(target))
    }
  }

  async function remove(target: string) {
    const clip = clips.get(target)
    if (!clip) return
    if (clip.url) URL.revokeObjectURL(clip.url)
    clips.delete(target)
    await inStore('readwrite', store => store.delete(target))
    shared.delete(target)
    const shootId = shootIds.get(clip.shoot)
    if (shootId) await db.from('shoot_clips').delete().eq('shoot_id', shootId).eq('target', target)
  }

  /** Save a clip for a target on this phone, replacing any earlier one. Throws if the phone can't store it. */
  /** `path`: a file without extension, or a folder ending in `/` to keep the clip's own name. */
  async function save(target: string, shoot: string, path: string, file: File, checked?: { details: string | null, issues: string[] }): Promise<AttachedClip> {
    const keepBoth = path.endsWith('/')
    const dest = keepBoth ? `${path}${file.name.replace(/\.[^.]+$/, '')}` : path
    const clip = reactive<AttachedClip>({
      shoot,
      savedAt: Date.now(),
      name: file.name,
      type: file.type,
      size: file.size,
      file,
      url: '',
      dest,
      keepBoth,
      state: 'saved',
      progress: 0,
      path: null,
      details: checked?.details ?? null,
      issues: checked?.issues ?? []
    })
    await inStore('readwrite', store => store.put(toStored(target, clip)))
    const previous = clips.get(target)
    if (previous?.url) URL.revokeObjectURL(previous.url)
    clip.url = URL.createObjectURL(file)
    clips.set(target, clip)
    // offline: the clip is still saved here, and shared the next time the checklist loads
    await share(target, clip).catch(() => {})
    return clip
  }

  async function uploadOne(target: string, clip: AttachedClip, uploader: ClipUploader) {
    if (!clip.file) return
    clip.state = 'uploading'
    clip.progress = 0
    // a clip replaced or removed mid-upload stops tracking its upload
    const current = () => clips.get(target) === clip
    try {
      const result = await uploader.upload(clip.file, `${clip.dest}${extensionOf(clip.name, clip.type)}`, !!clip.keepBoth, (fraction) => {
        if (current()) clip.progress = Math.min(1, Math.max(0, fraction))
      })
      if (!current()) return
      if (!result.uploaded) throw new Error('not uploaded')
      clip.path = result.path
      clip.state = 'uploaded'
      clip.file = null // off the phone; the preview's object URL keeps it viewable this session
      await inStore('readwrite', store => store.put(toStored(target, clip)))
      const shootId = shootIds.get(clip.shoot)
      if (shootId) await db.from('shoot_clips').update({ state: 'uploaded', path: clip.path }).eq('shoot_id', shootId).eq('target', target)
    } catch (error) {
      if (current()) clip.state = 'failed'
      uploadRun.error = (error as { statusMessage?: string, data?: { statusMessage?: string } }).data?.statusMessage
        ?? (error as { statusMessage?: string }).statusMessage ?? ''
    }
  }

  /** Upload every clip of a shoot still on this phone, one at a time. Keep the app open while it runs. */
  async function uploadShoot(shoot: string) {
    if (uploadRun.active) return
    const queue = [...clips].filter(([, clip]) => clip.shoot === shoot && (clip.state === 'saved' || clip.state === 'failed'))
    if (!queue.length) return
    Object.assign(uploadRun, { active: true, shoot, total: queue.length, done: 0, failed: 0, error: '' })
    await dropbox.refresh().catch(() => {})
    const uploader = connected.value ? dropboxUploader : stubUploader
    // make sure the shoot's whole folder tree is there (only what's missing is added); uploads
    // create their own folders anyway, so a failure here doesn't stop them
    if (connected.value) await $fetch('/api/dropbox/tree', { method: 'POST', body: { shootCode: shoot } }).catch(() => {})
    let wakeLock: { release: () => Promise<void> } | null = null
    try {
      wakeLock = await (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } })
        .wakeLock?.request('screen') ?? null
    } catch { /* the screen may sleep, which pauses the upload until the app is back */ }
    try {
      for (const [target, clip] of queue) {
        await uploadOne(target, clip, uploader)
        if (clip.state === 'failed') uploadRun.failed++
        uploadRun.done++
      }
    } finally {
      uploadRun.active = false
      wakeLock?.release().catch(() => {})
    }
  }

  /** Each phone's clips for a shoot (by whoever added them), for the upload progress. */
  function phones(shootId: string) {
    const byPhone = new Map<string, { name: string, total: number, uploaded: number }>()
    for (const clip of shared.values()) {
      if (clip.shootId !== shootId) continue
      const key = clip.byId ?? 'unknown'
      const phone = byPhone.get(key) ?? { name: clip.by ?? 'Someone', total: 0, uploaded: 0 }
      phone.total++
      if (clip.state === 'uploaded') phone.uploaded++
      byPhone.set(key, phone)
    }
    return [...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Clips of a shoot on this phone still to upload. */
  const waiting = (shoot: string) =>
    [...clips.values()].filter(clip => clip.shoot === shoot && clip.state !== 'uploaded')

  return {
    connected,
    clipFor: (target: string) => clips.get(target) ?? null,
    /** a clip added on another phone for this target, if there's none on this one */
    elsewhere: (target: string) => clips.has(target) ? null : shared.get(target) ?? null,
    /** whether a target has footage on any phone (this one included) */
    taken: (target: string) => clips.has(target) || shared.has(target),
    load,
    discardBefore,
    resync: fetchShared,
    phones,
    save,
    remove,
    uploadShoot,
    waiting,
    uploadRun: readonly(uploadRun)
  }
}
