<script setup lang="ts">
import type { Row } from '#shared/types/models'
import type { Beat } from '#shared/utils/slots'

// Slide-over editor for a VO (body template). Open it with `edit(row)`; pass `{ format_id }`
// to start a new VO in a format.
const emit = defineEmits<{ saved: [] }>()

const db = useDb()
const run = useAction()
const { confirmDialog } = useConfirm()
const { formats, angles, angleOptions, products, productOptions, settings } = useRefData()
const { context } = usePreviewContext()

const formatOptions = computed(() =>
  formats.value.filter(f => !f.archived).map(f => ({ label: `${f.code} — ${f.name}`, value: f.id }))
)
const formatOf = (id: string | undefined) => formats.value.find(f => f.id === id)

const open = ref(false)
const saving = ref(false)
const form = reactive({
  id: '',
  title: '',
  format_id: undefined as string | undefined,
  angle_id: undefined as string | undefined,
  beats: [] as Beat[],
  tags: [] as string[],
  notes: '',
  source_url: ''
})
const requestOpen = useGuardedClose(open, form)

function edit(row?: Partial<Omit<Row<'body_templates'>, 'beats'>> & { beats?: unknown }, duplicate = false) {
  Object.assign(form, {
    id: duplicate ? '' : row?.id ?? '',
    title: row?.title ? (duplicate ? `${row.title} (copy)` : row.title) : '',
    format_id: row?.format_id ?? formatOptions.value[0]?.value,
    angle_id: row?.angle_id ?? undefined,
    beats: parseBeats(row?.beats),
    tags: [...(row?.tags ?? [])],
    notes: row?.notes ?? '',
    source_url: row?.source_url ?? ''
  })
  open.value = true
}
defineExpose({ edit })

// One editor block per beat of the chosen format; scripts are kept when the format changes.
watch(() => [form.format_id, open.value] as const, () => {
  const chosen = formatOf(form.format_id)
  if (chosen && !beatsMatchFormat(chosen.beats, form.beats)) form.beats = alignBeats(chosen.beats, form.beats)
})

// Draft the beats in place with AI. The person reviews them before saving.
const drafting = ref(false)
const draftProduct = ref<string | undefined>()

async function draftBeats() {
  if (form.beats.some(beat => beat.script.trim()) && !(await confirmDialog({
    title: 'Replace your beats with an AI draft?',
    description: 'The scripts you have written in each beat are replaced. Nothing is saved until you press Save VO.',
    confirmLabel: 'Replace'
  }))) return
  drafting.value = true
  await run(async () => {
    const response = await $fetch('/api/ai/draft', {
      method: 'POST',
      body: {
        type: 'body' as const,
        formatId: form.format_id!,
        angle: angles.value.find(a => a.id === form.angle_id)?.name,
        brief: form.title.trim() ? `Working title: ${form.title.trim()}` : undefined,
        productId: products.value.some(p => p.id === draftProduct.value) ? draftProduct.value : undefined,
        count: 1
      }
    })
    const draft = response.drafts[0]
    if (!draft?.beats) throw new Error('No draft came back. Try again.')
    form.beats = alignBeats(formatOf(form.format_id)?.beats ?? draft.beats.map(beat => beat.beat), draft.beats)
    if (!form.title.trim() && draft.title) form.title = draft.title
  })
  drafting.value = false
}

const usesDog = computed(() => bodyUsesDog(form.beats))

// Length is worked out from the script at the speech pace in Settings → Defaults.
const pace = computed(() => Number(settings.value?.words_per_second) || DEFAULT_WORDS_PER_SECOND)
const script = computed(() => form.beats.map(beat => beat.script).join(' '))
const words = computed(() => countWords(script.value))
const estSeconds = computed(() => estimateSeconds(script.value, pace.value))
const target = computed(() => formatOf(form.format_id)?.target_seconds ?? null)
const canSave = computed(() =>
  form.title.trim() !== '' && !!form.format_id && form.beats.length > 0 && form.beats.every(beat => beat.script.trim() !== '')
  && isValidUrl(form.source_url)
)

