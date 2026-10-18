<script setup lang="ts">
import type { BundleItem, Recording } from '#shared/utils/shootsheet'
import type { LoadedShoot } from '#shared/utils/loadShoot'

// One take on the checklist (a hook, a CTA or one VO beat, by one person): the add-clip
// button and its clip. A line that doesn't name the dog is one take for all of the person's
// channels, so the clip is saved once and fills each channel's spot (`also`).
const props = withDefaults(defineProps<{
  recording: Recording
  bundle: LoadedShoot
  part?: 'all' | 'actions' | 'clip'
  rules?: ClipRules
  /** a label always shown on the button (e.g. a person's name) */
  buttonLabel?: string
  size?: 'xs' | 'sm' | 'md'
}>(), { part: 'all', rules: () => DEFAULT_CLIP_RULES, size: 'sm' })
const emit = defineEmits<{ saved: [], removed: [] }>()

const first = computed(() => props.recording.items[0]!)
const spot = (item: BundleItem) => ({
  target: clipTarget.item(item.id, props.recording.beat),
  path: itemPath(props.bundle, item, 'raw', props.recording.beat)
})
const media = computed(() => mediaOf(first.value))
/** what's said in this take, for its captions */
const script = computed(() => {
  const resolved = resolveItemScript(props.bundle, first.value)
  return props.recording.beat ? resolved.beats?.find(beat => beat.beat === props.recording.beat)?.script ?? '' : resolved.text ?? ''
})
const label = computed(() => {
  const person = props.bundle.people.find(p => p.id === first.value.person_id)?.name ?? ''
  return `${props.recording.code}${props.recording.beat ? ` ${props.recording.beat}` : ''} for ${person}`
})
</script>

<template>
  <ClipCapture
    :part="props.part"
    :shoot="props.bundle.shoot.code"
    :target="spot(first).target"
    :path="spot(first).path"
    :also="props.recording.items.slice(1).map(spot)"
    :script="script"
    :label="label"
    :media="media"
    :rules="props.rules"
    :button-label="props.buttonLabel"
    :size="props.size"
    @saved="emit('saved')"
    @removed="emit('removed')"
  />
</template>
