<script setup lang="ts">
// Film, record or pick a clip for one checklist target and send it through useClipUpload
// (test mode until Dropbox, spec §12). Video (hooks, sync CTAs, b-roll) films with the camera;
// audio (VOs, VO CTAs) records from the phone's microphone right here in the page.
// Every clip is sanity-checked first (clipChecks.ts, presets in Settings); anything off asks
// before uploading.
//
// Video with a script (hooks, sync CTAs) can also be filmed in the page with the script over
// the camera (TeleprompterCamera.vue).
//
// `part` splits it so the buttons can sit in an item's top row and the clip below:
// 'actions' = Film/Record + Upload (and the recording bar), 'clip' = the attached clip, 'all' = both.
const props = withDefaults(defineProps<{
  /** from clipTarget.item() / clipTarget.broll() */
  target: string
  /** Dropbox folder under topdogugc/, from itemFolder() / brollFolder() */
  folder: string
  /** what the clip is for, for screen readers and recording names (e.g. "V03", "clip 2") */
  label: string
  media?: 'video' | 'audio'
  part?: 'all' | 'actions' | 'clip'
  rules?: ClipRules
  /** audio: the script's estimated reading time, for the length check */
  expectedSeconds?: number
  /** video: the resolved script, to film with it over the camera */
  script?: string
  size?: 'xs' | 'sm' | 'md'
}>(), { media: 'video', part: 'all', rules: () => DEFAULT_CLIP_RULES, expectedSeconds: 0, size: 'sm' })

// An uploaded clip is what ticks a deliverable off: `uploaded` when this target gains one,
// `removed` when it loses it (removed, or replaced by a clip that failed).
const emit = defineEmits<{ uploaded: [path: string], removed: [] }>()

const { connected, clipFor, attach, remove } = useClipUpload()
const { confirmDialog } = useConfirm()
const toast = useToast()
const clip = computed(() => clipFor(props.target))
const audio = computed(() => props.media === 'audio')
const showActions = computed(() => props.part !== 'clip')
const showClip = computed(() => props.part !== 'actions')

const filmInput = useTemplateRef<HTMLInputElement>('filmInput')
const pickInput = useTemplateRef<HTMLInputElement>('pickInput')
const checking = ref(false)

/** Measure the clip and run the sanity checks. */
async function check(file: File, recordedSeconds?: number) {
  if (audio.value) {
    const duration = recordedSeconds ?? (await measureAudio(file)).duration
    const measure = { duration, expectedSeconds: props.expectedSeconds }
    return { details: describeAudio(measure) || null, issues: checkAudio(measure, props.rules) }
  }
  const measure = await measureVideo(file)
  return { details: measure.width ? describeVideo(measure, props.rules) : null, issues: checkVideo(measure, props.rules) }
}

async function send(file: File, recordedSeconds?: number) {
  checking.value = true
  const checked = await check(file, recordedSeconds).finally(() => (checking.value = false))
  if (checked.issues.length && !(await confirmDialog({
    title: 'This clip looks off',
    description: `${checked.issues.map(issue => `• ${issue}`).join('\n')}\n\nUpload it anyway, or cancel and ${audio.value ? 'record' : 'film'} it again.`,
    confirmLabel: 'Upload anyway'
  }))) return

  const hadUpload = clip.value?.state === 'uploaded'
  const result = await attach(props.target, props.folder, file, checked)
  const uploaded = result.state === 'uploaded' && !!result.path
  if (uploaded && !hadUpload) emit('uploaded', result.path!)
  else if (!uploaded && hadUpload) emit('removed')
}

async function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // so the same file can be picked again
  if (file) await send(file)
}

// --- recording (audio) --------------------------------------------------------

const recorder = shallowRef<MediaRecorder | null>(null)
const recordStart = ref(0)
const now = ref(0)
let ticker: ReturnType<typeof setInterval> | undefined
const recordedSeconds = computed(() => Math.max(0, (now.value - recordStart.value) / 1000))

const extensionFor = (type: string) =>
  type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm'

async function startRecording() {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    toast.add({ title: 'Can\'t use the microphone', description: 'Allow microphone access for this site, then try again.', color: 'error', icon: 'i-lucide-mic-off' })
    return
  }
  const chunks: Blob[] = []
  const next = new MediaRecorder(stream)
  next.ondataavailable = event => event.data.size && chunks.push(event.data)
  next.onstop = async () => {
    stream.getTracks().forEach(track => track.stop())
    clearInterval(ticker)
    now.value = Date.now()
    const seconds = recordedSeconds.value
    recorder.value = null
    if (!chunks.length) return
    const type = next.mimeType || chunks[0]!.type || 'audio/webm'
    const name = `${props.label.replace(/[^\w-]+/g, '-')}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${extensionFor(type)}`
    await send(new File(chunks, name, { type }), seconds)
  }
  next.start()
  recorder.value = next
  recordStart.value = now.value = Date.now()
  ticker = setInterval(() => (now.value = Date.now()), 250)
}

const stopRecording = () => recorder.value?.stop()

onBeforeUnmount(() => {
  // leaving mid-recording: let go of the microphone without keeping the take
  if (!recorder.value) return
  recorder.value.ondataavailable = null
  recorder.value.onstop = null
  recorder.value.stream.getTracks().forEach(track => track.stop())
  recorder.value.stop()
  clearInterval(ticker)
})

const capture = () => audio.value ? startRecording() : filmInput.value?.click()

// --- teleprompter (video with a script) ----------------------------------------

const canPrompt = computed(() => !audio.value && !!props.script?.trim())
const prompting = ref(false)

function onPrompted(file: File) {
  prompting.value = false
  send(file)
}

// --- clip ------------------------------------------------------------------

