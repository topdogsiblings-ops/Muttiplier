<script setup lang="ts">
import type { MyOrg } from '~/composables/useOrg'

// A tick list of organisations, each with its photo: which ones an AI app may use (the consent
// page, and Your account → Connect your AI). The model is the ticked organisations' ids.
defineProps<{ orgs: MyOrg[] }>()
const model = defineModel<string[]>({ default: () => [] })

function toggle(id: string) {
  model.value = model.value.includes(id) ? model.value.filter(entry => entry !== id) : [...model.value, id]
}
</script>

<template>
  <ul class="divide-y divide-default rounded-lg border border-default">
    <li v-for="org in orgs" :key="org.id">
      <label class="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-elevated/50">
        <UCheckbox :model-value="model.includes(org.id)" @update:model-value="toggle(org.id)" />
        <UAvatar :src="org.logo_url ?? undefined" :alt="org.name" size="sm" />
        <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ org.name }}</span>
        <span class="text-xs text-muted capitalize">{{ org.role }}</span>
      </label>
    </li>
  </ul>
</template>
