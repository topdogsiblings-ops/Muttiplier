<script setup lang="ts">
// "21–40 of 57" and page controls under a list. Hidden when everything fits on one page.
const props = defineProps<{ total: number, pageSize: number }>()
const page = defineModel<number>('page', { required: true })

const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
// Keep the page in range when filtering shrinks the list.
watch(pages, (count) => {
  if (page.value > count) page.value = count
})

const from = computed(() => Math.min(props.total, (page.value - 1) * props.pageSize + 1))
const to = computed(() => Math.min(props.total, page.value * props.pageSize))
</script>

<template>
  <div v-if="props.total > props.pageSize" class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-sm text-muted tabular-nums">
      {{ from }}–{{ to }} of {{ props.total }}
    </p>
    <UPagination v-model:page="page" :total="props.total" :items-per-page="props.pageSize" size="sm" />
  </div>
</template>
