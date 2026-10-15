<script setup lang="ts">
import type { Row } from '#shared/types/models'

const db = useDb()
const run = useAction()
const { context } = usePreviewContext()
const library = useLibrary('cta_templates', { usageKind: 'cta', text: row => row.script })

const mode = ref('all')
const tag = ref('all')
const modes = [{ label: 'Sync (on camera)', value: 'sync' }, { label: 'VO over b-roll', value: 'vo' }]
const modeFilter = [{ label: 'All modes', value: 'all' }, ...modes]

const visible = computed(() => library.visible(row =>
  (mode.value === 'all' || row.mode === mode.value)
  && (tag.value === 'all' || row.tags.includes(tag.value))
))
const pageRows = computed(() => library.paginate(visible.value))
watch([mode, tag], library.resetPage)

const open = ref(false)
const saving = ref(false)
const form = reactive({
  id: '',
  script: '',
  mode: 'sync',
  est_seconds: undefined as number | undefined,
  tags: [] as string[],
  notes: '',
  source_url: ''
})

function edit(row?: Partial<Row<'cta_templates'>>, duplicate = false) {
  Object.assign(form, {
    id: duplicate ? '' : row?.id ?? '',
    script: row?.script ?? '',
    mode: row?.mode ?? 'sync',
    est_seconds: row?.est_seconds ?? undefined,
    tags: [...(row?.tags ?? [])],
    notes: row?.notes ?? '',
    source_url: row?.source_url ?? ''
  })
  open.value = true
}

async function save() {
  saving.value = true
  const ok = await run(async () => {
    const fields = {
      script: form.script.trim(),
      mode: form.mode,
      est_seconds: form.est_seconds || null,
      tags: form.tags,
      notes: form.notes.trim() || null,
      source_url: normalizeUrl(form.source_url)
    }
    if (form.id) must(await db.from('cta_templates').update(fields).eq('id', form.id))
    else must(await db.from('cta_templates').insert(fields))
    await library.reload()
  }, 'CTA saved')
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
      new-label="New CTA"
      sortable
      @create="edit()"
    >
      <USelect v-model="mode" :items="modeFilter" class="w-44" />
      <USelect v-model="tag" :items="tagOptions(library.rows.value)" class="w-32" />
      <template #actions>
        <LibraryAiDrafts kind="cta" @use="edit($event)" />
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
          <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <UBadge :label="row.mode === 'sync' ? 'Sync' : 'VO'" :color="row.mode === 'sync' ? 'info' : 'secondary'" variant="subtle" size="sm" />
            <UBadge v-for="t in row.tags" :key="t" :label="t" color="neutral" variant="outline" size="sm" />
            <span v-if="row.est_seconds">{{ row.est_seconds }}s</span>
            <span>· {{ library.usedLabel(row.id) }}</span>
            <SourceLink :url="row.source_url" />
            <CreatedBy :by="row.created_by" :at="row.created_at" />          </div>
        </div>
        <LibraryRowActions
          noun="CTA"
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
        No CTAs here yet.
      </p>
    </div>
    <ListPager v-model:page="library.page.value" :total="visible.length" :page-size="library.pageSize" />

    <USlideover v-model:open="open" :title="form.id ? 'Edit CTA' : 'New CTA'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-5">
          <UFormField label="Script" required>
            <ScriptEditor v-model="form.script" placeholder="Tap the link and try {{product}} today" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Mode" help="Sync is said on camera; VO is recorded as voiceover over b-roll. Any CTA can follow any VO.">
              <USelect v-model="form.mode" :items="modes" class="w-full" />
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
        <UButton label="Save CTA" :loading="saving" :disabled="!form.script.trim() || !isValidUrl(form.source_url)" @click="save" />
      </template>
    </USlideover>
  </div>
</template>
