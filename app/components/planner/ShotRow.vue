<script setup lang="ts">
import type { LoadedShoot } from '#shared/utils/loadShoot'
import type { BundleItem, ShotGroup } from '#shared/utils/shootsheet'
import type { Beat } from '#shared/utils/slots'

// One entry on the shared shot list: a hook, VO or CTA that everyone on the shoot films.
// Code, channel and location are shared; each person can still have their own reworded
// version (per-person override) and their own filmed/skipped status.
const props = defineProps<{
  group: ShotGroup
  bundle: LoadedShoot
  draft: boolean
  split: boolean
  productId: string
}>()
const emit = defineEmits<{
  updateGroup: [patch: { channel_id?: string | null, location?: string | null }]
  remove: []
  updateItem: [item: BundleItem, patch: { channel_id?: string | null, location?: string | null, script_override?: string | Beat[] | null }]
}>()

const primary = computed(() => props.group.items[0]!)
const context = computed(() => itemSlotContext(props.bundle, primary.value.channel_id))
const beats = computed(() => primary.value.kind === 'body' ? parseBeats(primary.value.script_snapshot) : [])
const text = computed(() => typeof primary.value.script_snapshot === 'string' ? primary.value.script_snapshot : '')

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

const channelOptions = computed(() => props.bundle.channels.map(channel => ({ label: channel.name, value: channel.id })))
const canReassign = computed(() => props.group.kind === 'hook' && props.split && props.draft)

const expanded = ref(false)

const location = ref(primary.value.location ?? '')
watch(() => primary.value.location, value => location.value = value ?? '')
function saveLocation() {
  const value = location.value.trim() || null
  if (value !== primary.value.location) emit('updateGroup', { location: value })
}

function onDragStart(event: DragEvent) {
  event.dataTransfer?.setData('text/plain', props.group.key)
}
</script>

<template>
  <div class="px-3 py-2.5" :class="{ 'cursor-grab': canReassign }" :draggable="canReassign" @dragstart="onDragStart">
    <div class="flex items-start gap-3">
      <UBadge
        :label="group.code"
        :color="primary.universal ? 'primary' : 'neutral'"
        variant="subtle"
        class="mt-0.5 shrink-0 font-mono"
      />

      <div class="min-w-0 flex-1 space-y-1.5">
        <p v-if="primary.title" class="text-sm font-medium text-highlighted">
          {{ primary.title }}
        </p>
        <template v-if="group.kind === 'body'">
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
          <UBadge v-if="primary.universal" label="universal" color="primary" variant="outline" size="sm" />
          <UBadge v-if="primary.angle" :label="primary.angle" color="neutral" variant="subtle" size="sm" />
          <UBadge v-if="primary.format" :label="primary.format.code" color="info" variant="subtle" size="sm" />
          <UBadge v-if="writer" :label="`${writer}'s own`" icon="i-lucide-user" color="primary" variant="subtle" size="sm" />
          <UBadge v-if="primary.cta_mode" :label="primary.cta_mode" color="info" variant="subtle" size="sm" />
          <UBadge
            v-if="unfilled.length"
            :label="`unfilled: ${unfilled.join(', ')}`"
            color="error"
            variant="subtle"
            size="sm"
            icon="i-lucide-circle-alert"
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
        <USelect
          v-if="canReassign"
          :model-value="primary.channel_id ?? undefined"
          :items="channelOptions"
          size="xs"
          placeholder="Channel"
          class="w-32"
          @update:model-value="emit('updateGroup', { channel_id: $event })"
        />
        <UButton
          :label="overrides ? `${overrides} own version${overrides === 1 ? '' : 's'}` : 'Per person'"
          :icon="expanded ? 'i-lucide-chevron-up' : 'i-lucide-users'"
          size="xs"
          color="neutral"
          :variant="overrides ? 'soft' : 'ghost'"
          @click="expanded = !expanded"
        />
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
          Everyone films this. Edit someone's line to give them their own wording.
        </template>
      </p>
      <PlannerItemRow
        v-for="item in group.items"
        :key="item.id"
        :item="item"
        :person-name="personName(item.person_id)"
        :context="itemSlotContext(bundle, item.channel_id)"
        :channels="bundle.channels"
        :draft="draft"
        :split="split"
        :product-id="productId"
        @update="emit('updateItem', item, $event)"
      />
    </div>
  </div>
</template>
