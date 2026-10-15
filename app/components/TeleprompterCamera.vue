<script setup lang="ts">
// Full-screen in-page camera with the script laid over the top of the preview, near the
// lens, so whoever's on camera can read it while filming. Records with MediaRecorder and
// hands the take back as a File; ClipCapture checks and uploads it like any other clip.
// The front camera's preview is mirrored, like a selfie; the recording isn't.
//
// Safari records the camera track as raw landscape sensor frames with no rotation tag, so a
// portrait take comes out 1920x1080 and sideways. Instead each frame is drawn upright, as the
// preview shows it, onto a fixed 1080x1920 canvas (cover-cropped), and the canvas is recorded.
const props = defineProps<{
  /** the resolved script to show */
  script: string
  /** what the clip is for, for the file name and screen readers (e.g. "V03") */
  label: string
}>()
const emit = defineEmits<{ recorded: [file: File], close: [] }>()

const toast = useToast()
const preview = useTemplateRef<HTMLVideoElement>('preview')
const facing = ref<'user' | 'environment'>('user')
const stream = shallowRef<MediaStream | null>(null)
const recorder = shallowRef<MediaRecorder | null>(null)
const starting = ref(true)
const textSize = ref(28)

const recordStart = ref(0)
const now = ref(0)
let ticker: ReturnType<typeof setInterval> | undefined
const recordedSeconds = computed(() => Math.max(0, (now.value - recordStart.value) / 1000))

let wakeLock: { release: () => Promise<void> } | null = null

function stopStream() {
  stream.value?.getTracks().forEach(track => track.stop())
  stream.value = null
}

// Safari weighs an `ideal` frame rate against the `ideal` size, and happily settles on a
// 30fps mode; asking for at least 50 makes it pick a 60fps-capable mode. Falls back to
// best effort where the camera has none.
async function requestCamera(): Promise<MediaStream> {
  const video = { facingMode: facing.value, width: { ideal: 1080 }, height: { ideal: 1920 } }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { ...video, frameRate: { min: 50, ideal: 60 } }, audio: true })
  } catch (error) {
    if ((error as Error).name !== 'OverconstrainedError') throw error
    return navigator.mediaDevices.getUserMedia({ video: { ...video, frameRate: { ideal: 60 } }, audio: true })
  }
}

/** What the camera is actually giving us, e.g. "1080×1920 · 60fps". */
const cameraInfo = ref('')

async function openCamera() {
  starting.value = true
  stopStream()
  try {
    stream.value = await requestCamera()
  } catch {
    toast.add({ title: 'Can\'t use the camera', description: 'Allow camera and microphone access for this site, then try again.', color: 'error', icon: 'i-lucide-video-off' })
    emit('close')
    return
  }
  if (preview.value) preview.value.srcObject = stream.value
  const settings = stream.value.getVideoTracks()[0]?.getSettings()
  cameraInfo.value = settings?.width ? `${settings.width}×${settings.height} · ${Math.round(settings.frameRate ?? 0)}fps` : ''
  starting.value = false
}

function flip() {
  facing.value = facing.value === 'user' ? 'environment' : 'user'
  openCamera()
}

// --- portrait canvas -----------------------------------------------------------

const OUTPUT = { width: 1080, height: 1920 }
type FrameCallbackVideo = HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number }
let canvas: HTMLCanvasElement | null = null
let drawing = false

/** Draw the current camera frame onto the canvas, cropped to fill 9:16 like the preview's object-cover. */
function drawFrame() {
  const video = preview.value
  const context = canvas?.getContext('2d', { alpha: false })
  if (!video || !context || !video.videoWidth || !video.videoHeight) return
  const target = OUTPUT.width / OUTPUT.height
  const source = video.videoWidth / video.videoHeight
  const sw = source > target ? video.videoHeight * target : video.videoWidth
  const sh = source > target ? video.videoHeight : video.videoWidth / target
  context.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, OUTPUT.width, OUTPUT.height)
}

/** Redraw on every new camera frame while recording (or every animation frame where that isn't supported). */
function drawLoop() {
  if (!drawing) return
  drawFrame()
  const video = preview.value as FrameCallbackVideo | null
  if (video?.requestVideoFrameCallback) video.requestVideoFrameCallback(drawLoop)
  else requestAnimationFrame(drawLoop)
}

