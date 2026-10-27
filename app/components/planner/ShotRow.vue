<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { LoadedShoot } from '#shared/utils/loadShoot'
import type { BundleItem, ShotGroup } from '#shared/utils/shootsheet'
import type { Beat } from '#shared/utils/slots'

// One entry on the shared shot list: a hook, VO or CTA that everyone on the shoot films.
// Code, channel and location are shared; each person can still have their own reworded
// version (per-person override) and their own filmed/skipped status. "Edit for everyone"
// rewrites the shoot's own copy of the line (every person's snapshot): this shoot only, never
// the library, and own versions stay on top of it. "Permanently" (hooks and CTAs) edits the
// Library template itself, for later shoots, and updates this shoot's copy to match.
const props = defineProps<{
  group: ShotGroup
  bundle: LoadedShoot
  draft: boolean
  productId: string
}>()
const emit = defineEmits<{
  updateGroup: [patch: { channel_id?: string | null, location?: string | null, script_snapshot?: string | Beat[] }]
  remove: []
  updateItem: [item: BundleItem, patch: { channel_id?: string | null, location?: string | null, script_override?: string | Beat[] | null, script_snapshot?: string | Beat[] }]
}>()

const primary = computed(() => props.group.items[0]!)
// one line for every channel it's filmed for: {{dog}} reads "my Vizsla / our two dogs", and on a
// planned shoot (dog phrases already filled in) the channels' versions are merged the same way
const context = computed(() => groupSlotContext(props.bundle, props.group.items.map(item => item.channel_id)))
const beats = computed(() => {
  if (primary.value.kind !== 'body') return []
  const versions = props.group.items.map(item => parseBeats(item.script_snapshot))
  return versions[0]!.map((beat, index) => ({ beat: beat.beat, script: mergeVariants(versions.map(version => version[index]?.script ?? '')) }))
})
const text = computed(() => mergeVariants(props.group.items.map(item => typeof item.script_snapshot === 'string' ? item.script_snapshot : '')))

const personName = (id: string) => props.bundle.people.find(person => person.id === id)?.name ?? 'Unknown'
/** a VO one person on the cast wrote for themselves: only they perform it */
const writer = computed(() => primary.value.writer_id ? personName(primary.value.writer_id) : null)
const overrides = computed(() => props.group.items.filter(item => item.script_override !== null && item.script_override !== undefined).length)
const done = computed(() => props.group.items.filter(item => item.status !== 'planned').length)
const unfilled = computed(() => {
  const slots = new Set<string>()
  for (const item of props.group.items) for (const slot of resolveItemScript(props.bundle, item).unfilled) slots.add(slot)
  return [...slots]
})

const channelName = (id: string | null) => props.bundle.channels.find(channel => channel.id === id)?.name ?? 'no channel'

const expanded = ref(false)

const location = ref(primary.value.location ?? '')
watch(() => primary.value.location, value => location.value = value ?? '')
function saveLocation() {
  const value = location.value.trim() || null
  if (value !== primary.value.location) emit('updateGroup', { location: value })
}

// --- edit for everyone (this shoot only) -----------------------------------------
const editingAll = ref(false)
const allText = ref('')
const allBeats = ref<Beat[]>([])

function startEditAll() {
  allText.value = text.value
  allBeats.value = beats.value.map(beat => ({ ...beat }))
  editingLibrary.value = false
  editingAll.value = true
}

const canSaveAll = computed(() => primary.value.kind === 'body'
  ? allBeats.value.every(beat => beat.script.trim())
  : !!allText.value.trim())

function saveAll() {
  emit('updateGroup', {
    script_snapshot: primary.value.kind === 'body'
      ? allBeats.value.map(beat => ({ beat: beat.beat, script: beat.script.trim() }))
      : allText.value.trim()
  })
  editingAll.value = false
}

// --- permanently: the Library template (hooks and CTAs) ------------------------
const db = useDb()
const run = useAction()
const editingLibrary = ref(false)
const libraryText = ref('')
const loadingLibrary = ref(false)
const libraryTable = computed(() => primary.value.kind === 'hook' ? 'hook_templates' as const : 'cta_templates' as const)

async function startEditLibrary() {
  loadingLibrary.value = true
  await run(async () => {
    if (libraryTable.value === 'hook_templates') {
      const row = mustOne(await db.from('hook_templates').select('script').eq('id', primary.value.template_id).single())
      libraryText.value = row.script
    } else {
      const row = mustOne(await db.from('cta_templates').select('script').eq('id', primary.value.template_id).single())
      libraryText.value = row.script
    }
    editingAll.value = false
    editingLibrary.value = true
  })
  loadingLibrary.value = false
}

