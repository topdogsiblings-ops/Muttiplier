<script setup lang="ts">
import type { Row } from '#shared/types/models'

const db = useDb()
const run = useAction()
const { angleName, angleOptions } = useRefData()
const { context } = usePreviewContext()
const library = useLibrary('hook_templates', { usageKind: 'hook', text: row => row.script })

const angle = ref('all')
const tag = ref('all')
const angleFilter = computed(() => [{ label: 'All angles', value: 'all' }, ...angleOptions.value])

const visible = computed(() => library.visible(row =>
  (angle.value === 'all' || row.angle_id === angle.value)
  && (tag.value === 'all' || row.tags.includes(tag.value))
))
const pageRows = computed(() => library.paginate(visible.value))
watch([angle, tag], library.resetPage)

// --- editor ----------------------------------------------------------------
const open = ref(false)
const saving = ref(false)
const form = reactive({
  id: '',
  script: '',
  angle_id: undefined as string | undefined,
  est_seconds: undefined as number | undefined,
  tags: [] as string[],
  notes: '',
  source_url: '',
  filming_notes: '',
  caption: ''
})
const requestOpen = useGuardedClose(open, form)

function edit(row?: Partial<Row<'hook_templates'>>, duplicate = false) {
  Object.assign(form, {
    id: duplicate ? '' : row?.id ?? '',
    script: row?.script ?? '',
    angle_id: row?.angle_id ?? undefined,
    est_seconds: row?.est_seconds ?? undefined,
    tags: [...(row?.tags ?? [])],
    notes: row?.notes ?? '',
    source_url: row?.source_url ?? '',
    filming_notes: row?.filming_notes ?? '',
    caption: row?.caption ?? ''
  })
  open.value = true
}

const canSave = computed(() => form.script.trim() !== '' && isValidUrl(form.source_url))

async function save() {
  saving.value = true
  const ok = await run(async () => {
    const fields = {
      script: form.script.trim(),
      angle_id: form.angle_id ?? null,
      est_seconds: form.est_seconds || null,
      tags: form.tags,
      notes: form.notes.trim() || null,
      source_url: normalizeUrl(form.source_url),
      filming_notes: form.filming_notes.trim() || null,
      caption: form.caption.trim() || null
    }
    if (form.id) must(await db.from('hook_templates').update(fields).eq('id', form.id))
    else must(await db.from('hook_templates').insert(fields))
    await library.reload()
  }, 'Hook saved')
  saving.value = false
  if (ok) open.value = false
}
</script>

<template>
  <div class="space-y-4">
    <LibraryToolbar
      v-model:search="library.search.value"
      v-model:sort="library.sort.value"
      v-model:show-archived="library.showArchived.value"
      new-label="New hook"
      sortable
      @create="edit()"
    >
      <USelect v-model="angle" :items="angleFilter" class="w-36" />
      <USelect v-model="tag" :items="tagOptions(library.rows.value)" class="w-32" />
      <template #actions>
        <LibraryAiDrafts kind="hook" @use="edit($event)" />
      </template>
    </LibraryToolbar>

    <div class="divide-y divide-default rounded-lg border border-default">
      <div
        v-for="row in pageRows"
        :key="row.id"
        class="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-elevated/50"
        @click="edit(row)"
      >
        <div class="min-w-0 flex-1 space-y-1.5">
          <p class="text-highlighted">
            <ScriptPreview :text="row.script" />
          </p>
          <p v-if="row.caption" class="flex items-start gap-1 text-sm text-muted">
            <UIcon name="i-lucide-captions" class="mt-0.5 shrink-0" />
            <ScriptPreview :text="row.caption" />
          </p>
          <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <UTooltip v-if="row.filming_notes" :text="row.filming_notes">
              <UBadge label="Filming notes" icon="i-lucide-video" color="neutral" variant="subtle" size="sm" />
            </UTooltip>
            <UBadge v-if="angleName(row.angle_id)" :label="angleName(row.angle_id)!" color="neutral" variant="subtle" size="sm" />
            <UBadge v-for="t in row.tags" :key="t" :label="t" color="neutral" variant="outline" size="sm" />
            <span v-if="row.est_seconds">{{ row.est_seconds }}s</span>
            <span>· {{ library.usedLabel(row.id) }}</span>
            <SourceLink :url="row.source_url" />
            <CreatedBy :by="row.created_by" :at="row.created_at" />          </div>
        </div>
        <LibraryRowActions
          noun="hook"
          :archived="row.archived"
          duplicable
          @duplicate="edit(row, true)"
          @archive="library.setArchived(row, $event)"
        />
      </div>
      <div v-if="library.loading.value" class="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Loading…
      </div>      <p v-else-if="!visible.length" class="px-4 py-10 text-center text-sm text-muted">
        No hooks here yet.
      </p>
    </div>
    <ListPager v-model:page="library.page.value" :total="visible.length" :page-size="library.pageSize" />

    <USlideover :open="open" @update:open="requestOpen" :title="form.id ? 'Edit hook' : 'New hook'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-5">
          <UFormField
            label="Script"
            required
            help="On camera, sync audio. Use {{brand}}, {{product}}, {{dog}} or any custom slot. A line that says {{dog}} is filmed once per channel; one that doesn't is filmed once and used on every channel."
          >
            <ScriptEditor v-model="form.script" placeholder="Nobody told me {{product}} could do this…" />
          </UFormField>

          <UFormField label="Suggested caption" help="The post caption to go with this hook. Slots work here too.">
            <ScriptEditor v-model="form.caption" placeholder="{{dog}} went from chaos to calm in a week 🐾 #dogsoftiktok" />
          </UFormField>

          <UFormField label="How to film it" help="Shown on the shot sheet: framing, action, props, delivery, e.g. “Close-up, start mid-sentence, dog enters frame on ‘this’”">
            <UTextarea v-model="form.filming_notes" autoresize :rows="2" class="w-full" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Angle">
              <USelectMenu v-model="form.angle_id" :items="angleOptions" value-key="value" placeholder="None" class="w-full" />
            </UFormField>
            <UFormField label="Estimated seconds">
              <UInput v-model.number="form.est_seconds" type="number" min="0" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Tags" help="Pick an existing tag or type a new one">
            <TagInput v-model="form.tags" />
          </UFormField>
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
            <p class="text-highlighted">
              <ScriptPreview :text="form.script || '…'" :context="context" />
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton label="Save hook" :loading="saving" :disabled="!canSave" @click="save" />
      </template>
    </USlideover>
  </div>
</template>
