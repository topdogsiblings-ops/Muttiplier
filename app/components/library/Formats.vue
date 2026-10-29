<script setup lang="ts">
import type { Row } from '#shared/types/models'

// Formats: the structure of a VO (its beats and target length). VOs are written in each shoot;
// each format shows how many are built on it.
const db = useDb()
const run = useAction()
const { load } = useRefData()
const formatsLib = useLibrary('formats', { text: row => `${row.code} ${row.name} ${row.description ?? ''}` })
const formatEditor = useTemplateRef<{ edit: (row?: Row<'formats'>, duplicate?: boolean) => void }>('formatEditor')

// VOs per format (not counting archived ones)
const voCounts = ref<Record<string, number>>({})
async function loadCounts() {
  const rows = must(await db.from('body_templates').select('format_id').eq('archived', false))
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.format_id] = (counts[row.format_id] ?? 0) + 1
  voCounts.value = counts
}
run(loadCounts)

const list = computed(() => formatsLib.visible())
const page = computed(() => formatsLib.paginate(list.value))

async function onSaved() {
  await Promise.all([formatsLib.reload(), load(true)])
}
async function setArchived(row: Row<'formats'>, archived: boolean) {
  await formatsLib.setArchived(row, archived)
  await load(true)
}
</script>

<template>
  <div class="space-y-4">
    <LibraryToolbar
      v-model:search="formatsLib.search.value"
      v-model:sort="formatsLib.sort.value"
      v-model:show-archived="formatsLib.showArchived.value"
      new-label="New format"
      @create="formatEditor?.edit()"
    />

    <div v-if="formatsLib.loading.value" class="flex items-center justify-center gap-2 rounded-lg border border-default px-4 py-10 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
      Loading…
    </div>

    <p v-else-if="!list.length" class="rounded-lg border border-default px-4 py-10 text-center text-sm text-muted">
      {{ formatsLib.search.value || formatsLib.showArchived.value ? 'Nothing matches.' : 'No formats yet. A format defines the beats of a VO.' }}
    </p>

    <div v-else class="divide-y divide-default rounded-lg border border-default">
      <div
        v-for="format in page"
        :key="format.id"
        class="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-elevated/50"
        @click="formatEditor?.edit(format)"
      >
        <div class="min-w-0 flex-1 space-y-1">
          <p class="text-highlighted">
            <span class="mr-2 font-mono font-semibold">{{ format.code }}</span>
            <span class="font-medium">{{ format.name }}</span>
            <UBadge v-if="format.archived" label="Archived" color="neutral" variant="subtle" size="sm" class="ml-2" />
          </p>
          <p v-if="format.description" class="text-sm text-muted">
            {{ format.description }}
          </p>
          <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>Beats:</span>
            <UBadge v-for="beat in format.beats" :key="beat" :label="beat" color="neutral" variant="subtle" size="sm" />
            <span v-if="format.target_seconds">· {{ format.target_seconds }}s target</span>
            <SourceLink :url="format.source_url" />
            <CreatedBy :by="format.created_by" :at="format.created_at" />
          </div>
        </div>
        <UBadge
          :label="`${voCounts[format.id] ?? 0} VO${voCounts[format.id] === 1 ? '' : 's'}`"
          icon="i-lucide-mic"
          color="neutral"
          variant="outline"
          class="shrink-0"
        />
        <LibraryRowActions
          noun="format"
          :archived="format.archived"
          duplicable
          @duplicate="formatEditor?.edit(format, true)"
          @archive="setArchived(format, $event)"
        />
      </div>
    </div>

    <ListPager v-model:page="formatsLib.page.value" :total="list.length" :page-size="formatsLib.pageSize" />

    <LibraryFormatEditor ref="formatEditor" @saved="onSaved" />
  </div>
</template>
