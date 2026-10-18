<script setup lang="ts">
// Add a clip for one checklist target from the phone (Photos or Files) and save it on the
// phone through useClipUpload; saved clips go to Dropbox when Upload is pressed after the shoot (spec §12).
// Clips are filmed and recorded in the phone's own apps: iOS compresses anything its camera
// hands straight to a web page (to 480×360), so the app doesn't film or record itself.
// A clip added on another phone shows here too (ticked, with whose phone it's on), so nobody
// adds the same one twice; adding one anyway asks first and takes over the slot.
// Every clip is sanity-checked first (clipChecks.ts, presets in Settings); anything off asks
// before saving.
//
// `part` splits it so the button can sit in an item's top row and the clip below:
// 'actions' = Add clip / Replace, 'clip' = the attached clip, 'all' = both.
const props = withDefaults(defineProps<{
  /** from clipTarget.item() / clipTarget.broll() */
  target: string
  /** the shoot code, so the clip uploads with its shoot */
  shoot: string
  /**
   * Where it goes in Dropbox: a file without extension, from itemPath() (e.g. `…/hooks/joe/H01`),
   * or a folder ending in `/` to keep the clip's own name (b-roll)
   */
  path: string
  /** what the clip is for, for screen readers (e.g. "V03", "clip 2") */
  label: string
  media?: 'video' | 'audio'
  part?: 'all' | 'actions' | 'clip'
  rules?: ClipRules
  /** audio: the script's estimated reading time, for the length check */
  expectedSeconds?: number
  size?: 'xs' | 'sm' | 'md'
  /** a label always shown on the button (e.g. a person's name): + before a clip, ✓ after */
  buttonLabel?: string
  /** other spots the same take fills (a line that doesn't name the dog, on the person's other channels) */
  also?: { target: string, path: string }[]
  /** what's said in the clip, for its captions */
  script?: string | null
}>(), { media: 'video', part: 'all', rules: () => DEFAULT_CLIP_RULES, expectedSeconds: 0, size: 'sm' })

// A saved clip is what ticks a deliverable off: `saved` when this target gains one,
// `removed` when it loses it.
const emit = defineEmits<{ saved: [], removed: [] }>()

const { clipFor, elsewhere, save, remove } = useClipUpload()
const { confirmDialog } = useConfirm()
const toast = useToast()
const clip = computed(() => clipFor(props.target))
/** the clip for this target on another phone, when there's none on this one */
const other = computed(() => elsewhere(props.target))
const otherPhone = computed(() => other.value?.by ? `${other.value.by}'s phone` : 'another phone')
const done = computed(() => !!clip.value || !!other.value)
const audio = computed(() => props.media === 'audio')
const showActions = computed(() => props.part !== 'clip')
const showClip = computed(() => props.part !== 'actions')

const pickInput = useTemplateRef<HTMLInputElement>('pickInput')
const checking = ref(false)

/** Measure the clip and run the sanity checks. */
async function check(file: File) {
  if (audio.value) {
    const measure = { duration: (await measureAudio(file)).duration, expectedSeconds: props.expectedSeconds }
    return { details: describeAudio(measure) || null, issues: checkAudio(measure, props.rules), duration: measure.duration }
  }
  const measure = await measureVideo(file)
  return { details: measure.width ? describeVideo(measure, props.rules) : null, issues: checkVideo(measure, props.rules), duration: measure.duration }
}

async function send(file: File) {
  // the file is picked first (iOS only opens the picker straight from a tap), then this asks
  if (other.value && !(await confirmDialog({
    title: `Already added on ${otherPhone.value}`,
    description: `Use this clip instead? The one on ${otherPhone.value} will no longer count.`,
    confirmLabel: 'Use this clip'
  }))) return
  checking.value = true
  const checked = await check(file).finally(() => (checking.value = false))
  if (checked.issues.length && !(await confirmDialog({
    title: 'This clip looks off',
    description: `${checked.issues.map(issue => `• ${issue}`).join('\n')}\n\nSave it anyway, or cancel and pick another.`,
    confirmLabel: 'Save anyway'
  }))) return

  try {
    await save(props.target, props.shoot, props.path, file, {
      checked: { details: checked.details, issues: checked.issues },
      also: props.also,
      script: props.script,
      duration: checked.duration
    })
  } catch {
    toast.add({ title: 'Couldn\'t save the clip on this phone', description: 'The phone may be out of space. Free some up, then try again.', color: 'error', icon: 'i-lucide-hard-drive' })
    return
  }
  emit('saved')
}

