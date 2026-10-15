<script setup lang="ts">
// "Added by Joe · 14 Oct 2026". Rows without a creator came from the initial setup.
const props = defineProps<{ by: string | null, at: string }>()
const { nameOf } = useUsers()

const when = computed(() => new Date(props.at))
const day = computed(() => when.value.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))
</script>

<template>
  <span class="text-xs text-muted" :title="when.toLocaleString()">
    <template v-if="props.by">Added by {{ nameOf(props.by) }} · {{ day }}</template>
    <template v-else>Added at setup · {{ day }}</template>
  </span>
</template>
