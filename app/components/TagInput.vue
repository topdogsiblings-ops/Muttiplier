<script setup lang="ts">
// Tags with autocomplete from every tag already used in the Library (most used first).
// New tags are normalised ("Dog Walks" -> "dog-walks") and fold into an existing tag
// when they match one, so the same idea doesn't end up as several groups.
const model = defineModel<string[]>({ default: () => [] })

const { tags, counts, remember } = useLibraryTags()

const items = computed(() => [...new Set([...tags.value, ...model.value])])

function onCreate(value: string) {
  const tag = normalizeTag(value)
  if (!tag) return
  remember(tag)
  if (!model.value.includes(tag)) model.value = [...model.value, tag]
}

// Keep whatever is selected normalised too (e.g. tags typed before this existed).
function onUpdate(value: string[]) {
  model.value = [...new Set(value.map(normalizeTag).filter(Boolean))]
}
</script>

<template>
  <UInputMenu
    :model-value="model"
    :items="items"
    multiple
    create-item
    placeholder="Add tags…"
    class="w-full"
    @update:model-value="onUpdate"
    @create="onCreate"
  >
    <template #item-trailing="{ item }">
      <span v-if="counts[item as string]" class="text-xs text-muted tabular-nums">{{ counts[item as string] }}</span>
    </template>
  </UInputMenu>
</template>
