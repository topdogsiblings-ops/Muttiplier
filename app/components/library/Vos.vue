<script setup lang="ts">
import type { Row } from '#shared/types/models'
import type { BodyRow } from './BodyEditor.vue'

// VOs: the voiceover scripts between the hook and the CTA. Each is written by one person on the
// cast about one core feature of one product, so they're listed by brand and product, each
// shown as its feature and script. Every VO is built on a format (its beats).
const route = useRoute()
const { angleName, angleOptions, formats, people, products, productOptions, featureOf, load } = useRefData()
await load()

const personName = (id: string | null) => people.value.find(person => person.id === id)?.name ?? null
const formatOf = (id: string) => formats.value.find(format => format.id === id)
const productIdOf = (row: Row<'body_templates'>) => featureOf(row.feature_id)?.product_id ?? null
const script = (row: Row<'body_templates'>) => parseBeats(row.beats).map(beat => beat.script).join(' ')

const vos = useLibrary('body_templates', {
  usageKind: 'body',
  text: row => `${featureOf(row.feature_id)?.name ?? ''} ${personName(row.person_id) ?? ''} ${script(row)}`
})
const bodyEditor = useTemplateRef<{ edit: (row?: BodyRow, duplicate?: boolean) => void }>('bodyEditor')
const toEditor = (row: Row<'body_templates'>): BodyRow => ({ ...row, product_id: productIdOf(row) ?? undefined })

// --- filters (search, archived and sort come from the toolbar) -------------------
// a format's VO count on the Formats tab links here with ?format=
const format = ref(typeof route.query.format === 'string' ? route.query.format : 'all')
watch(() => route.query.format, (id) => {
  format.value = typeof id === 'string' ? id : 'all'
})
const product = ref('all')
const writer = ref('all')
const angle = ref('all')
const tag = ref('all')

const formatFilter = computed(() => [
  { label: 'All formats', value: 'all' },
  ...formats.value.filter(f => !f.archived || f.id === format.value).map(f => ({ label: `${f.code} — ${f.name}`, value: f.id }))
])
const productFilter = computed(() => [{ label: 'All products', value: 'all' }, ...productOptions.value, { label: 'Needs a feature', value: 'none' }])
const writerFilter = computed(() => [
  { label: 'Everyone', value: 'all' },
  ...people.value.filter(person => person.active).map(person => ({ label: person.name, value: person.id }))
])
const angleFilter = computed(() => [{ label: 'All angles', value: 'all' }, ...angleOptions.value])

const list = computed(() => vos.visible(row =>
  (format.value === 'all' || row.format_id === format.value)
  && (product.value === 'all' || (productIdOf(row) ?? 'none') === product.value)
  && (writer.value === 'all' || row.person_id === writer.value)
  && (angle.value === 'all' || row.angle_id === angle.value)
  && (tag.value === 'all' || row.tags.includes(tag.value))
))

// grouped by brand and product (in that order), VOs still needing a feature last; no paging:
// the groups start collapsed
const groupOrder = (productId: string | null) => {
  const found = products.value.find(p => p.id === productId)
  return found ? `0 ${found.brand.name} ${found.name}`.toLowerCase() : '1'
}
const sorted = computed(() => [...list.value].sort((a, b) => groupOrder(productIdOf(a)).localeCompare(groupOrder(productIdOf(b)))))
const groups = computed(() => {
  const byProduct = new Map<string, Row<'body_templates'>[]>()
  for (const row of sorted.value) {
    const key = productIdOf(row) ?? 'none'
    byProduct.set(key, [...(byProduct.get(key) ?? []), row])
  }
  return [...byProduct].map(([id, rows]) => {
    const found = products.value.find(p => p.id === id)
    return { id, brand: found?.brand.name ?? null, brandId: found?.brand_id ?? null, product: found?.name ?? null, rows }
  })
})

