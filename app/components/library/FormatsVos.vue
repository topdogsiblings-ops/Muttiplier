<script setup lang="ts">
import type { Row } from '#shared/types/models'

// Formats & VOs: every format is a collapsible panel (collapsed to start) holding the VOs
// written for it. Open a format to see its VOs and add new ones straight into it.
const { angleName, angleOptions, load } = useRefData()
const formatsLib = useLibrary('formats', { text: row => `${row.code} ${row.name} ${row.description ?? ''}` })
const vos = useLibrary('body_templates', {
  usageKind: 'body',
  text: row => `${row.title} ${parseBeats(row.beats).map(beat => beat.script).join(' ')}`
})

const formatEditor = useTemplateRef<{ edit: (row?: Row<'formats'>, duplicate?: boolean) => void }>('formatEditor')
const bodyEditor = useTemplateRef<{ edit: (row?: Partial<Omit<Row<'body_templates'>, 'beats'>> & { beats?: unknown }, duplicate?: boolean) => void }>('bodyEditor')

// --- filters (search, archived and sort come from the toolbar) -----------------
const angle = ref('all')
const tag = ref('all')
const angleFilter = computed(() => [{ label: 'All angles', value: 'all' }, ...angleOptions.value])
const term = computed(() => vos.search.value.trim().toLowerCase())
const filtering = computed(() => !!term.value || angle.value !== 'all' || tag.value !== 'all')

const voSorters: Record<string, (a: Row<'body_templates'>, b: Row<'body_templates'>) => number> = {
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  oldest: (a, b) => a.created_at.localeCompare(b.created_at),
  az: (a, b) => a.title.localeCompare(b.title),
  used: (a, b) => (vos.usage.value[b.id] ?? 0) - (vos.usage.value[a.id] ?? 0)
}
const voText = (row: Row<'body_templates'>) => `${row.title} ${parseBeats(row.beats).map(beat => beat.script).join(' ')}`.toLowerCase()

/** VOs in the current archived view that pass the angle and tag filters, sorted. */
const voPool = computed(() => vos.rows.value
  .filter(row => row.archived === vos.showArchived.value
    && (angle.value === 'all' || row.angle_id === angle.value)
    && (tag.value === 'all' || row.tags.includes(tag.value)))
  .sort(voSorters[vos.sort.value] ?? voSorters.newest))

const formatMatches = (format: Row<'formats'>) =>
  !term.value || `${format.code} ${format.name} ${format.description ?? ''}`.toLowerCase().includes(term.value)

/** A format's VOs: all of them when the search matches the format itself, otherwise the matching ones. */
function vosFor(format: Row<'formats'>) {
  const pool = voPool.value.filter(row => row.format_id === format.id)
  return formatMatches(format) ? pool : pool.filter(row => voText(row).includes(term.value))
}

const sections = computed(() => formatsLib.rows.value
  .filter((format) => {
    const count = vosFor(format).length
    // archived view: archived formats, plus any format holding archived VOs
    if (vos.showArchived.value) return format.archived || count > 0
    if (format.archived) return false
    if (!filtering.value) return true
    return count > 0 || (formatMatches(format) && angle.value === 'all' && tag.value === 'all')
  })
  .sort((a, b) => a.code.localeCompare(b.code))
  .map(format => ({ format, vos: vosFor(format) })))

const pageSections = computed(() => sections.value.slice((vos.page.value - 1) * vos.pageSize, vos.page.value * vos.pageSize))
watch([angle, tag], vos.resetPage)

// --- collapsing: everything starts collapsed; filtering opens the matches ----------
const open = ref<Set<string>>(new Set())
const toggle = (id: string) => {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}
watch(() => [filtering.value, sections.value.map(section => section.format.id).join()] as const, ([isFiltering]) => {
  open.value = isFiltering ? new Set(sections.value.map(section => section.format.id)) : new Set()
})

const loading = computed(() => formatsLib.loading.value || vos.loading.value)

async function setFormatArchived(row: Row<'formats'>, archived: boolean) {
  await formatsLib.setArchived(row, archived)
  await load(true)
}

function addVo(format: Row<'formats'>) {
  bodyEditor.value?.edit({ format_id: format.id })
}
</script>

