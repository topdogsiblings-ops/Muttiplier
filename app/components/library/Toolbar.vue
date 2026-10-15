<script setup lang="ts">
// Search, tab-specific filters (default slot), sort, archived toggle and the "new" button.
const props = defineProps<{
  newLabel: string
  sortable?: boolean
}>()
const emit = defineEmits<{ create: [] }>()

const search = defineModel<string>('search', { required: true })
const sort = defineModel<string>('sort', { default: 'newest' })
const showArchived = defineModel<boolean>('showArchived', { required: true })

const sorts = computed(() => props.sortable ? LIBRARY_SORTS : LIBRARY_SORTS.filter(option => option.value !== 'used'))
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <UInput v-model="search" icon="i-lucide-search" placeholder="Search" class="w-full sm:w-56" />
    <slot />
    <USelect v-model="sort" :items="sorts" icon="i-lucide-arrow-up-down" class="w-36" />
    <USwitch v-model="showArchived" label="Archived" />
    <div class="ml-auto flex items-center gap-2">
      <slot name="actions" />
      <UButton icon="i-lucide-plus" :label="props.newLabel" @click="emit('create')" />
    </div>
  </div>
</template>