const canSaveLibrary = computed(() => !!libraryText.value.trim())

const savingLibrary = ref(false)
async function saveLibrary() {
  const script = libraryText.value.trim()
  savingLibrary.value = true
  const ok = await run(async () => {
    must(await db.from(libraryTable.value).update({ script }).eq('id', primary.value.template_id))
  }, 'Saved to the Library')
  savingLibrary.value = false
  if (!ok) return
  // this shoot follows: a draft keeps the slots, a planned shoot's copy is frozen with them filled
  if (props.draft) emit('updateGroup', { script_snapshot: script })
  else for (const item of props.group.items) emit('updateItem', item, { script_snapshot: renderScript(script, itemSlotContext(props.bundle, item.channel_id)).text })
  editingLibrary.value = false
}

// --- a hook written in this shoot: keep it for the product ----------------------
const savingToProduct = ref(false)
async function saveToProduct() {
  // on a draft, the shoot's copy is the latest wording (slots unfilled); a planned shoot's copy is
  // frozen with slots filled in, so the hook keeps the wording it was written with
  const script = props.draft && typeof primary.value.script_snapshot === 'string' ? primary.value.script_snapshot : null
  savingToProduct.value = true
  const ok = await run(async () => {
    must(await db.from('hook_templates')
      .update({ shoot_id: null, product_id: props.productId, ...(script ? { script } : {}) })
      .eq('id', primary.value.template_id))
    for (const item of props.group.items) item.hook_home = 'product'
  }, `Saved to ${props.bundle.product.name}: it's in the Library for its later shoots`)
  savingToProduct.value = false
  return ok
}

/** One Edit button: change the line for everyone here, permanently in the Library, or per person. */
const editItems = computed<DropdownMenuItem[]>(() => [
  ...(primary.value.hook_home === 'shoot'
    ? [{ label: `Save to ${props.bundle.product.name}`, description: 'Keep it in the Library for this product\'s later shoots', icon: 'i-lucide-bookmark-plus', onSelect: saveToProduct }]
    : []),
  { label: 'For everyone', icon: 'i-lucide-pencil', onSelect: startEditAll },
  {
    label: expanded.value ? 'Hide per person' : 'Per person',
    icon: 'i-lucide-users',
    suffix: overrides.value ? `${overrides.value} own` : undefined,
    onSelect: () => (expanded.value = !expanded.value)
  },
  ...(primary.value.kind === 'body'
  ? []
  : [{ label: 'Permanently', description: 'In the Library, for later shoots', icon: 'i-lucide-book-marked', onSelect: startEditLibrary }])
])

</script>

