<script setup lang="ts">
import type { SlotContext } from '#shared/utils/slots'

// Renders a script with slots filled from `context`. Unfilled slots are flagged in red.
// Without a context it just highlights the slots (used in library lists).
const props = defineProps<{
  text: string
  context?: SlotContext
}>()

const segments = computed(() => renderSegments(props.text, props.context ?? {}))
const { isBuiltIn } = useSlotNames()
</script>

<template>
  <span class="whitespace-pre-wrap"><template v-for="(segment, index) in segments" :key="index"><template v-if="segment.type === 'text'">{{ segment.text }}</template><span
    v-else-if="!props.context"
    class="rounded-sm"
    :class="isBuiltIn(segment.name) ? 'bg-primary/15 text-primary' : 'bg-info/15 text-info'"
    :title="isBuiltIn(segment.name) ? undefined : 'Custom slot, filled in on each shoot'"
  >{{ segment.raw }}</span><span
    v-else-if="segment.value !== null"
    class="rounded-sm bg-success/15"
    :title="`{{${segment.name}}}`"
  >{{ segment.value }}</span><span
    v-else
    class="rounded-sm bg-error/15 font-medium text-error"
    title="Unfilled slot"
  >{{ segment.raw }}</span></template></span>
</template>
