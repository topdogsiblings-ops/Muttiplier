<script setup lang="ts">
// "What are your ad categories?": pills to pick any number of AD_CATEGORIES. The model is the
// picks in words ("Pets, Pet Toys and Gift Sets"), which is how the org profile keeps them; anything
// already there that isn't one of the categories (older free text) shows as a pill too, picked.
const model = defineModel<string>({ default: '' })

const picked = computed(() => textToCategories(model.value))
const options = computed(() => [
  ...AD_CATEGORIES,
  ...picked.value.filter(category => !(AD_CATEGORIES as readonly string[]).includes(category))
])
const isPicked = (category: string) => picked.value.includes(category)

function toggle(category: string) {
  const next = isPicked(category) ? picked.value.filter(entry => entry !== category) : [...picked.value, category]
  // kept in the list's order, with anything else at the end
  model.value = categoriesToText(options.value.filter(option => next.includes(option)))
}
</script>

<template>
  <div class="flex flex-wrap gap-1.5" role="group">
    <button
      v-for="category in options"
      :key="category"
      type="button"
      class="rounded-full border px-3 py-1 text-sm transition focus-visible:outline-2 focus-visible:outline-primary"
      :class="isPicked(category)
        ? 'border-transparent bg-inverted text-inverted'
        : 'border-default text-muted hover:border-accented hover:text-default'"
      :aria-pressed="isPicked(category)"
      @click="toggle(category)"
    >
      {{ category }}
    </button>
  </div>
</template>
