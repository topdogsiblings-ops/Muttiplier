// Clips filmed on set are saved on the phone first and only sent to Dropbox once the shoot
// is ended (spec §12). Saving a clip is what ticks a deliverable off. Saved clips live in
// IndexedDB, so they survive reloads, closing the app and a flat battery; each one is
// deleted from the phone once its upload is confirmed.

/** saved: on this phone, waiting for the shoot to end. failed: the upload didn't go through; retried with the rest. */
export type ClipState = 'saved' | 'uploading' | 'uploaded' | 'failed'

export interface AttachedClip {
  /** the shoot code it was filmed for */
  shoot: string
  name: string
  type: string
  size: number
  /** the clip itself until it's uploaded; null afterwards */
  file: Blob | null
  /** object URL for the preview; empty for a clip uploaded in an earlier session */
  url: string
  folder: string
  state: ClipState
  /** upload progress, 0 to 1 */
  progress: number
  path: string | null
  /** what the sanity checks measured, e.g. "1080×1920 · 9:16 · 30 fps" */
  details: string | null
  /** what looked wrong (saved anyway) */
  issues: string[]
}

/** Where a clip goes. Swap the stub for a real Dropbox adapter once §12 is settled. */
export interface ClipUploader {
  connected: boolean
  upload(file: Blob, name: string, folder: string, onProgress: (fraction: number) => void): Promise<{ uploaded: boolean, path: string | null }>
}

/**
 * Test mode until Dropbox is connected (spec §12): pretend to upload for about a second and
 * report success, so the end-of-shoot upload behaves as it will for real. Nothing leaves the phone.
 */
const stubUploader: ClipUploader = {
  connected: false,
  upload(_file, name, folder, onProgress) {
    return new Promise((resolve) => {
      let step = 0
      const timer = setInterval(() => {
        onProgress(++step / 10)
        if (step < 10) return
        clearInterval(timer)
        resolve({ uploaded: true, path: `${folder}/${name}` })
      }, 100)
    })
  }
}

/** One clip per target: a shoot item, or one required clip of a b-roll shot for one channel. */
export const clipTarget = {
  item: (itemId: string) => `item:${itemId}`,
  broll: (shotId: string, channelId: string | null, index: number) => `broll:${shotId}:${channelId ?? 'shared'}:${index}`
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

/** The end-of-shoot upload, for the progress panel. */
const uploadRun = reactive({ active: false, shoot: '', total: 0, done: 0, failed: 0 })

export const useClipUpload = (uploader: ClipUploader = stubUploader) => {
  /** Bring back the clips saved on this phone for a shoot (once per session). */
  async function load(shoot: string) {
    // ask iOS to keep the clips rather than clear them when space runs low
    navigator.storage?.persist?.().catch(() => {})
    if (loadedShoots.has(shoot)) return
    loadedShoots.add(shoot)
    const stored = await inStore<StoredClip[]>('readonly', store => store.index('shoot').getAll(shoot))
    for (const { target, ...clip } of stored) {
      if (clips.has(target)) continue
      clips.set(target, reactive<AttachedClip>({ ...clip, url: clip.file ? URL.createObjectURL(clip.file) : '', progress: clip.state === 'uploaded' ? 1 : 0 }))
    }
  }

  async function remove(target: string) {
    const clip = clips.get(target)
    if (!clip) return
    if (clip.url) URL.revokeObjectURL(clip.url)
    clips.delete(target)
    await inStore('readwrite', store => store.delete(target))
  }

  /** Save a clip for a target on this phone, replacing any earlier one. Throws if the phone can't store it. */
  async function save(target: string, shoot: string, folder: string, file: File, checked?: { details: string | null, issues: string[] }): Promise<AttachedClip> {
    const clip = reactive<AttachedClip>({
      shoot,
      name: file.name,
      type: file.type,
      size: file.size,
      file,
      url: '',
      folder,
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
    return clip
  }

  async function uploadOne(target: string, clip: AttachedClip) {
    if (!clip.file) return
    clip.state = 'uploading'
    clip.progress = 0
    // a clip replaced or removed mid-upload stops tracking its upload
    const current = () => clips.get(target) === clip
    try {
      const result = await uploader.upload(clip.file, clip.name, clip.folder, (fraction) => {
        if (current()) clip.progress = Math.min(1, Math.max(0, fraction))
      })
      if (!current()) return
      if (!result.uploaded) throw new Error('not uploaded')
      clip.path = result.path
      clip.state = 'uploaded'
      clip.file = null // off the phone; the preview's object URL keeps it viewable this session
      await inStore('readwrite', store => store.put(toStored(target, clip)))
    } catch {
      if (current()) clip.state = 'failed'
    }
  }

  /** Upload every clip of a shoot still on this phone, one at a time. Keep the app open while it runs. */
  async function uploadShoot(shoot: string) {
    if (uploadRun.active) return
    const queue = [...clips].filter(([, clip]) => clip.shoot === shoot && (clip.state === 'saved' || clip.state === 'failed'))
    if (!queue.length) return
    Object.assign(uploadRun, { active: true, shoot, total: queue.length, done: 0, failed: 0 })
    let wakeLock: { release: () => Promise<void> } | null = null
    try {
      wakeLock = await (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } })
        .wakeLock?.request('screen') ?? null
    } catch { /* the screen may sleep, which pauses the upload until the app is back */ }
    try {
      for (const [target, clip] of queue) {
        await uploadOne(target, clip)
        if (clip.state === 'failed') uploadRun.failed++
        uploadRun.done++
      }
    } finally {
      uploadRun.active = false
      wakeLock?.release().catch(() => {})
    }
  }

  /** Clips of a shoot on this phone still to upload. */
  const waiting = (shoot: string) =>
    [...clips.values()].filter(clip => clip.shoot === shoot && clip.state !== 'uploaded')

  return {
    connected: uploader.connected,
    clipFor: (target: string) => clips.get(target) ?? null,
    load,
    save,
    remove,
    uploadShoot,
    waiting,
    uploadRun: readonly(uploadRun)
  }
}