// --- collapsing: every product starts collapsed; filtering opens the matches -------------
const filtering = computed(() => [format, product, writer, angle, tag].some(filter => filter.value !== 'all'))
const open = ref<Set<string>>(new Set())
const toggle = (id: string) => {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}
watch(() => [filtering.value, groups.value.map(group => group.id).join()] as const, ([isFiltering]) => {
  open.value = isFiltering ? new Set(groups.value.map(group => group.id)) : new Set()
}, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <LibraryToolbar
      v-model:search="vos.search.value"
      v-model:sort="vos.sort.value"
      v-model:show-archived="vos.showArchived.value"
      new-label="New VO"
      sortable
      :searchable="false"
      @create="bodyEditor?.edit({ format_id: format === 'all' ? undefined : format, product_id: ['all', 'none'].includes(product) ? undefined : product })"
    >
      <USelect v-model="product" :items="productFilter" class="w-48" />
      <USelect v-model="format" :items="formatFilter" class="w-40" />
      <USelect v-model="writer" :items="writerFilter" class="w-32" />
      <USelect v-model="angle" :items="angleFilter" class="w-36" />
      <USelect v-model="tag" :items="tagOptions(vos.rows.value)" class="w-32" />
      <template #actions>
        <LibraryAiDrafts kind="body" @use="bodyEditor?.edit($event)" />
      </template>
    </LibraryToolbar>

    <div v-if="vos.loading.value" class="flex items-center justify-center gap-2 rounded-lg border border-default px-4 py-10 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
      Loading…
    </div>

    <p v-else-if="!list.length" class="rounded-lg border border-default px-4 py-10 text-center text-sm text-muted">
      {{ vos.rows.value.length ? 'Nothing matches.' : 'No VOs yet. Add core features to a product on its brand page, then write a VO about one.' }}
    </p>

    <div v-else class="space-y-4">
      <section v-for="group in groups" :key="group.id" class="overflow-hidden rounded-lg border border-default">
        <div
          role="button"
          tabindex="0"
          :aria-expanded="open.has(group.id)"
          class="flex cursor-pointer flex-wrap items-center gap-2 bg-elevated/40 px-4 py-2.5 hover:bg-elevated/70"
          @click="toggle(group.id)"
          @keydown.enter.prevent="toggle(group.id)"
          @keydown.space.prevent="toggle(group.id)"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 shrink-0 text-muted transition-transform"
            :class="{ 'rotate-90': open.has(group.id) }"
          />
          <template v-if="group.product">
            <UIcon name="i-lucide-package" class="size-4 text-muted" />
            <NuxtLink :to="`/brands/${group.brandId}`" class="text-sm text-muted hover:text-default" @click.stop>
              {{ group.brand }}
            </NuxtLink>
            <UIcon name="i-lucide-chevron-right" class="size-3.5 text-dimmed" />
            <span class="font-medium text-highlighted">{{ group.product }}</span>
          </template>
          <template v-else>
            <UIcon name="i-lucide-circle-alert" class="size-4 text-warning" />
            <span class="font-medium text-highlighted">Needs a product and feature</span>
            <span class="text-xs text-muted">Written before features. Open one to pick its feature; until then it can't go on a shoot.</span>
          </template>
          <UBadge :label="`${group.rows.length}`" color="neutral" variant="outline" size="sm" class="ml-auto" />
        </div>

        <div v-if="open.has(group.id)" class="divide-y divide-default border-t border-default">
          <div
            v-for="row in group.rows"
            :key="row.id"
            class="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-elevated/50"
            @click="bodyEditor?.edit(toEditor(row))"
          >
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <UBadge
                  :label="featureOf(row.feature_id)?.name ?? 'No feature'"
                  icon="i-lucide-sparkle"
                  :color="row.feature_id ? 'info' : 'warning'"
                  variant="subtle"
                />
                <UBadge
                  :label="personName(row.person_id) ?? 'No writer'"
                  icon="i-lucide-user"
                  :color="row.person_id ? 'primary' : 'warning'"
                  variant="subtle"
                />
                <UBadge v-if="formatOf(row.format_id)" :label="`${formatOf(row.format_id)!.code} ${formatOf(row.format_id)!.name}`" icon="i-lucide-layout-template" color="neutral" variant="outline" />
                <UBadge v-if="row.archived" label="Archived" color="neutral" variant="subtle" />
              </div>
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
              @duplicate="bodyEditor?.edit(toEditor(row), true)"
              @archive="vos.setArchived(row, $event)"
            />
          </div>
        </div>
      </section>
    </div>

    <LibraryBodyEditor ref="bodyEditor" @saved="vos.reload()" />
  </div>
</template>
