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
  { label: 'Retro look', value: 'retro_look' },
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
  active: true,
  /** a curated combination's parts (treatment ids); empty = a single treatment */
  parts: [] as string[],
  combination: false
})
const requestOpen = useGuardedClose(open, form)

function edit(row?: Row<'treatments'>, combination = false) {
  Object.assign(form, {
    parts: [...(row?.parts ?? [])],
    combination: combination || !!row?.parts?.length,
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
// --- curated combinations ------------------------------------------------------------------
// A combination is two (or more) treatments drawn together, each on its own part of the video:
// e.g. a search bar over the hook, then the VO face to camera. Only combinations set up here
// exist; nothing else combines. At most one part sets how the VO looks (a layout, greenscreen or
// picture-in-picture), and no two parts go on the same part of the video.
const byId = (id: string) => library.rows.value.find(row => row.id === id)
const partOptions = computed(() => library.rows.value
  .filter(row => !row.archived && !row.parts.length && row.id !== form.id)
  .map(row => ({ label: `${row.name} · ${labelOf(PLACEMENTS, row.placement).toLowerCase()}`, value: row.id })))
const looks = (row: Row<'treatments'>) => row.kind === 'layout' || row.kind === 'footage'
const partProblem = computed(() => {
  if (!form.combination) return null
  const parts = form.parts.map(byId).filter((row): row is Row<'treatments'> => !!row)
  if (parts.length < 2) return 'Pick at least two treatments to combine.'
  if (parts.filter(looks).length > 1) return 'Only one part can set how the VO looks (face to camera, over b-roll, greenscreen or picture-in-picture).'
  const overlays = parts.filter(part => !looks(part))
  if (new Set(overlays.map(part => part.placement)).size < overlays.length) return 'Two overlays can\u2019t go on the same part of the video.'
  return null
})
/** what a combination is, from its parts: how it looks if a part sets that, and everything its parts need */
function fromParts() {
  const parts = form.parts.map(byId).filter((row): row is Row<'treatments'> => !!row)
  const look = parts.find(looks)
  return {
    kind: look?.kind ?? 'overlay',
    placement: 'video',
    component: 'combo',
    needs: [...new Set(parts.flatMap(part => part.needs))]
  }
}
const partNames = (row: Row<'treatments'>) => row.parts.map(id => byId(id)?.name ?? 'a removed treatment').join(' + ')

const canSave = computed(() => !!form.name.trim() && !!settings.value && isValidUrl(form.source_url) && !partProblem.value)

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
      ...(form.system ? {} : { kind: form.kind, component: form.component }),
      // a combination is what its parts make it
      ...(form.combination ? { parts: form.parts, ...fromParts() } : { parts: [] })
    }
    if (form.id) must(await db.from('treatments').update(fields).eq('id', form.id))
    else must(await db.from('treatments').insert({ kind: form.kind, component: form.component, ...fields, sort_order: Math.max(0, ...library.rows.value.map(row => row.sort_order)) + 1 }))
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
    >
      <template #actions>
        <UButton label="New combination" icon="i-lucide-layers" color="neutral" variant="subtle" @click="edit(undefined, true)" />
      </template>
    </LibraryToolbar>

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
            <UBadge v-if="row.parts.length" :label="`Combines ${partNames(row)}`" icon="i-lucide-layers" color="secondary" variant="subtle" size="sm" />
          </p>
          <p v-if="row.description" class="text-sm text-muted">
            {{ row.description }}
          </p>
          <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <template v-if="!row.parts.length">
              <UBadge :label="labelOf(KINDS, row.kind)" color="primary" variant="subtle" size="sm" />
              <UBadge :label="labelOf(PLACEMENTS, row.placement)" color="neutral" variant="subtle" size="sm" />
            </template>
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

    <USlideover :open="open" @update:open="requestOpen" :title="form.combination ? (form.id ? 'Edit combination' : 'New combination') : (form.id ? 'Edit treatment' : 'New treatment')" :ui="{ content: 'max-w-xl' }">
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
          <UFormField
            v-if="form.combination"
            label="Combines"
            help="Each part is drawn on its own part of the video. At most one sets how the VO looks; no two overlays on the same part. It applies where every part would."
            :error="partProblem ?? undefined"
          >
            <USelectMenu v-model="form.parts" :items="partOptions" value-key="value" multiple placeholder="Pick the treatments" class="w-full" />
          </UFormField>
          <div v-if="!form.combination" class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Kind">
              <USelect v-model="form.kind" :items="KINDS" class="w-full" :disabled="form.system" />
            </UFormField>
            <UFormField label="Where it goes">
              <USelect v-model="form.placement" :items="PLACEMENTS" class="w-full" />
            </UFormField>
          </div>
          <UFormField v-if="!form.combination" label="What a recipe needs for it" help="A recipe without all of these doesn't get this treatment">
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
          <UFormField v-if="!form.combination" label="Showdog component" help="What Showdog draws it with. A new component has to be built in Showdog first.">
            <USelect v-model="form.component" :items="COMPONENTS" class="w-full" :disabled="form.system" />
          </UFormField>
          <UFormField v-if="!form.combination" label="Settings" help="Passed to the component as they are (JSON), e.g. position or colours" :error="settings ? undefined : 'Enter valid JSON, e.g. {}'">
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