async function save() {
  saving.value = true
  const ok = await run(async () => {
    const fields = {
      title: form.title.trim(),
      format_id: form.format_id!,
      angle_id: form.angle_id ?? null,
      beats: form.beats.map(beat => ({ beat: beat.beat, script: beat.script.trim() })),
      est_seconds: estSeconds.value || null,
      tags: form.tags,
      notes: form.notes.trim() || null,
      source_url: normalizeUrl(form.source_url)
    }
    if (form.id) must(await db.from('body_templates').update(fields).eq('id', form.id))
    else must(await db.from('body_templates').insert(fields))
  }, 'VO saved')
  saving.value = false
  if (ok) {
    open.value = false
    emit('saved')
  }
}
</script>

<template>
  <USlideover :open="open" @update:open="requestOpen" :title="form.id ? 'Edit VO' : 'New VO'" :ui="{ content: 'max-w-xl' }">
    <template #body>
      <div class="space-y-5">
        <UFormField label="Title" required>
          <UInput v-model="form.title" class="w-full" />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Format" required>
            <USelect v-model="form.format_id" :items="formatOptions" class="w-full" />
          </UFormField>
          <UFormField label="Angle">
            <USelectMenu v-model="form.angle_id" :items="angleOptions" value-key="value" placeholder="None" class="w-full" />
          </UFormField>
        </div>

        <div class="flex flex-wrap items-center gap-2 rounded-lg bg-elevated/50 p-2">
          <UButton
            label="Draft beats with AI"
            icon="i-lucide-sparkles"
            size="sm"
            color="neutral"
            variant="subtle"
            :loading="drafting"
            :disabled="!form.format_id"
            @click="draftBeats"
          />
          <USelectMenu
            v-model="draftProduct"
            :items="productOptions"
            value-key="value"
            placeholder="For a product (optional)"
            size="sm"
            class="min-w-48 flex-1"
          />
          <p class="w-full text-xs text-muted">
            Uses the format, angle and title above. Review the beats before saving.
          </p>
        </div>

        <UFormField v-for="beat in form.beats" :key="beat.beat" :label="`Beat: ${beat.beat}`" required>
          <template v-if="formatOf(form.format_id)?.beat_descriptions" #help>
            {{ (formatOf(form.format_id)!.beat_descriptions as Record<string, string>)[beat.beat] }}
          </template>
          <ScriptEditor v-model="beat.script" />
        </UFormField>

        <UAlert
          v-if="usesDog"
          color="warning"
          variant="subtle"
          icon="i-lucide-dog"
          title="This VO uses {{dog}}"
          description="VOs are shared by every channel, so write them dog-neutral (“my dog”, “my pup”). With more than one channel on a shoot, {{dog}} shows each channel's phrase."
        />

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Estimated length" :help="`${words} words at ${pace} words per second (Settings → Defaults)`">
            <div class="flex h-8 items-center gap-2">
              <span class="text-lg font-semibold text-highlighted tabular-nums">{{ estSeconds }}s</span>
              <UBadge
                v-if="target && estSeconds"
                :label="estSeconds > target ? `${estSeconds - target}s over the ${target}s target` : `within the ${target}s target`"
                :color="estSeconds > target ? 'warning' : 'success'"
                variant="subtle"
                size="sm"
              />
            </div>
          </UFormField>
          <UFormField label="Tags" help="Pick an existing tag or type a new one">
            <TagInput v-model="form.tags" />
          </UFormField>
        </div>
        <UFormField label="Source" help="Optional link to where this came from: a reference video, a competitor ad, a brief" :error="isValidUrl(form.source_url) ? undefined : 'Enter a valid link'">
          <UInput v-model="form.source_url" type="url" icon="i-lucide-link" placeholder="https://www.tiktok.com/@…" class="w-full" />
        </UFormField>
        <UFormField label="Notes">
          <UTextarea v-model="form.notes" autoresize class="w-full" />
        </UFormField>

        <div class="space-y-2 rounded-lg bg-elevated/50 p-3">
          <p class="text-xs font-medium text-muted uppercase">
            Live preview
          </p>
          <PreviewPicker />
          <p v-for="beat in form.beats" :key="beat.beat" class="text-highlighted">
            <span class="mr-1 text-xs font-medium text-muted uppercase">{{ beat.beat }}</span>
            <ScriptPreview :text="beat.script || '…'" :context="context" />
          </p>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton label="Save VO" :loading="saving" :disabled="!canSave" @click="save" />
    </template>
  </USlideover>
</template>
