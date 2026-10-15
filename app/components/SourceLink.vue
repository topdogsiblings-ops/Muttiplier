<script setup lang="ts">
// Opens a Library item's source in a new tab, labelled with its site.
const props = defineProps<{ url: string | null }>()

const host = computed(() => {
  try {
    return new URL(props.url ?? '').hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
})
</script>

<template>
  <a
    v-if="props.url"
    :href="props.url"
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
    :title="props.url"
    @click.stop
  >
    <UIcon name="i-lucide-link" class="size-3" />{{ host }}
  </a>
</template>