async function removeClip() {
  const uploaded = clip.value?.state === 'uploaded'
  if (!(await confirmDialog({
    title: 'Remove this clip?',
    description: uploaded
      ? 'It will be unticked until another clip is uploaded.'
      : 'It hasn\'t been uploaded. If you recorded it here, your phone may not have kept a copy.',
    confirmLabel: 'Remove',
    danger: true
  }))) return
  remove(props.target)
  if (uploaded) emit('removed')
}

const badge = computed(() => {
  switch (clip.value?.state) {
    case 'uploading': return { label: 'Uploading…', color: 'info' as const, icon: 'i-lucide-loader-circle' }
    case 'uploaded': return connected
      ? { label: 'Uploaded to Dropbox', color: 'success' as const, icon: 'i-lucide-cloud-check' }
      : { label: 'Ticked off · test mode, not really uploaded', color: 'warning' as const, icon: 'i-lucide-flask-conical' }
    case 'failed': return { label: 'Upload failed · try again', color: 'error' as const, icon: 'i-lucide-cloud-alert' }
    default: return { label: 'Not uploaded · Dropbox not connected', color: 'neutral' as const, icon: 'i-lucide-cloud-off' }
  }
})

const captureLabel = computed(() => (audio.value ? 'Record' : 'Film') + (clip.value ? ' again' : ''))
const captureIcon = computed(() => audio.value ? 'i-lucide-mic' : 'i-lucide-video')
</script>

<template>
  <div v-if="showActions || clip" :class="props.part === 'all' ? 'space-y-2' : undefined">
    <template v-if="showActions">
      <input
        v-if="!audio"
        ref="filmInput"
        type="file"
        accept="video/*"
        capture="environment"
        class="hidden"
        @change="onPick"
      >
      <input
        ref="pickInput"
        type="file"
        :accept="audio ? 'audio/*' : 'video/*'"
        class="hidden"
        @change="onPick"
      >

      <!-- recording in progress -->
      <div v-if="recorder" class="flex items-center gap-2 rounded-md border border-error/40 bg-error/5 py-1 pr-1 pl-2">
        <span class="relative flex size-2.5 shrink-0">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-error opacity-60" />
          <span class="relative inline-flex size-2.5 rounded-full bg-error" />
        </span>
        <span class="text-sm font-medium text-highlighted tabular-nums">{{ formatDuration(recordedSeconds) }}</span>
        <UButton
          icon="i-lucide-square"
          label="Stop"
          color="error"
          :size="props.size"
          :aria-label="`Stop recording ${props.label}`"
          @click="stopRecording"
        />
      </div>

      <div v-else class="flex gap-1.5">
        <!-- icons only on phones; labels from sm up -->
        <UButton
          :icon="captureIcon"
          :color="clip ? 'neutral' : 'primary'"
          :variant="clip ? 'ghost' : 'soft'"
          :size="props.size"
          :loading="checking"
          :aria-label="`${captureLabel} ${props.label}`"
          @click="capture"
        >
          <span class="hidden sm:inline">{{ captureLabel }}</span>
        </UButton>
        <UButton
          v-if="canPrompt"
          icon="i-lucide-scroll-text"
          color="neutral"
          variant="outline"
          :size="props.size"
          :disabled="checking"
          :aria-label="`Film ${props.label} with the script on screen`"
          @click="prompting = true"
        >
          <span class="hidden sm:inline">Film with script</span>
        </UButton>
        <UButton
          :icon="clip ? 'i-lucide-replace' : 'i-lucide-upload'"
          color="neutral"
          :variant="clip ? 'ghost' : 'outline'"
          :size="props.size"
          :disabled="checking"
          :aria-label="`${clip ? 'Replace the clip' : 'Upload a clip'} for ${props.label}`"
          @click="pickInput?.click()"
        >
          <span class="hidden sm:inline">{{ clip ? 'Replace' : 'Upload' }}</span>
        </UButton>
      </div>
    </template>

    <TeleprompterCamera
      v-if="prompting && props.script"
      :script="props.script"
      :label="props.label"
      @recorded="onPrompted"
      @close="prompting = false"
    />

    <div v-if="showClip && clip" class="space-y-2 rounded-md border border-default p-2">
      <div class="flex items-center gap-2">
        <UIcon :name="audio ? 'i-lucide-file-audio' : 'i-lucide-file-video'" class="size-5 shrink-0 text-muted" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">
            {{ clip.name }}
          </p>
          <p class="text-xs text-muted tabular-nums">
            {{ formatFileSize(clip.size) }}<template v-if="clip.details">
              · {{ clip.details }}
            </template>
          </p>
        </div>
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="`Remove the clip for ${props.label}`"
          @click="removeClip"
        />
      </div>

      <UProgress v-if="clip.state === 'uploading'" :model-value="Math.round(clip.progress * 100)" size="sm" />
      <div class="flex flex-wrap gap-1.5">
        <UBadge
          :label="badge.label"
          :color="badge.color"
          :icon="badge.icon"
          variant="subtle"
          class="whitespace-normal"
          :ui="{ leadingIcon: clip.state === 'uploading' ? 'animate-spin' : undefined }"
        />
        <UTooltip v-if="clip.issues.length" :text="clip.issues.join(' ')">
          <UBadge
            :label="`${clip.issues.length} check${clip.issues.length === 1 ? '' : 's'} failed`"
            color="warning"
            icon="i-lucide-triangle-alert"
            variant="outline"
          />
        </UTooltip>
      </div>

      <template v-if="clip.state !== 'uploading'">
        <audio v-if="audio" :src="clip.url" controls preload="metadata" class="w-full" />
        <video
          v-else
          :src="clip.url"
          controls
          playsinline
          preload="metadata"
          class="max-h-48 w-full rounded bg-black"
        />
      </template>
    </div>
  </div>
</template>
