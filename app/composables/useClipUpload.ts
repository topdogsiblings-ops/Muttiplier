export type ClipState = 'uploading' | 'pending' | 'uploaded' | 'failed'

export interface AttachedClip {
  name: string
  size: number
  /** object URL for the preview; revoked when the clip is replaced or removed */
  url: string
  folder: string
  state: ClipState
  /** 0 to 1 */
  progress: number
  path: string | null
  /** what the sanity checks measured, e.g. "1080×1920 · 9:16 · 30 fps" */
  details: string | null
  /** what looked wrong (uploaded anyway) */
  issues: string[]
}

/** Where a clip goes. Swap the stub for a real Dropbox adapter once §12 is settled. */
export interface ClipUploader {
  connected: boolean
  upload(file: File, folder: string, onProgress: (fraction: number) => void): Promise<{ uploaded: boolean, path: string | null }>
}

/**
 * Test mode until Dropbox is connected (spec §12): pretend to upload for about a second and
 * report success, so uploading ticks items off as it will for real. Nothing leaves the phone.
 */
const stubUploader: ClipUploader = {
  connected: false,
  upload(file, folder, onProgress) {
    return new Promise((resolve) => {
      let step = 0
      const timer = setInterval(() => {
        onProgress(++step / 10)
        if (step < 10) return
        clearInterval(timer)
        resolve({ uploaded: true, path: `${folder}/${file.name}` })
      }, 100)
    })
  }
}

/** One clip per target: a shoot item, or one clip box of a b-roll shot. */
export const clipTarget = {
  item: (itemId: string) => `item:${itemId}`,
  broll: (shotId: string, index: number) => `broll:${shotId}:${index}`
}

// Client-only, for this browser session: Files and object URLs can't be serialised, and
// nothing is attached during server rendering.
const clips = shallowReactive(new Map<string, AttachedClip>())

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export const useClipUpload = (uploader: ClipUploader = stubUploader) => {
  function remove(target: string) {
    const clip = clips.get(target)
    if (!clip) return
    URL.revokeObjectURL(clip.url)
    clips.delete(target)
  }

  /** Attach a clip to a target (replacing any earlier one) and send it to its folder. */
  async function attach(target: string, folder: string, file: File, checked?: { details: string | null, issues: string[] }): Promise<AttachedClip> {
    remove(target)
    const clip = reactive<AttachedClip>({
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
      folder,
      state: 'uploading',
      progress: 0,
      path: null,
      details: checked?.details ?? null,
      issues: checked?.issues ?? []
    })
    clips.set(target, clip)
    // a clip replaced or removed mid-upload stops tracking its upload
    const current = () => clips.get(target) === clip
    try {
      const result = await uploader.upload(file, folder, (fraction) => {
        if (current()) clip.progress = Math.min(1, Math.max(0, fraction))
      })
      if (current()) {
        clip.path = result.path
        clip.state = result.uploaded ? 'uploaded' : uploader.connected ? 'failed' : 'pending'
      }
    } catch {
      if (current()) clip.state = 'failed'
    }
    return clip
  }

  return {
    connected: uploader.connected,
    clipFor: (target: string) => clips.get(target) ?? null,
    attach,
    remove
  }
}