<template>
  <div class="space-y-4">
    <LibraryToolbar
      v-model:search="vos.search.value"
      v-model:sort="vos.sort.value"
      v-model:show-archived="vos.showArchived.value"
      new-label="New format"
      sortable
      @create="formatEditor?.edit()"
    >
      <USelect v-model="angle" :items="angleFilter" class="w-36" />
      <USelect v-model="tag" :items="tagOptions(vos.rows.value)" class="w-32" />
      <template #actions>
        <LibraryAiDrafts kind="body" @use="bodyEditor?.edit($event)" />
        <UButton label="New VO" icon="i-lucide-plus" color="neutral" variant="subtle" @click="bodyEditor?.edit()" />
      </template>
    </LibraryToolbar>

    <div v-if="loading" class="flex items-center justify-center gap-2 rounded-lg border border-default px-4 py-10 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
      Loading…
    </div>

    <p v-else-if="!sections.length" class="rounded-lg border border-default px-4 py-10 text-center text-sm text-muted">
      {{ filtering || vos.showArchived.value ? 'Nothing matches.' : 'No formats yet. A format defines the beats of a VO.' }}
    </p>

    <div v-else class="space-y-3">
      <section
        v-for="{ format, vos: formatVos } in pageSections"
        :key="format.id"
        class="overflow-hidden rounded-lg border border-default"
      >
        <!-- header: click to open; actions on the right -->
        <div class="flex items-start gap-3 bg-elevated/40 px-4 py-3">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-start gap-3 text-left"
            :aria-expanded="open.has(format.id)"
            @click="toggle(format.id)"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="mt-1 size-4 shrink-0 text-muted transition-transform"
              :class="{ 'rotate-90': open.has(format.id) }"
            />
            <span class="min-w-0 flex-1 space-y-1">
              <span class="block text-highlighted">
                <span class="mr-2 font-mono font-semibold">{{ format.code }}</span>
                <span class="font-medium">{{ format.name }}</span>
                <UBadge v-if="format.archived" label="Archived" color="neutral" variant="subtle" size="sm" class="ml-2" />
              </span>
              <span v-if="format.description" class="block text-sm text-muted">{{ format.description }}</span>
              <span class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>Beats:</span>
                <UBadge v-for="beat in format.beats" :key="beat" :label="beat" color="neutral" variant="subtle" size="sm" />
                <span v-if="format.target_seconds">· {{ format.target_seconds }}s target</span>
              </span>
            </span>
            <UBadge :label="`${formatVos.length} VO${formatVos.length === 1 ? '' : 's'}`" color="neutral" variant="outline" class="shrink-0" />
          </button>
          <div class="flex shrink-0 items-center">
            <UTooltip text="Edit format">
              <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" aria-label="Edit format" @click="formatEditor?.edit(format)" />
            </UTooltip>
            <LibraryRowActions
              noun="format"
              :archived="format.archived"
              duplicable
              @duplicate="formatEditor?.edit(format, true)"
              @archive="setFormatArchived(format, $event)"
            />
          </div>
        </div>

        <!-- the format's VOs -->
        <div v-if="open.has(format.id)" class="border-t border-default">
          <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <span class="text-xs text-muted">
              <SourceLink :url="format.source_url" />
              <CreatedBy :by="format.created_by" :at="format.created_at" class="ml-1" />
            </span>
            <UButton
              v-if="!format.archived"
              :label="`Add VO to ${format.code}`"
              icon="i-lucide-plus"
              size="sm"
              @click="addVo(format)"
            />
          </div>

          <div class="divide-y divide-default border-t border-default">
            <div
              v-for="row in formatVos"
              :key="row.id"
              class="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-elevated/50"
              @click="bodyEditor?.edit(row)"
            >
              <div class="min-w-0 flex-1 space-y-1.5">
                <p class="font-medium text-highlighted">
                  {{ row.title }}
                </p>
                <p v-for="beat in parseBeats(row.beats)" :key="beat.beat" class="text-sm">
                  <span class="mr-1 text-xs font-medium text-muted uppercase">{{ beat.beat }}</span>
                  <ScriptPreview :text="beat.script" />
                </p>
                <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <UBadge v-if="angleName(row.angle_id)" :label="angleName(row.angle_id)!" color="neutral" variant="subtle" size="sm" />
                  <UBadge v-for="t in row.tags" :key="t" :label="t" color="neutral" variant="outline" size="sm" />
                  <span v-if="row.est_seconds">{{ row.est_seconds }}s</span>
                  <span>· {{ vos.usedLabel(row.id) }}</span>
                  <SourceLink :url="row.source_url" />
                  <CreatedBy :by="row.created_by" :at="row.created_at" />
                </div>
              </div>
              <LibraryRowActions
                noun="VO"
                :archived="row.archived"
                duplicable
                @duplicate="bodyEditor?.edit(row, true)"
                @archive="vos.setArchived(row, $event)"
              />
            </div>
            <p v-if="!formatVos.length" class="px-4 py-4 text-sm text-muted">
              {{ vos.showArchived.value ? 'No archived VOs in this format.' : 'No VOs in this format yet.' }}
            </p>
          </div>
        </div>
      </section>
    </div>

    <ListPager v-model:page="vos.page.value" :total="sections.length" :page-size="vos.pageSize" />

    <LibraryFormatEditor ref="formatEditor" @saved="formatsLib.reload()" />
    <LibraryBodyEditor ref="bodyEditor" @saved="vos.reload()" />
  </div>
</template>
