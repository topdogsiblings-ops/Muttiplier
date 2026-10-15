<script setup lang="ts">
import type { BundleItem } from '#shared/utils/shootsheet'
import type { Beat, SlotContext } from '#shared/utils/slots'

// One thing to film or record: rendered script, per-person override editor, channel and location.
const props = defineProps<{
  item: BundleItem
  context: SlotContext
  channels: { id: string, name: string }[]
  /** shoot is a draft: structure can still change */
  draft: boolean
  /** hooks are split across channels */
  split: boolean
  productId: string
  /** per-person line under a shot-list item: shows the person, hides what's shared by everyone */
  personName?: string
}>()
const emit = defineEmits<{
  update: [patch: { channel_id?: string | null, location?: string | null, script_override?: string | Beat[] | null }]
  remove: []
}>()

const run = useAction()

const overridden = computed(() => props.item.script_override !== null && props.item.script_override !== undefined)
const source = computed(() => overridden.value ? props.item.script_override : props.item.script_snapshot)
const beats = computed(() => props.item.kind === 'body' ? parseBeats(source.value) : [])
const text = computed(() => typeof source.value === 'string' ? source.value : '')

const unfilled = computed(() => props.item.kind === 'body'
  ? renderBeats(beats.value, props.context).unfilled
  : renderScript(text.value, props.context).unfilled)

const channelOptions = computed(() => props.channels.map(channel => ({ label: channel.name, value: channel.id })))
const compact = computed(() => !!props.personName)
const canReassign = computed(() => props.item.kind === 'hook' && props.split && props.draft && !compact.value)

// --- override editor -------------------------------------------------------
const editing = ref(false)
const draftText = ref('')
const draftBeats = ref<Beat[]>([])

function startEdit() {
  draftText.value = text.value
  draftBeats.value = beats.value.map(beat => ({ ...beat }))
  variants.value = []
  editing.value = true
}

function saveEdit() {
  emit('update', {
    script_override: props.item.kind === 'body'
      ? draftBeats.value.map(beat => ({ beat: beat.beat, script: beat.script.trim() }))
      : draftText.value.trim()
  })
  editing.value = false
}

function resetOverride() {
  emit('update', { script_override: null })
  editing.value = false
}

// --- AI renditions (spec §11): reworded variants the person approves by saving ---
const variants = ref<{ script?: string, beats?: Beat[] }[]>([])
const drafting = ref(false)

async function reword() {
  drafting.value = true
  await run(async () => {
    const response = await $fetch('/api/ai/draft', {
      method: 'POST',
      body: {
        type: 'rendition',
        kind: props.item.kind,
        script: draftText.value,
        beats: draftBeats.value,
        productId: props.productId,
        count: 3
      }
    })
    variants.value = response.drafts
  })
  drafting.value = false
}

function useVariant(variant: { script?: string, beats?: Beat[] }) {
  if (props.item.kind === 'body' && variant.beats) draftBeats.value = variant.beats.map(beat => ({ ...beat }))
  else if (variant.script) draftText.value = variant.script
}

function onDragStart(event: DragEvent) {
  event.dataTransfer?.setData('text/plain', props.item.id)
}

const location = ref(props.item.location ?? '')
watch(() => props.item.location, value => location.value = value ?? '')
function saveLocation() {
  const value = location.value.trim() || null
  if (value !== props.item.location) emit('update', { location: value })
}
</script>

