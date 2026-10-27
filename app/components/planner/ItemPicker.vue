<script setup lang="ts">
import type { Row } from '#shared/types/models'

// Searchable multi-select over the Library. Picked items go on the shoot's shared shot list,
// which everyone on the shoot films, except VOs: each is written by one person on the cast
// about a feature of one product, and only they perform it. VOs show when they're about a
// feature of the shoot's product and written by someone on the shoot.
export interface PickedItems {
  hooks: Row<'hook_templates'>[]
  bodies: BodyWithProducts[]
  ctas: Row<'cta_templates'>[]
}
type BodyWithProducts = Row<'body_templates'> & { feature: { name: string, product_id: string } | null }

const props = defineProps<{
  /** template ids already on the structure, so they can't be added twice */
  existing: string[]
  /** opened from a format: only that format's VOs */
  format?: { id: string, code: string, name: string } | null
  /** the shoot's product: VOs for other products are left out */
  productId: string
  /** the shoot's people: VOs written by anyone else are left out */
  peopleIds: string[]
}>()
const emit = defineEmits<{ add: [picked: PickedItems] }>()
const open = defineModel<boolean>('open', { required: true })

const db = useDb()
const run = useAction()
const { formats, people, angleName, angleOptions, productOf } = useRefData()
const personName = (id: string | null) => people.value.find(person => person.id === id)?.name ?? null

const hooks = shallowRef<Row<'hook_templates'>[]>([])
const allBodies = shallowRef<BodyWithProducts[]>([])
const fitsShoot = (row: BodyWithProducts) =>
  !!row.person_id && props.peopleIds.includes(row.person_id) && row.feature?.product_id === props.productId
const bodies = computed(() => allBodies.value.filter(fitsShoot))
/** VOs in this view left out: for another product, by someone not on the shoot, or still needing a feature */
const hiddenBodies = computed(() => allBodies.value.filter(row => !props.format || row.format_id === props.format.id).length
  - bodies.value.filter(row => !props.format || row.format_id === props.format.id).length)
const ctas = shallowRef<Row<'cta_templates'>[]>([])
const loading = ref(false)

const kind = ref<'hook' | 'body' | 'cta'>('hook')
const search = ref('')
const angle = ref('all')
const tag = ref('all')
const selected = ref<Set<string>>(new Set())
const requestOpen = useGuardedClose(open, () => [...selected.value])

watch(open, async (isOpen) => {
  if (!isOpen) return
  selected.value = new Set()
  kind.value = props.format ? 'body' : 'hook'
  search.value = ''
  loading.value = true
  await run(async () => {
    // general hooks and this product's own; hooks written in other shoots stay with them
    hooks.value = must(await db.from('hook_templates').select('*').eq('archived', false).is('shoot_id', null)
      .or(`product_id.is.null,product_id.eq.${props.productId}`).order('created_at', { ascending: false }))
    allBodies.value = must(await db.from('body_templates').select('*, feature:product_features(name, product_id)').eq('archived', false).order('created_at'))
    ctas.value = must(await db.from('cta_templates').select('*').eq('archived', false).order('created_at', { ascending: false }))
  })
  loading.value = false
})

const kinds = computed(() => [
  { label: `Hooks (${hooks.value.length})`, value: 'hook' },
  { label: `VOs (${bodies.value.length})`, value: 'body' },
  { label: `CTAs (${ctas.value.length})`, value: 'cta' }
])
const angleFilter = computed(() => [{ label: 'All angles', value: 'all' }, ...angleOptions.value])
const tags = computed(() => tagOptions([...hooks.value, ...bodies.value, ...ctas.value]))
const formatOf = (id: string) => formats.value.find(format => format.id === id)

interface Option {
  id: string
  title: string | null
  text: string
  badges: string[]
  tags: string[]
  angleId: string | null
}

