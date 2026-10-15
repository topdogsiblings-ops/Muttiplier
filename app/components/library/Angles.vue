<script setup lang="ts">
import type { Row } from '#shared/types/models'

const db = useDb()
const run = useAction()
const { load } = useRefData()
const library = useLibrary('angles', { text: row => `${row.name} ${row.description ?? ''}` })
library.sort.value = 'az'

const visible = computed(() => library.visible())
const pageRows = computed(() => library.paginate(visible.value))

const open = ref(false)
const saving = ref(false)
const form = reactive({ id: '', name: '', description: '', source_url: '' })

function edit(row?: Row<'angles'>) {
  Object.assign(form, { id: row?.id ?? '', name: row?.name ?? '', description: row?.description ?? '', source_url: row?.source_url ?? '' })
  open.value = true
}

async function save() {
  saving.value = true
  const ok = await run(async () => {
    const fields = { name: form.name.trim(), description: form.description.trim() || null, source_url: normalizeUrl(form.source_url) }
    if (form.id) must(await db.from('angles').update(fields).eq('id', form.id))
    else must(await db.from('angles').insert(fields))
    await Promise.all([library.reload(), load(true)])
  }, 'Angle saved')
  saving.value = false
  if (ok) open.value = false
}

async function setArchived(row: Row<'angles'>, archived: boolean) {
  await library.setArchived(row, archived)
  await load(true)
}
</script>

<template>
  <div class="space-y-4">
    <LibraryToolbar
      v-model:search="library.search.value"
      v-model:sort="library.sort.value"
      v-model:show-archived="library.showArchived.value"
      new-label="New angle"
      @create="edit()"
    />

    <div class="divide-y divide-default rounded-lg border border-default">
      <div
        v-for="row in pageRows"
        :key="row.id"
        class="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-elevated/50"
        @click="edit(row)"
      >
        <div class="min-w-0 flex-1">
          <p class="font-medium text-highlighted">
            {{ row.name }}
          </p>
          <p v-if="row.description" class="text-sm text-muted">
            {{ row.description }}
          </p>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <SourceLink :url="row.source_url" />
            <CreatedBy :by="row.created_by" :at="row.created_at" />
          </div>
        </div>
        <LibraryRowActions noun="angle" :archived="row.archived" @archive="setArchived(row, $event)" />
      </div>
      <div v-if="library.loading.value" class="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Loading…
      </div>      <p v-else-if="!visible.length" class="px-4 py-10 text-center text-sm text-muted">
        No angles here.
      </p>
    </div>
    <ListPager v-model:page="library.page.value" :total="visible.length" :page-size="library.pageSize" />

    <UModal v-model:open="open" :title="form.id ? 'Edit angle' : 'New angle'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required help="Title case, e.g. Before and After">
            <UInput v-model="form.name" class="w-full" autofocus />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="form.description" autoresize class="w-full" />
          </UFormField>
          <UFormField label="Source" help="Optional link to where this came from" :error="isValidUrl(form.source_url) ? undefined : 'Enter a valid link'">
            <UInput v-model="form.source_url" type="url" icon="i-lucide-link" placeholder="https://" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton label="Save angle" :loading="saving" :disabled="!form.name.trim() || !isValidUrl(form.source_url)" @click="save" />
      </template>
    </UModal>
  </div>
</template>