<template>
  <div
    class="flex items-start gap-3 px-3 py-2.5"
    :class="{ 'cursor-grab': canReassign }"
    :draggable="canReassign"
    @dragstart="onDragStart"
  >
    <UBadge
      :label="props.personName ?? item.code"
      :color="item.universal && !compact ? 'primary' : 'neutral'"
      variant="subtle"
      class="mt-0.5 shrink-0"
      :class="compact ? 'w-20 justify-center truncate' : 'font-mono'"
    />

    <div class="min-w-0 flex-1 space-y-1.5">
      <template v-if="!editing">
        <p v-if="item.title" class="text-sm font-medium text-highlighted">
          {{ item.title }}
        </p>
        <template v-if="item.kind === 'body'">
          <p v-for="beat in beats" :key="beat.beat" class="text-sm text-highlighted">
            <span class="mr-1 text-xs font-medium text-muted uppercase">{{ beat.beat }}</span>
            <ScriptPreview :text="beat.script" :context="context" />
          </p>
        </template>
        <p v-else class="text-sm text-highlighted">
          <ScriptPreview :text="text" :context="context" />
        </p>
        <p v-if="item.filming_notes && !compact" class="flex items-start gap-1 text-xs text-muted">
          <UIcon name="i-lucide-video" class="mt-0.5 shrink-0" />{{ item.filming_notes }}
        </p>
        <p v-if="item.caption && !compact" class="flex items-start gap-1 text-xs text-muted">
          <UIcon name="i-lucide-captions" class="mt-0.5 shrink-0" />
          <ScriptPreview :text="item.caption" :context="context" />
        </p>
      </template>

      <div v-else class="space-y-2">
        <template v-if="item.kind === 'body'">
          <UFormField v-for="beat in draftBeats" :key="beat.beat" :label="beat.beat" size="xs">
            <ScriptEditor v-model="beat.script" />
          </UFormField>
        </template>
        <ScriptEditor v-else v-model="draftText" />

        <div v-if="variants.length" class="space-y-1">
          <p class="text-xs text-muted">
            Pick a variant to load it into the editor, then save.
          </p>
          <button
            v-for="(variant, index) in variants"
            :key="index"
            type="button"
            class="block w-full rounded-md border border-default px-2.5 py-1.5 text-left text-sm hover:bg-elevated/60"
            @click="useVariant(variant)"
          >
            {{ variant.beats ? joinBeats(variant.beats) : variant.script }}
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton label="Save override" size="xs" @click="saveEdit" />
          <UButton label="Cancel" size="xs" color="neutral" variant="ghost" @click="editing = false" />
          <UButton
            label="Reword with AI"
            icon="i-lucide-sparkles"
            size="xs"
            color="neutral"
            variant="subtle"
            :loading="drafting"
            @click="reword"
          />
          <UButton
            v-if="overridden"
            label="Reset to template"
            icon="i-lucide-undo-2"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="resetOverride"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <UBadge v-if="item.universal" label="universal" color="primary" variant="outline" size="sm" />
        <UBadge v-if="item.angle" :label="item.angle" color="neutral" variant="subtle" size="sm" />
        <UBadge v-if="item.format" :label="item.format.code" color="info" variant="subtle" size="sm" />
        <UBadge v-if="item.cta_mode" :label="item.cta_mode" color="info" variant="subtle" size="sm" />
        <UBadge v-if="overridden" label="override" color="secondary" variant="subtle" size="sm" />
        <UBadge v-if="item.status !== 'planned'" :label="item.status" :color="ITEM_STATUS_COLORS[item.status]" variant="subtle" size="sm" />
        <UBadge
          v-if="unfilled.length"
          :label="`unfilled: ${unfilled.join(', ')}`"
          color="error"
          variant="subtle"
          size="sm"
          icon="i-lucide-circle-alert"
        />
        <UInput
          v-if="!compact"
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
        :model-value="item.channel_id ?? undefined"
        :items="channelOptions"
        size="xs"
        placeholder="Channel"
        class="w-32"
        @update:model-value="emit('update', { channel_id: $event })"
      />
      <UButton
        v-if="!editing"
        icon="i-lucide-pencil"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="Edit script for this person"
        @click="startEdit"
      />
      <UButton
        v-if="draft && !compact"
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="Remove from shoot"
        @click="emit('remove')"
      />
    </div>
  </div>
</template>
