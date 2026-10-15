// Measure a clip in the browser for the sanity checks in shared/utils/clipChecks.ts.
// Everything here is best effort: anything the browser can't tell us comes back as null.

function loadMedia<T extends HTMLMediaElement>(element: T, file: File): Promise<T | null> {
  const url = URL.createObjectURL(file)
  element.preload = 'metadata'
  element.muted = true
  return new Promise((resolve) => {
    const timeout = setTimeout(() => done(null), 8000)
    function done(result: T | null) {
      clearTimeout(timeout)
      element.onloadedmetadata = null
      element.onerror = null
      resolve(result)
    }
    element.onloadedmetadata = () => done(element)
    element.onerror = () => done(null)
    element.src = url
  }).finally(() => setTimeout(() => URL.revokeObjectURL(url), 15000)) as Promise<T | null>
}

/**
 * Some recordings (e.g. Chrome's webm) report an Infinity duration until the browser has seeked
 * to the end, so seek far past it and read the duration back.
 */
async function durationOf(element: HTMLMediaElement): Promise<number | null> {
  if (Number.isFinite(element.duration)) return element.duration
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 4000)
    element.ontimeupdate = () => {
      element.ontimeupdate = null
      clearTimeout(timeout)
      const duration = element.duration
      element.currentTime = 0
      resolve(Number.isFinite(duration) ? duration : null)
    }
    element.currentTime = Number.MAX_SAFE_INTEGER
  })
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number, presentedFrames: number }) => void) => number
}

/** Frames per second from a short muted playback. Null if the browser can't report frames. */
async function measureFps(video: FrameCallbackVideo): Promise<number | null> {
  if (!video.requestVideoFrameCallback) return null
  video.playsInline = true
  const samples: { mediaTime: number, frames: number }[] = []
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout)
      video.pause()
      const first = samples[0]
      const last = samples.at(-1)
      if (!first || !last || last.mediaTime <= first.mediaTime) return resolve(null)
      resolve((last.frames - first.frames) / (last.mediaTime - first.mediaTime))
    }
    const timeout = setTimeout(finish, 3000)
    const onFrame = (_: number, metadata: { mediaTime: number, presentedFrames: number }) => {
      samples.push({ mediaTime: metadata.mediaTime, frames: metadata.presentedFrames })
      if (samples.length >= 30 || metadata.mediaTime >= (video.duration || Infinity) - 0.05) finish()
      else video.requestVideoFrameCallback!(onFrame)
    }
    video.requestVideoFrameCallback!(onFrame)
    // playing fast measures less; frames are counted against media time, not wall time
    video.play().catch(finish)
  })
}

export async function measureVideo(file: File): Promise<{ width: number, height: number, fps: number | null, duration: number | null }> {
  const video = await loadMedia(document.createElement('video'), file)
  if (!video) return { width: 0, height: 0, fps: null, duration: null }
  const measured = { width: video.videoWidth, height: video.videoHeight, duration: await durationOf(video), fps: await measureFps(video) }
  video.removeAttribute('src')
  video.load()
  return measured
}

export async function measureAudio(file: File): Promise<{ duration: number | null }> {
  const audio = await loadMedia(document.createElement('audio'), file)
  return { duration: audio ? await durationOf(audio) : null }
}