function portraitStream(camera: MediaStream): MediaStream {
  canvas = document.createElement('canvas')
  canvas.width = OUTPUT.width
  canvas.height = OUTPUT.height
  drawing = true
  drawLoop()
  const fps = camera.getVideoTracks()[0]?.getSettings().frameRate ?? 60
  return new MediaStream([...canvas.captureStream(Math.round(fps)).getVideoTracks(), ...camera.getAudioTracks()])
}

function stopDrawing(recorded?: MediaStream) {
  drawing = false
  recorded?.getVideoTracks().forEach(track => track.stop())
  canvas = null
}

const mimeType = () => ['video/mp4', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type)) ?? ''

function startRecording() {
  if (!stream.value) return
  const chunks: Blob[] = []
  const type = mimeType()
  const recorded = portraitStream(stream.value)
  const next = new MediaRecorder(recorded, { ...(type && { mimeType: type }), videoBitsPerSecond: 16_000_000 })
  next.ondataavailable = event => event.data.size && chunks.push(event.data)
  next.onstop = () => {
    stopDrawing(recorded)
    clearInterval(ticker)
    recorder.value = null
    if (!chunks.length) return
    const recordedType = next.mimeType || chunks[0]!.type || 'video/mp4'
    const extension = recordedType.includes('mp4') ? 'mp4' : 'webm'
    const name = `${props.label.replace(/[^\w-]+/g, '-')}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${extension}`
    emit('recorded', new File(chunks, name, { type: recordedType }))
  }
  next.start()
  recorder.value = next
  recordStart.value = now.value = Date.now()
  ticker = setInterval(() => (now.value = Date.now()), 250)
}

const stopRecording = () => recorder.value?.stop()

onMounted(async () => {
  await openCamera()
  try {
    wakeLock = await (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } })
      .wakeLock?.request('screen') ?? null
  } catch { /* the screen may dim; filming still works */ }
})

onBeforeUnmount(() => {
  // closing mid-take: let go of the camera without keeping it
  if (recorder.value) {
    recorder.value.ondataavailable = null
    recorder.value.onstop = null
    recorder.value.stop()
    stopDrawing(recorder.value.stream)
  }
  clearInterval(ticker)
  stopStream()
  wakeLock?.release().catch(() => {})
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      :aria-label="`Film ${props.label} with the script`"
    >
      <video
        ref="preview"
        autoplay
        muted
        playsinline
        class="absolute inset-0 size-full object-cover"
        :class="{ '-scale-x-100': facing === 'user' }"
      />

      <!-- script, up by the lens -->
      <div class="relative bg-black/55 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 backdrop-blur-sm">
        <p
          class="max-h-[40vh] overflow-y-auto leading-snug font-semibold text-balance"
          :style="{ fontSize: `${textSize}px` }"
        >
          {{ props.script }}
        </p>
        <div class="mt-2 flex items-center gap-1">
          <UButton icon="i-lucide-a-arrow-down" color="neutral" variant="ghost" size="sm" class="text-white" aria-label="Smaller text" :disabled="textSize <= 18" @click="textSize -= 4" />
          <UButton icon="i-lucide-a-arrow-up" color="neutral" variant="ghost" size="sm" class="text-white" aria-label="Bigger text" :disabled="textSize >= 48" @click="textSize += 4" />
          <span v-if="cameraInfo" class="ml-auto text-xs text-white/70 tabular-nums">camera {{ cameraInfo }}</span>
        </div>
      </div>

      <!-- controls -->
      <div class="relative mt-auto flex items-center justify-between px-6 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xl"
          class="text-white"
          aria-label="Close the camera"
          @click="emit('close')"
        />

        <div class="flex flex-col items-center gap-1">
          <button
            type="button"
            class="flex size-18 items-center justify-center rounded-full border-4 border-white disabled:opacity-50"
            :disabled="starting"
            :aria-label="recorder ? `Stop filming ${props.label}` : `Start filming ${props.label}`"
            @click="recorder ? stopRecording() : startRecording()"
          >
            <span class="bg-red-500 transition-all" :class="recorder ? 'size-7 rounded-md' : 'size-14 rounded-full'" />
          </button>
          <span class="h-5 text-sm font-medium tabular-nums">{{ recorder ? formatDuration(recordedSeconds) : '' }}</span>
        </div>

        <UButton
          icon="i-lucide-switch-camera"
          color="neutral"
          variant="ghost"
          size="xl"
          class="text-white"
          aria-label="Switch camera"
          :disabled="!!recorder || starting"
          @click="flip"
        />
      </div>
    </div>
  </Teleport>
</template>
