<script setup lang="ts">
import type { Row } from '#shared/types/models'
import type { Json } from '#shared/types/database.types'

// Slide-over editor for a format. Open it with `edit(row)`, or `edit()` for a new one.
const emit = defineEmits<{ saved: [] }>()

const db = useDb()
const run = useAction()
const { formats, load } = useRefData()

const open = ref(false)
const saving = ref(false)
const form = reactive({
  id: '',
  code: '',
  name: '',
  description: '',
  beats: [] as string[],
  beat_descriptions: {} as Record<string, string>,
  beat_broll: {} as Record<string, BrollSuggestion[]>,
  target_seconds: undefined as number | undefined,
  source_url: ''
})
const requestOpen = useGuardedClose(open, form)

function nextCode() {
  const highest = Math.max(0, ...formats.value.map(row => Number(row.code.match(/^F(\d+)$/)?.[1] ?? 0)))
  return `F${String(highest + 1).padStart(2, '0')}`
}

function edit(row?: Row<'formats'>, duplicate = false) {
  Object.assign(form, {
    id: duplicate ? '' : row?.id ?? '',
    code: row && !duplicate ? row.code : nextCode(),
    name: row?.name ? (duplicate ? `${row.name} (copy)` : row.name) : '',
    description: row?.description ?? '',
    beats: [...(row?.beats ?? DEFAULT_BEATS)],
    beat_descriptions: { ...((row?.beat_descriptions ?? {}) as Record<string, string>) },
    beat_broll: parseBeatSuggestions(row?.beat_broll),
    target_seconds: row?.target_seconds ?? undefined,
    source_url: row?.source_url ?? ''
  })
  open.value = true
}
defineExpose({ edit })

const canSave = computed(() =>
  form.code.trim() !== '' && form.name.trim() !== '' && form.beats.length > 0 && isValidUrl(form.source_url)
)

async function save() {
  saving.value = true
  const ok = await run(async () => {
    const fields = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      beats: form.beats.map(beat => beat.trim().toLowerCase()).filter(Boolean),
      // only descriptions for beats the format still has
      beat_descriptions: Object.fromEntries(form.beats
        .map(beat => [beat.trim().toLowerCase(), (form.beat_descriptions[beat] ?? '').trim()])
        .filter(([beat, text]) => beat && text)),
      // suggested b-roll per beat, for the beats the format still has
      beat_broll: Object.fromEntries(form.beats
        .map(beat => [beat.trim().toLowerCase(), parseSuggestions(form.beat_broll[beat])] as const)
        .filter(([beat, shots]) => beat && shots.length)) as unknown as Json,
      target_seconds: form.target_seconds || null,
      source_url: normalizeUrl(form.source_url)
    }
    if (form.id) must(await db.from('formats').update(fields).eq('id', form.id))
    else must(await db.from('formats').insert(fields))
    await load(true)
  }, 'Format saved')
  saving.value = false
  if (ok) {
    open.value = false
    emit('saved')
  }
}
</script>

<template>
  <USlideover :open="open" @update:open="requestOpen" :title="form.id ? 'Edit format' : 'New format'" :ui="{ content: 'max-w-xl' }">
    <template #body>
      <div class="space-y-5">
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Code" required>
            <UInput v-model="form.code" class="w-full font-mono" />
          </UFormField>
          <UFormField label="Name" required class="sm:col-span-2">
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Description">
          <UTextarea v-model="form.description" autoresize class="w-full" />
        </UFormField>

        <UFormField label="Beats" help="In order. VOs get one script block per beat, and b-roll is matched per beat.">
          <UInputTags v-model="form.beats" class="w-full" />
        </UFormField>
        <UFormField
          v-if="form.beats.length"
          label="Each beat"
          help="What the beat is for (shown when writing a VO and in the b-roll planner), and the b-roll shots to suggest for it on a shoot."
        >
          <div class="space-y-3">
            <div v-for="beat in form.beats" :key="beat" class="space-y-2 rounded-lg border border-default p-3">
              <UBadge :label="beat" color="neutral" variant="subtle" />
              <UTextarea
                v-model="form.beat_descriptions[beat]"
                :rows="1"
                autoresize
                :placeholder="`What happens in the ${beat} beat`"
                class="w-full"
              />
              <p class="text-xs font-medium text-muted">
                Suggested b-roll
              </p>
              <BrollSuggestionsEditor
                :model-value="form.beat_broll[beat] ?? []"
                @update:model-value="form.beat_broll[beat] = $event"
              />
            </div>
          </div>
        </UFormField>
        <UFormField label="Target seconds">
          <UInput v-model.number="form.target_seconds" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Source" help="Optional link to where this came from" :error="isValidUrl(form.source_url) ? undefined : 'Enter a valid link'">
          <UInput v-model="form.source_url" type="url" icon="i-lucide-link" placeholder="https://" class="w-full" />
        </UFormField>
        <UAlert
          v-if="form.id"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          description="Changing beats doesn't rewrite existing VOs: open each VO to realign it. Planned shoots keep their snapshots."
        />
      </div>
    </template>
    <template #footer>
      <UButton label="Save format" :loading="saving" :disabled="!canSave" @click="save" />
    </template>
  </USlideover>
</template>
