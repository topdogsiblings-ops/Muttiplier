<script setup lang="ts">
import type { BatchLoop } from '~/composables/useBatchLoop'

// How much of a Live shoot's recipes its batches have used: one segment per batch, in order,
// adding up to the share used so far. Replaces the calculator once a shoot is Live.
const props = defineProps<{ loop: BatchLoop }>()

const total = computed(() => props.loop.recipes.value.length)
const pct = (n: number) => total.value ? (n / total.value) * 100 : 0
const segments = computed(() => props.loop.batches.value.map((batch, index) => ({
  code: batch.code,
  size: batch.size,
  status: batch.status,
  width: pct(batch.size),
  color: BATCH_COLORS[index % BATCH_COLORS.length]!
})))
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p class="text-sm text-muted">
        <span class="text-xl font-semibold text-highlighted tabular-nums">{{ formatNumber(props.loop.used.value * 100, 1) }}%</span>
        used · {{ formatNumber(props.loop.batched.value.size) }} of {{ formatNumber(total) }} recipes in {{ segments.length }} batch{{ segments.length === 1 ? '' : 'es' }}
      </p>
      <p class="text-xs text-muted tabular-nums">
        {{ formatNumber(total - props.loop.batched.value.size) }} left
      </p>
    </div>
    <div class="flex h-3 w-full overflow-hidden rounded-full bg-elevated" role="img" :aria-label="`${formatNumber(props.loop.used.value * 100, 1)}% of the recipes used`">
      <div
        v-for="segment in segments"
        :key="segment.code"
        class="h-full border-r border-default last:border-r-0"
        :class="segment.color"
        :style="{ width: `${segment.width}%` }"
        :title="`${segment.code}: ${segment.size} recipes (${formatNumber(segment.width, 1)}%)`"
      />
    </div>
    <ul v-if="segments.length" class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <li v-for="segment in segments" :key="segment.code" class="flex items-center gap-1.5">
        <span class="size-2.5 rounded-sm" :class="segment.color" />
        <span class="font-mono text-default">{{ segment.code }}</span>
        <span class="tabular-nums">{{ formatNumber(segment.width, 1) }}%</span>
        <span>· {{ BATCH_STATUS_LABELS[segment.status] }}</span>
      </li>
    </ul>
  </div>
</template>
