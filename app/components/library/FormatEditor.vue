<script setup lang="ts">
import type { Row } from '#shared/types/models'
import type { Json } from '#shared/types/database.types'

// Slide-over editor for a format. Open it with `edit(row)`, or `edit()` for a new one.
// Modular formats are a VO between a Library hook and CTA. Standalone formats open and close
// themselves: their first beat is always "hook" and their last "cta" (filmed like any beat, shown
// in the checklist's Hooks and CTAs), with the format's own beats in between. Every beat has
// guidance (what to write), an example line, and how it's shown: the speaker on camera (face) or
// their voice over b-roll.
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
  kind: 'modular' as 'modular' | 'standalone',
  beat_descriptions: {} as Record<string, string>,
  beat_examples: {} as Record<string, string>,
  beat_display: {} as Record<string, 'face' | 'broll'>,
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
    kind: row?.kind === 'standalone' ? 'standalone' : 'modular',
    beats: [...(row?.beats ?? DEFAULT_BEATS)],
    beat_descriptions: { ...((row?.beat_descriptions ?? {}) as Record<string, string>) },
    beat_examples: { ...((row?.beat_examples ?? {}) as Record<string, string>) },
    beat_display: { ...((row?.beat_display ?? {}) as Record<string, 'face' | 'broll'>) },
    beat_broll: parseBeatSuggestions(row?.beat_broll),
    target_seconds: row?.target_seconds ?? undefined,
    source_url: row?.source_url ?? ''
  })
  open.value = true
}
defineExpose({ edit })

const kinds = [
  { label: 'Modular: Library hook + VO + CTA', value: 'modular' },
  { label: 'Standalone: opens and closes itself', value: 'standalone' }
]
const HOOK = 'hook'
const CTA = 'cta'
const isStandalone = computed(() => form.kind === 'standalone')
/** a standalone format's own beats: everything between its hook and CTA */
const middleBeats = computed({
  get: () => isStandalone.value ? form.beats.filter(beat => beat !== HOOK && beat !== CTA) : form.beats,
  set: (beats: string[]) => {
    const clean = beats.map(beat => beat.trim().toLowerCase()).filter(Boolean)
    form.beats = isStandalone.value ? [HOOK, ...clean.filter(beat => beat !== HOOK && beat !== CTA), CTA] : clean
  }
})
// switching class adds (or drops) the locked hook and CTA beats
watch(() => form.kind, (kind) => {
  const middle = form.beats.filter(beat => beat !== HOOK && beat !== CTA)
  form.beats = kind === 'standalone' ? [HOOK, ...middle, CTA] : middle.length ? middle : [...DEFAULT_BEATS]
})
/** how a beat is shown, as the format would play it: set, or the default for its place */
const showOf = (beat: string): 'face' | 'broll' =>
  form.beat_display[beat] ?? (isStandalone.value && (beat === HOOK || beat === CTA) ? 'face' : 'broll')
// the default layout: the Face to camera and Over b-roll treatments make whole-video versions on top
const showItems = [
  { label: 'Face to camera', value: 'face' },
  { label: 'Over b-roll', value: 'broll' }
]
const beatTitle = (beat: string) => isStandalone.value && beat === HOOK ? 'hook (opens the video)' : isStandalone.value && beat === CTA ? 'cta (closes the video)' : beat

const canSave = computed(() =>
  form.code.trim() !== '' && form.name.trim() !== '' && form.beats.length > 0 && isValidUrl(form.source_url)
  && (!isStandalone.value || form.beats.length > 2)
)

async function save() {
  saving.value = true
  const ok = await run(async () => {
    const fields = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      kind: form.kind,
      beats: form.beats.map(beat => beat.trim().toLowerCase()).filter(Boolean),
      // only descriptions for beats the format still has
      beat_descriptions: Object.fromEntries(form.beats
        .map(beat => [beat.trim().toLowerCase(), (form.beat_descriptions[beat] ?? '').trim()])
        .filter(([beat, text]) => beat && text)),
      beat_examples: Object.fromEntries(form.beats
        .map(beat => [beat.trim().toLowerCase(), (form.beat_examples[beat] ?? '').trim()])
        .filter(([beat, text]) => beat && text)),
      // how every beat is shown, written out in full so it doesn't depend on defaults later
      beat_display: Object.fromEntries(form.beats.map(beat => [beat.trim().toLowerCase(), showOf(beat)])),
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

        <UFormField label="Class" help="A standalone format is its own hook and CTA: its VOs are never paired with Library hooks or CTAs.">
          <USelect v-model="form.kind" :items="kinds" class="w-full" />
        </UFormField>

        <UFormField
          :label="isStandalone ? 'Beats between the hook and CTA' : 'Beats'"
          :help="isStandalone ? 'In order. The hook beat always comes first and the CTA beat last.' : 'In order. VOs get one script block per beat, and b-roll is matched per beat.'"
        >
          <div class="flex items-center gap-1.5">
            <UBadge v-if="isStandalone" label="hook" icon="i-lucide-lock" color="primary" variant="subtle" />
            <UInputTags v-model="middleBeats" class="min-w-0 flex-1" />
            <UBadge v-if="isStandalone" label="cta" icon="i-lucide-lock" color="primary" variant="subtle" />
          </div>
        </UFormField>
        <UFormField
          v-if="form.beats.length"
          label="Each beat"
          help="What to write in it and an example line (both shown when writing a VO, and used by AI drafting), its default layout (face to camera or over b-roll; treatments can add other versions), and the b-roll shots to suggest for it on a shoot."
        >
          <div class="space-y-3">
            <div v-for="beat in form.beats" :key="beat" class="space-y-2 rounded-lg border border-default p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <UBadge :label="beatTitle(beat)" color="neutral" variant="subtle" />
                <USelect
                  :model-value="showOf(beat)"
                  :items="showItems"
                  size="xs"
                  class="w-40"
                  @update:model-value="form.beat_display[beat] = $event as 'face' | 'broll'"
                />
              </div>
              <UTextarea
                v-model="form.beat_descriptions[beat]"
                :rows="1"
                autoresize
                :placeholder="`What to write in the ${beat} beat`"
                class="w-full"
              />
              <UInput
                v-model="form.beat_examples[beat]"
                icon="i-lucide-quote"
                :placeholder="`An example ${beat} line`"
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
        <UFormField label="Source" help="A reference video or example of the format: shown when writing its VOs" :error="isValidUrl(form.source_url) ? undefined : 'Enter a valid link'">
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