async function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // so the same file can be picked again
  if (file) await send(file)
}

// --- clip ------------------------------------------------------------------

async function removeClip() {
  const uploaded = clip.value?.state === 'uploaded'
  if (!(await confirmDialog({
    title: 'Remove this clip?',
    description: uploaded
      ? 'It will be unticked until another clip is saved. The copy already uploaded stays in Dropbox.'
      : 'It will be deleted from this phone and unticked until another clip is saved.',
    confirmLabel: 'Remove',
    danger: true
  }))) return
  await remove(props.target)
  emit('removed')
}

const badge = computed(() => {
  switch (clip.value?.state) {
    case 'uploading': return { label: 'Uploading…', color: 'info' as const, icon: 'i-lucide-loader-circle' }
    // real uploads have a full Dropbox path ("/UGC/…"); test-mode ones a relative one
    case 'uploaded': return clip.value.path?.startsWith('/')
      ? { label: 'Uploaded to Dropbox', color: 'success' as const, icon: 'i-lucide-cloud-check' }
      : { label: 'Uploaded · test mode, not really sent', color: 'warning' as const, icon: 'i-lucide-flask-conical' }
    case 'failed': return { label: 'Upload failed · retried with the rest', color: 'error' as const, icon: 'i-lucide-cloud-alert' }
    default: return { label: 'Saved on this phone', color: 'neutral' as const, icon: 'i-lucide-smartphone' }
  }
})
</script>

<template>
  <div v-if="showActions || clip || other" :class="props.part === 'all' ? 'space-y-2' : undefined">
    <template v-if="showActions">
      <input
        ref="pickInput"
        type="file"
        :accept="audio ? 'audio/*' : 'video/*'"
        class="hidden"
        @change="onPick"
      >
      <UButton
        v-if="props.buttonLabel"
        :icon="done ? 'i-lucide-check' : 'i-lucide-plus'"
        :label="props.buttonLabel"
        :color="done ? 'success' : 'primary'"
        variant="soft"
        :size="props.size"
        :loading="checking"
        :aria-label="clip ? `Replace the clip for ${props.label}` : other ? `${props.label}: added on ${otherPhone}` : `Add a clip for ${props.label}`"
        @click="pickInput?.click()"
      />
      <!-- icon only on phones; label from sm up -->
      <UButton
        v-else
        :icon="clip ? 'i-lucide-replace' : other ? 'i-lucide-check' : 'i-lucide-plus'"
        :color="clip ? 'neutral' : other ? 'success' : 'primary'"
        :variant="clip ? 'ghost' : 'soft'"
        :size="props.size"
        :loading="checking"
        :aria-label="clip ? `Replace the clip for ${props.label}` : other ? `${props.label}: added on ${otherPhone}` : `Add a clip for ${props.label}`"
        @click="pickInput?.click()"
      >
        <span class="hidden sm:inline">{{ clip ? 'Replace' : other ? 'Added' : 'Add clip' }}</span>
      </UButton>
    </template>

    <!-- added on another phone: just who has it -->
    <p v-if="showClip && !clip && other" class="flex items-center gap-1.5 rounded-md border border-default px-2 py-1.5 text-sm text-muted">
      <UIcon name="i-lucide-smartphone" class="size-4 shrink-0" />
      <span class="min-w-0 truncate">
        {{ other.fileName }} · on {{ otherPhone }}{{ other.state === 'uploaded' ? ' · uploaded' : '' }}
      </span>
    </p>

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

      <template v-if="clip.url && clip.state !== 'uploading'">
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