const options = computed<Option[]>(() => {
  if (kind.value === 'hook') {
    return hooks.value.map(row => ({
      id: row.id,
      title: null,
      text: row.script,
      badges: [
        ...(row.product_id ? [`${productOf(row.product_id)?.name ?? 'This product'} only`] : []),
        ...(angleName(row.angle_id) ? [angleName(row.angle_id)!] : [])
      ],
      tags: row.tags,
      angleId: row.angle_id
    }))
  }
  if (kind.value === 'body') {
    return bodies.value.filter(row => !props.format || row.format_id === props.format.id).map(row => ({
      id: row.id,
      title: row.feature?.name ?? null,
      text: joinBeats(parseBeats(row.beats)),
      badges: [
        formatOf(row.format_id)?.code ?? '?',
        ...(personName(row.person_id) ? [`by ${personName(row.person_id)}`] : []),
        ...(angleName(row.angle_id) ? [angleName(row.angle_id)!] : [])
      ],
      tags: row.tags,
      angleId: row.angle_id
    }))
  }
  return ctas.value.map(row => ({ id: row.id, title: null, text: row.script, badges: [row.mode], tags: row.tags, angleId: null }))
})

const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  return options.value.filter(option =>
    (!term || `${option.title ?? ''} ${option.text}`.toLowerCase().includes(term))
    && (angle.value === 'all' || kind.value === 'cta' || option.angleId === angle.value)
    && (tag.value === 'all' || option.tags.includes(tag.value))
  )
})

/** Already on the shoot for every targeted person. */
const alreadyAdded = (id: string) => props.existing.includes(id)

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function selectAllVisible() {
  const next = new Set(selected.value)
  for (const option of visible.value) if (!alreadyAdded(option.id)) next.add(option.id)
  selected.value = next
}

function add() {
  emit('add', {
    hooks: hooks.value.filter(row => selected.value.has(row.id)),
    bodies: bodies.value.filter(row => selected.value.has(row.id)),
    ctas: ctas.value.filter(row => selected.value.has(row.id))
  })
  open.value = false
}

</script>

<template>
  <UModal
    :open="open"
    @update:open="requestOpen"
    :title="props.format ? `Add ${props.format.code} VOs` : 'Add to the structure'"
    :description="props.format ? `VOs written for ${props.format.name}.` : 'Pick hooks, VOs and CTAs from the Library.'"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-3">
        <UTabs v-if="!props.format" v-model="kind" :items="kinds" :content="false" class="w-full" />
        <div class="flex flex-wrap gap-2">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search scripts" class="min-w-40 flex-1" />
          <USelect v-if="kind !== 'cta'" v-model="angle" :items="angleFilter" class="w-36" />
          <USelect v-model="tag" :items="tags" class="w-32" />
          <UButton label="Select all" color="neutral" variant="subtle" @click="selectAllVisible" />
        </div>

        <div class="max-h-[50vh] divide-y divide-default overflow-y-auto rounded-lg border border-default">
          <label
            v-for="option in visible"
            :key="option.id"
            class="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-elevated/50"
            :class="{ 'cursor-not-allowed opacity-50': alreadyAdded(option.id) }"
          >
            <UCheckbox
              :model-value="selected.has(option.id) || alreadyAdded(option.id)"
              :disabled="alreadyAdded(option.id)"
              class="mt-0.5"
              @update:model-value="toggle(option.id)"
            />
            <div class="min-w-0 flex-1 space-y-1">
              <p v-if="option.title" class="font-medium text-highlighted">
                {{ option.title }}
              </p>
              <p class="text-sm" :class="option.title ? 'line-clamp-2 text-muted' : 'text-highlighted'">
                <ScriptPreview :text="option.text" />
              </p>
              <div class="flex flex-wrap gap-1">
                <UBadge v-for="badge in option.badges" :key="badge" :label="badge" color="neutral" variant="subtle" size="sm" />
                <UBadge v-for="t in option.tags" :key="t" :label="t" color="neutral" variant="outline" size="sm" />
                <UBadge v-if="alreadyAdded(option.id)" label="Already added" color="success" variant="subtle" size="sm" />
              </div>
            </div>
          </label>
          <p v-if="!visible.length" class="px-3 py-8 text-center text-sm text-muted">
            {{ loading ? 'Loading…' : 'Nothing in the Library matches.' }}
          </p>
        </div>
        <p v-if="kind === 'body' && hiddenBodies" class="text-xs text-muted">
          {{ hiddenBodies }} VO{{ hiddenBodies === 1 ? '' : 's' }} not shown: about another product, by someone who isn't on this shoot, or still needing a feature (Library → VOs).
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-3">
        <span class="text-sm text-muted">Everyone on the shoot films every item, except VOs written by one person.</span>
        <UButton
          class="ml-auto"
          :label="`Add ${selected.size} item${selected.size === 1 ? '' : 's'}`"
          :disabled="!selected.size"
          @click="add"
        />
      </div>
    </template>
  </UModal>
</template>