<template>
  <div class="px-3 py-2.5">
    <div class="flex items-start gap-3">
      <UBadge
        :label="group.code"
        color="neutral"
        variant="subtle"
        class="mt-0.5 shrink-0 font-mono"
      />

      <div class="min-w-0 flex-1 space-y-1.5">
        <p v-if="primary.title" class="text-sm font-medium text-highlighted">
          {{ primary.title }}
        </p>
        <!-- permanently: the Library template, and this shoot with it -->
        <div v-if="editingLibrary" class="space-y-2 rounded-lg border border-primary/40 p-2.5">
          <ScriptEditor v-model="libraryText" />
          <p class="text-xs text-muted">
            Changes the {{ primary.kind === 'hook' ? 'hook' : 'CTA' }} in the Library for every later shoot, and this shoot's line for everyone.
            Other shoots keep their own copy.<template v-if="overrides">
              {{ overrides }} own version{{ overrides === 1 ? '' : 's' }} here stay{{ overrides === 1 ? 's' : '' }} as {{ overrides === 1 ? 'it is' : 'they are' }}.
            </template>
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton label="Save to Library" icon="i-lucide-book-marked" size="xs" :disabled="!canSaveLibrary" :loading="savingLibrary" @click="saveLibrary" />
            <UButton label="Cancel" size="xs" color="neutral" variant="ghost" @click="editingLibrary = false" />
          </div>
        </div>
        <!-- edit for everyone: this shoot's copy only -->
        <div v-else-if="editingAll" class="space-y-2 rounded-lg border border-default p-2.5">
          <template v-if="group.kind === 'body'">
            <UFormField v-for="beat in allBeats" :key="beat.beat" :label="beat.beat" size="xs">
              <ScriptEditor v-model="beat.script" />
            </UFormField>
          </template>
          <ScriptEditor v-else v-model="allText" />
          <p class="text-xs text-muted">
            Changes this line for everyone on this shoot only; the library isn't touched.<template v-if="overrides">
              {{ overrides }} own version{{ overrides === 1 ? '' : 's' }} stay{{ overrides === 1 ? 's' : '' }} as {{ overrides === 1 ? 'it is' : 'they are' }}.
            </template>
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton label="Save for everyone" size="xs" :disabled="!canSaveAll" @click="saveAll" />
            <UButton label="Cancel" size="xs" color="neutral" variant="ghost" @click="editingAll = false" />
          </div>
        </div>
        <template v-else-if="group.kind === 'body'">
          <p v-for="beat in beats" :key="beat.beat" class="text-sm text-highlighted">
            <span class="mr-1 text-xs font-medium text-muted uppercase">{{ beat.beat }}</span>
            <ScriptPreview :text="beat.script" :context="context" />
          </p>
        </template>
        <p v-else class="text-sm text-highlighted">
          <ScriptPreview :text="text" :context="context" />
        </p>
        <p v-if="primary.filming_notes" class="flex items-start gap-1 text-xs text-muted">
          <UIcon name="i-lucide-video" class="mt-0.5 shrink-0" />{{ primary.filming_notes }}
        </p>
        <p v-if="primary.caption" class="flex items-start gap-1 text-xs text-muted">
          <UIcon name="i-lucide-captions" class="mt-0.5 shrink-0" />
          <ScriptPreview :text="primary.caption" :context="context" />
        </p>

        <div class="flex flex-wrap items-center gap-1.5">
          <UBadge v-if="primary.hook_home === 'shoot'" label="Written here" icon="i-lucide-pen-line" color="warning" variant="subtle" size="sm" />
          <UBadge v-else-if="primary.hook_home === 'product'" :label="`${bundle.product.name} hook`" icon="i-lucide-package" color="primary" variant="subtle" size="sm" />
          <UBadge v-if="primary.angle" :label="primary.angle" color="neutral" variant="subtle" size="sm" />
          <UBadge v-if="primary.format" :label="primary.format.code" color="info" variant="subtle" size="sm" />
          <UBadge v-if="writer" :label="`${writer}'s own`" icon="i-lucide-user" color="primary" variant="subtle" size="sm" />
          <UBadge v-if="primary.cta_mode" :label="primary.cta_mode" color="info" variant="subtle" size="sm" />
          <SourceLink :url="primary.source_url ?? null" />
          <UBadge
            v-if="unfilled.length"
            :label="`unfilled: ${unfilled.join(', ')}`"
            color="error"
            variant="subtle"
            size="sm"
            icon="i-lucide-circle-alert"
          />
          <UBadge
            v-if="overrides"
            :label="`${overrides} own version${overrides === 1 ? '' : 's'}`"
            icon="i-lucide-users"
            color="secondary"
            variant="subtle"
            size="sm"
            class="cursor-pointer"
            @click="expanded = !expanded"
          />
          <UBadge v-if="done" :label="`${done}/${group.items.length} filmed or skipped`" color="success" variant="subtle" size="sm" />
          <UInput
            v-model="location"
            size="xs"
            variant="ghost"
            icon="i-lucide-map-pin"
            placeholder="Location"
            class="w-36"
            @blur="saveLocation"
            @keydown.enter="saveLocation"
          />
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <UDropdownMenu v-if="!editingAll && !editingLibrary" :items="editItems" :content="{ align: 'end' }">
          <UButton
            :loading="loadingLibrary || savingToProduct"
            icon="i-lucide-pencil"
            trailing-icon="i-lucide-chevron-down"
            size="xs"
            color="neutral"
            :variant="overrides || expanded ? 'soft' : 'ghost'"
            aria-label="Edit this line: for everyone or per person"
          >
            <span class="hidden sm:inline">Edit</span>
          </UButton>
        </UDropdownMenu>
        <UButton
          v-if="draft"
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="ghost"
          aria-label="Remove from the structure"
          @click="emit('remove')"
        />
      </div>
    </div>

    <div v-if="expanded" class="mt-2 divide-y divide-default rounded-lg border border-default sm:ml-12">
      <p class="px-3 py-1.5 text-xs text-muted">
        <template v-if="writer">
          Only {{ writer }} performs this: they wrote it.
        </template>
        <template v-else>
          Everyone films this, once per channel they're on. Edit someone's line to give them their own wording.
        </template>
      </p>
      <PlannerItemRow
        v-for="item in group.items"
        :key="item.id"
        :item="item"
        :person-name="`${personName(item.person_id)} · ${channelName(item.channel_id)}`"
        :context="itemSlotContext(bundle, item.channel_id)"
        :draft="draft"
        :product-id="productId"
        @update="emit('updateItem', item, $event)"
      />
    </div>
  </div>
</template>
