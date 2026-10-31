<script setup lang="ts">
import type { Row } from '#shared/types/models'
import type { Json } from '#shared/types/database.types'

// Treatments: ways a finished recipe is presented. Every active treatment applies to every recipe
// that has what it needs, and each treated version is its own recipe, alongside the untreated
// one. Muttiplier decides where they apply, the editor prepares any footage they need, and
// Showdog draws them from each recipe's spec. Built-in ones (face to camera, over b-roll) are
// always on: they can't be switched off, archived or deleted.
const db = useDb()
const run = useAction()
const library = useLibrary('treatments', { text: row => `${row.name} ${row.description ?? ''}` })

const KINDS = [
  { label: 'Layout', value: 'layout', description: 'Changes which footage plays' },
  { label: 'Overlay', value: 'overlay', description: 'A layer drawn over the video' },
  { label: 'Footage', value: 'footage', description: 'Needs the editor to prepare clips' }
]
const PLACEMENTS = [
  { label: 'The hook', value: 'hook' },
  { label: 'The whole video', value: 'video' },
  { label: 'The CTA', value: 'cta' }
]
const NEEDS = [
  { label: 'Text written for it', value: 'text', help: 'AI writes it from the script when the batch is built' },
  { label: 'The speaker\'s video', value: 'speaker_video', help: 'Every take is filmed on camera, so every recipe has it' },
  { label: 'Old footage', value: 'old_footage', help: 'Clips filmed before a date, from the footage library' },
  { label: 'The shoot\'s offer', value: 'offer', help: 'Only when the shoot fills {{offer}}' }
]
// the components Showdog draws with (a new one has to be built in Showdog first)
const COMPONENTS = [
  { label: 'Layout (face or b-roll)', value: 'layout' },
  { label: 'Search bar', value: 'search_bar' },
  { label: 'Text thread', value: 'text_thread' },
  { label: 'Then & now labels', value: 'then_now_labels' },
  { label: 'Offer badge', value: 'offer_badge' },
  { label: 'Placed text', value: 'placed_text' },
  { label: 'Greenscreen', value: 'greenscreen' },
  { label: 'Picture-in-picture', value: 'picture_in_picture' }
]
const labelOf = (list: { label: string, value: string }[], value: string) => list.find(entry => entry.value === value)?.label ?? value

// built-in first, then in their own order
const list = computed(() => [...library.visible()].sort((a, b) => Number(b.system) - Number(a.system) || a.sort_order - b.sort_order))
const pageRows = computed(() => library.paginate(list.value))

async function setActive(row: Row<'treatments'>, active: boolean) {
  await run(async () => {
    must(await db.from('treatments').update({ active }).eq('id', row.id))
    row.active = active
  }, active ? `${row.name} is on` : `${row.name} is off`)
}

// --- editor -------------------------------------------------------------------------------
const open = ref(false)
const saving = ref(false)
const form = reactive({
  id: '',
  system: false,
  name: '',
  description: '',
  kind: 'overlay',
  placement: 'hook',
  needs: [] as string[],
  component: 'search_bar',
  settings: '{}',
  source_url: '',
  active: true
})
const requestOpen = useGuardedClose(open, form)

function edit(row?: Row<'treatments'>) {
  Object.assign(form, {
    id: row?.id ?? '',
    system: row?.system ?? false,
    name: row?.name ?? '',
    description: row?.description ?? '',
    kind: row?.kind ?? 'overlay',
    placement: row?.placement ?? 'hook',
    needs: [...(row?.needs ?? [])],
    component: row?.component ?? 'search_bar',
    settings: JSON.stringify(row?.settings ?? {}, null, 2),
    source_url: row?.source_url ?? '',
    active: row?.active ?? true
  })
  open.value = true
}

function toggleNeed(value: string, on: boolean) {
  form.needs = on ? [...new Set([...form.needs, value])] : form.needs.filter(need => need !== value)
}

