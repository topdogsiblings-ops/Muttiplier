<script setup lang="ts">
import type { Json } from '#shared/types/database.types'
import type { LoadedShoot } from '#shared/utils/loadShoot'
import type { EditsCheck } from '#shared/utils/manifest'

// Filmed → Ready for batching (spec §14). Once the editors have put every clip in edited/,
// check their work against raw/ in Dropbox and read every edited clip's length; if it all
// checks out, write the shoot's manifest (manifest.json in the shoot folder, and a copy here
// for batching) and mark the shoot ready. Refreshing later writes a new manifest version.
// This runs in the browser, which talks to Dropbox directly, so a big shoot isn't cut short.
const props = defineProps<{ bundle: LoadedShoot }>()
const emit = defineEmits<{ changed: [] }>()

const db = useDb()
const run = useAction()
const toast = useToast()
const { confirmDialog } = useConfirm()
const dropbox = useDropbox()
const shoot = computed(() => props.bundle.shoot)
const base = computed(() => shootFolder(props.bundle))
const ready = computed(() => shoot.value.status === 'edited')

// the latest manifest, if there is one
const latest = ref<{ version: number, created_at: string } | null>(null)
async function loadLatest() {
  const { data } = await db.from('shoot_manifests').select('version, created_at').eq('shoot_id', shoot.value.id).order('version', { ascending: false }).limit(1).maybeSingle()
  latest.value = data
}
onMounted(loadLatest)

// --- checking ------------------------------------------------------------------------
const checking = ref(false)
const reading = reactive({ done: 0, total: 0 })
const result = ref<EditsCheck | null>(null)
let editedFiles: string[] = []
let rawFiles: string[] = []
let durations = new Map<string, number | null>()
let brollShots = new Map<string, string>()

async function check() {
  const status = await dropbox.refresh().catch(() => null)
  if (!status?.connected) {
    toast.add({ title: 'Dropbox isn\'t connected', description: 'An admin can connect it in Settings → Dropbox.', color: 'warning', icon: 'i-lucide-cloud-off' })
    return
  }
  checking.value = true
  result.value = null
  try {
    const [raw, edited, clipRows] = await Promise.all([
      dropboxListFiles(`${base.value}/raw`),
      dropboxListFiles(`${base.value}/edited`),
      db.from('shoot_clips').select('target, path, state').eq('shoot_id', shoot.value.id)
    ])
    const rows = clipRows.data ?? []
    // which b-roll shot each uploaded clip was for, by its place in raw/
    brollShots = new Map(rows
      .filter(row => row.target.startsWith('broll:') && row.path)
      .flatMap((row) => {
        const relative = relativeToStage(props.bundle, row.path!, status.root, 'raw')
        return relative ? [[relative, row.target.split(':')[1]!] as [string, string]] : []
      }))

    // every edited clip's length, a few at a time
    const clips = edited.filter(file => isClip(file.path))
    Object.assign(reading, { done: 0, total: clips.length })
    durations = new Map()
    const queue = [...clips]
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        durations.set(file.path, await dropboxDuration(`${base.value}/edited/${file.path}`, file.size))
        reading.done++
      }
    }))

    editedFiles = edited.map(file => file.path)
    rawFiles = raw.map(file => file.path)
    result.value = checkEdits(props.bundle, rawFiles, editedFiles, {
      onPhones: rows.filter(row => row.state === 'saved').length,
      durations
    })
  } catch (error) {
    toast.add({ title: 'Couldn\'t read the shoot\'s folders', description: (error as Error).message, color: 'error', icon: 'i-lucide-cloud-alert' })
  } finally {
    checking.value = false
  }
}

// --- writing the manifest --------------------------------------------------------------
const saving = ref(false)
/**
 * Write the manifest. With problems, only when someone overrides them: whatever's missing is
 * left out (recipes needing it aren't made) and the problems are recorded in the manifest.
 */
