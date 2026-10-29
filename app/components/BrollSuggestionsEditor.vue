<script setup lang="ts">
// Edit a list of suggested b-roll shots: what to film.
const props = defineProps<{ placeholder?: string }>()
const list = defineModel<BrollSuggestion[]>({ required: true })

function add() {
  list.value = [...list.value, { description: '' }]
}
function remove(index: number) {
  list.value = list.value.filter((_, i) => i !== index)
}
</script>

<template>
  <div class="space-y-1.5">
    <div v-for="(shot, index) in list" :key="index" class="flex items-center gap-2">
      <UInput v-model="shot.description" size="sm" :placeholder="props.placeholder ?? 'Describe the shot'" class="flex-1" />
      <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" aria-label="Remove suggestion" @click="remove(index)" />
    </div>
    <UButton label="Add suggested shot" icon="i-lucide-plus" size="xs" color="neutral" variant="subtle" @click="add" />
  </div>
</template>