/** the settings as an object, or null when it isn't valid JSON */
const settings = computed(() => {
  try {
    const parsed = JSON.parse(form.settings || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
})
const canSave = computed(() => !!form.name.trim() && !!settings.value && isValidUrl(form.source_url))

async function save() {
  saving.value = true
  const ok = await run(async () => {
    const fields = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      placement: form.placement,
      needs: form.needs,
      settings: settings.value as Json,
      source_url: normalizeUrl(form.source_url),
      active: form.active,
      // a built-in treatment's kind and component stay as they are
      ...(form.system ? {} : { kind: form.kind, component: form.component })
    }
    if (form.id) must(await db.from('treatments').update(fields).eq('id', form.id))
    else must(await db.from('treatments').insert({ ...fields, kind: form.kind, component: form.component, sort_order: Math.max(0, ...library.rows.value.map(row => row.sort_order)) + 1 }))
    await library.reload()
  }, 'Treatment saved')
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
      new-label="New treatment"
      @create="edit()"
    />

    <p class="text-sm text-muted">
      Every treatment that's on is applied to every recipe that has what it needs, as an extra version alongside the untreated one.
    </p>

    <div class="divide-y divide-default rounded-lg border border-default">
      <div
        v-for="row in pageRows"
        :key="row.id"
        class="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-elevated/50"
        :class="{ 'opacity-60': !row.active }"
        @click="edit(row)"
      >
        <div class="min-w-0 flex-1 space-y-1.5">
          <p class="flex flex-wrap items-center gap-2 font-medium text-highlighted">
            {{ row.name }}
            <UBadge v-if="row.system" label="Built in" icon="i-lucide-lock" color="neutral" variant="outline" size="sm" />
          </p>
          <p v-if="row.description" class="text-sm text-muted">
            {{ row.description }}
          </p>
          <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <UBadge :label="labelOf(KINDS, row.kind)" color="primary" variant="subtle" size="sm" />
            <UBadge :label="labelOf(PLACEMENTS, row.placement)" color="neutral" variant="subtle" size="sm" />
            <UBadge v-for="need in row.needs" :key="need" :label="`Needs ${labelOf(NEEDS, need).toLowerCase()}`" color="neutral" variant="outline" size="sm" />
            <SourceLink :url="row.source_url" />
          </div>
        </div>
        <UBadge v-if="row.system" label="Always on" color="success" variant="subtle" size="sm" class="mt-1" />
        <USwitch
          v-else
          :model-value="row.active"
          :aria-label="row.active ? `Switch ${row.name} off` : `Switch ${row.name} on`"
          class="mt-1"
          @click.stop
          @update:model-value="setActive(row, $event)"
        />
        <LibraryRowActions
          v-if="!row.system"
          noun="treatment"
          :archived="row.archived"
          @archive="library.setArchived(row, $event)"
        />
        <span v-else class="w-8" />
      </div>
      <div v-if="library.loading.value" class="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Loading…
      </div>
      <p v-else-if="!list.length" class="px-4 py-10 text-center text-sm text-muted">
        No treatments here.
      </p>
    </div>
    <ListPager v-model:page="library.page.value" :total="list.length" :page-size="library.pageSize" />

    <USlideover :open="open" @update:open="requestOpen" :title="form.id ? 'Edit treatment' : 'New treatment'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-5">
          <UAlert
            v-if="form.system"
            color="neutral"
            variant="subtle"
            icon="i-lucide-lock"
            description="Built in: it's always on, can't be archived, and its kind and component stay as they are."
          />
          <UFormField label="Name" required>
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField label="Description" help="What it looks like, and when it works best">
            <UTextarea v-model="form.description" autoresize class="w-full" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Kind">
              <USelect v-model="form.kind" :items="KINDS" class="w-full" :disabled="form.system" />
            </UFormField>
            <UFormField label="Where it goes">
              <USelect v-model="form.placement" :items="PLACEMENTS" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="What a recipe needs for it" help="A recipe without all of these doesn't get this treatment">
            <div class="space-y-1.5">
              <UCheckbox
                v-for="need in NEEDS"
                :key="need.value"
                :model-value="form.needs.includes(need.value)"
                :label="need.label"
                :description="need.help"
                @update:model-value="toggleNeed(need.value, $event === true)"
              />
            </div>
          </UFormField>
          <UFormField label="Showdog component" help="What Showdog draws it with. A new component has to be built in Showdog first.">
            <USelect v-model="form.component" :items="COMPONENTS" class="w-full" :disabled="form.system" />
          </UFormField>
          <UFormField label="Settings" help="Passed to the component as they are (JSON), e.g. position or colours" :error="settings ? undefined : 'Enter valid JSON, e.g. {}'">
            <UTextarea v-model="form.settings" autoresize :rows="3" class="w-full font-mono text-xs" />
          </UFormField>
          <UFormField label="Source" help="An example of it in a real ad" :error="isValidUrl(form.source_url) ? undefined : 'Enter a valid link'">
            <UInput v-model="form.source_url" type="url" icon="i-lucide-link" placeholder="https://" class="w-full" />
          </UFormField>
          <USwitch v-if="!form.system" v-model="form.active" label="On: applied to every recipe that has what it needs" />
        </div>
      </template>
      <template #footer>
        <UButton label="Save treatment" :loading="saving" :disabled="!canSave" @click="save" />
      </template>
    </USlideover>
  </div>
</template>