async function writeManifest(override = false) {
  if (!result.value || (!result.value.ok && !override)) return
  if (override && !(await confirmDialog({
    title: ready.value ? 'Save the manifest anyway?' : 'Mark ready for batching anyway?',
    description: `${result.value.problems.length} problem${result.value.problems.length === 1 ? '' : 's'} will be left as they are. Anything missing or without a readable length stays out of the manifest, so recipes that need it won't be made. The problems are noted in the manifest, and you can refresh it once they're fixed.`,
    confirmLabel: ready.value ? 'Save anyway' : 'Mark ready anyway'
  }))) return
  saving.value = true
  const version = (latest.value?.version ?? 0) + 1
  const ok = await run(async () => {
    const manifest = buildManifest(props.bundle, editedFiles, rawFiles, durations, {
      version,
      generatedAt: new Date().toISOString(),
      brollShots,
      overridden: result.value!.ok ? undefined : result.value!.problems
    })
    await dropboxUploader.writeText(`${base.value}/manifest.json`, JSON.stringify(manifest, null, 2))
    must(await db.from('shoot_manifests').insert({ shoot_id: shoot.value.id, version, data: manifest as unknown as Json }))
    if (!ready.value) must(await db.from('shoots').update({ status: 'edited' }).eq('id', shoot.value.id).eq('status', 'filmed'))
  }, ready.value ? `Manifest v${version} saved` : 'Ready for batching')
  saving.value = false
  if (!ok) return
  result.value = null
  await loadLatest()
  emit('changed')
}

async function notReady() {
  await run(async () => {
    must(await db.from('shoots').update({ status: 'filmed' }).eq('id', shoot.value.id).eq('status', 'edited'))
  }, 'Back to filmed')
  emit('changed')
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <UCard :ui="{ body: 'space-y-3' }">
    <div class="flex flex-wrap items-start gap-3">
      <UIcon :name="ready ? 'i-lucide-package-check' : 'i-lucide-scissors'" class="mt-0.5 size-6 shrink-0" :class="ready ? 'text-success' : 'text-muted'" />
      <div class="min-w-0 flex-1">
        <p class="font-medium text-highlighted">
          {{ ready ? 'Ready for batching' : 'Edits in? Get it ready for batching' }}
        </p>
        <p class="text-sm text-muted">
          <template v-if="ready && latest">
            Manifest v{{ latest.version }}, {{ when(latest.created_at) }}. Refresh it if the edits change.
          </template>
          <template v-else>
            Once the editors have put every clip in edited/, check their work: every take in raw/ and edited/,
            named by its code (VOs beat by beat), edited/ mirroring raw/, and every clip's length readable.
          </template>
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="ready"
          label="Not ready"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="notReady"
        />
        <UButton
          :label="checking ? (reading.total ? `Reading lengths ${reading.done}/${reading.total}` : 'Checking…') : ready ? 'Refresh manifest' : 'Check edits'"
          icon="i-lucide-scan-search"
          size="sm"
          :color="ready ? 'neutral' : 'primary'"
          :variant="ready ? 'subtle' : 'solid'"
          :loading="checking"
          @click="check"
        />
      </div>
    </div>

    <template v-if="result">
      <UAlert
        v-if="result.ok"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="`Everything checks out: ${result.editedClips} clips in edited/`"
      >
        <template #description>
          <div class="mt-2">
            <UButton
              :label="ready ? `Save manifest v${(latest?.version ?? 0) + 1}` : 'Mark ready for batching'"
              icon="i-lucide-package-check"
              size="sm"
              :loading="saving"
              @click="writeManifest()"
            />
          </div>
        </template>
      </UAlert>
      <UAlert
        v-else
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        :title="`${result.problems.length} thing${result.problems.length === 1 ? '' : 's'} to fix first`"
      >
        <template #description>
          <ul class="list-disc space-y-0.5 pl-4">
            <li v-for="problem in result.problems.slice(0, 20)" :key="problem">
              {{ problem }}
            </li>
            <li v-if="result.problems.length > 20">
              …and {{ result.problems.length - 20 }} more
            </li>
          </ul>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <UButton
              :label="ready ? 'Save manifest anyway' : 'Mark ready anyway'"
              icon="i-lucide-triangle-alert"
              color="error"
              variant="subtle"
              size="sm"
              :loading="saving"
              @click="writeManifest(true)"
            />
            <span class="text-xs text-muted">Leaves out whatever's missing; recipes that need it won't be made.</span>
          </div>
        </template>
      </UAlert>
    </template>
  </UCard>
</template>
