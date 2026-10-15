<script setup lang="ts">
// Product + channel to preview a library script against (spec §5).
const { productOptions, channelOptions } = useRefData()
const { productId, channelId } = usePreviewContext()
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-2">
    <USelectMenu
      v-model="productId"
      :items="productOptions"
      value-key="value"
      placeholder="Preview product"
      icon="i-lucide-package"
      class="w-full"
    />
    <USelectMenu
      v-model="channelId"
      :items="channelOptions"
      value-key="value"
      placeholder="Preview channel"
      icon="i-lucide-tv"
      class="w-full"
    />
  </div>
</template>
